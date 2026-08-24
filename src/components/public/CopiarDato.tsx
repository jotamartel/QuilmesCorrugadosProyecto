'use client';

/**
 * Un dato con su boton de copiar, para paginas publicas.
 *
 * Existe por el alias bancario, que termina en punto y ese punto es parte del
 * dato: mostrarlo como texto invita a tipearlo mal. Copiar mata el problema de
 * raiz — se copia el valor EXACTO, puntuacion incluida.
 */
import { useState } from 'react';

export function CopiarDato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  const [copiado, setCopiado] = useState(false);

  return (
    <div className="flex items-center gap-2 min-w-0">
      <dt className="text-gray-500 w-16 shrink-0 text-sm">{etiqueta}:</dt>
      <dd className="min-w-0 flex-1">
        <span className="font-medium text-sm break-all">{valor}</span>
        {nota && <span className="block text-xs text-amber-700">{nota}</span>}
      </dd>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(valor);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
        className="shrink-0 text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded-md px-2.5 py-1 transition-colors"
      >
        {copiado ? 'Copiado ✓' : 'Copiar'}
      </button>
    </div>
  );
}
