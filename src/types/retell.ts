import { HORARIO } from '@/lib/retail/config';

/**
 * Tipos TypeScript para integración con Retell AI
 * Bot telefónico para Quilmes Corrugados
 */

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS DE LLAMADAS
// ═══════════════════════════════════════════════════════════════════════════════

export type CallStatus = 'in_progress' | 'completed' | 'failed' | 'transferred';
export type TransferStatus = 'pending' | 'completed' | 'failed' | 'callback_scheduled';
export type Sentiment = 'positive' | 'neutral' | 'negative';

// ═══════════════════════════════════════════════════════════════════════════════
// PAYLOADS DE WEBHOOK
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetellWebhookPayload {
  event: 'call_started' | 'call_ended' | 'call_analyzed';
  call: RetellCall;
}

export interface RetellCall {
  call_id: string;
  agent_id: string;
  call_type: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  start_timestamp: number; // Unix timestamp ms
  end_timestamp?: number;
  duration_ms?: number;
  status: 'ongoing' | 'ended' | 'error';
  end_call_reason?: string;
  transcript?: string;
  transcript_object?: TranscriptTurn[];
  recording_url?: string;
  public_log_url?: string;
  call_analysis?: CallAnalysis;
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
}

export interface TranscriptTurn {
  role: 'agent' | 'user';
  content: string;
  words?: TranscriptWord[];
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
}

export interface CallAnalysis {
  call_summary?: string;
  user_sentiment?: Sentiment;
  call_successful?: boolean;
  custom_analysis_data?: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARÁMETROS DE FUNCIONES CUSTOM
// ═══════════════════════════════════════════════════════════════════════════════

export interface CotizarParams {
  largo_cm: number;     // Largo de la caja en cm
  ancho_cm: number;     // Ancho de la caja en cm
  alto_cm: number;      // Alto de la caja en cm
  cantidad: number;     // Cantidad de cajas
  call_id?: string;     // ID de la llamada (opcional)
  telefono?: string;    // Teléfono del cliente (opcional)
}

export interface CotizarResponse {
  response: string;     // Texto que Ana dirá
  data?: {
    cotizacion_id?: string;
    precio_unitario: number;
    precio_total: number;
    descuento_porcentaje: number;
    area_m2_unitario: number;
    area_m2_total: number;
    tiempo_produccion: string;
    ancho_lamina_mm: number;
    largo_lamina_mm: number;
    excede_limite: boolean;
    exceso_mm?: number;
  };
}

export interface RegistrarLeadParams {
  nombre?: string;
  email?: string;
  telefono?: string;
  consulta: string;
  cotizacion_id?: string;
  call_id?: string;
}

export interface RegistrarLeadResponse {
  response: string;
  data?: {
    lead_id: string;
    email_enviado?: boolean;
  };
}

export interface TransferirParams {
  motivo?: string;
  call_id?: string;
  telefono_cliente?: string;
}

export interface TransferirResponse {
  response: string;
  transfer?: boolean;
  transfer_number?: string;
  data?: {
    transferencia_id?: string;
    horario_laboral: boolean;
    callback_programado?: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIPOS PARA BASE DE DATOS
// ═══════════════════════════════════════════════════════════════════════════════

export interface DBLlamada {
  id: string;
  call_id: string;
  from_number: string;
  to_number?: string;
  started_at: string;
  ended_at?: string;
  duration_seconds?: number;
  transcript?: TranscriptTurn[];
  status: CallStatus;
  sentiment?: Sentiment;
  summary?: string;
  recording_url?: string;
  created_at: string;
  updated_at?: string;
}

export interface DBTransferencia {
  id: string;
  call_id?: string;
  from_number: string;
  requested_at: string;
  status: TransferStatus;
  horario_laboral: boolean;
  motivo?: string;
  callback_scheduled_at?: string;
  created_at: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN DEL AGENTE
// ═══════════════════════════════════════════════════════════════════════════════

export interface RetellAgentConfig {
  agent_name: string;
  voice_id: string;
  language: string;
  llm_websocket_url?: string;
  general_prompt: string;
  general_tools: RetellTool[];
  begin_message?: string;
  ambient_sound?: string;
  ambient_sound_volume?: number;
  responsiveness?: number;
  interruption_sensitivity?: number;
  enable_backchannel?: boolean;
  backchannel_frequency?: number;
  backchannel_words?: string[];
  reminder_trigger_ms?: number;
  reminder_max_count?: number;
  normalize_for_speech?: boolean;
  end_call_after_silence_ms?: number;
  max_call_duration_ms?: number;
  voicemail_detection_timeout_ms?: number;
  post_call_analysis_data?: PostCallAnalysisData[];
}

export interface RetellTool {
  type: 'custom';
  name: string;
  description: string;
  url: string;
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  parameters: RetellToolParameters;
}

export interface RetellToolParameters {
  type: 'object';
  properties: Record<string, RetellToolProperty>;
  required?: string[];
}

export interface RetellToolProperty {
  type: 'string' | 'number' | 'boolean' | 'integer';
  description: string;
  enum?: string[];
}

export interface PostCallAnalysisData {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  description: string;
  enum?: string[];
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════════

export const RETELL_CONSTANTS = {
  TIMEZONE: 'America/Argentina/Buenos_Aires',
  // PRECIO_BASE_M2, ANCHO_LAMINA_MAX_MM y SOLAPA_MM se borraron el 22/08/2026,
  // junto con TIEMPOS_PRODUCCION y MEDIDAS. Los usaba /api/retell/cotizar, que
  // ahora cotiza con el motor como todos los demas canales.
  //
  // PRECIO_BASE_M2 valia 700, un precio que la fabrica no cobra en ningun tramo
  // —la escalera real va de 800 a 1.200 por m²— y MEDIDAS decia 5 a 500 cm, o
  // sea que aceptaba cajas de 50 mm y de 5 metros. Que no los leyera nadie no
  // los hacia inofensivos: eran la version equivocada esperando que alguien la
  // importara por tenerla a mano. Es el mismo motivo por el que se borro
  // DESCUENTOS.
  // Sale de HORARIO y no escrito a mano: esta constante decide si una llamada
  // se transfiere a una persona. Con 8 a 17 en duro, a las 7 no transferia
  // estando la fabrica abierta, y a las 16:30 transferia a un telefono que ya
  // no atendia nadie.
  HORARIO_LABORAL: {
    INICIO: HORARIO.desde,
    FIN: HORARIO.hasta,
    DIAS: [...HORARIO.dias] as number[],
  },
  // DESCUENTOS se borro el 20/08/2026. No lo leia nadie y describia el precio
  // como un porcentaje de descuento sobre una base que no existe: la escalera
  // real son cuatro precios por m² en pricing_config, no descuentos. Tenerlo
  // escrito acá era una segunda version de los precios esperando divergir.
} as const;
