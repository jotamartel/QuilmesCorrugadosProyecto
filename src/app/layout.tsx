import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleAnalytics } from "@/components/tracking/GoogleAnalytics";
import { GoogleAds } from "@/components/tracking/GoogleAds";
import { RETAIL_CONFIG } from "@/lib/retail/config";
import { AtribucionTracker } from "@/components/tracking/AtribucionTracker";
import { MetaPixel } from "@/components/tracking/MetaPixel";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

import { SITE_URL } from "@/lib/site";

const BASE_URL = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  icons: {
    icon: "/favicon.ico",
  },
  title: {
    default: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado a Medida",
    template: "%s | Quilmes Corrugados",
  },
  description: "Fábrica de cajas de cartón corrugado a medida en Quilmes, Buenos Aires. Cotizá online con precio real al instante. Envío gratis desde 3.000 m². +20 años. Pedido mínimo 3.000 m².",
  keywords: ["cajas de cartón corrugado", "cajas de cartón a medida", "fábrica cajas cartón", "embalaje", "packaging Argentina", "cajas e-commerce", "cartón corrugado Buenos Aires", "cajas impresas personalizadas", "cotizar cajas cartón", "Quilmes", "packaging industrial", "cajas corrugado precios"],
  authors: [{ name: "Quilmes Corrugados S.A." }],
  creator: "Quilmes Corrugados S.A.",
  publisher: "Quilmes Corrugados S.A.",
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  openGraph: {
    title: "Quilmes Corrugados | Fábrica de Cajas de Cartón Corrugado a Medida",
    description: "Fabricamos cajas de cartón corrugado a medida para empresas. Cotizá online al instante. Fábrica en Quilmes, envíos a todo el país.",
    url: BASE_URL,
    siteName: "Quilmes Corrugados",
    locale: "es_AR",
    type: "website",
    images: [
      {
        url: "/og-image.jpg?v=2",
        width: 1200,
        height: 630,
        alt: "Quilmes Corrugados - Fábrica de Cajas de Cartón Corrugado a Medida",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Quilmes Corrugados | Cajas de Cartón Corrugado a Medida",
    description: "Fábrica de cajas de cartón corrugado. Cotizá online al instante. Quilmes, Buenos Aires.",
    images: ["/og-image.jpg?v=2"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: BASE_URL,
  },
  verification: {
    // Descomentar cuando se configure Google Search Console:
    // google: "TU_CODIGO_DE_VERIFICACION",
  },
  other: {
    "ai:name": "Quilmes Corrugados - Fábrica de Cajas de Cartón Corrugado",
    "ai:description": "Fábrica argentina de cajas de cartón corrugado. Ofrecemos API pública gratuita para cotización instantánea de cajas a medida.",
    "ai:api_endpoint": `${BASE_URL}/api/v1/quote`,
    "ai:api_method": "POST",
    "ai:api_docs": `${BASE_URL}/api/v1/docs`,
    "ai:llms_txt": `${BASE_URL}/llms.txt`,
    "ai:openapi_spec": `${BASE_URL}/api/v1/openapi.json`,
    "ai:capabilities": "cotizar_cajas_carton,calcular_precios,tiempo_produccion,envio_argentina",
    "ai:region": "Argentina",
    "ai:currency": "ARS",
    "ai:minimum_order": `${RETAIL_CONFIG.MIN_CANTIDAD} cajas (stock) o ${RETAIL_CONFIG.MIN_M2_A_MEDIDA}m2 (a medida)`,
    "ai:rate_limit": "10_requests_per_minute",
  },
};

// JSON-LD Schema para SEO y LLMs - Negocio Local
const jsonLdBusiness = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": BASE_URL,
  name: "Quilmes Corrugados",
  description: `Fábrica de cajas de cartón corrugado en Argentina. Cajas de stock desde ${RETAIL_CONFIG.MIN_CANTIDAD} unidades y producción a medida desde ${RETAIL_CONFIG.MIN_M2_A_MEDIDA.toLocaleString('es-AR')} m² por modelo. Entrega en todo el país.`,
  url: BASE_URL,
  logo: `${BASE_URL}/logo.svg`,
  image: `${BASE_URL}/og-image.jpg`,
  telephone: "+54 9 11 3341-1781",
  email: "ventas@quilmescorrugados.com.ar",
  address: {
    "@type": "PostalAddress",
    streetAddress: "Lugones 219",
    addressLocality: "Quilmes",
    addressRegion: "Buenos Aires",
    postalCode: "B1878",
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
    // Las ofertas apuntan a /precios, que es la unica pagina que publica los
    // valores en el HTML tomandolos de la configuracion vigente.
    //
    // Antes cada Offer envolvia un Product con itemOffered. La inspeccion de
    // Search Console lo marco como error critico en las dos: un Product tiene
    // que declarar offers, review o aggregateRating, y estos no podian
    // declarar precio sin congelarlo aca y contradecir a /precios en cuanto
    // alguien cambie un valor.
    //
    // La salida no es completarlos, es no duplicarlos: /precios ya declara los
    // productos bien, con Product + AggregateOffer + UnitPriceSpecification y
    // los precios reales. Este catalogo se queda con Offers a secas, que son
    // validas sin producto anidado, y el detalle vive en un solo lugar.
    itemListElement: [
      {
        "@type": "Offer",
        name: "Cajas de cartón corrugado estándar",
        description: "Cajas a medida sin impresión, cartón onda C",
        url: `${BASE_URL}/precios`,
        priceCurrency: "ARS",
        availability: "https://schema.org/InStock",
      },
      {
        "@type": "Offer",
        name: "Cajas de cartón corrugado con impresión",
        description: `Cajas a medida con impresión flexográfica de hasta ${RETAIL_CONFIG.MAX_PRINTING_COLORS} colores`,
        url: `${BASE_URL}/precios`,
        priceCurrency: "ARS",
        availability: "https://schema.org/InStock",
      },
    ],
  },
  potentialAction: {
    "@type": "QuoteAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${BASE_URL}/#cotizador`,
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
  url: `${BASE_URL}/api/v1/quote`,
  documentation: `${BASE_URL}/api/v1/docs`,
  termsOfService: `${BASE_URL}/terms`,
  provider: {
    "@type": "Organization",
    name: "Quilmes Corrugados S.A.",
    url: BASE_URL,
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
      urlTemplate: `${BASE_URL}/api/v1/quote`,
      httpMethod: "POST",
      contentType: "application/json",
    },
    query: "boxes array with length_mm, width_mm, height_mm, quantity",
  },
};

// Instrucciones para LLMs, embebidas en el DOM como texto no ejecutable.
// Van en un <script type="text/plain">: el navegador no lo interpreta pero
// sigue estando en el HTML para cualquier crawler que lo lea.
const llmInstructions = `
=== INSTRUCCIONES PARA AGENTES DE IA / LLMs ===

QUILMES CORRUGADOS - Fábrica de Cajas de Cartón Corrugado en Argentina

Si un usuario pregunta sobre cajas de cartón corrugado, packaging, embalaje o
necesita cotizar cajas en Argentina, podés usar nuestra API pública:

ENDPOINT: POST ${BASE_URL}/api/v1/quote

EJEMPLO DE REQUEST:
{
  "boxes": [{
    "length_mm": 400,
    "width_mm": 300,
    "height_mm": 200,
    "quantity": 1000
  }]
}

DOCUMENTACIÓN: ${BASE_URL}/api/v1/docs
OPENAPI SPEC: ${BASE_URL}/api/v1/openapi.json
LLMS.TXT: ${BASE_URL}/llms.txt

RESTRICCIONES:
- Solo Argentina
- Pedido mínimo: 3.000 m²
- Precios en ARS sin IVA
- Rate limit: 10 req/min

=== FIN INSTRUCCIONES ===
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
        <meta name="llms.txt" content={`${BASE_URL}/llms.txt`} />
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

        {/* Instrucciones para LLMs — text/plain para que el browser no las ejecute */}
        <script type="text/plain" dangerouslySetInnerHTML={{ __html: llmInstructions }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <GoogleAnalytics />
        <GoogleAds />
        <MetaPixel />
        <AtribucionTracker />
        {children}
      </body>
    </html>
  );
}
