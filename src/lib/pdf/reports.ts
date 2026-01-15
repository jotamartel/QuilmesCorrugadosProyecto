/**
 * Utilidades para generar reportes en PDF
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatM2 } from '@/lib/utils/pricing';

// Extender jsPDF para incluir lastAutoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

interface PDFOptions {
  title: string;
  subtitle?: string;
  filters?: Record<string, string>;
}

/**
 * Crear documento PDF base con header y footer
 */
function createBasePDF(options: PDFOptions): jsPDF {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFillColor(37, 99, 235); // blue-600
  doc.rect(0, 0, pageWidth, 25, 'F');

  // Logo placeholder (texto)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('QUILMES CORRUGADOS', 14, 16);

  // Fecha de generacion
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const fecha = new Date().toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Generado: ${fecha}`, pageWidth - 14, 16, { align: 'right' });

  // Titulo del reporte
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(options.title, 14, 38);

  // Subtitulo si existe
  let yPos = 38;
  if (options.subtitle) {
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(options.subtitle, 14, 46);
    yPos = 46;
  }

  // Filtros aplicados
  if (options.filters && Object.keys(options.filters).length > 0) {
    yPos += 8;
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const filterText = Object.entries(options.filters)
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ');
    doc.text(filterText, 14, yPos);
  }

  return doc;
}

/**
 * Agregar footer a todas las paginas
 */
function addFooter(doc: jsPDF): void {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Linea separadora
    doc.setDrawColor(200, 200, 200);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);

    // Texto del footer
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      'Generado desde sistema.quilmescorrugados.com.ar',
      14,
      pageHeight - 8
    );
    doc.text(
      `Pagina ${i} de ${pageCount}`,
      pageWidth - 14,
      pageHeight - 8,
      { align: 'right' }
    );
  }
}

/**
 * Reporte de Ventas
 */
export function exportSalesReport(
  data: Array<{
    period: string;
    total_quotes: number;
    total_orders: number;
    total_revenue: number;
    total_m2: number;
  }>,
  summary: {
    total_quotes: number;
    total_orders: number;
    total_revenue: number;
    total_m2: number;
    conversion_rate: number;
  },
  period: string
): void {
  const periodLabels: Record<string, string> = {
    day: 'Por dia',
    week: 'Por semana',
    month: 'Por mes',
  };

  const doc = createBasePDF({
    title: 'Reporte de Ventas',
    subtitle: `Agrupado ${periodLabels[period] || period}`,
  });

  // Tabla de datos
  autoTable(doc, {
    startY: 55,
    head: [['Periodo', 'Cotizaciones', 'Ordenes', 'Facturacion', 'm2 Vendidos']],
    body: data.map((row) => [
      row.period,
      row.total_quotes.toString(),
      row.total_orders.toString(),
      formatCurrency(row.total_revenue),
      formatM2(row.total_m2),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Resumen
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Resumen', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Metrica', 'Valor']],
    body: [
      ['Total Cotizaciones', summary.total_quotes.toString()],
      ['Total Ordenes', summary.total_orders.toString()],
      ['Facturacion Total', formatCurrency(summary.total_revenue)],
      ['m2 Totales', formatM2(summary.total_m2)],
      ['Tasa de Conversion', `${summary.conversion_rate.toFixed(1)}%`],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      0: { fontStyle: 'bold' },
    },
  });

  addFooter(doc);
  doc.save(`reporte-ventas-${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Reporte de Produccion
 */
export function exportProductionReport(
  data: Array<{
    status: string;
    status_label: string;
    count: number;
    total_m2: number;
    total_revenue: number;
  }>,
  summary: {
    pending_m2: number;
    pending_count: number;
    in_production_m2: number;
    in_production_count: number;
    completed_m2: number;
    completed_count: number;
    total_m2: number;
    total_orders: number;
  }
): void {
  const doc = createBasePDF({
    title: 'Reporte de Produccion',
    subtitle: 'm2 producidos y pendientes por estado',
  });

  // Tabla por estado
  autoTable(doc, {
    startY: 55,
    head: [['Estado', 'Cantidad', 'm2 Totales', 'Valor']],
    body: data.map((row) => [
      row.status_label,
      row.count.toString(),
      formatM2(row.total_m2),
      formatCurrency(row.total_revenue),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Resumen
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Resumen General', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Categoria', 'Ordenes', 'm2']],
    body: [
      ['Pendientes de produccion', summary.pending_count.toString(), formatM2(summary.pending_m2)],
      ['En produccion', summary.in_production_count.toString(), formatM2(summary.in_production_m2)],
      ['Completados', summary.completed_count.toString(), formatM2(summary.completed_m2)],
      ['TOTAL', summary.total_orders.toString(), formatM2(summary.total_m2)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    foot: [['', '', '']],
  });

  addFooter(doc);
  doc.save(`reporte-produccion-${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Reporte de Clientes Top
 */
export function exportClientsReport(
  data: Array<{
    client_name: string;
    company: string | null;
    total_orders: number;
    total_m2: number;
    total_revenue: number;
  }>,
  summary: {
    total_clients: number;
    top_clients_percentage: number;
  }
): void {
  const doc = createBasePDF({
    title: 'Reporte de Clientes Top',
    subtitle: 'Top 10 clientes por facturacion',
  });

  // Tabla de clientes
  autoTable(doc, {
    startY: 55,
    head: [['#', 'Cliente', 'Empresa', 'Ordenes', 'm2', 'Facturacion']],
    body: data.map((row, idx) => [
      (idx + 1).toString(),
      row.client_name,
      row.company || '-',
      row.total_orders.toString(),
      formatM2(row.total_m2),
      formatCurrency(row.total_revenue),
    ]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  // Resumen
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Los top 10 clientes representan el ${summary.top_clients_percentage.toFixed(1)}% de la facturacion total.`,
    14,
    finalY
  );
  doc.text(`Total de clientes activos: ${summary.total_clients}`, 14, finalY + 6);

  addFooter(doc);
  doc.save(`reporte-clientes-${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Reporte de Precision de Produccion
 */
export function exportPrecisionReport(
  data: Array<{
    order_number: string;
    client_name: string;
    original_m2: number;
    delivered_m2: number;
    precision_percent: number;
    difference_m2: number;
  }>,
  summary: {
    total_orders: number;
    average_precision: number;
    total_original_m2: number;
    total_delivered_m2: number;
    total_difference_m2: number;
    perfect_orders: number;
    under_delivered: number;
    over_delivered: number;
  }
): void {
  const doc = createBasePDF({
    title: 'Reporte de Precision de Produccion',
    subtitle: 'Comparacion de cantidades cotizadas vs entregadas',
  });

  // Resumen general
  autoTable(doc, {
    startY: 55,
    head: [['Metrica', 'Valor']],
    body: [
      ['Precision Promedio', `${summary.average_precision.toFixed(1)}%`],
      ['Total Ordenes Analizadas', summary.total_orders.toString()],
      ['Entregas Exactas (100%)', summary.perfect_orders.toString()],
      ['Entrego Menos', summary.under_delivered.toString()],
      ['Entrego Mas', summary.over_delivered.toString()],
      ['m2 Cotizados', formatM2(summary.total_original_m2)],
      ['m2 Entregados', formatM2(summary.total_delivered_m2)],
      ['Diferencia Total', formatM2(summary.total_difference_m2)],
    ],
    styles: { fontSize: 9 },
    headStyles: { fillColor: [37, 99, 235] },
    columnStyles: {
      0: { fontStyle: 'bold' },
    },
  });

  // Detalle por orden
  const finalY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Detalle por Orden', 14, finalY);

  autoTable(doc, {
    startY: finalY + 5,
    head: [['Orden', 'Cliente', 'Cotizado', 'Entregado', 'Diferencia', 'Precision']],
    body: data.map((row) => [
      row.order_number,
      row.client_name,
      formatM2(row.original_m2),
      formatM2(row.delivered_m2),
      `${row.difference_m2 >= 0 ? '+' : ''}${formatM2(row.difference_m2)}`,
      `${row.precision_percent.toFixed(1)}%`,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [37, 99, 235] },
    alternateRowStyles: { fillColor: [245, 245, 245] },
  });

  addFooter(doc);
  doc.save(`reporte-precision-${new Date().toISOString().split('T')[0]}.pdf`);
}
