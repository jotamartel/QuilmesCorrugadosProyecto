import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');

    let query = supabase
      .from('communications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500);

    if (channel) {
      query = query.eq('channel', channel);
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
