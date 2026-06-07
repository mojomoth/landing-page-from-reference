// customizations/ 디렉터리 정적 서빙 — customized-page.html 을 실제 URL 로 제공.
// Playwright(retention 검증)와 미리보기 iframe 이 이 URL 을 가리킨다.
// app/captures/[...path]/route.ts 와 동일 패턴(경로 traversal 가드 + content-type by ext).
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, sep } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const base = join(process.cwd(), "customizations");
  const rel = normalize(path.join("/")).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = join(base, rel);
  if (!abs.startsWith(base + sep) || !existsSync(abs)) {
    return new Response("not found", { status: 404 });
  }
  const buf = await readFile(abs);
  const type = TYPES[extname(abs).toLowerCase()] ?? "application/octet-stream";
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": type, "cache-control": "no-store" },
  });
}
