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
  PRECIO_BASE_M2: 700, // ARS por m²
  ANCHO_LAMINA_MAX_MM: 1200,
  SOLAPA_MM: 50, // 5cm de solapa
  HORARIO_LABORAL: {
    INICIO: 8,
    FIN: 17,
    DIAS: [1, 2, 3, 4, 5] as number[], // Lunes a Viernes
  },
  DESCUENTOS: [
    { minM2: 5000, descuento: 0.20, nombre: '20% mayorista' },
    { minM2: 3000, descuento: 0.15, nombre: '15% por volumen' },
    { minM2: 1000, descuento: 0.10, nombre: '10% por volumen' },
    { minM2: 500, descuento: 0.05, nombre: '5% por volumen' },
  ],
  TIEMPOS_PRODUCCION: [
    { maxM2: 1000, tiempo: '2 a 3 días hábiles' },
    { maxM2: 3000, tiempo: '3 a 5 días hábiles' },
    { maxM2: 5000, tiempo: '5 a 7 días hábiles' },
    { maxM2: Infinity, tiempo: '7 a 10 días hábiles' },
  ],
  MEDIDAS: {
    MIN_CM: 5,
    MAX_CM: 500,
  },
} as const;
