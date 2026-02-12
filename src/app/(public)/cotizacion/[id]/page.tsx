'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { CheckCircle2, Package, Clock, MessageCircle, ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { LandingHeader } from '@/components/public/LandingHeader';
import { LandingFooter } from '@/components/public/LandingFooter';
import { BelowMinimumModal } from '@/components/public/BelowMinimumModal';
import { formatCurrency } from '@/lib/utils/pricing';

// Importar BoxPreview3D dinámicamente
const BoxPreview3D = dynamic(
  () => import('@/components/public/BoxPreview3D').then(mod => mod.BoxPreview3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Cargando vista 3D...</p>
      </div>
    ),
  }
);

interface PublicQuoteData {
  id: string;
  quote_number: number;
  quote_number_formatted: string;
  requester_name: string;
  requester_company: string | null;
  requester_email: string;
  requester_phone: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  quantity: number;
  has_printing: boolean;
  printing_colors: number;
  design_file_name: string | null;
  sheet_width_mm: number;
  sheet_length_mm: number;
  sqm_per_box: number;
  total_sqm: number;
  unit_price: number;
  subtotal: number;
  estimated_days: number;
  status: string;
  created_at: string;
}

const WHATSAPP_NUMBER = '5491169249801';

export default function QuoteConfirmationPage() {
  const params = useParams();
  const id = params.id as string;

  const [quote, setQuote] = useState<PublicQuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBelowMinimumModal, setShowBelowMinimumModal] = useState(false);
  const [pricingConfig, setPricingConfig] = useState<{ price_per_m2_below_minimum: number; min_m2_per_model: number } | null>(null);

  useEffect(() => {
    async function fetchQuote() {
      try {
        const [quoteRes, pricingRes] = await Promise.all([
          fetch(`/api/public/quotes/${id}`),
          fetch('/api/config/pricing'),
        ]);

        if (!quoteRes.ok) {
          throw new Error('Cotización no encontrada');
        }
        const quoteData = await quoteRes.json();
        setQuote(quoteData);

        if (pricingRes.ok) {
          const pricingData = await pricingRes.json();
          // Usar valores directamente de la configuración activa (sin fallbacks hardcodeados)
          if (pricingData.price_per_m2_below_minimum && pricingData.min_m2_per_model) {
            setPricingConfig({
              price_per_m2_below_minimum: pricingData.price_per_m2_below_minimum,
              min_m2_per_model: pricingData.min_m2_per_model,
            });
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al cargar la cotización');
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchQuote();
    }
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando cotización...</p>
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <LandingHeader />
        <main className="pt-24 pb-16 px-4">
          <div className="max-w-lg mx-auto text-center">
            <div className="bg-white rounded-xl shadow-lg p-8">
              <p className="text-red-600 mb-4">{error || 'Cotización no encontrada'}</p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-amber-600 hover:text-amber-700"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al inicio
              </Link>
            </div>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const createdDate = new Date(quote.created_at);
  const whatsappMessage = `Hola, acabo de enviar una cotización web (${quote.quote_number_formatted}) para ${quote.quantity} cajas de ${quote.length_mm}x${quote.width_mm}x${quote.height_mm}mm`;

  return (
    <div className="min-h-screen bg-gray-50">
      <LandingHeader />

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              ¡Cotización enviada!
            </h1>
            <p className="text-gray-600">
              Número: <span className="font-semibold">{quote.quote_number_formatted}</span>
            </p>
            <p className="text-sm text-gray-500">
              {createdDate.toLocaleDateString('es-AR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left Column - 3D View and Details */}
            <div className="space-y-6">
              {/* Vista 3D */}
              <BoxPreview3D
                length={quote.length_mm}
                width={quote.width_mm}
                height={quote.height_mm}
                autoRotate={true}
              />

              {/* Resumen de la caja */}
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-amber-600" />
                  Resumen del pedido
                </h2>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Dimensiones:</span>
                    <span className="font-medium">{quote.length_mm} x {quote.width_mm} x {quote.height_mm} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Cantidad:</span>
                    <span className="font-medium">{quote.quantity.toLocaleString('es-AR')} unidades</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Impresión:</span>
                    <span className="font-medium">
                      {quote.has_printing ? `Sí, ${quote.printing_colors} color${quote.printing_colors > 1 ? 'es' : ''}` : 'No'}
                    </span>
                  </div>
                  {quote.design_file_name && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Diseño:</span>
                      <span className="font-medium text-green-600">{quote.design_file_name} ✓</span>
                    </div>
                  )}
                  <hr className="my-3" />
                  <div className="flex justify-between">
                    <span className="text-gray-500">Medida plancha:</span>
                    <span className="font-medium">{quote.sheet_width_mm} x {quote.sheet_length_mm} mm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">m² totales:</span>
                    <span className="font-medium">{quote.total_sqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
                  </div>
                  <hr className="my-3" />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total estimado:</span>
                    <span className="text-amber-600">{formatCurrency(quote.subtotal)}</span>
                  </div>
                  <div className="flex items-center gap-2 text-gray-600 bg-gray-50 rounded-lg p-3 mt-4">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <span>Entrega estimada: <strong>{quote.estimated_days} días hábiles</strong></span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column - Contact Info and Next Steps */}
            <div className="space-y-6">
              {/* Datos de contacto */}
              <div className="bg-white rounded-xl shadow p-6">
                <h2 className="font-semibold text-gray-900 mb-4">Datos de contacto</h2>
                <div className="space-y-2 text-sm">
                  <p>
                    <span className="text-gray-500">Empresa/Nombre:</span>{' '}
                    <span className="font-medium">{quote.requester_company || quote.requester_name}</span>
                  </p>
                  {quote.requester_company && (
                    <p>
                      <span className="text-gray-500">Contacto:</span>{' '}
                      <span className="font-medium">{quote.requester_name}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-gray-500">Email:</span>{' '}
                    <span className="font-medium">{quote.requester_email}</span>
                  </p>
                  <p>
                    <span className="text-gray-500">Teléfono:</span>{' '}
                    <span className="font-medium">{quote.requester_phone}</span>
                  </p>
                </div>
              </div>

              {/* Próximos pasos */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
                <h2 className="font-semibold text-amber-900 mb-3">¿Qué sigue?</h2>
                <ul className="space-y-2 text-sm text-amber-800">
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600">1.</span>
                    Te contactaremos en menos de 24hs hábiles para confirmar los detalles.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600">2.</span>
                    Coordinaremos el envío del diseño de impresión (si aplica).
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600">3.</span>
                    Una vez confirmado, emitiremos la factura con el 50% de seña.
                  </li>
                </ul>
              </div>

              {/* WhatsApp Button */}
              <a
                href={`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(whatsappMessage)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full px-6 py-3 bg-green-500 hover:bg-green-600 text-white font-medium rounded-lg transition-colors"
              >
                <MessageCircle className="w-5 h-5" />
                ¿Urgente? Escribinos al WhatsApp
              </a>

              {/* Botón para pedidos menores al mínimo */}
              {quote.total_sqm >= 3000 && pricingConfig && (
                <button
                  onClick={() => setShowBelowMinimumModal(true)}
                  className="w-full px-6 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 shadow-lg"
                >
                  <AlertCircle className="w-5 h-5" />
                  ¿Necesitas menos m²?
                </button>
              )}

              {/* Back to home */}
              <Link
                href="/"
                className="flex items-center justify-center gap-2 text-gray-600 hover:text-amber-600"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </main>

      <LandingFooter />

      {/* Modal para pedidos menores al mínimo */}
      {quote && pricingConfig && (
        <BelowMinimumModal
          isOpen={showBelowMinimumModal}
          onClose={() => setShowBelowMinimumModal(false)}
          quoteId={quote.id}
          boxDimensions={{
            length_mm: quote.length_mm,
            width_mm: quote.width_mm,
            height_mm: quote.height_mm,
          }}
          originalQuantity={quote.quantity}
          originalTotalSqm={quote.total_sqm}
          pricePerM2BelowMinimum={pricingConfig.price_per_m2_below_minimum}
          minM2PerModel={pricingConfig.min_m2_per_model}
          onSuccess={() => {
            // Recargar la cotización para ver el estado actualizado
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
