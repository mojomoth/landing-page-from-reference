// Loop B 단위 검증 — CSS url()/@import rewrite 및 data: 보존.
import { describe, it, expect } from "vitest";
import { rewriteCssUrls, extractCssUrls, djb2 } from "../../lib/capture/mirror";

// 테스트용 resolver: 알려진 매핑만 치환, 나머지는 원본 유지.
const MAP: Record<string, string> = {
  "./a.png": "/captures/x/assets/a.png",
  "../b.woff2": "/captures/x/assets/b.woff2",
  "x.css": "/captures/x/assets/x.css",
};
const resolve = (u: string): string => MAP[u] ?? u;

describe("rewriteCssUrls", () => {
  it("rewrites url(./a.png) (따옴표 없음)", () => {
    const css = ".hero { background: url(./a.png) no-repeat; }";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('url("/captures/x/assets/a.png")');
    expect(out).not.toContain("./a.png");
  });

  it('rewrites url("../b.woff2") (큰따옴표)', () => {
    const css = '@font-face { src: url("../b.woff2") format("woff2"); }';
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('url("/captures/x/assets/b.woff2")');
    expect(out).not.toContain("../b.woff2");
    // format() 등 다른 토큰은 보존.
    expect(out).toContain('format("woff2")');
  });

  it("rewrites @import url(x.css)", () => {
    const css = "@import url(x.css);\nbody{color:red}";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('@import url("/captures/x/assets/x.css")');
    expect(out).toContain("color:red");
  });

  it("rewrites @import 'x.css' (문자열 형태)", () => {
    const css = "@import 'x.css';";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('@import url("/captures/x/assets/x.css")');
  });

  it("preserves data: URLs", () => {
    const dataUrl =
      "url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==)";
    const css = `.x { background: ${dataUrl}; }`;
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain("data:image/png;base64,");
    // data: 는 그대로 보존(치환 안 함).
    expect(out).toBe(css);
  });

  it("leaves unmapped urls untouched", () => {
    const css = "div { background: url(unknown.svg); }";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain("url(unknown.svg)");
  });

  it("handles single-quoted url('./a.png')", () => {
    const css = ".y { background: url('./a.png'); }";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('url("/captures/x/assets/a.png")');
  });

  it("rewrites multiple urls in one block", () => {
    const css = ".z { background: url(./a.png), url('../b.woff2'); }";
    const out = rewriteCssUrls(css, resolve);
    expect(out).toContain('url("/captures/x/assets/a.png")');
    expect(out).toContain('url("/captures/x/assets/b.woff2")');
  });
});

describe("extractCssUrls", () => {
  it("extracts url() and @import targets, excludes data:", () => {
    const css = [
      ".a { background: url(./a.png); }",
      '@import url("x.css");',
      ".b { background: url(data:image/png;base64,AAAA); }",
      '@font-face { src: url("../b.woff2"); }',
    ].join("\n");
    const urls = extractCssUrls(css);
    expect(urls).toContain("./a.png");
    expect(urls).toContain("x.css");
    expect(urls).toContain("../b.woff2");
    expect(urls.some((u) => u.startsWith("data:"))).toBe(false);
  });

  it("dedupes repeated urls", () => {
    const css = ".a{background:url(./a.png)} .b{background:url(./a.png)}";
    const urls = extractCssUrls(css);
    expect(urls.filter((u) => u === "./a.png")).toHaveLength(1);
  });
});

describe("djb2", () => {
  it("is deterministic and url-safe", () => {
    const h1 = djb2("https://example.com/a.png");
    const h2 = djb2("https://example.com/a.png");
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[a-z0-9]+$/);
  });

  it("differs for different inputs", () => {
    expect(djb2("https://example.com/a.png")).not.toBe(
      djb2("https://example.com/b.png"),
    );
  });
});
