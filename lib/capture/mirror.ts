// Loop B — mirrorAssets: 렌더된 HTML 안의 모든 asset(css/font/img/background/srcset/video poster)을
// captures/{id}/assets/ 로 다운로드하고 모든 URL 을 로컬 경로로 rewrite 한다.
// 실패(CORS/CSP/404)는 blocked[] 에 기록하고 원본 URL 을 유지한다. LLM 미관여.
import { mkdir, writeFile } from "node:fs/promises";
import { captureAssetsDir, captureAssetWebPath } from "../paths";

const FETCH_HEADERS_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface MirrorResult {
  html: string;
  assetCount: number;
  blocked: string[];
}

// djb2 문자열 해시 (자산 파일명 안정화).
export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff2": "woff2",
  "application/font-woff": "woff",
  "application/x-font-ttf": "ttf",
  "application/x-font-otf": "otf",
  "application/vnd.ms-fontobject": "eot",
  "text/css": "css",
  "video/mp4": "mp4",
  "video/webm": "webm",
};

function extFromUrl(u: string): string {
  try {
    const path = new URL(u).pathname;
    const m = /\.([a-z0-9]{2,5})(?:$|\?)/i.exec(path);
    if (m) return m[1].toLowerCase();
  } catch {
    const m = /\.([a-z0-9]{2,5})(?:$|\?|#)/i.exec(u);
    if (m) return m[1].toLowerCase();
  }
  return "";
}

function assetName(absUrl: string, contentType: string | null): string {
  let ext = extFromUrl(absUrl);
  if (!ext && contentType) {
    const ct = contentType.split(";")[0].trim().toLowerCase();
    ext = MIME_EXT[ct] || "";
  }
  const base = djb2(absUrl);
  return ext ? `${base}.${ext}` : base;
}

function absolutize(ref: string, base: string): string | null {
  const t = ref.trim();
  if (!t) return null;
  if (t.startsWith("data:") || t.startsWith("blob:")) return null;
  if (t.startsWith("#")) return null;
  if (/^(javascript|mailto|tel):/i.test(t)) return null;
  try {
    return new URL(t, base).toString();
  } catch {
    return null;
  }
}

// ---- CSS url() / @import 파싱 & 치환 ----

const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/gi;
const IMPORT_RE = /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi;

// CSS 안의 모든 참조 URL(상대/절대) 추출 (data: 제외).
export function extractCssUrls(css: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(css)) !== null) {
    const u = m[2].trim();
    if (u && !u.startsWith("data:")) out.push(u);
  }
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(css)) !== null) {
    const u = (m[2] || m[4] || "").trim();
    if (u && !u.startsWith("data:")) out.push(u);
  }
  return Array.from(new Set(out));
}

// CSS 안의 url(...) 와 @import 를 resolve(originalUrl)=>newUrl 로 치환. data: 는 보존.
export function rewriteCssUrls(css: string, resolve: (u: string) => string): string {
  let out = css.replace(
    URL_RE,
    (full: string, _q: string, raw: string): string => {
      const u = raw.trim();
      if (!u || u.startsWith("data:")) return full;
      const mapped = resolve(u);
      if (mapped === u) return full;
      return `url("${mapped}")`;
    },
  );
  out = out.replace(
    IMPORT_RE,
    (full: string, _q1: string, urlForm: string, _q2: string, strForm: string): string => {
      const u = (urlForm || strForm || "").trim();
      if (!u || u.startsWith("data:")) return full;
      const mapped = resolve(u);
      if (mapped === u) return full;
      const suffix = full.slice(full.indexOf(u) + u.length).replace(/^['")\s]+/, "");
      return `@import url("${mapped}")${suffix ? " " + suffix.trim() : ""};`;
    },
  );
  return out;
}

// ---- fetch + download ----

interface MirrorCtx {
  captureId: string;
  baseUrl: string;
  blocked: string[];
  // absUrl -> local web path. 다운로드 성공 시에만 채워짐.
  downloaded: Map<string, string>;
  assetsDir: string;
}

async function fetchBuffer(
  absUrl: string,
  baseUrl: string,
): Promise<{ buf: Buffer; contentType: string | null } | null> {
  try {
    const res = await fetch(absUrl, {
      headers: {
        "User-Agent": FETCH_HEADERS_UA,
        Referer: baseUrl,
        Accept: "*/*",
      },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return { buf: Buffer.from(ab), contentType: res.headers.get("content-type") };
  } catch {
    return null;
  }
}

// 단일 asset 다운로드 (이미 받은 것은 캐시). 성공 시 web path 반환, 실패 시 null + blocked 기록.
async function mirrorOne(ctx: MirrorCtx, ref: string): Promise<string | null> {
  const abs = absolutize(ref, ctx.baseUrl);
  if (!abs) return null;
  const cached = ctx.downloaded.get(abs);
  if (cached) return cached;

  const got = await fetchBuffer(abs, ctx.baseUrl);
  if (!got) {
    if (!ctx.blocked.includes(abs)) ctx.blocked.push(abs);
    return null;
  }
  const name = assetName(abs, got.contentType);
  await writeFile(`${ctx.assetsDir}/${name}`, got.buf).catch(() => {});
  const web = captureAssetWebPath(ctx.captureId, name);
  ctx.downloaded.set(abs, web);
  return web;
}

// CSS 텍스트 안의 url()/@import 를 재귀적으로 mirror 하고 로컬 경로로 rewrite.
// resolveBase 는 해당 CSS 가 위치한 절대 URL (상대 경로 해석 기준).
async function mirrorCssText(
  ctx: MirrorCtx,
  css: string,
  resolveBase: string,
  depth: number,
): Promise<string> {
  const refs = extractCssUrls(css);
  const map = new Map<string, string>();
  for (const ref of refs) {
    const abs = absolutize(ref, resolveBase);
    if (!abs) continue;
    const isCss = extFromUrl(abs) === "css" || /@import/i.test(ref);
    if (isCss && depth < 3) {
      // @import 된 CSS 는 텍스트를 받아 재귀 처리 후 별도 파일로 저장.
      const nested = await fetchBuffer(abs, ctx.baseUrl);
      if (!nested) {
        if (!ctx.blocked.includes(abs)) ctx.blocked.push(abs);
        continue;
      }
      const nestedCss = nested.buf.toString("utf8");
      const rewritten = await mirrorCssText(ctx, nestedCss, abs, depth + 1);
      const name = assetName(abs, "text/css");
      await writeFile(`${ctx.assetsDir}/${name}`, rewritten).catch(() => {});
      const web = captureAssetWebPath(ctx.captureId, name);
      ctx.downloaded.set(abs, web);
      map.set(ref, web);
    } else {
      const web = await mirrorOne(ctx, ref);
      if (web) map.set(ref, web);
    }
  }
  return rewriteCssUrls(css, (u) => map.get(u) ?? u);
}

// ---- srcset 파싱 ----
function rewriteSrcset(
  srcset: string,
  map: (ref: string) => string | null,
): string {
  return srcset
    .split(",")
    .map((part) => {
      const seg = part.trim();
      if (!seg) return "";
      const sp = seg.split(/\s+/);
      const u = sp[0];
      const desc = sp.slice(1).join(" ");
      const mapped = map(u);
      const finalU = mapped ?? u;
      return desc ? `${finalU} ${desc}` : finalU;
    })
    .filter(Boolean)
    .join(", ");
}

// ---- HTML 처리 ----
// 정규식 기반 (렌더된 DOM 직렬화 문자열을 대상으로 한 안정적 치환).

export async function mirrorAssets(
  captureId: string,
  baseUrl: string,
  html: string,
  extraCss: string[] = [],
): Promise<MirrorResult> {
  const assetsDir = captureAssetsDir(captureId);
  await mkdir(assetsDir, { recursive: true });
  const ctx: MirrorCtx = {
    captureId,
    baseUrl,
    blocked: [],
    downloaded: new Map(),
    assetsDir,
  };

  let out = html;

  // 1) <link rel="stylesheet" href="..."> -> CSS 텍스트 fetch -> 내부 url() mirror -> <style> inline.
  out = await replaceAsync(
    out,
    /<link\b[^>]*\brel=(['"])?stylesheet\1?[^>]*>/gi,
    async (tag) => {
      const href = attr(tag, "href");
      if (!href) return tag;
      const abs = absolutize(href, baseUrl);
      if (!abs) return tag;
      const got = await fetchBuffer(abs, baseUrl);
      if (!got) {
        if (!ctx.blocked.includes(abs)) ctx.blocked.push(abs);
        return tag; // 실패 시 원본 link 유지.
      }
      const cssText = got.buf.toString("utf8");
      const media = attr(tag, "media");
      const rewritten = await mirrorCssText(ctx, cssText, abs, 0);
      const mediaAttr = media ? ` media="${media}"` : "";
      return `<style data-mirrored-from="${escapeAttr(abs)}"${mediaAttr}>\n${rewritten}\n</style>`;
    },
  );

  // 2) <style>...</style> inline CSS 내부 url() mirror (미디어쿼리 통째 보존).
  out = await replaceAsync(
    out,
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    async (full, attrs: string, css: string) => {
      if (!css.trim()) return full;
      const rewritten = await mirrorCssText(ctx, css, baseUrl, 0);
      return `<style${attrs}>${rewritten}</style>`;
    },
  );

  // 3) extraCss (외부에서 전달된 CSS 텍스트) -> mirror 후 추가 <style> 로 head 에 주입.
  for (const css of extraCss) {
    if (!css.trim()) continue;
    const rewritten = await mirrorCssText(ctx, css, baseUrl, 0);
    out = injectStyle(out, rewritten);
  }

  // 4) inline style="...background...url()..." 속성 mirror.
  out = await replaceAsync(
    out,
    /\bstyle=(['"])([\s\S]*?)\1/gi,
    async (full, q: string, css: string) => {
      if (!/url\(/i.test(css)) return full;
      const rewritten = await mirrorCssText(ctx, css, baseUrl, 2);
      return `style=${q}${rewritten}${q}`;
    },
  );

  // 5) <img src> / poster / <source src> / 일반 src 속성 mirror.
  out = await replaceAsync(
    out,
    /\b(src|poster)=(['"])([^'"]+)\2/gi,
    async (full, name: string, q: string, ref: string) => {
      if (ref.startsWith("data:") || ref.startsWith("blob:")) return full;
      const web = await mirrorOne(ctx, ref);
      if (!web) return full;
      return `${name}=${q}${web}${q}`;
    },
  );

  // 6) srcset (img + source) mirror.
  out = await replaceAsync(
    out,
    /\bsrcset=(['"])([^'"]+)\1/gi,
    async (full, q: string, srcset: string) => {
      const tasks: Promise<void>[] = [];
      const local = new Map<string, string>();
      for (const part of srcset.split(",")) {
        const u = part.trim().split(/\s+/)[0];
        if (!u || u.startsWith("data:")) continue;
        tasks.push(
          mirrorOne(ctx, u).then((web) => {
            if (web) local.set(u, web);
          }),
        );
      }
      await Promise.all(tasks);
      const rewritten = rewriteSrcset(srcset, (u) => local.get(u) ?? null);
      return `srcset=${q}${rewritten}${q}`;
    },
  );

  const assetCount = ctx.downloaded.size;
  return { html: out, assetCount, blocked: ctx.blocked };
}

// ---- helpers ----

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}=(['"])([\\s\\S]*?)\\1`, "i");
  const m = re.exec(tag);
  if (m) return decodeEntities(m[2]);
  const re2 = new RegExp(`\\b${name}=([^\\s>]+)`, "i");
  const m2 = re2.exec(tag);
  return m2 ? decodeEntities(m2[1]) : null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function injectStyle(html: string, css: string): string {
  const style = `<style data-mirrored-extra>\n${css}\n</style>`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${style}</head>`);
  if (/<head[^>]*>/i.test(html))
    return html.replace(/(<head[^>]*>)/i, `$1${style}`);
  return style + html;
}

// 비동기 replace: 모든 매치를 비동기로 처리해 순서대로 합친다.
async function replaceAsync(
  input: string,
  re: RegExp,
  fn: (match: string, ...groups: string[]) => Promise<string>,
): Promise<string> {
  const matches: { index: number; length: number; result: string }[] = [];
  const tasks: Promise<void>[] = [];
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(input)) !== null) {
    const full = m[0];
    const index = m.index;
    const groups = m.slice(1) as string[];
    if (full.length === 0) {
      r.lastIndex++;
      continue;
    }
    tasks.push(
      fn(full, ...groups).then((result) => {
        matches.push({ index, length: full.length, result });
      }),
    );
  }
  await Promise.all(tasks);
  matches.sort((a, b) => a.index - b.index);
  let out = "";
  let pos = 0;
  for (const mt of matches) {
    out += input.slice(pos, mt.index) + mt.result;
    pos = mt.index + mt.length;
  }
  out += input.slice(pos);
  return out;
}
