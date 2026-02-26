export const RETAIL_CONFIG = {
  // Límites de dimensiones (mm)
  MIN_LARGO: 100,
  MAX_LARGO: 800,
  MIN_ANCHO: 100,
  MAX_ANCHO: 600,
  MIN_ALTO: 50,
  MAX_ALTO: 600,

  // Valores iniciales (mm)
  DEFAULT_LARGO: 300,
  DEFAULT_ANCHO: 200,
  DEFAULT_ALTO: 200,

  // Límites de cantidad
  MIN_CANTIDAD: 1,

  // Restricción de producción (del negocio)
  // Ancho de plancha = Alto + Ancho (no puede superar 1200mm por los rollos)
  MAX_SHEET_WIDTH: 1200, // mm

  // Precio minorista (< 3000 m²)
  FACTOR_MATERIAL: 0.000015,     // ARS por mm³
  COSTO_BASE_FIJO: 150,          // ARS por caja
  RECARGO_MANIPULACION: 50,      // ARS por caja
  MARGEN_MINORISTA: 0.35,        // 35%
  PRECIO_MINIMO_PEDIDO: 5000,    // ARS
  DECIMALES_PRECIO: 0,           // Redondeo sin decimales

  // Precio mayorista (>= 3000 m²)
  WHOLESALE_THRESHOLD_M2: 3000,  // m² mínimo para precio mayorista
  WHOLESALE_PRICE_PER_M2: 700,   // ARS por m²

  // Interacción
  DRAG_SENSITIVITY: 2,           // mm por pixel
  TRANSITION_DURATION: 400,      // ms
  HINT_DURATION: 1500,           // ms

  // Envío
  SHIPPING_FACTORY_ADDRESS: 'Lugones 219, B1878 Quilmes, Buenos Aires',
  SHIPPING_CABA_AMBA_COST: 5000, // ARS flat rate (ajustar según necesidad)

  // Bounds del AMBA (para validar que la dirección cae dentro de la zona)
  AMBA_BOUNDS: {
    SW: { lat: -35.0, lng: -59.2 },  // Sudoeste
    NE: { lat: -34.3, lng: -58.1 },  // Nordeste
  },
} as const;

export type RetailConfig = typeof RETAIL_CONFIG;
