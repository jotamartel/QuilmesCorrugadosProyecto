/**
 * Negociación de contenido para agentes (acceptmarkdown.com).
 *
 * La convención: la MISMA URL que sirve HTML a un navegador tiene que servir
 * markdown a un cliente que manda `Accept: text/markdown`, con
 * `Content-Type: text/markdown; charset=utf-8` y `Vary: Accept` en la
 * respuesta, respetando los q-values y devolviendo 406 cuando el cliente no
 * acepta nada de lo que sabemos servir (RFC 9110).
 *
 * Esta función decide y nada más; no toca la request. Vive separada del
 * middleware para poder probarla como función pura: la tabla de casos está en
 * scripts/verificar-agentes.mjs y corre contra el sitio ya deployado.
 */

export type FormatoNegociado = 'html' | 'markdown' | 'inaceptable';

interface EntradaAccept {
  tipo: string;
  q: number;
}

function parsearAccept(accept: string): EntradaAccept[] {
  return accept
    .split(',')
    .map((parte) => {
      const [tipo, ...params] = parte.trim().split(';');
      let q = 1;
      for (const p of params) {
        const m = p.trim().match(/^q=(\d(?:\.\d{0,3})?)$/i);
        if (m) q = parseFloat(m[1]);
      }
      return { tipo: tipo.trim().toLowerCase(), q: Number.isFinite(q) ? q : 1 };
    })
    .filter((e) => e.tipo.length > 0);
}

/**
 * q-value efectivo para un tipo concreto: gana la entrada MÁS ESPECÍFICA
 * (exacta > text/* > *​/*), como manda RFC 9110. Sin ninguna entrada que lo
 * cubra, el tipo no es aceptable (q=0).
 */
function qPara(objetivo: string, entradas: EntradaAccept[]): number {
  const prefijo = objetivo.split('/')[0] + '/*';
  let especificidad = -1;
  let q = 0;
  for (const e of entradas) {
    let esp: number;
    if (e.tipo === objetivo) esp = 2;
    else if (e.tipo === prefijo) esp = 1;
    else if (e.tipo === '*/*') esp = 0;
    else continue;
    if (esp > especificidad) {
      especificidad = esp;
      q = e.q;
    } else if (esp === especificidad) {
      q = Math.max(q, e.q);
    }
  }
  return q;
}

export function elegirFormato(accept: string | null | undefined): FormatoNegociado {
  // Sin Accept, el cliente acepta cualquier cosa: HTML, que es lo que era.
  if (!accept || !accept.trim()) return 'html';

  const entradas = parsearAccept(accept);
  if (entradas.length === 0) return 'html';

  const qMarkdown = qPara('text/markdown', entradas);
  // Todo lo que en la práctica significa "dame la página": el HTML en sí, su
  // variante XHTML, el payload RSC de una navegación del propio sitio y el
  // stream SSE que puede pedir un cliente de API. A ninguno de esos hay que
  // contestarle markdown ni 406.
  const qHtml = Math.max(
    qPara('text/html', entradas),
    qPara('application/xhtml+xml', entradas),
    qPara('text/x-component', entradas),
    qPara('text/event-stream', entradas),
  );

  // Markdown SOLO cuando lo pidieron con nombre y apellido. Un `*/*` no es un
  // pedido de markdown: es un navegador viejo o un curl pelado, y a esos les
  // corresponde el HTML de siempre.
  const pidioMarkdown = entradas.some((e) => e.tipo === 'text/markdown' && e.q > 0);
  if (pidioMarkdown && qMarkdown >= qHtml) return 'markdown';

  if (qHtml > 0 || qMarkdown > 0) return 'html';
  return 'inaceptable';
}
