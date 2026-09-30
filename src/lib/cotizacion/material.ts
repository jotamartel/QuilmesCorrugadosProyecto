/**
 * Los tipos de cartón que se cotizan.
 *
 * POR QUE EXISTE
 *
 * Hasta septiembre de 2026 había un solo material y vivía como texto en
 * MATERIAL (retail/config). El historial de WhatsApp mostró el costo: gente
 * que escribía "doble triple, 7 mm, reforzadas" recibía el precio de la onda
 * simple, y después Florencia tenía que desmentirlo y recotizar a mano. Pasó
 * con una caja de 300x300x240 por 5.000 unidades: el bot dio $607,50 y el
 * precio real en doble triple 120 liner era $1.215. Otra vez el bot contestó
 * "no fabricamos en doble corrugado", que es falso.
 *
 * Ahora el material es una variable del precio, igual que el volumen. Además
 * de la onda simple hay tres cartones REFORZADOS —130 libras onda C, doble
 * triple 120 liner y doble triple 150 kraft— y cada uno tiene su precio por
 * m² en pricing_config, editable desde el panel. Los reforzados comparten las
 * reglas: un solo precio por m² sin escalera, siempre a pedido (no hay stock)
 * y un mínimo propio. Un reforzado sin precio cargado no se ofrece en ningún
 * canal (ver materialDisponible), así que nunca sale un precio que nadie fijó.
 */

import type { PricingConfig } from '@/lib/types/database';

export type Material = 'simple' | 'r130' | 'dt120' | 'dt150';
export type MaterialReforzado = Exclude<Material, 'simple'>;

/** De menos a más resistente, que es el orden en que se ofrecen. */
export const REFORZADOS: readonly MaterialReforzado[] = ['r130', 'dt120', 'dt150'];

export const MATERIALES: Record<
  Material,
  {
    /** Nombre corto, para meter en una oración: "cajas en ${nombre}". */
    nombre: string;
    /** Frase completa, para un cliente. */
    descripcion: string;
    /** Una línea para el selector de la web. */
    para_que: string;
    espesor_mm: number;
  }
> = {
  simple: {
    nombre: 'onda simple',
    descripcion: 'Cartón corrugado kraft de 90 libras, onda simple (onda C), 4 mm de espesor.',
    para_que: 'Kraft 90 libras. El estándar para embalaje y envíos.',
    espesor_mm: 4,
  },
  r130: {
    nombre: 'reforzado 130 libras',
    descripcion:
      'Cartón corrugado reforzado de 130 libras, onda simple (onda C), 4 mm de espesor. Mismo ' +
      'espesor que el estándar con papel más pesado: para productos de peso medio, unos 15 a 20 kilos.',
    para_que: 'Mismo espesor, papel más pesado. Para productos de peso medio.',
    espesor_mm: 4,
  },
  dt120: {
    nombre: 'doble triple 120 liner',
    descripcion:
      'Cartón corrugado doble triple 120 liner (doble pared), 7 mm de espesor. Para productos ' +
      'pesados, estiba en pallet o transporte largo.',
    para_que: 'Doble pared, 7 mm. Para productos pesados o estiba en pallet.',
    espesor_mm: 7,
  },
  dt150: {
    nombre: 'doble triple 150 kraft',
    descripcion:
      'Cartón corrugado doble triple 150 kraft (doble pared, papel kraft puro), 7 mm de ' +
      'espesor. El más resistente que fabricamos: cargas muy pesadas, estiba alta, exportación.',
    para_que: 'Papel kraft puro, el más resistente. Cargas muy pesadas, estiba alta, exportación.',
    espesor_mm: 7,
  },
};

type ConfigDeMateriales = Pick<
  PricingConfig,
  'price_per_m2_r130' | 'price_per_m2_dt120' | 'price_per_m2_dt150'
>;

/** Todo lo que no es la onda simple: precio único, a pedido, mínimo propio. */
export function esReforzado(m: Material | undefined): m is MaterialReforzado {
  return m === 'r130' || m === 'dt120' || m === 'dt150';
}

/** Si es de doble pared. Importa para el texto, no para el precio. */
export function esDobleTriple(m: Material | undefined): boolean {
  return m === 'dt120' || m === 'dt150';
}

/** Precio por m² de un reforzado, o null si no está cargado. */
export function precioReforzado(config: ConfigDeMateriales, m: MaterialReforzado): number | null {
  const precio =
    m === 'r130' ? config.price_per_m2_r130
    : m === 'dt120' ? config.price_per_m2_dt120
    : config.price_per_m2_dt150;
  return precio && precio > 0 ? precio : null;
}

/**
 * Si este material se puede cotizar. La onda simple siempre; cada reforzado,
 * solo si tiene precio. La config vieja —antes de las migraciones 040 y 041—
 * no trae las columnas, y eso se lee igual que "sin precio".
 */
export function materialDisponible(config: ConfigDeMateriales, m: Material): boolean {
  return m === 'simple' || precioReforzado(config, m) !== null;
}

/** Los reforzados que hoy se pueden cotizar, de menos a más resistente. */
export function reforzadosDisponibles(config: ConfigDeMateriales): MaterialReforzado[] {
  return REFORZADOS.filter((m) => precioReforzado(config, m) !== null);
}

/**
 * Lee un material de lo que venga (query string, body, parámetro de tool).
 * Lo que no reconoce es null, no "simple": quien llama decide si eso es un
 * error o el valor por defecto. "doble triple" a secas también es null: son
 * dos calidades con precios distintos y elegir una por la persona sería
 * cotizarle algo que no pidió.
 */
export function leerMaterial(valor: unknown): Material | null {
  if (typeof valor !== 'string') return null;
  const v = valor.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (v === 'simple' || v === 'ondasimple' || v === '90' || v === '90libras') return 'simple';
  if (v === 'r130' || v === '130' || v === '130libras' || v === 'reforzado130') return 'r130';
  if (v === 'dt120' || v === 'dobletriple120' || v === 'dobletriple120liner') return 'dt120';
  if (v === 'dt150' || v === 'dobletriple150' || v === 'dobletriple150kraft') return 'dt150';
  return null;
}

/** Cómo va el material en una URL de /cotizar: solo aparece si no es el estándar. */
export function queryDeMaterial(material: Material | undefined): string {
  return material && material !== 'simple' ? `?carton=${material}` : '';
}
