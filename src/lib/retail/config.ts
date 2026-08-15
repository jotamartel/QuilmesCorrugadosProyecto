export interface RetailConfig {
  // Límites de dimensiones (mm)
  MIN_LARGO: number;
  MAX_LARGO: number;
  MIN_ANCHO: number;
  MAX_ANCHO: number;
  MIN_ALTO: number;
  MAX_ALTO: number;

  // Valores iniciales (mm)
  DEFAULT_LARGO: number;
  DEFAULT_ANCHO: number;
  DEFAULT_ALTO: number;

  // Límites de cantidad
  MIN_CANTIDAD: number;

  // Restricción de producción
  MAX_SHEET_WIDTH: number;

  // Precio minorista (< 1000 m²): $/m²
  RETAIL_PRICE_PER_M2: number;
  PRECIO_MINIMO_PEDIDO: number;
  DECIMALES_PRECIO: number;

  // Precio mayorista (>= 1000 m²)
  WHOLESALE_THRESHOLD_M2: number;
  WHOLESALE_PRICE_PER_M2: number;

  // Interacción
  DRAG_SENSITIVITY: number;
  TRANSITION_DURATION: number;
  HINT_DURATION: number;

  // Envío
  SHIPPING_FACTORY_ADDRESS: string;
  SHIPPING_CABA_AMBA_COST: number;

  // Bounds AMBA
  AMBA_BOUNDS: {
    SW: { lat: number; lng: number };
    NE: { lat: number; lng: number };
  };
}

export const RETAIL_CONFIG: RetailConfig = {
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
  MIN_CANTIDAD: 100,              // El canal minorista vende desde 100 cajas

  // Restricción de producción (del negocio)
  // Ancho de plancha = Alto + Ancho (no puede superar 1200mm por los rollos)
  MAX_SHEET_WIDTH: 1200, // mm

  // Precio de stock. Estos son valores de RESPALDO: en runtime se sobreescriben
  // con pricing_config vía /api/public/retail-config, que es la fuente de
  // verdad. Se mantienen alineados con la base para que, si falla la lectura,
  // no se cotice un precio viejo.
  RETAIL_PRICE_PER_M2: 990,       // ARS por m² — pricing_config.price_per_m2_retail
  PRECIO_MINIMO_PEDIDO: 5000,     // ARS
  DECIMALES_PRECIO: 0,            // Redondeo sin decimales

  // Tope del canal: pasado este volumen el pedido ya no sale de stock sino de
  // produccion a medida, y se deriva al cotizador mayorista.
  WHOLESALE_THRESHOLD_M2: 1000,   // m² — pricing_config.wholesale_min_m2
  WHOLESALE_PRICE_PER_M2: 900,    // ARS por m² — solo para mostrar a cuanto sale al derivar

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
};
