/**
 * Componentes de Schema Markup (JSON-LD) para SEO
 * Usar en pages que necesiten datos estructurados específicos
 */

interface FAQItem {
  question: string;
  answer: string;
}

export function FAQSchema({ items }: { items: FAQItem[] }) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function BreadcrumbSchema({
  items,
}: {
  items: { name: string; url: string }[];
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function ProductSchema({
  name,
  description,
  image,
  brand,
  offers,
}: {
  name: string;
  description: string;
  image?: string;
  brand?: string;
  offers?: {
    priceCurrency: string;
    availability: string;
    description: string;
  };
}) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    ...(image && { image }),
    brand: {
      "@type": "Brand",
      name: brand || "Quilmes Corrugados",
    },
    manufacturer: {
      "@type": "Organization",
      name: "Quilmes Corrugados S.A.",
      url: "https://quilmes-corrugados.vercel.app",
    },
    ...(offers && {
      offers: {
        "@type": "Offer",
        ...offers,
        seller: {
          "@type": "Organization",
          name: "Quilmes Corrugados S.A.",
        },
      },
    }),
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function OrganizationSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Quilmes Corrugados S.A.",
    url: "https://quilmes-corrugados.vercel.app",
    logo: "https://quilmes-corrugados.vercel.app/logo.svg",
    description: "Fábrica de cajas de cartón corrugado a medida en Quilmes, Buenos Aires, Argentina.",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Quilmes",
      addressRegion: "Buenos Aires",
      addressCountry: "AR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+54 9 11 6924-9801",
      contactType: "sales",
      availableLanguage: "Spanish",
      areaServed: "AR",
    },
    sameAs: [
      // Agregar URLs de redes sociales cuando existan
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export function WebSiteSchema() {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quilmes Corrugados",
    url: "https://quilmes-corrugados.vercel.app",
    description: "Fábrica de cajas de cartón corrugado a medida para empresas en Argentina.",
    publisher: {
      "@type": "Organization",
      name: "Quilmes Corrugados S.A.",
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: "https://quilmes-corrugados.vercel.app/#cotizador",
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
