import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { EJEMPLOS, rutaEjemplo } from '@/lib/cotizacion/ejemplos'

const BASE_URL = SITE_URL

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date().toISOString()

  return [
    {
      url: BASE_URL,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${BASE_URL}/productos`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      // Canal minorista: es la landing a la que apunta la pauta de "desde 100 unidades"
      url: `${BASE_URL}/cajas`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      // La unica pagina que publica precios en el HTML. Es la que puede citar
      // un asistente de IA sin tener que llamar a la API.
      url: `${BASE_URL}/precios`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/cajas-ecommerce`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/cajas-alimentos`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/mayorista`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/cajas-mudanza`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.85,
    },
    {
      url: `${BASE_URL}/nosotros`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/contacto`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${BASE_URL}/faq`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: `${BASE_URL}/privacidad`,
      lastModified: now,
      changeFrequency: 'yearly',
      priority: 0.5,
    },

    // Cotizaciones concretas, con el precio en el title.
    //
    // Estan en el sitemap para que se indexen como paginas normales. Es la
    // diferencia entre que un asistente tenga que ARMAR una URL siguiendo un
    // patron documentado —que solo ve si lee llms.txt— y que encuentre la
    // respuesta ya hecha buscando "cuanto salen 500 cajas de mudanza".
    //
    // Prioridad alta a proposito: son las paginas que contestan la pregunta
    // con un numero, que es lo unico que el que pregunta queria.
    ...EJEMPLOS.map((e) => ({
      url: `${BASE_URL}${rutaEjemplo(e)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
