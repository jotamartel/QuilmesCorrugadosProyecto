import type { NextConfig } from "next";

/**
 * Dominio de Vercel que venía sirviendo el sitio completo en paralelo al
 * propio. Tener el mismo contenido en dos dominios parte la autoridad de SEO y
 * hace que un asistente de IA cite la URL de Vercel en lugar de la marca.
 */
const DOMINIO_VERCEL = "quilmes-corrugados.vercel.app";
const DOMINIO_PROPIO = "https://quilmescorrugados.com.ar";

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
