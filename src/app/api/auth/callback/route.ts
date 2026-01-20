/**
 * API: GET /api/auth/callback
 * Callback para OAuth de Google
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error_param = searchParams.get('error');
  const error_description = searchParams.get('error_description');
  const next = searchParams.get('next') ?? '/inicio';

  console.log('Auth callback received:', {
    hasCode: !!code,
    error: error_param,
    error_description,
    origin
  });

  // Si hay un error de OAuth, redirigir con el mensaje
  if (error_param) {
    console.log('OAuth error:', error_param, error_description);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error_description || error_param)}`
    );
  }

  if (code) {
    // Usar cliente simple para el exchange
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          flowType: 'pkce',
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        }
      }
    );

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      console.log('Exchange code result:', {
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        email: data?.user?.email,
        error: error?.message
      });

      if (error) {
        console.error('Exchange error:', error);
        return NextResponse.redirect(`${origin}/login?error=auth_error`);
      }

      if (data.user && data.session) {
        // Verificar si el usuario esta autorizado
        const adminClient = createAdminClient();
        const { data: authorizedUser, error: authError } = await adminClient
          .from('authorized_users')
          .select('id')
          .eq('email', data.user.email?.toLowerCase())
          .eq('is_active', true)
          .single();

        console.log('Authorization check:', {
          email: data.user.email,
          isAuthorized: !!authorizedUser,
          authError: authError?.message
        });

        if (!authorizedUser) {
          // Usuario no autorizado
          return NextResponse.redirect(`${origin}/login?error=unauthorized`);
        }

        // Usuario autorizado - crear response con cookies de sesion
        const response = NextResponse.redirect(`${origin}${next}`);

        // Guardar tokens en cookies
        response.cookies.set('sb-access-token', data.session.access_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 7, // 7 dias
        });

        response.cookies.set('sb-refresh-token', data.session.refresh_token, {
          path: '/',
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30, // 30 dias
        });

        console.log('Login successful, redirecting to:', next);
        return response;
      }
    } catch (err) {
      console.error('Callback error:', err);
    }
  }

  // Error en el proceso - redirigir al login con error
  return NextResponse.redirect(`${origin}/login?error=auth_error`);
}
