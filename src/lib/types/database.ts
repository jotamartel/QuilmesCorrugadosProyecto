// Tipos de base de datos para Quilmes Corrugados

export type PaymentTerms = 'contado' | 'cheque_30';
export type PaymentMethod = 'transferencia' | 'cheque' | 'efectivo' | 'echeq';
export type QuoteStatus = 'draft' | 'sent' | 'approved' | 'rejected' | 'expired' | 'converted';
export type OrderStatus = 'pending_deposit' | 'confirmed' | 'in_production' | 'ready' | 'shipped' | 'delivered' | 'cancelled';
export type Channel = 'manual' | 'whatsapp' | 'email' | 'web';
export type CommunicationChannel = 'whatsapp' | 'email' | 'phone' | 'manual';
export type Direction = 'inbound' | 'outbound';
export type DesignStatus = 'pending' | 'approved' | 'rejected';
export type PaymentStatus = 'pending' | 'paid';

// Nuevos tipos para integración Xubio + ARBA
export type TaxCondition = 'responsable_inscripto' | 'monotributista' | 'consumidor_final' | 'exento';
export type PaymentScheme = 'standard' | 'credit';
export type PaymentType = 'deposit' | 'balance' | 'full';
export type CheckStatus = 'in_portfolio' | 'deposited' | 'cashed' | 'endorsed' | 'rejected';
export type CheckExitType = 'deposit' | 'cash' | 'endorsement';
export type IntegrationStatus = 'success' | 'error' | 'pending';
export type IntegrationType = 'xubio' | 'arba';
export type ClientSource = 'manual' | 'web' | 'email' | 'whatsapp';
export type PublicQuoteStatus = 'pending' | 'contacted' | 'converted' | 'rejected';

export interface PricingConfig {
  id: string;
  price_per_m2_standard: number;
  price_per_m2_volume: number;
  volume_threshold_m2: number;
  min_m2_per_model: number;
  price_per_m2_below_minimum: number | null; // Precio con recargo para pedidos < 3000m2
  free_shipping_min_m2: number;
  free_shipping_max_km: number;
  production_days_standard: number;
  production_days_printing: number;
  quote_validity_days: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  company: string | null;
  cuit: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  city: string | null;
  province: string;
  postal_code: string | null;
  distance_km: number | null;
  payment_terms: PaymentTerms;
  is_recurring: boolean;
  notes: string | null;
  // Campos de integración Xubio
  xubio_id: string | null;
  tax_condition: TaxCondition;
  // Campos de crédito
  has_credit: boolean;
  credit_days: number;
  credit_limit: number | null;
  credit_notes: string | null;
  // Campos de origen
  source: ClientSource;
  source_quote_id: string | null;
  created_from_ip: string | null;
  created_at: string;
  updated_at: string;
}

export interface Box {
  id: string;
  name: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  unfolded_length_mm: number;
  unfolded_width_mm: number;
  m2_per_box: number;
  is_standard: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Quote {
  id: string;
  quote_number: string;
  client_id: string | null;
  status: QuoteStatus;
  channel: Channel;
  total_m2: number;
  price_per_m2: number;
  subtotal: number;
  has_printing: boolean;
  printing_colors: number;
  printing_cost: number;
  has_existing_polymer: boolean;
  has_die_cut: boolean;
  die_cut_cost: number;
  shipping_cost: number;
  shipping_notes: string | null;
  total: number;
  production_days: number;
  estimated_delivery: string | null;
  valid_until: string;
  notes: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  approved_at: string | null;
  expired_at: string | null;
  converted_to_order_id: string | null;
  // Relaciones opcionales
  client?: Client;
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  box_id: string | null;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  unfolded_length_mm: number;
  unfolded_width_mm: number;
  m2_per_box: number;
  quantity: number;
  total_m2: number;
  is_custom: boolean;
  is_oversized: boolean;
  created_at: string;
  // Relación opcional
  box?: Box;
}

export interface Order {
  id: string;
  order_number: string;
  quote_id: string | null;
  client_id: string | null;
  status: OrderStatus;
  total_m2: number;
  subtotal: number;
  printing_cost: number;
  die_cut_cost: number;
  shipping_cost: number;
  total: number;
  deposit_amount: number;
  deposit_status: PaymentStatus;
  deposit_method: PaymentMethod | null;
  deposit_paid_at: string | null;
  balance_amount: number;
  balance_status: PaymentStatus;
  balance_method: PaymentMethod | null;
  balance_paid_at: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_notes: string | null;
  estimated_delivery: string | null;
  production_started_at: string | null;
  ready_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  // Campos de integración
  payment_scheme: PaymentScheme;
  quantities_confirmed: boolean;
  quantities_confirmed_at: string | null;
  // Xubio
  xubio_deposit_invoice_id: string | null;
  xubio_deposit_invoice_number: string | null;
  xubio_balance_invoice_id: string | null;
  xubio_balance_invoice_number: string | null;
  xubio_remito_id: string | null;
  xubio_remito_number: string | null;
  // ARBA COT
  cot_number: string | null;
  cot_generated_at: string | null;
  vehicle_id: string | null;
  // Relaciones opcionales
  client?: Client;
  quote?: Quote;
  items?: OrderItem[];
  vehicle?: Vehicle;
}

export interface OrderItem {
  id: string;
  order_id: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  m2_per_box: number;
  quantity: number;
  quantity_delivered: number | null;
  total_m2: number;
  created_at: string;
}

export interface Communication {
  id: string;
  client_id: string | null;
  quote_id: string | null;
  order_id: string | null;
  channel: CommunicationChannel;
  direction: Direction;
  subject: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface PrintingDesign {
  id: string;
  client_id: string | null;
  quote_id: string | null;
  name: string | null;
  file_url: string | null;
  file_type: string | null;
  colors: number | null;
  status: DesignStatus;
  notes: string | null;
  created_at: string;
}

// Tipos para requests/responses de API

export interface CalculateQuoteItem {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  box_id?: string;
}

export interface CalculateQuoteRequest {
  items: CalculateQuoteItem[];
  has_printing?: boolean;
  printing_colors?: number;
  has_existing_polymer?: boolean;
  has_die_cut?: boolean;
  client_distance_km?: number;
}

export interface CalculatedItem {
  length_mm: number;
  width_mm: number;
  height_mm: number;
  unfolded_length_mm: number;
  unfolded_width_mm: number;
  m2_per_box: number;
  quantity: number;
  total_m2: number;
  is_oversized: boolean;
  is_undersized: boolean;
  meets_minimum: boolean;
  minimum_required_qty: number;
  box_id?: string;
}

export interface CalculateQuoteResponse {
  items: CalculatedItem[];
  summary: {
    total_m2: number;
    price_per_m2: number;
    subtotal: number;
    printing_cost: number;
    die_cut_cost: number;
    shipping_cost: number;
    shipping_notes: string;
    total: number;
    production_days: number;
    estimated_delivery: string;
    warnings: string[];
  };
}

export interface CreateQuoteRequest {
  client_id?: string;
  items: CalculateQuoteItem[];
  has_printing?: boolean;
  printing_colors?: number;
  has_existing_polymer?: boolean;
  has_die_cut?: boolean;
  die_cut_cost?: number;
  shipping_cost?: number;
  shipping_notes?: string;
  notes?: string;
  internal_notes?: string;
  channel?: Channel;
}

export interface CreateClientRequest {
  name: string;
  company?: string;
  cuit?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  city?: string;
  province?: string;
  distance_km?: number;
  payment_terms?: PaymentTerms;
  is_recurring?: boolean;
  notes?: string;
}

export interface UpdateOrderStatusRequest {
  status: OrderStatus;
  notes?: string;
}

export interface RegisterPaymentRequest {
  payment_type: 'deposit' | 'balance';
  method: PaymentMethod;
  // Datos del cheque (requeridos si method es 'cheque' o 'echeq')
  check_bank?: string;
  check_number?: string;
  check_date?: string;
  check_holder?: string;
  check_cuit?: string;
}

// Tipos para reportes
export interface SalesReport {
  period: string;
  total_quotes: number;
  total_orders: number;
  total_m2: number;
  total_revenue: number;
  conversion_rate: number;
}

export interface ProductionReport {
  status: string;
  count: number;
  total_m2: number;
}

export interface TopClientReport {
  client_id: string;
  client_name: string;
  company: string | null;
  total_orders: number;
  total_m2: number;
  total_revenue: number;
}

// =====================================================
// NUEVAS INTERFACES - Integración Xubio + ARBA
// =====================================================

export interface Vehicle {
  id: string;
  patent: string;
  description: string | null;
  driver_name: string | null;
  driver_cuit: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  order_id: string | null;
  client_id: string | null;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  // Datos del cheque
  check_bank: string | null;
  check_number: string | null;
  check_date: string | null;
  check_holder: string | null;
  check_cuit: string | null;
  // Xubio
  xubio_receipt_id: string | null;
  xubio_receipt_number: string | null;
  status: 'pending' | 'completed' | 'cancelled';
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones opcionales
  order?: Order;
  client?: Client;
}

export interface Check {
  id: string;
  payment_id: string | null;
  client_id: string | null;
  bank: string;
  number: string;
  amount: number;
  issue_date: string | null;
  due_date: string;
  holder: string | null;
  holder_cuit: string | null;
  status: CheckStatus;
  // Operación de salida
  exit_type: CheckExitType | null;
  exit_date: string | null;
  exit_to: string | null;
  exit_notes: string | null;
  // Xubio
  xubio_id: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones opcionales
  payment?: Payment;
  client?: Client;
  // Calculado
  days_until_due?: number;
}

export interface SystemConfig {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  is_secret: boolean;
  updated_at: string;
}

export interface IntegrationLog {
  id: string;
  integration: IntegrationType;
  operation: string;
  order_id: string | null;
  client_id: string | null;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  status: IntegrationStatus;
  error_message: string | null;
  created_at: string;
}

// =====================================================
// TIPOS DE CONFIGURACIÓN DEL SISTEMA
// =====================================================

export interface CompanyConfig {
  company_name: string;
  company_cuit: string;
  company_address: string;
  company_city: string;
  company_province: string;
  company_postal_code: string;
  company_email: string;
  company_phone: string;
  company_iibb: string;
  company_start_date: string;
}

export interface XubioConfig {
  xubio_client_id: string;
  xubio_secret_id: string;
  xubio_enabled: boolean;
  xubio_point_of_sale: string;
}

export interface ArbaConfig {
  arba_cit_user: string;
  arba_cit_password: string;
  arba_cot_enabled: boolean;
  arba_cot_product_code: string;
  arba_cot_product_unit: string;
}

export interface FullSystemConfig extends CompanyConfig, XubioConfig, ArbaConfig {}

// =====================================================
// TIPOS PARA REQUESTS DE NUEVAS APIs
// =====================================================

export interface CreateVehicleRequest {
  patent: string;
  description?: string;
  driver_name?: string;
  driver_cuit?: string;
  is_active?: boolean;
}

export interface CreatePaymentRequest {
  order_id: string;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  check_bank?: string;
  check_number?: string;
  check_date?: string;
  check_holder?: string;
  check_cuit?: string;
  notes?: string;
}

export interface CreateCheckRequest {
  payment_id?: string;
  client_id: string;
  bank: string;
  number: string;
  amount: number;
  issue_date?: string;
  due_date: string;
  holder?: string;
  holder_cuit?: string;
}

export interface ConfirmQuantitiesRequest {
  items: {
    id: string;
    quantity_delivered: number;
  }[];
}

export interface DispatchOrderRequest {
  vehicle_id: string;
  generate_invoice: boolean;
  generate_remito: boolean;
  generate_cot: boolean;
  send_invoice_email: boolean;
}

export interface CheckExitRequest {
  exit_type: CheckExitType;
  exit_to: string;
  exit_notes?: string;
}

// =====================================================
// TIPOS PARA XUBIO API
// =====================================================

export interface XubioCustomer {
  id?: number;
  nombre: string;
  cuit: string;
  condicion_iva: string;
  domicilio?: string;
  localidad?: string;
  provincia?: string;
  codigo_postal?: string;
  email?: string;
  telefono?: string;
}

export interface XubioInvoiceItem {
  concepto: string;
  cantidad: number;
  precio_unitario: number;
  iva_id: number;
}

export interface XubioInvoice {
  id?: number;
  numero?: string;
  cliente_id: number;
  fecha: string;
  tipo_comprobante: 'FA' | 'FB' | 'FC'; // Factura A, B, C
  punto_venta: number;
  items: XubioInvoiceItem[];
  total?: number;
}

export interface XubioReceipt {
  id?: number;
  numero?: string;
  cliente_id: number;
  fecha: string;
  monto: number;
  forma_pago: string;
}

export interface XubioRemito {
  id?: number;
  numero?: string;
  cliente_id: number;
  fecha: string;
  domicilio_entrega: string;
  items: {
    concepto: string;
    cantidad: number;
  }[];
}

// =====================================================
// TIPOS PARA ARBA COT
// =====================================================

export interface CotRequest {
  order_id: string;
  vehicle_id: string;
  // Datos del remitente (empresa)
  remitente_cuit: string;
  remitente_razon_social: string;
  remitente_domicilio: string;
  remitente_localidad: string;
  // Datos del destinatario (cliente)
  destinatario_cuit: string;
  destinatario_razon_social: string;
  destinatario_domicilio: string;
  destinatario_localidad: string;
  // Datos del transporte
  patente: string;
  conductor_cuit: string;
  conductor_nombre: string;
  // Datos de la mercadería
  productos: CotProduct[];
}

export interface CotProduct {
  codigo: string;
  descripcion: string;
  cantidad: number;
  unidad: string;
}

export interface CotResponse {
  success: boolean;
  cot_number?: string;
  error?: string;
}

// =====================================================
// LABELS Y MAPEOS PARA NUEVOS TIPOS
// =====================================================

export const TAX_CONDITION_LABELS: Record<TaxCondition, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributista: 'Monotributista',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento',
};

export const PAYMENT_SCHEME_LABELS: Record<PaymentScheme, string> = {
  standard: 'Estándar (50% + 50%)',
  credit: 'A crédito',
};

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  deposit: 'Seña',
  balance: 'Saldo',
  full: 'Pago total',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transferencia: 'Transferencia',
  cheque: 'Cheque',
  efectivo: 'Efectivo',
  echeq: 'eCheq',
};

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  in_portfolio: 'En cartera',
  deposited: 'Depositado',
  cashed: 'Cobrado',
  endorsed: 'Endosado',
  rejected: 'Rechazado',
};

export const CHECK_STATUS_COLORS: Record<CheckStatus, string> = {
  in_portfolio: 'bg-blue-100 text-blue-800',
  deposited: 'bg-green-100 text-green-800',
  cashed: 'bg-green-100 text-green-800',
  endorsed: 'bg-yellow-100 text-yellow-800',
  rejected: 'bg-red-100 text-red-800',
};

// Mapeo de condición fiscal a tipo de factura
export const TAX_CONDITION_TO_INVOICE_TYPE: Record<TaxCondition, 'FA' | 'FB'> = {
  responsable_inscripto: 'FA',
  monotributista: 'FB',
  consumidor_final: 'FB',
  exento: 'FB',
};

// =====================================================
// TIPOS PARA CONTROL DE COSTOS Y RENTABILIDAD
// =====================================================

export type CostCategoryType = 'fixed' | 'variable' | 'supply' | 'labor' | 'other';
export type CostFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface CostCategory {
  id: string;
  name: string;
  type: CostCategoryType;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FixedCost {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  amount: number;
  frequency: CostFrequency;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relación opcional
  category?: CostCategory;
}

export interface Supply {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  unit: string;
  current_price: number;
  last_price: number | null;
  price_updated_at: string;
  supplier: string | null;
  min_stock: number;
  current_stock: number;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relación opcional
  category?: CostCategory;
}

export interface SupplyPriceHistory {
  id: string;
  supply_id: string;
  price: number;
  effective_date: string;
  notes: string | null;
  created_at: string;
}

export interface OrderCost {
  id: string;
  order_id: string;
  category_id: string | null;
  concept: string;
  amount: number;
  quantity: number;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relaciones opcionales
  category?: CostCategory;
  order?: Order;
}

export interface ProductionCostConfig {
  id: string;
  name: string;
  cardboard_cost_per_m2: number;
  glue_cost_per_m2: number;
  ink_cost_per_m2: number;
  labor_cost_per_m2: number;
  energy_cost_per_m2: number;
  waste_percentage: number;
  overhead_percentage: number;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OperationalExpense {
  id: string;
  category_id: string | null;
  concept: string;
  amount: number;
  expense_date: string;
  payment_method: string | null;
  receipt_number: string | null;
  supplier: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Relación opcional
  category?: CostCategory;
}

export interface OrderProfitability {
  order_id: string;
  order_number: string;
  order_date: string;
  status: OrderStatus;
  client_id: string | null;
  client_name: string;
  client_company: string | null;
  total_m2: number;
  revenue_subtotal: number;
  revenue_printing: number;
  revenue_diecut: number;
  revenue_shipping: number;
  total_revenue: number;
  total_direct_costs: number;
  gross_profit: number;
  gross_margin_percent: number;
}

// Labels para tipos de costos
export const COST_CATEGORY_TYPE_LABELS: Record<CostCategoryType, string> = {
  fixed: 'Fijo',
  variable: 'Variable',
  supply: 'Insumo',
  labor: 'Mano de obra',
  other: 'Otro',
};

export const COST_FREQUENCY_LABELS: Record<CostFrequency, string> = {
  daily: 'Diario',
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

// Requests para APIs de costos
export interface CreateFixedCostRequest {
  category_id?: string;
  name: string;
  description?: string;
  amount: number;
  frequency?: CostFrequency;
  start_date: string;
  end_date?: string;
  notes?: string;
}

export interface CreateSupplyRequest {
  category_id?: string;
  name: string;
  description?: string;
  unit: string;
  current_price: number;
  supplier?: string;
  min_stock?: number;
  current_stock?: number;
  notes?: string;
}

export interface CreateOrderCostRequest {
  order_id: string;
  category_id?: string;
  concept: string;
  amount: number;
  quantity?: number;
  unit_cost?: number;
  notes?: string;
}

export interface CreateOperationalExpenseRequest {
  category_id?: string;
  concept: string;
  amount: number;
  expense_date: string;
  payment_method?: string;
  receipt_number?: string;
  supplier?: string;
  notes?: string;
}

export interface UpdateProductionCostConfigRequest {
  cardboard_cost_per_m2?: number;
  glue_cost_per_m2?: number;
  ink_cost_per_m2?: number;
  labor_cost_per_m2?: number;
  energy_cost_per_m2?: number;
  waste_percentage?: number;
  overhead_percentage?: number;
  notes?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// COTIZACIONES PÚBLICAS (WEB)
// ═══════════════════════════════════════════════════════════════════════════════

export interface PublicQuote {
  id: string;
  quote_number: number;

  // Datos del solicitante
  requester_name: string;
  requester_company: string | null;
  requester_email: string;
  requester_phone: string;
  requester_cuit: string | null;
  requester_tax_condition: TaxCondition;

  // Dirección
  address: string | null;
  city: string | null;
  province: string;
  postal_code: string | null;
  distance_km: number | null;
  is_free_shipping: boolean;

  // Lead tracking
  requested_contact: boolean;

  // Datos de la caja
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;

  // Diseño
  design_file_url: string | null;
  design_file_name: string | null;
  design_preview_url: string | null;

  // Cálculos
  sheet_width_mm: number;
  sheet_length_mm: number;
  sqm_per_box: number;
  total_sqm: number;
  price_per_m2: number;
  price_per_m2_applied: number | null; // Precio realmente aplicado (puede ser con recargo)
  unit_price: number;
  subtotal: number;
  estimated_days: number;

  // Pedidos menores al mínimo
  is_below_minimum: boolean;
  requested_quantity_below_minimum: number | null;
  accepted_below_minimum_terms: boolean;

  // Tracking
  source_ip: string | null;
  source_user_agent: string | null;
  message: string | null;

  // Estado
  status: PublicQuoteStatus;
  notes: string | null;

  // Conversión
  converted_to_client_id: string | null;
  converted_to_quote_id: string | null;
  converted_at: string | null;
  converted_by: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreatePublicQuoteRequest {
  // Datos del solicitante (requeridos)
  requester_name: string;
  requester_email: string;
  requester_phone: string;

  // Datos opcionales del solicitante
  requester_company?: string;
  requester_cuit?: string;
  requester_tax_condition?: TaxCondition;

  // Dirección opcional
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;

  // Datos de la caja (requeridos)
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;

  // Opciones
  has_printing?: boolean;
  printing_colors?: number;

  // Diseño
  design_file_url?: string;
  design_file_name?: string;

  // Mensaje
  message?: string;
}

export interface UpdatePublicQuoteRequest {
  status?: PublicQuoteStatus;
  notes?: string;
}

export interface ConvertPublicQuoteRequest {
  // Datos del cliente (pueden ser editados antes de crear)
  name?: string;
  company?: string;
  cuit?: string;
  tax_condition?: TaxCondition;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  postal_code?: string;

  // Opciones
  create_quote?: boolean; // También crear cotización formal
}

export const PUBLIC_QUOTE_STATUS_LABELS: Record<PublicQuoteStatus, string> = {
  pending: 'Pendiente',
  contacted: 'Contactado',
  converted: 'Convertido',
  rejected: 'Rechazado',
};

export const CLIENT_SOURCE_LABELS: Record<ClientSource, string> = {
  manual: 'Manual',
  web: 'Web',
  email: 'Email',
  whatsapp: 'WhatsApp',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CIUDADES DE BUENOS AIRES
// ═══════════════════════════════════════════════════════════════════════════════

export interface BuenosAiresCity {
  id: number;
  name: string;
  partido: string | null;
  distance_km: number;
  is_free_shipping: boolean;
  postal_codes: string[] | null;
  created_at: string;
}

export interface CitiesResponse {
  cities: BuenosAiresCity[];
  total: number;
}

export interface PartidosResponse {
  partidos: string[];
}

// Constante para la distancia máxima de envío gratis
export const FREE_SHIPPING_MAX_KM = 60;

// Lista de provincias argentinas para el selector
export const ARGENTINE_PROVINCES = [
  'Buenos Aires',
  'CABA',
  'Catamarca',
  'Chaco',
  'Chubut',
  'Córdoba',
  'Corrientes',
  'Entre Ríos',
  'Formosa',
  'Jujuy',
  'La Pampa',
  'La Rioja',
  'Mendoza',
  'Misiones',
  'Neuquén',
  'Río Negro',
  'Salta',
  'San Juan',
  'San Luis',
  'Santa Cruz',
  'Santa Fe',
  'Santiago del Estero',
  'Tierra del Fuego',
  'Tucumán',
] as const;

export type ArgentineProvince = typeof ARGENTINE_PROVINCES[number];
