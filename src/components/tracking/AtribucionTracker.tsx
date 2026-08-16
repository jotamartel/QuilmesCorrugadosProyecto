'use client';

import { Suspense, useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { registrarVisita } from '@/lib/utils/atribucion';

/**
 * Registra de dónde vino cada visita, para poder atribuir las cotizaciones a
 * la campaña que las genera.
 *
 * Va aparte de GoogleAnalytics a propósito: ese componente devuelve null si no
 * hay measurement ID configurado, y la atribución tiene que funcionar igual.
 * Es dato propio y no depende de que Analytics esté activo.
 *
 * Se vuelve a ejecutar en cada navegación porque el App Router no recarga la
 * página: sin esto, alguien que entra por un anuncio a /cajas-ecommerce y
 * después navega a /cajas perdería el origen.
 */
function Registro() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    registrarVisita();
  }, [pathname, searchParams]);

  return null;
}

export function AtribucionTracker() {
  // useSearchParams obliga a un Suspense boundary en el App Router: sin esto,
  // toda la pagina se renderiza del lado del cliente y se pierde el HTML
  // estatico que justamente queremos que indexen los buscadores.
  return (
    <Suspense fallback={null}>
      <Registro />
    </Suspense>
  );
}
