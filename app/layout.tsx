import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/cormorant-garamond/latin-400-italic.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "@fontsource/cormorant-garamond/latin-500-italic.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Project Eclipse — Relight Lantern 17",
  description:
    "A sunless rogue planet kept alive by orbital Lanterns. One has gone dark. Design the mission that brings the light back.",
};

export const viewport: Viewport = {
  themeColor: "#05070B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
