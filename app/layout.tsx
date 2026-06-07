import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Landing Page from Reference",
  description: "레퍼런스 URL을 분석해 커스터마이징 가능한 랜딩을 생성하는 LLM 도구",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
