import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FarmHack AI",
  description: "Clear crop guidance for farmers",
  icons: {
    icon: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
      <script
        id="farmhack-theme-init"
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var saved = localStorage.getItem('farmhack-theme');
                var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (dark) document.documentElement.classList.add('dark');
              } catch (e) {}
            })();
          `,
        }}
      />
    </html>
  );
}
