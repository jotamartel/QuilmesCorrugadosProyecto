/**
 * API: POST /api/traffic/track
 * Endpoint para registrar visitas y eventos de tráfico web
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Hash simple de IP para privacidad (no reversible)
function hashIP(ip: string): string {
  // En producción, usar un hash más seguro
  return Buffer.from(ip).toString('base64').substring(0, 16);
}

// Extraer dominio de referrer
function extractDomain(url: string | null): string {
  if (!url) return '';
  try {
    const domain = new URL(url).hostname;
    return domain.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Detectar tipo de dispositivo desde user agent
function detectDevice(userAgent: string): { deviceType: string; browserName: string; osName: string } {
  const ua = userAgent.toLowerCase();
  
  let deviceType = 'desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'tablet';
  }
  
  let browserName = 'unknown';
  if (ua.includes('chrome') && !ua.includes('edg')) browserName = 'Chrome';
  else if (ua.includes('firefox')) browserName = 'Firefox';
  else if (ua.includes('safari') && !ua.includes('chrome')) browserName = 'Safari';
  else if (ua.includes('edg')) browserName = 'Edge';
  else if (ua.includes('opera')) browserName = 'Opera';
  
  let osName = 'unknown';
  if (ua.includes('windows')) osName = 'Windows';
  else if (ua.includes('mac os')) osName = 'macOS';
  else if (ua.includes('linux')) osName = 'Linux';
  else if (ua.includes('android')) osName = 'Android';
  else if (ua.includes('iphone') || ua.includes('ipad')) osName = 'iOS';
  
  return { deviceType, browserName, osName };
}

// Detectar si es bot
function isBot(userAgent: string): boolean {
  const botPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'googlebot', 'bingbot',
    'facebookexternalhit', 'twitterbot', 'linkedinbot', 'slurp', 'duckduckbot'
  ];
  const ua = userAgent.toLowerCase();
  return botPatterns.some(pattern => ua.includes(pattern));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      sessionId,
      visitorId,
      pagePath,
      pageTitle,
      referrer,
      userAgent,
      screenWidth,
      screenHeight,
      eventType = 'page_view',
      eventData,
      timeOnPage,
      scrollDepth,
    } = body;

    // Validación básica
    if (!sessionId || !visitorId || !pagePath) {
      return NextResponse.json(
        { error: 'sessionId, visitorId y pagePath son requeridos' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const hashedIP = hashIP(ip);
    
    const { deviceType, browserName, osName } = detectDevice(userAgent || '');
    const referrerDomain = extractDomain(referrer);
    const bot = isBot(userAgent || '');

    // Insertar visita
    const { error: visitError } = await supabase
      .from('web_visits')
      .insert({
        session_id: sessionId,
        visitor_id: visitorId,
        page_path: pagePath,
        page_title: pageTitle,
        referrer: referrer,
        referrer_domain: referrerDomain,
        user_agent: userAgent,
        browser_name: browserName,
        device_type: deviceType,
        os_name: osName,
        screen_width: screenWidth,
        screen_height: screenHeight,
        ip_address: hashedIP,
        time_on_page_seconds: timeOnPage,
        scroll_depth: scrollDepth,
        event_type: eventType,
        event_data: eventData || null,
      });

    if (visitError) {
      console.error('Error tracking visit:', visitError);
      // No fallar la request, solo loguear
    }

    // Actualizar o crear sesión activa (solo si no es bot)
    if (!bot) {
      const { error: sessionError } = await supabase
        .from('active_sessions')
        .upsert({
          session_id: sessionId,
          visitor_id: visitorId,
          last_seen_at: new Date().toISOString(),
          current_page: pagePath,
          referrer: referrerDomain,
          device_type: deviceType,
          is_bot: false,
        }, {
          onConflict: 'session_id',
        });

      if (sessionError) {
        console.error('Error updating active session:', sessionError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in traffic tracking:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
