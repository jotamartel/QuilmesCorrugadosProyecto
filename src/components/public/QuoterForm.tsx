'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ArrowLeft, ArrowRight, Loader2, Plus, Eye } from 'lucide-react';
import { PriceSummary } from './PriceSummary';
import { BoxItemForm, BoxItemData, BoxCalculations, calculateBoxItem } from './BoxItemForm';
import type { TaxCondition, BuenosAiresCity } from '@/lib/types/database';
import { ARGENTINE_PROVINCES, FREE_SHIPPING_MAX_KM } from '@/lib/types/database';
import { trackEvent } from '@/lib/utils/tracking';

// Importar BoxPreview3D dinámicamente para evitar SSR issues con Three.js
const BoxPreview3D = dynamic(
  () => import('./BoxPreview3D').then(mod => mod.BoxPreview3D),
  {
    ssr: false,
    loading: () => (
      <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500">Cargando vista 3D...</p>
      </div>
    ),
  }
);

interface ClientFormData {
  client_type: 'empresa' | 'particular';
  requester_name: string;
  requester_company: string;
  requester_cuit: string;
  requester_tax_condition: TaxCondition;
  requester_email: string;
  requester_phone: string;
  address: string;
  city: string;
  city_id: number | null;
  province: string;
  postal_code: string;
  distance_km: number | null;
  message: string;
}

const initialClientData: ClientFormData = {
  client_type: 'empresa',
  requester_name: '',
  requester_company: '',
  requester_cuit: '',
  requester_tax_condition: 'responsable_inscripto',
  requester_email: '',
  requester_phone: '',
  address: '',
  city: '',
  city_id: null,
  province: 'Buenos Aires',
  postal_code: '',
  distance_km: null,
  message: '',
};

const createNewBox = (): BoxItemData => ({
  id: crypto.randomUUID(),
  length_mm: 400,
  width_mm: 300,
  height_mm: 300,
  quantity: 0,
  has_printing: false,
  printing_colors: 1,
  design_file_url: '',
  design_file_name: '',
  design_preview_url: '',
});

const PRODUCTION_DAYS_STANDARD = 7;
const PRODUCTION_DAYS_PRINTING = 14;

export function QuoterForm() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [boxes, setBoxes] = useState<BoxItemData[]>([createNewBox()]);
  const [collapsedBoxes, setCollapsedBoxes] = useState<Set<string>>(new Set());
  const [selectedBoxIndex, setSelectedBoxIndex] = useState(0);
  const [clientData, setClientData] = useState<ClientFormData>(initialClientData);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddress, setShowAddress] = useState(false);
  const [cities, setCities] = useState<BuenosAiresCity[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [priceRevealed, setPriceRevealed] = useState(false);
  const [revealingPrice, setRevealingPrice] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(null);
  const quoteStartedTracked = useRef(false);
  const quoterViewedTracked = useRef(false);

  // Trackear cuando el usuario ve el cotizador (scroll hasta #cotizador)
  useEffect(() => {
    if (quoterViewedTracked.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !quoterViewedTracked.current) {
            trackEvent('quoter_viewed');
            quoterViewedTracked.current = true;
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 }
    );

    const quoterSection = document.getElementById('cotizador');
    if (quoterSection) {
      observer.observe(quoterSection);
    }

    return () => observer.disconnect();
  }, []);

  // Trackear cuando el usuario empieza a llenar el formulario (quote_started)
  useEffect(() => {
    if (quoteStartedTracked.current) return;
    
    const hasValidBox = boxes.some(box => 
      box.length_mm >= 200 && 
      box.width_mm >= 200 && 
      box.height_mm >= 100 && 
      box.quantity > 0
    );

    if (hasValidBox && !quoteStartedTracked.current) {
      trackEvent('quote_started', { 
        boxCount: boxes.length
      });
      quoteStartedTracked.current = true;
    }
  }, [boxes]);

  // Cargar ciudades cuando la provincia es Buenos Aires o CABA
  useEffect(() => {
    const fetchCities = async () => {
      if (clientData.province !== 'Buenos Aires' && clientData.province !== 'CABA') {
        setCities([]);
        return;
      }
      setLoadingCities(true);
      try {
        const response = await fetch('/api/public/cities');
        if (response.ok) {
          const data = await response.json();
          setCities(data.cities || []);
        }
      } catch (err) {
        console.error('Error loading cities:', err);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, [clientData.province]);

  // Filtrar ciudades según búsqueda
  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return cities.slice(0, 20);
    const search = citySearch.toLowerCase();
    return cities
      .filter(c => c.name.toLowerCase().includes(search) || c.partido?.toLowerCase().includes(search))
      .slice(0, 20);
  }, [cities, citySearch]);

  // Verificar si aplica envío gratis
  const isFreeShipping = useMemo(() => {
    if (clientData.province !== 'Buenos Aires' && clientData.province !== 'CABA') return false;
    if (clientData.distance_km === null) return false;
    return clientData.distance_km <= FREE_SHIPPING_MAX_KM;
  }, [clientData.province, clientData.distance_km]);

  // Cálculos para cada caja
  const boxCalculations = useMemo(() => {
    return boxes.map(box => calculateBoxItem(box));
  }, [boxes]);

  // Totales combinados
  const totals = useMemo(() => {
    let totalSqm = 0;
    let totalSubtotal = 0;
    let hasPrinting = false;
    let allMeetMinimum = true;

    boxCalculations.forEach((calc, index) => {
      if (calc) {
        totalSqm += calc.totalSqm;
        totalSubtotal += calc.subtotal;
        if (boxes[index].has_printing) hasPrinting = true;
        if (!calc.meetsMinimum) allMeetMinimum = false;
      } else {
        allMeetMinimum = false;
      }
    });

    const estimatedDays = hasPrinting ? PRODUCTION_DAYS_PRINTING : PRODUCTION_DAYS_STANDARD;

    return {
      totalSqm,
      totalSubtotal,
      hasPrinting,
      estimatedDays,
      allMeetMinimum,
      boxCount: boxes.length,
    };
  }, [boxCalculations, boxes]);

  // Validación del paso 1 - todas las cajas deben cumplir el mínimo
  const isStep1Valid = useMemo(() => {
    return totals.allMeetMinimum && boxes.length > 0;
  }, [totals.allMeetMinimum, boxes.length]);

  // Validación del paso 2 - datos requeridos para ver cotización
  const isStep2DataComplete = useMemo(() => {
    const { requester_name, requester_email, requester_phone } = clientData;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return (
      requester_name.trim().length >= 3 &&
      emailRegex.test(requester_email) &&
      requester_phone.replace(/\D/g, '').length >= 8
    );
  }, [clientData]);

  // El paso 2 es válido para enviar cuando se reveló el precio
  const isStep2Valid = priceRevealed;

  // Handlers para cajas
  const handleAddBox = () => {
    const newBox = createNewBox();
    setBoxes(prev => [...prev, newBox]);
    // Colapsar las otras cajas y expandir la nueva
    setCollapsedBoxes(prev => {
      const newSet = new Set(prev);
      boxes.forEach(box => newSet.add(box.id));
      return newSet;
    });
    setSelectedBoxIndex(boxes.length);
    
    // Trackear evento
    trackEvent('box_added', { 
      totalBoxes: boxes.length + 1,
      totalSqm: totals.totalSqm 
    });
  };

  const handleUpdateBox = (id: string, field: keyof BoxItemData, value: BoxItemData[keyof BoxItemData]) => {
    setBoxes(prev => prev.map(box =>
      box.id === id ? { ...box, [field]: value } : box
    ));
  };

  const handleDeleteBox = (id: string) => {
    if (boxes.length <= 1) return;
    const index = boxes.findIndex(b => b.id === id);
    setBoxes(prev => prev.filter(box => box.id !== id));
    setCollapsedBoxes(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    // Ajustar índice seleccionado
    if (selectedBoxIndex >= index && selectedBoxIndex > 0) {
      setSelectedBoxIndex(prev => prev - 1);
    }
  };

  const handleToggleCollapse = (id: string) => {
    setCollapsedBoxes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
        // Actualizar índice seleccionado al expandir
        const index = boxes.findIndex(b => b.id === id);
        if (index >= 0) setSelectedBoxIndex(index);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const updateClientField = <K extends keyof ClientFormData>(field: K, value: ClientFormData[K]) => {
    setClientData(prev => ({ ...prev, [field]: value }));
  };

  // Revelar precio y registrar lead
  const handleRevealPrice = async () => {
    if (!isStep2DataComplete || !totals.allMeetMinimum) return;

    setRevealingPrice(true);
    setError(null);

    try {
      const payload = {
        client_type: clientData.client_type,
        requester_name: clientData.requester_name,
        requester_company: clientData.client_type === 'empresa' ? clientData.requester_company : undefined,
        requester_email: clientData.requester_email,
        requester_phone: clientData.requester_phone,
        requester_cuit: clientData.requester_cuit || undefined,
        requester_tax_condition: clientData.client_type === 'empresa' ? clientData.requester_tax_condition : 'consumidor_final',
        address: clientData.address || undefined,
        city: clientData.city || undefined,
        province: clientData.province,
        postal_code: clientData.postal_code || undefined,
        distance_km: clientData.distance_km,
        message: clientData.message || undefined,
        boxes: boxes.map(box => ({
          length_mm: box.length_mm,
          width_mm: box.width_mm,
          height_mm: box.height_mm,
          quantity: box.quantity,
          has_printing: box.has_printing,
          printing_colors: box.has_printing ? box.printing_colors : 0,
          design_file_url: box.design_file_url || undefined,
          design_file_name: box.design_file_name || undefined,
          design_preview_url: box.design_preview_url || undefined,
        })),
      };

      const response = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al procesar la solicitud');
      }

      const result = await response.json();
      setLeadId(result.id);
      setPriceRevealed(true);
      
      // Trackear evento
      trackEvent('price_revealed', {
        leadId: result.id,
        boxCount: boxes.length,
        totalSqm: totals.totalSqm,
        totalAmount: totals.totalSubtotal,
        hasPrinting: totals.hasPrinting,
        clientType: clientData.client_type
      });

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la solicitud');
    } finally {
      setRevealingPrice(false);
    }
  };

  const handleSubmit = async () => {
    if (!isStep2Valid || !totals.allMeetMinimum) return;

    setSubmitting(true);
    setError(null);

    try {
      // Enviar cotización con múltiples cajas
      const payload = {
        requester_name: clientData.client_type === 'empresa' ? clientData.requester_name : clientData.requester_name,
        requester_company: clientData.client_type === 'empresa' ? clientData.requester_company : undefined,
        requester_email: clientData.requester_email,
        requester_phone: clientData.requester_phone,
        requester_cuit: clientData.requester_cuit || undefined,
        requester_tax_condition: clientData.client_type === 'empresa' ? clientData.requester_tax_condition : 'consumidor_final',
        address: clientData.address || undefined,
        city: clientData.city || undefined,
        province: clientData.province,
        postal_code: clientData.postal_code || undefined,
        distance_km: clientData.distance_km,
        is_free_shipping: isFreeShipping,
        message: clientData.message || undefined,
        // Primera caja (compatibilidad con API actual)
        length_mm: boxes[0].length_mm,
        width_mm: boxes[0].width_mm,
        height_mm: boxes[0].height_mm,
        quantity: boxes[0].quantity,
        has_printing: boxes[0].has_printing,
        printing_colors: boxes[0].has_printing ? boxes[0].printing_colors : 0,
        design_file_url: boxes[0].design_file_url || undefined,
        design_file_name: boxes[0].design_file_name || undefined,
        design_preview_url: boxes[0].design_preview_url || undefined,
        // Cajas adicionales
        additional_boxes: boxes.length > 1 ? boxes.slice(1).map(box => ({
          length_mm: box.length_mm,
          width_mm: box.width_mm,
          height_mm: box.height_mm,
          quantity: box.quantity,
          has_printing: box.has_printing,
          printing_colors: box.has_printing ? box.printing_colors : 0,
          design_file_url: box.design_file_url || undefined,
          design_file_name: box.design_file_name || undefined,
          design_preview_url: box.design_preview_url || undefined,
        })) : undefined,
      };

      const response = await fetch('/api/public/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al enviar la cotización');
      }

      const quote = await response.json();

      // Trackear evento de conversión completa
      trackEvent('quote_submitted', {
        quoteId: quote.id,
        leadId: leadId,
        boxCount: boxes.length,
        totalSqm: totals.totalSqm,
        totalAmount: totals.totalSubtotal,
        hasPrinting: totals.hasPrinting,
        clientType: clientData.client_type,
        province: clientData.province,
        distanceKm: clientData.distance_km
      });

      router.push(`/cotizacion/${quote.id}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al enviar la cotización');
    } finally {
      setSubmitting(false);
    }
  };

  // Caja seleccionada para mostrar en 3D
  const selectedBox = boxes[selectedBoxIndex] || boxes[0];

  return (
    <div className="space-y-6">
      {/* Progress - centrado arriba del grid */}
      <div id="quoter-progress" className="flex items-center justify-center gap-3 max-w-xs mx-auto">
        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
          step >= 1 ? 'bg-[#002E55] text-white' : 'bg-gray-200 text-gray-500'
        }`}>
          1
        </div>
        <div className={`w-24 h-1 rounded ${step >= 2 ? 'bg-[#002E55]' : 'bg-gray-200'}`} />
        <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
          step >= 2 ? 'bg-[#002E55] text-white' : 'bg-gray-200 text-gray-500'
        }`}>
          2
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:items-start">
        {/* Columna izquierda: Formulario */}
        <div className="space-y-6">
          {/* Paso 1: Datos de las cajas */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Lista de cajas */}
            {boxes.map((box, index) => (
              <BoxItemForm
                key={box.id}
                box={box}
                index={index}
                canDelete={boxes.length > 1}
                isCollapsed={collapsedBoxes.has(box.id)}
                onUpdate={handleUpdateBox}
                onDelete={handleDeleteBox}
                onToggleCollapse={handleToggleCollapse}
                calculations={boxCalculations[index]}
              />
            ))}

            {/* Botón agregar otra caja */}
            <button
              type="button"
              onClick={handleAddBox}
              className="w-full py-3 border-2 border-dashed border-gray-300 hover:border-[#002E55] text-gray-500 hover:text-[#002E55] rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Agregar otra medida de caja
            </button>

            {/* Resumen de totales - sin precio */}
            {boxes.length > 1 && (
              <div className="bg-[#002E55] text-white rounded-xl p-4">
                <h4 className="font-medium mb-2">Resumen del pedido</h4>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Medidas diferentes:</span>
                    <span>{boxes.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">m² totales:</span>
                    <span>{totals.totalSqm.toLocaleString('es-AR', { minimumFractionDigits: 2 })} m²</span>
                  </div>
                </div>
              </div>
            )}

            {/* Botón continuar */}
            <button
              type="button"
              onClick={() => {
                setStep(2);
                // Trackear evento
                trackEvent('quote_step_2', {
                  boxCount: boxes.length,
                  totalSqm: totals.totalSqm,
                  hasPrinting: totals.hasPrinting
                });
                // Scroll al indicador de progreso en mobile
                setTimeout(() => {
                  document.getElementById('quoter-progress')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              disabled={!isStep1Valid}
              className="w-full px-4 py-3 bg-[#002E55] hover:bg-[#001a33] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              {!isStep1Valid ? (
                'Completá todas las cajas con el mínimo requerido'
              ) : (
                <>
                  Continuar
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* Paso 2: Datos del cliente */}
        {step === 2 && (
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Tus datos</h3>

            {/* Tipo de cliente */}
            <div className="mb-4">
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="client_type"
                    value="empresa"
                    checked={clientData.client_type === 'empresa'}
                    onChange={() => updateClientField('client_type', 'empresa')}
                    className="w-4 h-4 text-[#002E55] focus:ring-[#4F6D87]"
                  />
                  <span className="text-sm">Empresa</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="client_type"
                    value="particular"
                    checked={clientData.client_type === 'particular'}
                    onChange={() => updateClientField('client_type', 'particular')}
                    className="w-4 h-4 text-[#002E55] focus:ring-[#4F6D87]"
                  />
                  <span className="text-sm">Particular</span>
                </label>
              </div>
            </div>

            {/* Campos según tipo */}
            {clientData.client_type === 'empresa' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Razón Social *
                  </label>
                  <input
                    type="text"
                    value={clientData.requester_name}
                    onChange={(e) => updateClientField('requester_name', e.target.value)}
                    placeholder="Ej: ACME S.A."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre de Fantasía
                  </label>
                  <input
                    type="text"
                    value={clientData.requester_company}
                    onChange={(e) => updateClientField('requester_company', e.target.value)}
                    placeholder="Ej: Acme"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CUIT
                    </label>
                    <input
                      type="text"
                      value={clientData.requester_cuit}
                      onChange={(e) => updateClientField('requester_cuit', e.target.value)}
                      placeholder="XX-XXXXXXXX-X"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Condición IVA
                    </label>
                    <select
                      value={clientData.requester_tax_condition}
                      onChange={(e) => updateClientField('requester_tax_condition', e.target.value as TaxCondition)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                    >
                      <option value="responsable_inscripto">Responsable Inscripto</option>
                      <option value="monotributista">Monotributista</option>
                      <option value="exento">Exento</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    value={clientData.requester_name}
                    onChange={(e) => updateClientField('requester_name', e.target.value)}
                    placeholder="Tu nombre"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    DNI (opcional)
                  </label>
                  <input
                    type="text"
                    value={clientData.requester_cuit}
                    onChange={(e) => updateClientField('requester_cuit', e.target.value)}
                    placeholder="12345678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
                <p className="text-sm text-gray-500">Condición IVA: Consumidor Final</p>
              </div>
            )}

            {/* Datos de contacto */}
            <div className="mt-6 pt-6 border-t border-gray-100 space-y-4">
              <h4 className="font-medium text-gray-900">Datos de contacto</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={clientData.requester_email}
                    onChange={(e) => updateClientField('requester_email', e.target.value)}
                    placeholder="tu@email.com"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono/WhatsApp *
                  </label>
                  <input
                    type="tel"
                    value={clientData.requester_phone}
                    onChange={(e) => updateClientField('requester_phone', e.target.value)}
                    placeholder="11 1234-5678"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            {/* Dirección (colapsable) */}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowAddress(!showAddress)}
                className="text-sm text-[#002E55] hover:text-[#001a33]"
              >
                {showAddress ? '- Ocultar dirección' : '+ Agregar dirección de entrega (ver si aplica envío gratis)'}
              </button>

              {showAddress && (
                <div className="mt-4 space-y-4 pl-4 border-l-2 border-gray-200">
                  {/* Provincia */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Provincia
                    </label>
                    <select
                      value={clientData.province}
                      onChange={(e) => {
                        updateClientField('province', e.target.value);
                        updateClientField('city', '');
                        updateClientField('city_id', null);
                        updateClientField('distance_km', null);
                        setCitySearch('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                    >
                      {ARGENTINE_PROVINCES.map(prov => (
                        <option key={prov} value={prov}>{prov}</option>
                      ))}
                    </select>
                    {clientData.province !== 'Buenos Aires' && clientData.province !== 'CABA' && (
                      <p className="text-xs text-[#002E55] mt-1">
                        El envío gratis solo aplica en Buenos Aires y CABA (hasta {FREE_SHIPPING_MAX_KM} km)
                      </p>
                    )}
                  </div>

                  {/* Ciudad - Con autocomplete para Buenos Aires */}
                  <div className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ciudad / Localidad
                    </label>
                    {(clientData.province === 'Buenos Aires' || clientData.province === 'CABA') ? (
                      <>
                        <input
                          type="text"
                          value={citySearch || clientData.city}
                          onChange={(e) => {
                            setCitySearch(e.target.value);
                            setShowCityDropdown(true);
                            if (!e.target.value) {
                              updateClientField('city', '');
                              updateClientField('city_id', null);
                              updateClientField('distance_km', null);
                            }
                          }}
                          onFocus={() => setShowCityDropdown(true)}
                          placeholder={loadingCities ? 'Cargando ciudades...' : 'Buscar ciudad...'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                        />
                        {showCityDropdown && filteredCities.length > 0 && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                            {filteredCities.map((city) => (
                              <button
                                key={city.id}
                                type="button"
                                onClick={() => {
                                  updateClientField('city', city.name);
                                  updateClientField('city_id', city.id);
                                  updateClientField('distance_km', city.distance_km);
                                  if (city.postal_codes && city.postal_codes.length > 0) {
                                    updateClientField('postal_code', city.postal_codes[0]);
                                  }
                                  setCitySearch('');
                                  setShowCityDropdown(false);
                                }}
                                className="w-full px-3 py-2 text-left hover:bg-blue-50 flex justify-between items-center border-b border-gray-100 last:border-b-0"
                              >
                                <span>
                                  <span className="font-medium">{city.name}</span>
                                  {city.partido && <span className="text-gray-500 text-sm ml-1">({city.partido})</span>}
                                </span>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  city.is_free_shipping
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {city.distance_km} km
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                        {clientData.city && clientData.distance_km !== null && (
                          <div className={`mt-2 p-2 rounded-lg text-sm ${
                            isFreeShipping
                              ? 'bg-green-50 text-green-700 border border-green-200'
                              : 'bg-blue-50 text-[#001a33] border border-blue-200'
                          }`}>
                            {isFreeShipping ? (
                              <span>✓ Envío gratis disponible ({clientData.distance_km} km desde Quilmes)</span>
                            ) : (
                              <span>Envío con cargo adicional ({clientData.distance_km} km desde Quilmes)</span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <input
                        type="text"
                        value={clientData.city}
                        onChange={(e) => updateClientField('city', e.target.value)}
                        placeholder="Ingrese la ciudad"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                      />
                    )}
                  </div>

                  {/* Dirección y CP */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dirección
                    </label>
                    <input
                      type="text"
                      value={clientData.address}
                      onChange={(e) => updateClientField('address', e.target.value)}
                      placeholder="Calle y número"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Código Postal
                    </label>
                    <input
                      type="text"
                      value={clientData.postal_code}
                      onChange={(e) => updateClientField('postal_code', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Mensaje */}
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mensaje (opcional)
              </label>
              <textarea
                value={clientData.message}
                onChange={(e) => updateClientField('message', e.target.value)}
                placeholder="¿Algún detalle adicional?"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#4F6D87] focus:border-transparent resize-none"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Botones */}
            <div className="flex flex-col gap-3 mt-6">
              {/* Botón Ver Cotización - solo si no se reveló el precio */}
              {!priceRevealed && (
                <button
                  type="button"
                  onClick={handleRevealPrice}
                  disabled={!isStep2DataComplete || revealingPrice}
                  className="w-full px-4 py-3 bg-[#002E55] hover:bg-[#001a33] disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {revealingPrice ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Eye className="w-4 h-4" />
                      Ver cotización
                    </>
                  )}
                </button>
              )}

              {/* Texto de términos (solo visible antes de revelar) */}
              {!priceRevealed && (
                <p className="text-xs text-gray-500 text-center">
                  Al hacer click aceptás recibir la cotización y ser contactado por Quilmes Corrugados
                </p>
              )}

              {/* Mensaje después de revelar precio */}
              {priceRevealed && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700 text-center">
                    ¡Cotización lista! <span className="hidden lg:inline">Revisá el precio a la derecha.</span><span className="lg:hidden">Deslizá hacia abajo para ver el precio.</span>
                  </p>
                </div>
              )}

              {/* Botón Volver */}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                Volver
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: Vista 3D y resumen */}
      <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        {/* Selector de caja para vista 3D */}
        {boxes.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {boxes.map((box, index) => (
              <button
                key={box.id}
                onClick={() => setSelectedBoxIndex(index)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  selectedBoxIndex === index
                    ? 'bg-[#002E55] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Caja {index + 1}
              </button>
            ))}
          </div>
        )}

        {/* Vista 3D */}
        <BoxPreview3D
          length={selectedBox.length_mm}
          width={selectedBox.width_mm}
          height={selectedBox.height_mm}
          autoRotate={true}
          designUrl={selectedBox.design_preview_url || undefined}
        />

        {/* Resumen de precio - solo muestra precios cuando se reveló */}
        <PriceSummary
          boxes={boxes}
          boxCalculations={boxCalculations}
          estimatedDays={totals.estimatedDays}
          isFreeShipping={clientData.distance_km !== null ? isFreeShipping : undefined}
          distanceKm={clientData.distance_km}
          showPrice={priceRevealed}
          onRequestContact={priceRevealed ? handleSubmit : undefined}
          submitting={submitting}
        />
      </div>
      </div>
    </div>
  );
}
