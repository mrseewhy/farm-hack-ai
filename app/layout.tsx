import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FarmHack AI",
  description: "Clear crop guidance for farmers",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en" suppressHydrationWarning><body className="min-h-dvh font-sans antialiased">{children}</body></html>;
}
