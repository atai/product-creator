import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "Product Creator",
  description: "Function catalog management system",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <Header />
        <main>
          {children}
        </main>
      </body>
    </html>
  );
}
