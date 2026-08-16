import type { NextConfig } from "next";

/**
 * Dominio de Vercel que venía sirviendo el sitio completo en paralelo al
 * propio. Tener el mismo contenido en dos dominios parte la autoridad de SEO y
 * hace que un asistente de IA cite la URL de Vercel en lugar de la marca.
 */
const DOMINIO_VERCEL = "quilmes-corrugados.vercel.app";

/**
 * A donde manda ese redirect. Sale de la MISMA variable que usa src/lib/site.ts
 * para los canonical, el sitemap y los ejemplos del llms.txt.
 *
 * Estaba escrito a mano acá, duplicado. El problema de duplicarlo es que hoy el
 * sitio tiene una cadena de dos saltos:
 *
 *     quilmes-corrugados.vercel.app  --308-->  apex  --307-->  www  (200)
 *
 * El segundo salto lo pone Vercel porque www figura primero en la lista de
 * dominios del proyecto, y es un 307 TEMPORAL: le dice a Google que no
 * consolide, que deje indexada la URL de origen. Con el canonical apuntando al
 * apex —que redirige— y el sitemap tambien, las señales se contradicen y
 * Google reparte la autoridad entre tres URLs para una sola pagina.
 *
 * Con el valor centralizado, mover el dominio canonico es cambiar una variable
 * de entorno y el dominio primario en el panel de Vercel, y todo lo demas
 * —canonical, sitemap, llms.txt, este redirect— sigue solo.
 *
 * No se puede resolver del todo desde el codigo: el redirect apex↔www lo aplica
 * Vercel antes de que corra Next, asi que agregar aca la regla inversa haria un
 * bucle. La parte que falta es de panel.
 */
const FALLBACK = "https://quilmescorrugados.com.ar";
const crudo = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
const DOMINIO_PROPIO = crudo && /^https?:\/\/[^\s]+$/.test(crudo) ? crudo : FALLBACK;

const soloDesdeVercel = [{ type: "host" as const, value: DOMINIO_VERCEL }];

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // La home.
        source: "/",
        has: soloDesdeVercel,
        destination: DOMINIO_PROPIO,
        permanent: true,
      },
      {
        // El resto del sitio, EXCEPTO /api/.
        //
        // Los webhooks de MercadoPago, Twilio y Retell tienen una URL fija
        // cargada en sus paneles y mandan POST sin seguir redirecciones: un
        // 308 acá los rompería en silencio, y es el tipo de falla que no se
        // nota hasta que falta un pago. La API tampoco compite por
        // posicionamiento, así que servirla en los dos dominios no cuesta nada.
        source: "/:path((?!api/).*)",
        has: soloDesdeVercel,
        destination: `${DOMINIO_PROPIO}/:path`,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
