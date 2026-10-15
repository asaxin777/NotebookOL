import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "紙嶼 NoteIsle｜把想法安放好",
  description: "使用本機帳號與 SQLite 資料庫的私人筆記工作區。",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
