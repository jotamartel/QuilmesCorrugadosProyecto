import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// El cliente de sesión no ve `communications`: la tabla tiene RLS prendido y
// cero policies, así que devuelve una lista vacía y ningún error. Por eso se
// comprueba quién pregunta con el cliente de sesión y se lee con la service
// role, que saltea RLS. Antes este handler ni chequeaba sesión: no se notó
// porque RLS igual lo dejaba sin ver nada.
async function sesion() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await sesion())) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    const supabase = createAdminClient();
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');
    const phone = searchParams.get('phone');

    let query = supabase
      .from('communications')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500);

    if (channel) {
      query = query.eq('channel', channel);
    }

    if (phone) {
      query = query.eq('metadata->>phone', phone);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching communications:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Error in GET /api/communications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
