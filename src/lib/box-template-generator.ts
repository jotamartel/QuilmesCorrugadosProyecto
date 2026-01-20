import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

interface BoxDimensions {
  length: number;  // Largo (L) en mm
  width: number;   // Ancho (A) en mm
  height: number;  // Alto (H) en mm
}

export async function generateBoxTemplate(dimensions: BoxDimensions): Promise<Uint8Array> {
  const { length: L, width: A, height: H } = dimensions;

  // ═══════════════════════════════════════════════════════════
  // CONSTANTES Y CÁLCULOS
  // ═══════════════════════════════════════════════════════════

  const GLUE_FLAP = 35;           // Aleta de pegado
  const FLAP_TAPER = 20;          // Cuánto se angosta la solapa trapezoidal

  // Dimensiones del desplegado
  const totalWidth = GLUE_FLAP + L + A + L + A;
  const flapHeight = A / 2;       // Alto de solapas = mitad del ancho
  const totalHeight = flapHeight + H + flapHeight;

  // Márgenes del documento
  const margin = 40;

  // Convertir mm a puntos (1mm = 2.83465 pt)
  const mmToPt = 2.83465;

  // Calcular tamaño de página
  let pageWidth = (totalWidth + margin * 2) * mmToPt;
  let pageHeight = (totalHeight + margin * 2 + 30) * mmToPt; // +30 para cotas
  let scale = 1;

  // Si excede A2 horizontal (594 × 420 mm = 1684 × 1190 pt), escalar
  const maxWidth = 1684;
  const maxHeight = 1190;

  if (pageWidth > maxWidth || pageHeight > maxHeight) {
    scale = Math.min(maxWidth / pageWidth, maxHeight / pageHeight) * 0.92;
    pageWidth = Math.min(pageWidth * scale, maxWidth);
    pageHeight = Math.min(pageHeight * scale, maxHeight);
  }

  // Crear documento
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // ═══════════════════════════════════════════════════════════
  // COLORES
  // ═══════════════════════════════════════════════════════════

  const black = rgb(0, 0, 0);
  const gray = rgb(0.5, 0.5, 0.5);
  const grayLight = rgb(0.75, 0.75, 0.75);
  const blue = rgb(0, 0.18, 0.33);        // #002E55
  const blueLight = rgb(0.31, 0.43, 0.53); // #4F6D87
  const greenLight = rgb(0.9, 0.97, 0.9);
  const orange = rgb(0.9, 0.5, 0.1);

  // ═══════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════

  // Convertir coordenadas mm a puntos PDF (origen abajo-izquierda)
  const toX = (mm: number) => (margin + mm) * mmToPt * scale;
  const toY = (mm: number) => pageHeight - (margin + 20 + mm) * mmToPt * scale; // +20 para cotas arriba
  const toSize = (mm: number) => mm * mmToPt * scale;

  // Dibujar línea
  const drawLine = (
    x1: number, y1: number,
    x2: number, y2: number,
    options: { color?: typeof black; thickness?: number; dash?: number[] } = {}
  ) => {
    page.drawLine({
      start: { x: toX(x1), y: toY(y1) },
      end: { x: toX(x2), y: toY(y2) },
      thickness: (options.thickness || 0.5) * scale,
      color: options.color || black,
      dashArray: options.dash,
    });
  };

  // Dibujar rectángulo
  const drawRect = (
    x: number, y: number,
    w: number, h: number,
    options: { fill?: typeof black; stroke?: typeof black; strokeWidth?: number } = {}
  ) => {
    page.drawRectangle({
      x: toX(x),
      y: toY(y + h),
      width: toSize(w),
      height: toSize(h),
      color: options.fill,
      borderColor: options.stroke,
      borderWidth: options.strokeWidth ? options.strokeWidth * scale : undefined,
    });
  };

  // Dibujar texto centrado
  const drawTextCentered = (
    text: string,
    x: number, y: number,
    options: { size?: number; color?: typeof black; bold?: boolean } = {}
  ) => {
    const fontSize = (options.size || 8) * scale;
    const usedFont = options.bold ? fontBold : font;
    const textWidth = usedFont.widthOfTextAtSize(text, fontSize);
    page.drawText(text, {
      x: toX(x) - textWidth / 2,
      y: toY(y) - fontSize / 3,
      size: fontSize,
      font: usedFont,
      color: options.color || black,
    });
  };

  // Dibujar texto
  const drawText = (
    text: string,
    x: number, y: number,
    options: { size?: number; color?: typeof black; bold?: boolean } = {}
  ) => {
    page.drawText(text, {
      x: toX(x),
      y: toY(y),
      size: (options.size || 8) * scale,
      font: options.bold ? fontBold : font,
      color: options.color || black,
    });
  };

  // ═══════════════════════════════════════════════════════════
  // POSICIONES DE LOS PANELES
  // ═══════════════════════════════════════════════════════════

  // Posiciones X de cada panel (desde la izquierda)
  const xGlueFlap = 0;
  const xBack = GLUE_FLAP;
  const xSide1 = GLUE_FLAP + L;
  const xFront = GLUE_FLAP + L + A;
  const xSide2 = GLUE_FLAP + L + A + L;
  const xEnd = totalWidth;

  // Posiciones Y
  const yTopFlaps = 0;
  const yBody = flapHeight;
  const yBottomFlaps = flapHeight + H;
  const yEnd = totalHeight;

  // ═══════════════════════════════════════════════════════════
  // 1. DIBUJAR FONDO (áreas de impresión)
  // ═══════════════════════════════════════════════════════════

  // Cara FRONTAL - área principal de impresión
  drawRect(xFront, yBody, L, H, { fill: greenLight });

  // Cara TRASERA - área secundaria de impresión
  drawRect(xBack, yBody, L, H, { fill: greenLight });

  // ═══════════════════════════════════════════════════════════
  // 2. DIBUJAR LÍNEAS DE CORTE (contorno exterior)
  // ═══════════════════════════════════════════════════════════

  const cutStyle = { color: black, thickness: 0.8 };

  // --- CUERPO PRINCIPAL ---

  // Borde superior del cuerpo (entre solapas superiores y cuerpo)
  drawLine(xGlueFlap, yBody, xEnd, yBody, cutStyle);

  // Borde inferior del cuerpo (entre cuerpo y solapas inferiores)
  drawLine(xGlueFlap, yBottomFlaps, xEnd, yBottomFlaps, cutStyle);

  // Aleta de pegado (izquierda) - forma trapezoidal
  drawLine(xGlueFlap, yBody, 0 + 5, yBody + 8, cutStyle);        // Esquina sup
  drawLine(0 + 5, yBody + 8, 0, yBody + 15, cutStyle);           // Curva sup
  drawLine(0, yBody + 15, 0, yBottomFlaps - 15, cutStyle);       // Borde izq
  drawLine(0, yBottomFlaps - 15, 0 + 5, yBottomFlaps - 8, cutStyle); // Curva inf
  drawLine(0 + 5, yBottomFlaps - 8, xGlueFlap, yBottomFlaps, cutStyle); // Esquina inf

  // Borde derecho (lateral 2)
  drawLine(xEnd, yBody, xEnd, yBottomFlaps, cutStyle);

  // --- SOLAPAS SUPERIORES ---

  // Solapa trasera (trapezoidal)
  drawLine(xBack + FLAP_TAPER, yTopFlaps + 3, xBack + L - FLAP_TAPER, yTopFlaps + 3, cutStyle);
  drawLine(xBack + FLAP_TAPER, yTopFlaps + 3, xBack + 5, yTopFlaps + flapHeight - 5, cutStyle);
  drawLine(xBack + 5, yTopFlaps + flapHeight - 5, xBack, yBody, cutStyle);
  drawLine(xBack + L - FLAP_TAPER, yTopFlaps + 3, xBack + L - 5, yTopFlaps + flapHeight - 5, cutStyle);
  drawLine(xBack + L - 5, yTopFlaps + flapHeight - 5, xBack + L, yBody, cutStyle);

  // Solapa tapa superior 1 (rectangular)
  drawLine(xSide1, yTopFlaps, xSide1 + A, yTopFlaps, cutStyle);
  drawLine(xSide1, yTopFlaps, xSide1, yBody, cutStyle);
  drawLine(xSide1 + A, yTopFlaps, xSide1 + A, yBody, cutStyle);

  // Solapa frontal (trapezoidal)
  drawLine(xFront + FLAP_TAPER, yTopFlaps + 3, xFront + L - FLAP_TAPER, yTopFlaps + 3, cutStyle);
  drawLine(xFront + FLAP_TAPER, yTopFlaps + 3, xFront + 5, yTopFlaps + flapHeight - 5, cutStyle);
  drawLine(xFront + 5, yTopFlaps + flapHeight - 5, xFront, yBody, cutStyle);
  drawLine(xFront + L - FLAP_TAPER, yTopFlaps + 3, xFront + L - 5, yTopFlaps + flapHeight - 5, cutStyle);
  drawLine(xFront + L - 5, yTopFlaps + flapHeight - 5, xFront + L, yBody, cutStyle);

  // Solapa tapa superior 2 (rectangular)
  drawLine(xSide2, yTopFlaps, xSide2 + A, yTopFlaps, cutStyle);
  drawLine(xSide2, yTopFlaps, xSide2, yBody, cutStyle);
  drawLine(xSide2 + A, yTopFlaps, xSide2 + A, yBody, cutStyle);

  // --- SOLAPAS INFERIORES ---

  // Solapa trasera (trapezoidal)
  drawLine(xBack + FLAP_TAPER, yEnd - 3, xBack + L - FLAP_TAPER, yEnd - 3, cutStyle);
  drawLine(xBack + FLAP_TAPER, yEnd - 3, xBack + 5, yBottomFlaps + 5, cutStyle);
  drawLine(xBack + 5, yBottomFlaps + 5, xBack, yBottomFlaps, cutStyle);
  drawLine(xBack + L - FLAP_TAPER, yEnd - 3, xBack + L - 5, yBottomFlaps + 5, cutStyle);
  drawLine(xBack + L - 5, yBottomFlaps + 5, xBack + L, yBottomFlaps, cutStyle);

  // Solapa tapa inferior 1 (rectangular)
  drawLine(xSide1, yEnd, xSide1 + A, yEnd, cutStyle);
  drawLine(xSide1, yEnd, xSide1, yBottomFlaps, cutStyle);
  drawLine(xSide1 + A, yEnd, xSide1 + A, yBottomFlaps, cutStyle);

  // Solapa frontal (trapezoidal)
  drawLine(xFront + FLAP_TAPER, yEnd - 3, xFront + L - FLAP_TAPER, yEnd - 3, cutStyle);
  drawLine(xFront + FLAP_TAPER, yEnd - 3, xFront + 5, yBottomFlaps + 5, cutStyle);
  drawLine(xFront + 5, yBottomFlaps + 5, xFront, yBottomFlaps, cutStyle);
  drawLine(xFront + L - FLAP_TAPER, yEnd - 3, xFront + L - 5, yBottomFlaps + 5, cutStyle);
  drawLine(xFront + L - 5, yBottomFlaps + 5, xFront + L, yBottomFlaps, cutStyle);

  // Solapa tapa inferior 2 (rectangular)
  drawLine(xSide2, yEnd, xSide2 + A, yEnd, cutStyle);
  drawLine(xSide2, yEnd, xSide2, yBottomFlaps, cutStyle);
  drawLine(xSide2 + A, yEnd, xSide2 + A, yBottomFlaps, cutStyle);

  // ═══════════════════════════════════════════════════════════
  // 3. DIBUJAR LÍNEAS DE PLEGADO (internas, punteadas)
  // ═══════════════════════════════════════════════════════════

  const foldStyle = { color: grayLight, thickness: 0.5, dash: [4 * scale, 3 * scale] };

  // Verticales entre paneles del cuerpo
  drawLine(xBack, yBody, xBack, yBottomFlaps, foldStyle);      // Entre aleta y trasera
  drawLine(xSide1, yBody, xSide1, yBottomFlaps, foldStyle);    // Entre trasera y lateral1
  drawLine(xFront, yBody, xFront, yBottomFlaps, foldStyle);    // Entre lateral1 y frontal
  drawLine(xSide2, yBody, xSide2, yBottomFlaps, foldStyle);    // Entre frontal y lateral2

  // ═══════════════════════════════════════════════════════════
  // 4. ETIQUETAS DE CADA CARA
  // ═══════════════════════════════════════════════════════════

  const labelStyle = { size: 11, color: gray, bold: true };

  // Caras del cuerpo
  drawTextCentered('TRASERA', xBack + L/2, yBody + H/2, labelStyle);
  drawTextCentered('LATERAL', xSide1 + A/2, yBody + H/2, labelStyle);
  drawTextCentered('FRONTAL', xFront + L/2, yBody + H/2, labelStyle);
  drawTextCentered('LATERAL', xSide2 + A/2, yBody + H/2, labelStyle);

  // Aleta de pegado
  drawTextCentered('ALETA', xGlueFlap/2, yBody + H/2 - 8, { size: 6, color: orange, bold: true });

  // Solapas superiores
  drawTextCentered('TAPA', xSide1 + A/2, yTopFlaps + flapHeight/2, { size: 8, color: gray });
  drawTextCentered('TAPA', xSide2 + A/2, yTopFlaps + flapHeight/2, { size: 8, color: gray });

  // Solapas inferiores
  drawTextCentered('TAPA', xSide1 + A/2, yBottomFlaps + flapHeight/2, { size: 8, color: gray });
  drawTextCentered('TAPA', xSide2 + A/2, yBottomFlaps + flapHeight/2, { size: 8, color: gray });

  // ═══════════════════════════════════════════════════════════
  // 5. COTAS Y MEDIDAS
  // ═══════════════════════════════════════════════════════════

  const dimStyle = { size: 7, color: blueLight };
  const dimOffset = -12;

  // Medida del Largo (L) - arriba de la cara frontal
  drawLine(xFront, yTopFlaps + dimOffset, xFront + L, yTopFlaps + dimOffset, { color: blueLight, thickness: 0.3 });
  drawLine(xFront, yTopFlaps + dimOffset - 2, xFront, yTopFlaps + dimOffset + 2, { color: blueLight, thickness: 0.3 });
  drawLine(xFront + L, yTopFlaps + dimOffset - 2, xFront + L, yTopFlaps + dimOffset + 2, { color: blueLight, thickness: 0.3 });
  drawTextCentered(`L = ${L} mm`, xFront + L/2, yTopFlaps + dimOffset - 5, dimStyle);

  // Medida del Ancho (A) - arriba del lateral
  drawLine(xSide1, yTopFlaps + dimOffset, xSide1 + A, yTopFlaps + dimOffset, { color: blueLight, thickness: 0.3 });
  drawLine(xSide1, yTopFlaps + dimOffset - 2, xSide1, yTopFlaps + dimOffset + 2, { color: blueLight, thickness: 0.3 });
  drawLine(xSide1 + A, yTopFlaps + dimOffset - 2, xSide1 + A, yTopFlaps + dimOffset + 2, { color: blueLight, thickness: 0.3 });
  drawTextCentered(`A = ${A} mm`, xSide1 + A/2, yTopFlaps + dimOffset - 5, dimStyle);

  // Medida del Alto (H) - a la derecha
  const dimOffsetRight = 10;
  drawLine(xEnd + dimOffsetRight, yBody, xEnd + dimOffsetRight, yBottomFlaps, { color: blueLight, thickness: 0.3 });
  drawLine(xEnd + dimOffsetRight - 2, yBody, xEnd + dimOffsetRight + 2, yBody, { color: blueLight, thickness: 0.3 });
  drawLine(xEnd + dimOffsetRight - 2, yBottomFlaps, xEnd + dimOffsetRight + 2, yBottomFlaps, { color: blueLight, thickness: 0.3 });
  drawTextCentered(`H = ${H} mm`, xEnd + dimOffsetRight + 15, yBody + H/2, dimStyle);

  // Medida de solapa (A/2)
  drawTextCentered(`${Math.round(A/2)} mm`, xSide1 + A/2, yTopFlaps + flapHeight + 8, { size: 6, color: blueLight });

  // ═══════════════════════════════════════════════════════════
  // 6. CAJETÍN DE INFORMACIÓN
  // ═══════════════════════════════════════════════════════════

  const infoBoxW = 80;
  const infoBoxH = 50;
  const infoBoxX = totalWidth - infoBoxW;
  const infoBoxY = yEnd + 5;

  drawRect(infoBoxX, infoBoxY, infoBoxW, infoBoxH, { fill: rgb(1, 1, 1), stroke: blue, strokeWidth: 0.5 });

  drawText('QUILMES CORRUGADOS', infoBoxX + 5, infoBoxY + 8, { size: 8, bold: true, color: blue });
  drawText('Plantilla caja RSC', infoBoxX + 5, infoBoxY + 18, { size: 7, color: gray });
  drawText(`Medidas: ${L} × ${A} × ${H} mm`, infoBoxX + 5, infoBoxY + 28, { size: 7 });
  drawText(`Plancha: ${totalWidth.toFixed(0)} × ${totalHeight.toFixed(0)} mm`, infoBoxX + 5, infoBoxY + 38, { size: 7 });
  drawText(`Escala: ${scale === 1 ? '1:1' : (scale * 100).toFixed(0) + '%'}`, infoBoxX + 5, infoBoxY + 48, { size: 7, color: scale < 1 ? orange : black });

  // ═══════════════════════════════════════════════════════════
  // 7. LEYENDA
  // ═══════════════════════════════════════════════════════════

  const legendX = 5;
  const legendY = yEnd + 5;

  drawText('Leyenda:', legendX, legendY + 5, { size: 7, bold: true, color: gray });

  // Línea de corte
  drawLine(legendX, legendY + 15, legendX + 20, legendY + 15, cutStyle);
  drawText('Corte', legendX + 25, legendY + 17, { size: 6 });

  // Línea de plegado
  drawLine(legendX, legendY + 25, legendX + 20, legendY + 25, foldStyle);
  drawText('Plegado', legendX + 25, legendY + 27, { size: 6 });

  // Área de impresión
  drawRect(legendX, legendY + 32, 15, 10, { fill: greenLight, stroke: gray, strokeWidth: 0.3 });
  drawText('Área impresión', legendX + 25, legendY + 40, { size: 6 });

  // ═══════════════════════════════════════════════════════════
  // GENERAR PDF
  // ═══════════════════════════════════════════════════════════

  return await pdfDoc.save();
}
