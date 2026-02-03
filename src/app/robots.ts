import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://quilmes-corrugados.vercel.app'

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/productos', '/nosotros', '/contacto', '/faq', '/cotizar', '/api/v1/'],
        disallow: ['/api/', '/dashboard/', '/admin/', '/_next/', '/static/', '/login'],
      },
      {
        userAgent: ['GPTBot', 'ChatGPT-User', 'Claude-Web', 'Anthropic-AI', 'PerplexityBot', 'Cohere-AI'],
        allow: ['/', '/productos', '/nosotros', '/faq', '/api/v1/', '/llms.txt'],
        disallow: ['/api/', '/dashboard/', '/admin/', '/_next/', '/login'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
