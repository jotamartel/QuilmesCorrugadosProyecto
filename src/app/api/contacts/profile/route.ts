import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/contacts/profile?phone=+549...
 * Perfil unificado: contact_profile, historial, órdenes, cotizaciones
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get('phone');

    if (!phone) {
      return NextResponse.json(
        { error: 'phone es requerido' },
        { status: 400 }
      );
    }

    // 1. Contact profile (si existe - tabla puede no existir si migración no corrida)
    let profile: { client_id?: string; [k: string]: unknown } | null = null;
    const { data: profileData, error: profileError } = await supabase
      .from('contact_profiles')
      .select('*')
      .eq('phone_number', phone)
      .maybeSingle();
    if (!profileError) profile = profileData;
    const clientId = profile?.client_id ?? null;

    // 2. Datos del cliente si hay match
    let client = null;
    if (clientId) {
      const { data } = await supabase
        .from('clients')
        .select('id, name, company, email, phone, whatsapp, address, city')
        .eq('id', clientId)
        .single();
      client = data;
    }

    // 3. Historial de comunicaciones: WhatsApp por teléfono + otros canales por client_id
    const { data: whatsappComms } = await supabase
      .from('communications')
      .select('id, channel, direction, content, created_at, metadata')
      .eq('channel', 'whatsapp')
      .eq('metadata->>phone', phone)
      .order('created_at', { ascending: true })
      .limit(200);

    let communications = whatsappComms || [];
    if (clientId) {
      const { data: clientComms } = await supabase
        .from('communications')
        .select('id, channel, direction, content, created_at, metadata')
        .eq('client_id', clientId)
        .neq('channel', 'whatsapp')
        .order('created_at', { ascending: true })
        .limit(50);
      const existingIds = new Set(communications.map((c) => c.id));
      const extra = (clientComms || []).filter((c) => !existingIds.has(c.id));
      communications = [...communications, ...extra].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    }

    // 4. Últimas órdenes (si hay client_id)
    let orders: Awaited<ReturnType<typeof supabase.from<'orders'>>>['data'] = [];
    if (clientId) {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, status, total, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10);
      orders = data || [];
    }

    // 5. Últimas cotizaciones (por client_id o por public_quotes con mismo teléfono)
    let quotes: Array<{ id: string; quote_number?: string; total?: number; status?: string; created_at: string }> = [];
    if (clientId) {
      const { data } = await supabase
        .from('quotes')
        .select('id, quote_number, total, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10);
      quotes = (data || []).map((q) => ({
        id: q.id,
        quote_number: q.quote_number,
        total: q.total ? Number(q.total) : undefined,
        status: q.status,
        created_at: q.created_at,
      }));
    }
    // También cotizaciones desde public_quotes con este teléfono
    const { data: pq } = await supabase
      .from('public_quotes')
      .select('id, quote_number, subtotal, status, created_at')
      .eq('requester_phone', phone)
      .order('created_at', { ascending: false })
      .limit(5);
    if (pq?.length) {
      const pqQuotes = pq.map((q) => ({
        id: q.id,
        quote_number: `QW-${q.quote_number}`,
        total: q.subtotal ? Number(q.subtotal) : undefined,
        status: q.status,
        created_at: q.created_at,
      }));
      quotes = [...quotes, ...pqQuotes].slice(0, 10);
    }

    return NextResponse.json({
      contact: {
        phone_number: phone,
        display_name: profile?.display_name ?? client?.name,
        company_name: profile?.company_name ?? client?.company,
        email: profile?.email ?? client?.email,
        client_id: clientId,
        preferred_channel: profile?.preferred_channel ?? 'whatsapp',
        company_enrichment: profile?.company_enrichment ?? null,
        last_order_at: profile?.last_order_at,
        total_orders: profile?.total_orders ?? orders.length,
        total_m2: profile?.total_m2,
      },
      client: client || null,
      conversation_history: communications,
      orders,
      quotes,
    });
  } catch (error) {
    console.error('[Contacts API] Error:', error);
    return NextResponse.json(
      { error: 'Error obteniendo perfil' },
      { status: 500 }
    );
  }
}
