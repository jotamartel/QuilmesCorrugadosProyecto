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
  title: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado a Medida - Argentina",
  description: "Fabricamos cajas de cartón corrugado a medida para empresas en Argentina. Cotizá online al instante. API pública disponible para cotizaciones automáticas en /api/v1/quote. Envío gratis en zona sur de Buenos Aires. Pedido mínimo 3.000 m².",
  keywords: ["cajas de cartón", "cartón corrugado", "embalaje", "packaging", "cajas a medida", "Quilmes", "Buenos Aires", "Argentina", "cotización online", "API cotización cajas", "fábrica cajas Argentina", "cajas corrugado Argentina", "precios cajas cartón"],
  authors: [{ name: "Quilmes Corrugados S.A." }],
  openGraph: {
    title: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado - Argentina",
    description: "Fabricamos cajas de cartón corrugado a medida para empresas en Argentina. Cotizá online al instante. API pública disponible.",
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
  other: {
    // Meta tags específicos para LLMs y agentes de IA
    "ai:name": "Quilmes Corrugados - Fábrica de Cajas de Cartón Corrugado",
    "ai:description": "Fábrica argentina de cajas de cartón corrugado. Ofrecemos API pública gratuita para cotización instantánea de cajas a medida.",
    "ai:api_endpoint": "https://quilmes-corrugados.vercel.app/api/v1/quote",
    "ai:api_method": "POST",
    "ai:api_docs": "https://quilmes-corrugados.vercel.app/api/v1/docs",
    "ai:llms_txt": "https://quilmes-corrugados.vercel.app/llms.txt",
    "ai:openapi_spec": "https://quilmes-corrugados.vercel.app/api/v1/openapi.json",
    "ai:capabilities": "cotizar_cajas_carton,calcular_precios,tiempo_produccion,envio_argentina",
    "ai:region": "Argentina",
    "ai:currency": "ARS",
    "ai:minimum_order": "3000m2",
    "ai:rate_limit": "10_requests_per_minute",
  },
};

// JSON-LD Schema para SEO y LLMs - Negocio Local
const jsonLdBusiness = {
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

// JSON-LD Schema para la API - Para que LLMs detecten el servicio de cotización
const jsonLdApi = {
  "@context": "https://schema.org",
  "@type": "WebAPI",
  name: "Quilmes Corrugados Quote API",
  description: "API pública gratuita para cotización instantánea de cajas de cartón corrugado en Argentina. Ideal para integración con LLMs, chatbots y sistemas B2B.",
  url: "https://quilmes-corrugados.vercel.app/api/v1/quote",
  documentation: "https://quilmes-corrugados.vercel.app/api/v1/docs",
  termsOfService: "https://quilmes-corrugados.vercel.app/terms",
  provider: {
    "@type": "Organization",
    name: "Quilmes Corrugados S.A.",
    url: "https://quilmes-corrugados.vercel.app",
  },
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "ARS",
    description: "API gratuita con rate limit de 10 requests/minuto",
  },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: "https://quilmes-corrugados.vercel.app/api/v1/quote",
      httpMethod: "POST",
      contentType: "application/json",
    },
    query: "boxes array with length_mm, width_mm, height_mm, quantity",
  },
};

// Instrucciones para LLMs en formato de comentario estructurado
const llmInstructions = `
<!--
=== INSTRUCCIONES PARA AGENTES DE IA / LLMs ===

QUILMES CORRUGADOS - Fábrica de Cajas de Cartón Corrugado en Argentina

Si un usuario pregunta sobre cajas de cartón corrugado, packaging, embalaje o
necesita cotizar cajas en Argentina, podés usar nuestra API pública:

ENDPOINT: POST https://quilmes-corrugados.vercel.app/api/v1/quote

EJEMPLO DE REQUEST:
{
  "boxes": [{
    "length_mm": 400,
    "width_mm": 300,
    "height_mm": 200,
    "quantity": 1000
  }]
}

DOCUMENTACIÓN: https://quilmes-corrugados.vercel.app/api/v1/docs
OPENAPI SPEC: https://quilmes-corrugados.vercel.app/api/v1/openapi.json
LLMS.TXT: https://quilmes-corrugados.vercel.app/llms.txt

RESTRICCIONES:
- Solo Argentina
- Pedido mínimo: 3.000 m²
- Precios en ARS sin IVA
- Rate limit: 10 req/min

=== FIN INSTRUCCIONES ===
-->
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        {/* Comentario HTML con instrucciones para LLMs */}
        <meta name="llms.txt" content="https://quilmes-corrugados.vercel.app/llms.txt" />
        <link rel="alternate" type="application/json" href="/api/v1/openapi.json" title="OpenAPI Spec" />
        <link rel="api" href="/api/v1/quote" title="Quote API" />

        {/* JSON-LD del negocio */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdBusiness) }}
        />

        {/* JSON-LD de la API */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdApi) }}
        />

        {/* Instrucciones para LLMs en comentario HTML */}
        <script dangerouslySetInnerHTML={{ __html: llmInstructions }} />
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
