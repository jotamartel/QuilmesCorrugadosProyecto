import type { Metadata, Viewport } from 'next';
import { JetBrains_Mono, DM_Sans } from 'next/font/google';
import RetailTracking from '@/components/retail/RetailTracking';

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-retail-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const dmSans = DM_Sans({
  variable: '--font-retail-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const viewport: Viewport = {
  viewportFit: 'cover',
};

export const metadata: Metadata = {
  title: 'Armá tu caja | Quilmes Corrugados',
  description: 'Diseñá tu caja de cartón corrugado a medida y cotizá al instante. Tocá, arrastrá y armá tu caja personalizada.',
};

export default function RetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={`${jetbrainsMono.variable} ${dmSans.variable}`}>
      <RetailTracking />
      {children}
    </div>
  );
}
