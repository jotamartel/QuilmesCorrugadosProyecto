/**
 * Verificar un CBU y un CUIT de verdad, no solo contar dígitos.
 *
 * POR QUE
 *
 * Un CBU con un dígito mal tipeado tiene los mismos 22 caracteres que uno
 * bueno: el chequeo de largo lo deja pasar entero. Y ese dato se publica en la
 * página de la cotización, en la del pedido y en cada WhatsApp del bot — un
 * error se difunde a los tres canales al mismo tiempo y la transferencia
 * rebota, o peor, cae en otra cuenta.
 *
 * Los dos números traen su propio dígito verificador justamente para eso. Es
 * aritmética de diez líneas y ataja el error antes de que exista.
 */

/**
 * El dígito verificador de un bloque de CBU.
 *
 * Cada dígito se multiplica por su ponderador, se suman, y el verificador es
 * lo que falta para llegar a la próxima decena. Los ponderadores se repiten
 * 7-1-3-9 de derecha a izquierda; van escritos ya alineados a cada bloque.
 */
function digitoDeBloque(digitos: string, ponderadores: number[]): number {
  const suma = digitos
    .split('')
    .reduce((acc, d, i) => acc + Number(d) * ponderadores[i], 0);
  return (10 - (suma % 10)) % 10;
}

/**
 * ¿Es un CBU/CVU válido?
 *
 * 22 dígitos en dos bloques con verificador propio: los primeros 8 identifican
 * banco y sucursal, los 14 restantes la cuenta.
 */
export function cbuValido(cbu: string): boolean {
  const n = cbu.replace(/\D/g, '');
  if (n.length !== 22) return false;

  const bloque1 = n.slice(0, 8);
  const bloque2 = n.slice(8);

  const dv1 = digitoDeBloque(bloque1.slice(0, 7), [7, 1, 3, 9, 7, 1, 3]);
  const dv2 = digitoDeBloque(bloque2.slice(0, 13), [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);

  return dv1 === Number(bloque1[7]) && dv2 === Number(bloque2[13]);
}

/** El banco de un CBU son sus tres primeros dígitos. Sirve para mostrarlo. */
export function bancoDeCBU(cbu: string): string | null {
  const n = cbu.replace(/\D/g, '');
  return n.length === 22 ? n.slice(0, 3) : null;
}

/**
 * ¿Es un CUIT válido?
 *
 * 11 dígitos: los 10 primeros ponderados 5-4-3-2-7-6-5-4-3-2, y el
 * verificador sale del resto de dividir por 11.
 */
export function cuitValido(cuit: string): boolean {
  const n = cuit.replace(/\D/g, '');
  if (n.length !== 11) return false;

  const ponderadores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = ponderadores.reduce((acc, p, i) => acc + Number(n[i]) * p, 0);
  const resto = suma % 11;

  // Los dos casos de borde del algoritmo: resto 0 da verificador 0, y resto 1
  // da 9 en los CUIT que empiezan con 20/23/24/27 (sin esta rama, una porción
  // de CUIT legítimos se rechazaría).
  const dv = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;

  return dv === Number(n[10]);
}

/** Con los guiones donde van: 30-70938614-6. */
export function formatearCUIT(cuit: string): string {
  const n = cuit.replace(/\D/g, '');
  return n.length === 11 ? `${n.slice(0, 2)}-${n.slice(2, 10)}-${n[10]}` : cuit;
}
