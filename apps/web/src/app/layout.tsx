import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "제2생활관 근무표",
  description: "조교 근무표 생성, 조정, 게시를 위한 월간 스케줄링 도구"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
