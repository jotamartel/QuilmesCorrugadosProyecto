import { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/site'
import { EJEMPLOS, rutaEjemplo } from '@/lib/cotizacion/ejemplos'
import { calcularCotizacion } from '@/lib/cotizacion/motor'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PricingConfig } from '@/lib/types/database'

const BASE_URL = SITE_URL

// Una hora. Los ejemplos se verifican contra la configuracion de precios, que
// vive en la base y puede cambiar sin desplegar: si el minimo se mueve, el
// sitemap se corrige solo dentro de la hora.
export const revalidate = 3600

/**
 * Las cotizaciones de ejemplo que HOY dan un precio.
 *
 * POR QUE SE VERIFICAN Y NO SE LISTAN Y LISTO
 *
 * Estaban listadas a mano y tres de las ocho habian dejado de cotizar. El
 * minimo del pedido se movio a 500 m² en la base —sin tocar el codigo— y
 * 400x300x300 x500, que son 435 m², paso a ser un "no llega al minimo". Otra,
 * 320x320x50, dejo de fabricarse cuando el alto minimo paso a 100 mm.
 *
 * Esas paginas se declaran `robots: noindex` cuando no hay precio, asi que el
 * sitemap le pedia a Google que indexara tres URLs que le contestan que no la
 * indexe. Eso no es un detalle de prolijidad: contradecir el propio sitemap es
 * de las pocas cosas que Search Console mira para decidir cuanto le cree.
 *
 * Ahora se corre el motor antes de publicarlas. Un ejemplo que dejo de cotizar
 * desaparece del sitemap solo, sin que nadie se entere tarde por Search
 * Console. Igual conviene que no pase: scripts/qa-sitemap.mts falla cuando uno
 * deja de cotizar, para enterarse al hacer el cambio y no un mes despues.
 */
async function ejemplosConPrecio(): Promise<string[]> {
  try {
    const db = createAdminClient()

    const { data: config } = await db
      .from('pricing_config')
      .select('*')
      .eq('is_active', true)
      .order('valid_from', { ascending: false })
      .limit(1)
      .single()

    // Sin configuracion no se puede saber cual cotiza. Se publica el sitemap sin
    // los ejemplos antes que publicarlos sin verificar: una URL de menos se
    // recupera en el proximo revalidado, una URL rota queda en el indice.
    if (!config) {
      console.error('[sitemap] sin pricing_config: se publican solo las paginas fijas')
      return []
    }

    const { data: catalogo } = await db
      .from('boxes')
      .select('length_mm, width_mm, height_mm, stock')
      .eq('is_standard', true)
      .eq('is_active', true)

    return EJEMPLOS.filter((e) => {
      const q = calcularCotizacion(
        [
          {
            length_mm: e.mm.largo,
            width_mm: e.mm.ancho,
            height_mm: e.mm.alto,
            quantity: e.unidades,
            printing_colors: e.colores,
            has_printing: e.colores > 0,
          },
        ],
        config as PricingConfig,
        catalogo || [],
      )
      if (!q.cotizable) {
        console.error(
          '[sitemap] %s quedo afuera: %s',
          rutaEjemplo(e),
          q.impedimento.tipo,
        )
      }
      return q.cotizable
    }).map(rutaEjemplo)
  } catch (error) {
    console.error('[sitemap] no se pudieron verificar los ejemplos:', error)
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date().toISOString()
  const cotizaciones = await ejemplosConPrecio()

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
    // /cajas-alimentos queda fuera a propósito: producto en pausa (microcorrugado
    // tercerizado sin cerrar), la página tiene noindex en su layout.
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
      // Puerta de entrada de desarrolladores y asistentes de IA a la API de
      // cotizacion. Estaba permitida en robots.ts pero fuera del sitemap.
      url: `${BASE_URL}/api/v1/docs`,
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
    {
      url: `${BASE_URL}/terminos`,
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
    //
    // Solo las que dan precio: ver ejemplosConPrecio().
    ...cotizaciones.map((ruta) => ({
      url: `${BASE_URL}${ruta}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
  ]
}
