import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Risk Check",
  description: "Разовая проверка URL на расхождения контента между браузером и ботами.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body className="antialiased">{children}</body>
    </html>
  );
}
