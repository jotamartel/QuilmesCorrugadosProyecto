/**
 * Omnicanalidad: matching de teléfono/email con clients y contact_profiles
 */
import { createAdminClient } from '@/lib/supabase/admin';

function normalizePhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  return phone
    .replace(/\D/g, '')
    .replace(/^54/, '')
    .replace(/^9/, '');
}

/**
 * Busca un cliente por teléfono (whatsapp o phone normalizado)
 */
export async function findClientByPhone(phoneNumber: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const normalized = normalizePhone(phoneNumber);
    const digitsOnly = phoneNumber.replace(/\D/g, '');

    if (!normalized || normalized.length < 8) return null;

    // Buscar clients con whatsapp o phone que coincidan (normalizado)
    const { data: clients } = await supabase
      .from('clients')
      .select('id, whatsapp, phone')
      .not('whatsapp', 'is', null)
      .limit(500);

    const { data: clientsByPhone } = await supabase
      .from('clients')
      .select('id, whatsapp, phone')
      .not('phone', 'is', null)
      .limit(500);

    const allClients = [...(clients || []), ...(clientsByPhone || [])];
    const uniqueById = new Map(allClients.map((c) => [c.id, c]));

    if (uniqueById.size === 0) return null;

    const match = Array.from(uniqueById.values()).find((c) => {
      const w = normalizePhone(c.whatsapp || '');
      const p = normalizePhone(c.phone || '');
      const suf = normalized.slice(-8); // últimos 8 dígitos (celular Argentina)
      return (
        (w && (w.slice(-8) === suf || w === normalized || normalized.endsWith(w))) ||
        (p && (p.slice(-8) === suf || p === normalized || normalized.endsWith(p)))
      );
    });

    return match?.id ?? null;
  } catch (error) {
    console.error('[ContactMatching] Error buscando cliente:', error);
    return null;
  }
}

/**
 * Busca un cliente por email
 */
export async function findClientByEmail(email: string): Promise<string | null> {
  if (!email || !email.includes('@')) return null;
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('clients')
      .select('id')
      .ilike('email', email.trim())
      .limit(1)
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Upsert contact_profiles y retorna el client_id si hay match
 */
export async function upsertContactProfile(params: {
  phoneNumber: string;
  email?: string;
  displayName?: string;
  companyName?: string;
  clientId?: string | null;
}): Promise<{ clientId: string | null; profileId: string }> {
  const supabase = createAdminClient();

  // Buscar client si no viene
  let clientId = params.clientId ?? null;
  if (!clientId) {
    clientId = await findClientByPhone(params.phoneNumber);
    if (!clientId && params.email) {
      clientId = await findClientByEmail(params.email);
    }
  }

  const { data: profile, error } = await supabase
    .from('contact_profiles')
    .upsert(
      {
        phone_number: params.phoneNumber,
        email: params.email || null,
        display_name: params.displayName || null,
        company_name: params.companyName || null,
        client_id: clientId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number', ignoreDuplicates: false }
    )
    .select('id')
    .single();

  if (error) {
    console.error('[ContactMatching] Error upsert contact_profile:', error);
    return { clientId, profileId: '' };
  }

  return { clientId, profileId: profile?.id ?? '' };
}

/**
 * Actualiza client_id en whatsapp_conversations
 */
export async function linkConversationToClient(
  phoneNumber: string,
  clientId: string | null
): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from('whatsapp_conversations')
      .update({ client_id: clientId, updated_at: new Date().toISOString() })
      .eq('phone_number', phoneNumber);
  } catch (error) {
    console.error('[ContactMatching] Error vinculando conversación:', error);
  }
}
