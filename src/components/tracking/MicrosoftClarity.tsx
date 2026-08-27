import Script from 'next/script';

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID;

/**
 * Microsoft Clarity: grabaciones de sesión y mapas de calor, gratis y sin
 * límite de tráfico. Es la herramienta para ver CÓMO navega la gente —dónde
 * clickea, hasta dónde scrollea, en qué paso del cotizador se traba— que GA4
 * no muestra: GA4 dice qué pasó, Clarity muestra por qué.
 *
 * Va montado en los layouts públicos ((public) y (retail)/cajas), NUNCA en el
 * raíz: el dashboard interno muestra datos de clientes —teléfonos, mails,
 * cotizaciones— y esas pantallas no tienen por qué quedar grabadas en un
 * tercero. Clarity además enmascara el contenido de los inputs por defecto
 * (modo Balanced), así lo que la gente tipea en el cotizador no viaja en la
 * grabación.
 *
 * Sin NEXT_PUBLIC_CLARITY_ID no renderiza nada. El ID sale del proyecto en
 * clarity.microsoft.com y se carga en Vercel; como toda variable NEXT_PUBLIC_
 * queda horneada en el build, así que después de setearla hay que redeployar.
 */
export function MicrosoftClarity() {
  if (!CLARITY_ID) return null;
  return (
    <Script id="ms-clarity" strategy="afterInteractive">
      {`(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${CLARITY_ID}");`}
    </Script>
  );
}
