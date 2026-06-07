/** @type {import('next').NextConfig} */
const nextConfig = {
  // playwright 는 서버 전용 무거운 패키지 — webpack 번들에서 제외 (node:sqlite 는 빌트인이라 자동 외부화).
  serverExternalPackages: ["playwright", "playwright-core"],
};

export default nextConfig;
