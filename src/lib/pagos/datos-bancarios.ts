/**
 * El mensaje con los datos para transferir, ya redactado.
 *
 * ES SOLO FORMATEO A PROPOSITO: quien tiene la configuracion es el que llama
 * (getBankDataForClient() en src/lib/config/system.ts). Sin fetch y sin base
 * adentro, este helper se prueba con un objeto en la mano y lo consumen igual
 * los tres canales: el boton del panel, el agente de WhatsApp y los avisos
 * automaticos. Si los tres redactaran por su cuenta, en seis meses habria
 * tres mensajes distintos con el mismo alias.
 */
import type { DatosBancarios } from '@/lib/config/system';

const pesos = (n: number) =>
  `$${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.round(n))}`;

export function formatearAliasParaWhatsApp(
  datos: DatosBancarios,
  opts?: { orderNumber?: string; balanceAmount?: number },
): string {
  const lineas: string[] = [];

  if (opts?.orderNumber) {
    lineas.push(`Pedido ${opts.orderNumber}`);
    if (typeof opts.balanceAmount === 'number' && opts.balanceAmount > 0) {
      lineas.push(`Saldo a pagar: ${pesos(opts.balanceAmount)}`);
    }
    lineas.push('');
  }

  lineas.push('Para transferirnos:');
  lineas.push('');
  lineas.push(`Alias: ${datos.alias}`);
  lineas.push(`CBU: ${datos.cbu}`);
  lineas.push(`Titular: ${datos.holder} (CUIT ${datos.cuit})`);
  if (datos.bank) lineas.push(`Banco: ${datos.bank}`);
  lineas.push('');
  lineas.push('Cuando la hagas, respondenos por aca con el comprobante.');

  return lineas.join('\n');
}
