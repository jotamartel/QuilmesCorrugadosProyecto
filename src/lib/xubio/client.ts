// Cliente HTTP para la API de Xubio
// Maneja autenticación OAuth2 con cache de token

import { getXubioConfig } from '@/lib/config/system';
import type { XubioToken, XubioApiError } from './types';

const XUBIO_API_BASE = 'https://xubio.com/API/1.1';
const XUBIO_TOKEN_ENDPOINT = 'https://xubio.com/API/1.1/TokenEndpoint';

// Cache del token en memoria
let cachedToken: XubioToken | null = null;

/**
 * Invalida el token cacheado (útil cuando cambian las credenciales)
 */
export function invalidateXubioToken(): void {
  cachedToken = null;
}

/**
 * Obtiene un token de acceso válido
 * Usa cache si el token actual no ha expirado
 */
export async function getXubioToken(): Promise<string> {
  const config = await getXubioConfig();

  if (!config.xubio_client_id || !config.xubio_secret_id) {
    throw new Error('Credenciales de Xubio no configuradas');
  }

  // Verificar si el token cacheado aún es válido (con 1 minuto de margen)
  if (cachedToken && cachedToken.expires_at > Date.now() + 60000) {
    return cachedToken.access_token;
  }

  // Obtener nuevo token
  const credentials = Buffer.from(
    `${config.xubio_client_id}:${config.xubio_secret_id}`
  ).toString('base64');

  const response = await fetch(XUBIO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error obteniendo token de Xubio:', errorText);
    throw new Error('Error de autenticación con Xubio. Verifique las credenciales.');
  }

  const data = await response.json();

  cachedToken = {
    access_token: data.access_token,
    token_type: data.token_type || 'Bearer',
    expires_in: data.expires_in,
    expires_at: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.access_token;
}

/**
 * Realiza una petición autenticada a la API de Xubio
 */
export async function xubioRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getXubioToken();

  const url = endpoint.startsWith('http')
    ? endpoint
    : `${XUBIO_API_BASE}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  // Manejar respuestas vacías (como DELETE exitoso)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return {} as T;
  }

  const responseText = await response.text();

  if (!response.ok) {
    let errorMessage = `Error ${response.status}: ${response.statusText}`;

    try {
      const errorData = JSON.parse(responseText) as XubioApiError;
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // Si no es JSON, usar el texto como está
      if (responseText) {
        errorMessage = responseText;
      }
    }

    console.error('Error en Xubio API:', {
      endpoint,
      status: response.status,
      error: errorMessage,
    });

    throw new Error(`Xubio: ${errorMessage}`);
  }

  // Parsear respuesta JSON
  try {
    return JSON.parse(responseText) as T;
  } catch {
    console.error('Error parseando respuesta de Xubio:', responseText);
    throw new Error('Respuesta inválida de Xubio');
  }
}

/**
 * GET request a Xubio
 */
export async function xubioGet<T>(endpoint: string): Promise<T> {
  return xubioRequest<T>(endpoint, { method: 'GET' });
}

/**
 * POST request a Xubio
 */
export async function xubioPost<T>(endpoint: string, data: unknown): Promise<T> {
  return xubioRequest<T>(endpoint, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/**
 * PUT request a Xubio
 */
export async function xubioPut<T>(endpoint: string, data: unknown): Promise<T> {
  return xubioRequest<T>(endpoint, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/**
 * DELETE request a Xubio
 */
export async function xubioDelete<T>(endpoint: string): Promise<T> {
  return xubioRequest<T>(endpoint, { method: 'DELETE' });
}

/**
 * Prueba la conexión con Xubio
 */
export async function testXubioConnection(): Promise<{ success: boolean; message: string }> {
  try {
    await getXubioToken();
    return { success: true, message: 'Conexión exitosa con Xubio' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return { success: false, message };
  }
}
