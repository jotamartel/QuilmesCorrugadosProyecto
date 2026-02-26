'use client';

import { Lenis } from 'lenis/react';
// CSS inlined in globals.css to avoid Turbopack resolution issues

const HEADER_HEIGHT = 64; // h-16 = 4rem

export function LenisProvider({ children }: { children: React.ReactNode }) {
  return (
    <Lenis
      root
      options={{
        duration: 1.2,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        touchMultiplier: 2,
        autoRaf: true,
        anchors: {
          offset: HEADER_HEIGHT,
          duration: 1.2,
          easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        },
      }}
    >
      {children}
    </Lenis>
  );
}
