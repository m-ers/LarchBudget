import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Instrument Sans (SIL Open Font License), bundled so no font is fetched at runtime.
const instrumentSans = localFont({
  src: "../../node_modules/@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2",
  weight: "400 700",
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "LarchBudget", template: "%s · LarchBudget" },
  description: "A simple, self-hosted budgeting app for one person.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${instrumentSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
