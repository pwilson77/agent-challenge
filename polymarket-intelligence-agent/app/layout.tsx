import type { Metadata } from "next";

import "@/styles/globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Polymarket Intelligence Agent";

export const metadata: Metadata = {
  title: appName,
  description: "Your Personal AI for Detecting Mispriced Prediction Markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
