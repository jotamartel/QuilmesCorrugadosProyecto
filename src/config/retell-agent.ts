/**
 * Configuración del Agente Retell AI para Quilmes Corrugados
 * Bot telefónico "Ana"
 */

import type { RetellAgentConfig, RetellTool } from '@/types/retell';

/**
 * Prompt del sistema para el agente "Ana"
 */
export const AGENT_PROMPT = `Sos Ana, la asistente telefónica de Quilmes Corrugados, una fábrica de cajas de cartón corrugado ubicada en Quilmes, Buenos Aires, Argentina.

## Tu personalidad:
- Sos amable, profesional y eficiente
- Usás español rioplatense natural (vos, tuteo argentino)
- Sos paciente y clara al explicar
- Mostrás entusiasmo genuino por ayudar
- Nunca inventás información - si no sabés algo, lo decís

## Tu rol:
- Atendés llamadas de clientes que quieren cotizar cajas de cartón
- Cotizás cajas a medida en tiempo real
- Registrás datos de contacto para seguimiento
- Transferís a ventas cuando es necesario

## Información del negocio:
- Fabricamos cajas de cartón corrugado a medida
- Las cajas son tipo RSC (Regular Slotted Container)
- Trabajamos con medidas entre 5 y 500 centímetros
- El ancho + alto de la caja no puede superar 120 cm (limitación técnica)
- Pedido mínimo: 100 unidades
- Tiempos de producción: 2-10 días según volumen
- Ofrecemos descuentos por volumen (hasta 20%)
- Horario de atención: Lunes a Viernes de 8 a 17hs

## Cómo cotizar:
1. Pedile al cliente las medidas: largo, ancho y alto en centímetros
2. Pedile la cantidad de cajas
3. Usá la función "cotizar" con esos datos
4. La función te va a devolver el precio y vos se lo comunicás al cliente

## Flujo típico:
1. Saludar y preguntar en qué podés ayudar
2. Si quieren cotizar: pedir medidas y cantidad
3. Dar la cotización (precio, tiempo de producción)
4. Ofrecer enviar cotización por email
5. Preguntar si necesitan algo más
6. Despedirte amablemente

## Frases útiles:
- "¿En qué puedo ayudarte hoy?"
- "Para cotizarte necesito las medidas de la caja en centímetros: largo, ancho y alto, y la cantidad"
- "Dejame calcular eso..."
- "¿Querés que te envíe esta cotización por email?"
- "¿Hay algo más en lo que pueda ayudarte?"
- "Gracias por comunicarte con Quilmes Corrugados, que tengas un buen día"

## Reglas importantes:
- NUNCA inventés precios, siempre usá la función cotizar
- Si las medidas exceden el límite, explicá el problema claramente
- Si el cliente quiere hablar con un humano, usá la función transferir
- Mantené las respuestas concisas y naturales
- No uses palabras técnicas innecesarias
- Adaptate al ritmo del cliente

## Manejo de errores:
- Si no entendiste las medidas, pedí que las repitan
- Si hay un problema técnico, disculpate y ofrecé transferir
- Nunca dejes al cliente sin respuesta`;

/**
 * Obtener configuración de tools con URLs dinámicas
 */
export function getAgentTools(baseUrl: string): RetellTool[] {
  return [
    {
      type: 'custom',
      name: 'cotizar',
      description: 'Calcula el precio de cajas de cartón según medidas y cantidad. ' +
        'Usar cuando el cliente quiere una cotización. ' +
        'Requiere: largo_cm, ancho_cm, alto_cm (medidas en centímetros) y cantidad (número de cajas).',
      url: `${baseUrl}/api/retell/cotizar`,
      speak_during_execution: true,
      speak_after_execution: true,
      parameters: {
        type: 'object',
        properties: {
          largo_cm: {
            type: 'number',
            description: 'Largo de la caja en centímetros',
          },
          ancho_cm: {
            type: 'number',
            description: 'Ancho de la caja en centímetros',
          },
          alto_cm: {
            type: 'number',
            description: 'Alto de la caja en centímetros',
          },
          cantidad: {
            type: 'integer',
            description: 'Cantidad de cajas que necesita el cliente',
          },
        },
        required: ['largo_cm', 'ancho_cm', 'alto_cm', 'cantidad'],
      },
    },
    {
      type: 'custom',
      name: 'registrar_lead',
      description: 'Registra los datos de contacto del cliente para seguimiento. ' +
        'Usar cuando el cliente quiere que lo contacten o envíe cotización por email.',
      url: `${baseUrl}/api/retell/registrar-lead`,
      speak_during_execution: false,
      speak_after_execution: true,
      parameters: {
        type: 'object',
        properties: {
          nombre: {
            type: 'string',
            description: 'Nombre del cliente',
          },
          email: {
            type: 'string',
            description: 'Email del cliente',
          },
          telefono: {
            type: 'string',
            description: 'Teléfono del cliente',
          },
          consulta: {
            type: 'string',
            description: 'Descripción de la consulta o necesidad del cliente',
          },
          cotizacion_id: {
            type: 'string',
            description: 'ID de la cotización previa si existe',
          },
        },
        required: ['consulta'],
      },
    },
    {
      type: 'custom',
      name: 'transferir',
      description: 'Transfiere la llamada a un asesor de ventas humano. ' +
        'Usar cuando el cliente lo solicita explícitamente o la consulta es muy compleja.',
      url: `${baseUrl}/api/retell/transferir`,
      speak_during_execution: false,
      speak_after_execution: true,
      parameters: {
        type: 'object',
        properties: {
          motivo: {
            type: 'string',
            description: 'Motivo de la transferencia',
          },
        },
        required: [],
      },
    },
  ];
}

/**
 * Configuración completa del agente para crear/actualizar en Retell
 */
export function getAgentConfig(baseUrl: string): Partial<RetellAgentConfig> {
  return {
    agent_name: 'Ana - Quilmes Corrugados',
    voice_id: 'eleven_spanish_argentina_female', // Ajustar según voces disponibles en Retell
    language: 'es',
    general_prompt: AGENT_PROMPT,
    general_tools: getAgentTools(baseUrl),
    begin_message: 'Hola, gracias por llamar a Quilmes Corrugados. Soy Ana, ¿en qué puedo ayudarte?',
    ambient_sound: 'off',
    responsiveness: 0.8,
    interruption_sensitivity: 0.5,
    enable_backchannel: true,
    backchannel_frequency: 0.3,
    backchannel_words: ['ajá', 'claro', 'bien', 'entendido', 'ok'],
    reminder_trigger_ms: 10000, // Recordatorio si el usuario no habla por 10s
    reminder_max_count: 2,
    normalize_for_speech: true,
    end_call_after_silence_ms: 30000, // Colgar después de 30s de silencio
    max_call_duration_ms: 900000, // Máximo 15 minutos
    post_call_analysis_data: [
      {
        name: 'cotizacion_realizada',
        type: 'boolean',
        description: 'Si se realizó una cotización durante la llamada',
      },
      {
        name: 'email_registrado',
        type: 'boolean',
        description: 'Si el cliente dejó su email',
      },
      {
        name: 'transferido',
        type: 'boolean',
        description: 'Si se transfirió a ventas',
      },
      {
        name: 'tipo_consulta',
        type: 'enum',
        description: 'Tipo de consulta del cliente',
        enum: ['cotizacion', 'seguimiento', 'reclamo', 'informacion', 'otro'],
      },
    ],
  };
}

/**
 * Helper para validar configuración
 */
export function validateAgentConfig(config: Partial<RetellAgentConfig>): boolean {
  if (!config.agent_name) return false;
  if (!config.general_prompt) return false;
  if (!config.general_tools || config.general_tools.length === 0) return false;
  return true;
}

/**
 * Exportar configuración para usar en scripts de setup
 */
export const DEFAULT_CONFIG = {
  AGENT_PROMPT,
  getAgentTools,
  getAgentConfig,
};
