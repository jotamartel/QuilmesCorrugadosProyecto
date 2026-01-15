// Gestión de cheques en Xubio (consulta)
// Los cheques se registran principalmente en Supabase
// Esta integración es para consultar y sincronizar

import { xubioGet } from './client';

export interface XubioCheck {
  id: number;
  banco: string;
  numero: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  importe: number;
  librador: string;
  cuit_librador: string;
  estado: string;
}

export interface XubioCheckListResponse {
  data: XubioCheck[];
  total: number;
  page: number;
  per_page: number;
}

/**
 * Lista cheques en Xubio
 */
export async function listXubioChecks(params?: {
  estado?: string;
  page?: number;
  per_page?: number;
}): Promise<XubioCheckListResponse> {
  const queryParams = new URLSearchParams();

  if (params?.estado) queryParams.append('estado', params.estado);
  if (params?.page) queryParams.append('page', String(params.page));
  if (params?.per_page) queryParams.append('per_page', String(params.per_page));

  const query = queryParams.toString();
  return xubioGet<XubioCheckListResponse>(`/cheques${query ? `?${query}` : ''}`);
}

/**
 * Obtiene un cheque de Xubio por ID
 */
export async function getXubioCheck(checkId: string): Promise<XubioCheck> {
  return xubioGet<XubioCheck>(`/cheques/${checkId}`);
}
