/**
 * API: GET /api/auth/callback
 * Callback para OAuth de Google
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options });
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.delete({ name, ...options });
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      // Verificar si el usuario está autorizado
      const adminClient = createAdminClient();
      const { data: authorizedUser } = await adminClient
        .from('authorized_users')
        .select('id')
        .eq('email', data.user.email?.toLowerCase())
        .eq('is_active', true)
        .single();

      if (!authorizedUser) {
        // Usuario no autorizado - cerrar sesión y redirigir con error
        await supabase.auth.signOut();
        return NextResponse.redirect(
          `${origin}/login?error=unauthorized`
        );
      }

      // Usuario autorizado - redirigir al dashboard
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Error en el proceso - redirigir al login con error
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
