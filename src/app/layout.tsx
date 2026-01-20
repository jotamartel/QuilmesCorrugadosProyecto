import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado a Medida",
  description: "Fabricamos cajas de cartón corrugado a medida para empresas. Cotizá online al instante. Envío gratis en zona sur de Buenos Aires. Pedido mínimo 3.000 m².",
  keywords: ["cajas de cartón", "cartón corrugado", "embalaje", "packaging", "cajas a medida", "Quilmes", "Buenos Aires", "Argentina"],
  authors: [{ name: "Quilmes Corrugados S.A." }],
  openGraph: {
    title: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado",
    description: "Fabricamos cajas de cartón corrugado a medida para empresas. Cotizá online al instante.",
    url: "https://quilmes-corrugados.vercel.app",
    siteName: "Quilmes Corrugados",
    locale: "es_AR",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: "https://quilmes-corrugados.vercel.app",
  },
};

// JSON-LD Schema para SEO y LLMs
const jsonLd = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": "https://quilmes-corrugados.vercel.app",
  name: "Quilmes Corrugados",
  description: "Fábrica de cajas de cartón corrugado a medida para empresas en Argentina. Producción desde 3.000 m² con entrega en todo el país.",
  url: "https://quilmes-corrugados.vercel.app",
  logo: "https://quilmes-corrugados.vercel.app/logo.png",
  image: "https://quilmes-corrugados.vercel.app/og-image.jpg",
  telephone: "+54-11-XXXX-XXXX",
  email: "info@quilmescorrugados.com.ar",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Calle Industrial 123",
    addressLocality: "Quilmes",
    addressRegion: "Buenos Aires",
    postalCode: "1878",
    addressCountry: "AR",
  },
  geo: {
    "@type": "GeoCoordinates",
    latitude: -34.7232,
    longitude: -58.2528,
  },
  areaServed: {
    "@type": "Country",
    name: "Argentina",
  },
  priceRange: "$$",
  openingHours: "Mo-Fr 08:00-17:00",
  sameAs: [],
  hasOfferCatalog: {
    "@type": "OfferCatalog",
    name: "Cajas de Cartón Corrugado",
    itemListElement: [
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "Cajas de cartón corrugado estándar",
          description: "Cajas a medida sin impresión, cartón onda C",
        },
      },
      {
        "@type": "Offer",
        itemOffered: {
          "@type": "Product",
          name: "Cajas de cartón corrugado con impresión",
          description: "Cajas a medida con impresión flexográfica de 1 a 4 colores",
        },
      },
    ],
  },
  potentialAction: {
    "@type": "QuoteAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://quilmes-corrugados.vercel.app/cotizar",
      actionPlatform: [
        "http://schema.org/DesktopWebPlatform",
        "http://schema.org/MobileWebPlatform",
      ],
    },
    description: "Cotizar cajas de cartón corrugado online",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}
