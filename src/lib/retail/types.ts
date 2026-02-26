export interface BoxConfig {
  largo: number;    // mm
  ancho: number;    // mm
  alto: number;     // mm
  cantidad: number;
}

export interface BoxQuoteLine extends BoxConfig {
  volumen: number;           // mm³
  precioUnitario: number;    // ARS (entero)
  subtotal: number;          // ARS (entero)
  m2PerBox: number;          // m² por caja
  totalM2: number;           // m² total del line item
  isMayorista: boolean;      // si aplica precio mayorista
  standardBoxId?: string;    // ID de caja estándar del catálogo (si fue seleccionada de sugerencias)
}

export interface RetailQuote {
  boxes: BoxQuoteLine[];
  precioTotal: number;       // ARS (entero)
  createdAt: Date;
}

export type GameState =
  | 'IDLE'
  | 'SET_LARGO'
  | 'SET_ANCHO'
  | 'SET_ALTO'
  | 'SET_CANTIDAD'
  | 'ADD_MORE'
  | 'QUOTE'
  | 'ORDER_FORM'
  | 'SHIPPING'
  | 'ORDER_SENT';

export type ShippingMethod = 'retiro_sucursal' | 'envio_caba_amba' | 'envio_resto_pais';

export interface ShippingData {
  method: ShippingMethod;
  cost: number;            // 0 para retiro y resto del país
  costConfirmed: boolean;  // false para resto del país (precio a confirmar)
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  lat?: number;            // Coordenadas de Google Maps para planificación de entregas
  lng?: number;
}

export type ClientType = 'empresa' | 'particular';

export interface OrderFormData {
  clientType: ClientType;
  // Empresa fields
  razonSocial: string;
  nombreFantasia: string;
  cuit: string;
  condicionIva: 'responsable_inscripto' | 'monotributista' | 'exento';
  // Particular fields
  nombreCompleto: string;
  dni: string;
  // Common fields
  email: string;
  telefono: string;
  // Optional address
  direccion: string;
  ciudad: string;
  provincia: string;
  codigoPostal: string;
  // Message
  mensaje: string;
}

export type DragAxis = 'horizontal' | 'vertical';

export interface GameStore {
  state: GameState;
  currentBox: {
    largo: number;
    ancho: number;
    alto: number;
    cantidad: number;
  };
  boxes: BoxQuoteLine[];
  isTransitioning: boolean;
  showHint: boolean;
  hintShownFor: Set<GameState>;
}
