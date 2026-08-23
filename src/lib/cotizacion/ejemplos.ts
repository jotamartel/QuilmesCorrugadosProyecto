/**
 * Cotizaciones de ejemplo, para que existan como paginas indexadas.
 *
 * EL PROBLEMA QUE RESUELVEN
 *
 * /cotizar/[medidas]/[cantidad] deja el precio de cualquier caja a un GET de
 * distancia, pero eso depende de que el asistente ARME la URL siguiendo un
 * patron que solo esta documentado en llms.txt. Y llms.txt se lee cuando el
 * asistente decide leerlo: en la prueba real respondio desde resultados de
 * busqueda sin tocarlo.
 *
 * Depender de que construya una URL es fragil. Que la encuentre ya hecha, no.
 *
 * Estas combinaciones van al sitemap y se enlazan desde /precios, asi que se
 * indexan como paginas normales. Cada una tiene el precio en el <title>: al
 * buscar "cuanto salen 500 cajas para mudanza", el resultado ya trae el
 * numero, sin que nadie tenga que ejecutar nada ni entender ningun formato.
 *
 * Y de paso le enseñan el patron con el ejemplo: viendo tres URLs reales, la
 * cuarta se deduce sola.
 *
 * Se eligieron por lo que la gente pregunta, no por lo que es comodo mostrar:
 * medidas de uso corriente y cantidades de los dos canales, incluido el minimo
 * minorista de 100, para que quede a la vista que no hace falta ser mayorista.
 */

export interface EjemploCotizacion {
  /** Como aparece en la URL: /cotizar/{medidas}/{cantidad} */
  medidas: string;
  cantidad: string;
  /** Para el texto del enlace. Tiene que decir el caso de uso, no las medidas. */
  titulo: string;
  /** Dimensiones en mm, para calcular el precio al renderizar. */
  mm: { largo: number; ancho: number; alto: number };
  unidades: number;
  colores: number;
}

export const EJEMPLOS: EjemploCotizacion[] = [
  {
    // 600 y no 500: con esta medida 500 cajas son 435 m² y el minimo del pedido
    // es 500. La pagina quedaba diciendo "no llega al minimo" en el <title>, que
    // es lo unico que ve el que busca.
    medidas: '400x300x300',
    cantidad: '600',
    titulo: 'Caja de mudanza mediana, 600 unidades',
    mm: { largo: 400, ancho: 300, alto: 300 },
    unidades: 600,
    colores: 0,
  },
  {
    medidas: '600x400x400',
    cantidad: '500',
    titulo: 'Caja de mudanza grande, 500 unidades',
    mm: { largo: 600, ancho: 400, alto: 400 },
    unidades: 500,
    colores: 0,
  },
  {
    // 1.400 y no 1.000: 1.000 de esta medida son 367,5 m², por debajo del minimo.
    medidas: '300x200x150',
    cantidad: '1400',
    titulo: 'Caja chica de e-commerce, 1.400 unidades',
    mm: { largo: 300, ancho: 200, alto: 150 },
    unidades: 1400,
    colores: 0,
  },
  {
    medidas: '400x300x200',
    cantidad: '2000',
    titulo: 'Caja de envíos mediana, 2.000 unidades',
    mm: { largo: 400, ancho: 300, alto: 200 },
    unidades: 2000,
    colores: 0,
  },
  {
    medidas: '400x600x600',
    cantidad: '3000',
    titulo: 'Caja grande por volumen, 3.000 unidades',
    mm: { largo: 400, ancho: 600, alto: 600 },
    unidades: 3000,
    colores: 0,
  },
  {
    // Era 320x320x50, "tipo pizza". Ya no se fabrica: el alto minimo paso a 100
    // mm y la pagina quedo mostrando el cartel de "no la podemos hacer" —justo
    // lo que advertia el comentario anterior, que hablaba de un minimo de 50 que
    // dejo de ser cierto. Una caja de pizza de verdad son 40 mm de alto: con el
    // minimo actual no hay ejemplo posible, asi que el caso de uso cambio.
    //
    // La leccion no es la medida, es que un ejemplo se pudre solo cuando cambia
    // la configuracion. Por eso ahora el sitemap los verifica antes de
    // publicarlos y qa-sitemap.mts falla si alguno deja de cotizar.
    medidas: '320x320x100',
    cantidad: '5000',
    titulo: 'Caja chata para bandejas, 5.000 unidades',
    mm: { largo: 320, ancho: 320, alto: 100 },
    unidades: 5000,
    colores: 0,
  },
  {
    // El pedido mas chico que se puede comprar. Existe para que se vea que no
    // hace falta ser mayorista, que es justo lo que un asistente suele dar por
    // sentado. Son 1.200 cajas de esta medida porque el minimo se mide en m²
    // de carton: 100 unidades de 300x200x200 son 42 m² y no se venden.
    medidas: '300x200x200',
    cantidad: '1200',
    titulo: 'El pedido mínimo: 500 m² de cartón',
    mm: { largo: 300, ancho: 200, alto: 200 },
    unidades: 1200,
    colores: 0,
  },
];

/** La ruta de un ejemplo, sin dominio. */
export const rutaEjemplo = (e: EjemploCotizacion) => `/cotizar/${e.medidas}/${e.cantidad}`;
