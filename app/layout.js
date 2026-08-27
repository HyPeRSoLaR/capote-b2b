import "./globals.css";
import { ConsentProvider } from "@/lib/consent";
import MetaPixel from "@/components/MetaPixel";
import CookieBanner from "@/components/CookieBanner";

export const metadata = {
  title: "Capote B2B — Wholesale Portal",
  description: "Secure wholesale ordering portal for Capote Eyewear retailers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ConsentProvider>
          <MetaPixel />
          {children}
          <CookieBanner />
        </ConsentProvider>
      </body>
    </html>
  );
}
