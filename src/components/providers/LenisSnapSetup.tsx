'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useLenis } from 'lenis/react';
import Snap from 'lenis/snap';

const SNAP_SELECTOR = '[data-snap-section]';
const SNAP_DURATION = 1;
const SNAP_DEBOUNCE = 150;

export function LenisSnapSetup() {
  const lenis = useLenis();
  const pathname = usePathname();

  useEffect(() => {
    if (!lenis) return;

    const snap = new Snap(lenis, {
      type: 'proximity',
      duration: SNAP_DURATION,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      distanceThreshold: '40%',
      debounce: SNAP_DEBOUNCE,
    });

    const elements = document.querySelectorAll<HTMLElement>(SNAP_SELECTOR);
    const removers = Array.from(elements).map((el) =>
      snap.addElement(el, { align: 'start' })
    );

    return () => {
      removers.forEach((remove) => remove());
      snap.destroy();
    };
  }, [lenis, pathname]);

  return null;
}
