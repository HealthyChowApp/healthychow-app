import type { Metadata, Viewport } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://healthychowapp.com"),
  title: "Healthy Chow: Eat out. Eat right.",
  description:
    "Healthy Chow is your scout. Tell us how you want to eat and we'll tell you exactly what to order at restaurants near you.",
  openGraph: {
    title: "Healthy Chow: Eat out. Eat right.",
    description:
      "Your scout for eating out. Exact orders, modifications included, for keto, low-carb, Mediterranean, paleo, and carnivore.",
    images: ["/assets/logo.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#1E4F2B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`}>
      <body>
        {/* shared logo mark: leaf + location pin + turmeric check */}
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <defs>
            <linearGradient id="hcLeaf" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2F6B3C" />
              <stop offset="1" stopColor="#1E4F2B" />
            </linearGradient>
            <symbol id="hc-mark" viewBox="0 0 240 260">
              <path
                d="M120 12 C176 12 224 56 224 116 C224 176 168 220 120 248 C72 220 16 176 16 116 C16 56 64 12 120 12 Z"
                fill="url(#hcLeaf)"
              />
              <path
                d="M82 128 L110 158 L168 92"
                stroke="#F4B23E"
                strokeWidth="18"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </symbol>
          </defs>
        </svg>
        {children}
      </body>
    </html>
  );
}
