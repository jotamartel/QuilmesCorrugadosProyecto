import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/whatsapp/conversations
 * Obtiene las conversaciones de WhatsApp con filtros
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Filtros
    const filter = searchParams.get('filter'); // 'all' | 'needs_advisor' | 'quoted' | 'unattended'
    const search = searchParams.get('search'); // Buscar por teléfono
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');

    // Obtener conversaciones
    let query = supabase
      .from('whatsapp_conversations')
      .select('*')
      .order('last_interaction', { ascending: false });

    // Aplicar filtro de fecha
    if (dateFrom) {
      query = query.gte('last_interaction', dateFrom);
    }
    if (dateTo) {
      query = query.lte('last_interaction', dateTo + 'T23:59:59');
    }

    // Aplicar búsqueda por teléfono
    if (search) {
      query = query.ilike('phone_number', `%${search}%`);
    }

    // Aplicar filtro de estado
    if (filter === 'unattended') {
      query = query.eq('attended', false);
    }

    const { data: conversations, error } = await query;

    if (error) {
      throw error;
    }

    // Obtener estadísticas de cada conversación desde communications
    const enrichedConversations = await Promise.all(
      (conversations || []).map(async (conv) => {
        // Obtener mensajes y stats
        const { data: messages } = await supabase
          .from('communications')
          .select('metadata, created_at')
          .eq('channel', 'whatsapp')
          .eq('metadata->>phone', conv.phone_number)
          .order('created_at', { ascending: false });

        const messageCount = messages?.length || 0;
        const quotedMessages = messages?.filter(m =>
          (m.metadata as Record<string, unknown>)?.quote
        ) || [];
        const totalQuoted = quotedMessages.reduce((sum, m) => {
          const quote = (m.metadata as { quote?: { total: number } })?.quote;
          return sum + (quote?.total || 0);
        }, 0);
        const needsAdvisor = messages?.some(m =>
          (m.metadata as Record<string, unknown>)?.needsAdvisor
        ) || false;

        return {
          ...conv,
          message_count: messageCount,
          quotes_count: quotedMessages.length,
          total_quoted: totalQuoted,
          needs_advisor: needsAdvisor,
        };
      })
    );

    // Filtrar por needs_advisor o quoted si es necesario
    let filteredConversations = enrichedConversations;
    if (filter === 'needs_advisor') {
      filteredConversations = enrichedConversations.filter(c => c.needs_advisor);
    } else if (filter === 'quoted') {
      filteredConversations = enrichedConversations.filter(c => c.quotes_count > 0);
    }

    // Ordenar: primero los que necesitan asesor, luego por última interacción
    filteredConversations.sort((a, b) => {
      if (a.needs_advisor && !a.attended && (!b.needs_advisor || b.attended)) return -1;
      if ((!a.needs_advisor || a.attended) && b.needs_advisor && !b.attended) return 1;
      return new Date(b.last_interaction).getTime() - new Date(a.last_interaction).getTime();
    });

    // Calcular stats globales
    const stats = {
      total: filteredConversations.length,
      needsAdvisor: filteredConversations.filter(c => c.needs_advisor && !c.attended).length,
      quoted: filteredConversations.filter(c => c.quotes_count > 0).length,
      unattended: filteredConversations.filter(c => !c.attended).length,
      totalQuotedValue: filteredConversations.reduce((sum, c) => sum + c.total_quoted, 0),
    };

    return NextResponse.json({
      conversations: filteredConversations,
      stats,
    });
  } catch (error) {
    console.error('[WhatsApp API] Error:', error);
    return NextResponse.json(
      { error: 'Error obteniendo conversaciones' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/whatsapp/conversations
 * Marca una conversación como atendida
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await request.json();
    const { phoneNumber, attended, notes } = body;

    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'phoneNumber es requerido' },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from('whatsapp_conversations')
      .update({
        attended: attended ?? true,
        attended_at: attended ? new Date().toISOString() : null,
        notes: notes,
      })
      .eq('phone_number', phoneNumber);

    if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[WhatsApp API] Error:', error);
    return NextResponse.json(
      { error: 'Error actualizando conversación' },
      { status: 500 }
    );
  }
}
