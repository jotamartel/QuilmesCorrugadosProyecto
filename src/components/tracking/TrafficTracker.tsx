'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

// Generar IDs persistentes para sesión y visitante
function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  let sessionId = sessionStorage.getItem('traffic_session_id');
  if (!sessionId) {
    sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('traffic_session_id', sessionId);
  }
  return sessionId;
}

function getVisitorId(): string {
  if (typeof window === 'undefined') return '';
  let visitorId = localStorage.getItem('traffic_visitor_id');
  if (!visitorId) {
    visitorId = `vis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('traffic_visitor_id', visitorId);
  }
  return visitorId;
}

export function TrafficTracker() {
  const pathname = usePathname();
  const startTimeRef = useRef<number>(Date.now());
  const scrollDepthRef = useRef<number>(0);
  const hasTrackedRef = useRef<boolean>(false);

  useEffect(() => {
    // Solo trackear en páginas públicas (no en dashboard)
    if (pathname?.startsWith('/inicio') || pathname?.startsWith('/api') || pathname?.startsWith('/auth')) {
      return;
    }

    const sessionId = getSessionId();
    const visitorId = getVisitorId();
    const startTime = Date.now();

    // Trackear página vista inicial
    const trackPageView = () => {
      if (hasTrackedRef.current) return;
      hasTrackedRef.current = true;

      const scrollDepth = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
      );

      fetch('/api/traffic/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          visitorId,
          pagePath: pathname || '/',
          pageTitle: document.title,
          referrer: document.referrer,
          userAgent: navigator.userAgent,
          screenWidth: window.screen.width,
          screenHeight: window.screen.height,
          eventType: 'page_view',
          scrollDepth: Math.min(scrollDepth, 100),
        }),
      }).catch(() => {
        // Silenciar errores de tracking
      });
    };

    // Trackear scroll depth
    const trackScroll = () => {
      const scrollDepth = Math.round(
        ((window.scrollY + window.innerHeight) / document.documentElement.scrollHeight) * 100
      );
      if (scrollDepth > scrollDepthRef.current) {
        scrollDepthRef.current = scrollDepth;
      }
    };

    // Trackear tiempo en página al salir
    const trackTimeOnPage = () => {
      const timeOnPage = Math.round((Date.now() - startTime) / 1000);
      if (timeOnPage > 0) {
        fetch('/api/traffic/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            visitorId,
            pagePath: pathname || '/',
            pageTitle: document.title,
            eventType: 'page_view',
            timeOnPage,
            scrollDepth: scrollDepthRef.current,
          }),
        }).catch(() => {});
      }
    };

    // Trackear eventos especiales
    const trackEvent = (eventType: string, eventData?: Record<string, unknown>) => {
      fetch('/api/traffic/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          visitorId,
          pagePath: pathname || '/',
          pageTitle: document.title,
          eventType,
          eventData,
        }),
      }).catch(() => {});
    };

    // Exponer función global para trackear eventos desde otros componentes
    (window as any).trackTrafficEvent = trackEvent;

    // Trackear inicialmente
    trackPageView();

    // Trackear scroll
    window.addEventListener('scroll', trackScroll, { passive: true });

    // Trackear tiempo al salir
    window.addEventListener('beforeunload', trackTimeOnPage);

    // Cleanup
    return () => {
      window.removeEventListener('scroll', trackScroll);
      window.removeEventListener('beforeunload', trackTimeOnPage);
      trackTimeOnPage();
    };
  }, [pathname]);

  return null; // Componente invisible
}
