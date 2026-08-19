'use client';

import { useState, useRef, useEffect } from 'react';
import type { BoxQuoteLine, ClientType, OrderFormData } from '@/lib/retail/types';
import { formatPrecio } from '@/lib/retail/pricing';

interface OrderFormProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onSubmit: (data: OrderFormData) => Promise<void>;
  onBack: () => void;
  savedData?: OrderFormData | null;
}

/**
 * Detecta si la persona esta pidiendo impresion en el campo de mensaje libre.
 *
 * POR QUE EXISTE
 *
 * Entro un pedido real —el 266— de 100 cajas de 200x200x200 con este mensaje:
 * "tmb me gustaria imprimirle el logo". El pedido se tomo sin decir nada. Con
 * las reglas vigentes ese pedido NO se puede imprimir por dos motivos a la vez:
 * son 34 m² y la impresion arranca en 1.000, y ademas 200x200x200 es una medida
 * de catalogo, que no lleva arte.
 *
 * O sea que el cliente iba a recibir cien cajas lisas habiendo pedido su logo,
 * y se iba a enterar al abrir la caja. Eso no se arregla con una nota interna:
 * el que tiene que enterarse a tiempo es el.
 */
const PALABRAS_IMPRESION = [
  'imprim', 'impres', 'logo', 'serigraf', 'estampa', 'marca', 'diseño', 'diseno', 'arte',
];

function pideImpresion(mensaje: string): boolean {
  const t = mensaje.toLowerCase();
  return PALABRAS_IMPRESION.some((p) => t.includes(p));
}

/**
 * Que le impide imprimir a ESTE pedido, si algo. Null si puede.
 * Los umbrales van en duro porque este componente corre en el navegador y no
 * puede leer pricing_config; se revisan junto con la escalera.
 */
function motivoSinImpresion(boxes: BoxQuoteLine[]): string | null {
  const totalM2 = boxes.reduce((s, b) => s + b.totalM2, 0);
  const hayDeCatalogo = boxes.some((b) => !!b.standardBoxId);

  if (hayDeCatalogo && totalM2 < 1000) {
    return (
      'Este pedido no puede llevar impresión por dos motivos: la impresión se hace ' +
      'desde 1.000 m² de cartón y acá son ' + totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 }) +
      ' m², y además las medidas estándar de catálogo se producen sin arte. Para imprimir hay ' +
      'que fabricar una medida propia y llegar a ese volumen. Podés mandarnos igual la consulta ' +
      'y lo vemos: te cotizamos la opción con impresión aparte.'
    );
  }
  if (hayDeCatalogo) {
    return (
      'Las medidas estándar de catálogo se producen sin arte, así que este pedido no puede ' +
      'llevar impresión. Para imprimir hay que fabricar una medida propia. Contanos y te ' +
      'cotizamos esa opción.'
    );
  }
  if (totalM2 < 1000) {
    return (
      'La impresión se hace desde 1.000 m² de cartón y este pedido son ' +
      totalM2.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' m². Podés mandarnos ' +
      'la consulta igual y te cotizamos qué cantidad haría falta.'
    );
  }
  return null;
}

const TAX_OPTIONS = [
  { value: 'responsable_inscripto', label: 'Responsable Inscripto' },
  { value: 'monotributista', label: 'Monotributista' },
  { value: 'exento', label: 'Exento' },
] as const;

const initialForm: OrderFormData = {
  clientType: 'particular',
  razonSocial: '',
  nombreFantasia: '',
  cuit: '',
  condicionIva: 'responsable_inscripto',
  nombreCompleto: '',
  dni: '',
  email: '',
  telefono: '',
  direccion: '',
  ciudad: '',
  provincia: 'Buenos Aires',
  codigoPostal: '',
  mensaje: '',
};

export default function OrderForm({ boxes, visible, onSubmit, onBack, savedData }: OrderFormProps) {
  const [form, setForm] = useState<OrderFormData>(savedData || initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible && scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [visible]);

  // Se calcula al vuelo mientras escribe: si menciona impresion y este pedido
  // no califica, el aviso aparece antes de que confirme, no despues.
  const avisoImpresion =
    form.mensaje && pideImpresion(form.mensaje) ? motivoSinImpresion(boxes) : null;

  const update = (field: keyof OrderFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (form.clientType === 'empresa') {
      if (!form.razonSocial.trim()) errs.razonSocial = 'Requerido';
      if (!form.cuit.trim()) errs.cuit = 'Requerido';
    } else {
      if (!form.nombreCompleto.trim()) errs.nombreCompleto = 'Requerido';
    }

    if (!form.email.trim()) {
      errs.email = 'Requerido';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errs.email = 'Email no valido';
    }

    if (!form.telefono.trim()) {
      errs.telefono = 'Requerido';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(form);
    } catch {
      setErrors({ _general: 'Error al enviar. Intenta de nuevo.' });
    } finally {
      setSubmitting(false);
    }
  };

  const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);

  const inputStyle = (hasError?: boolean) => ({
    fontFamily: 'var(--font-retail-sans), sans-serif',
    color: 'var(--retail-text)',
    background: 'var(--retail-surface)',
    borderColor: hasError ? '#ef4444' : 'var(--retail-border, #e0e0e0)',
    fontSize: '16px',
  });

  const labelStyle = {
    fontFamily: 'var(--font-retail-sans), sans-serif',
    color: 'var(--retail-text-muted)',
    fontSize: '12px',
  };

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col overflow-hidden"
      style={{
        background: 'var(--retail-bg)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      {/* Header */}
      <div className="pt-safe-top px-6 pt-6 pb-3 text-center">
        <div
          className="text-xs tracking-[0.3em] uppercase mb-2"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          Quilmes Corrugados
        </div>
        <h2
          className="text-xl font-bold"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text)',
          }}
        >
          Datos de contacto
        </h2>
        <p
          className="text-sm mt-1"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text-muted)',
          }}
        >
          Completa tus datos para ver la cotizacion
        </p>
      </div>

      {/* Form */}
      <div ref={scrollRef} className="flex-1 px-6 py-4 overflow-y-auto">
        <div className="max-w-sm mx-auto space-y-5">

          {/* Client type toggle */}
          <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid var(--retail-primary)' }}>
            {(['empresa', 'particular'] as ClientType[]).map(type => (
              <button
                key={type}
                onClick={() => update('clientType', type)}
                className="flex-1 py-3 text-sm font-semibold tracking-wide"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  background: form.clientType === type ? 'var(--retail-primary)' : 'transparent',
                  color: form.clientType === type ? '#fff' : 'var(--retail-primary)',
                  border: 'none',
                  transition: 'all 200ms',
                }}
              >
                {type === 'empresa' ? 'EMPRESA' : 'PARTICULAR'}
              </button>
            ))}
          </div>

          {/* Empresa fields */}
          {form.clientType === 'empresa' && (
            <div
              className="space-y-3"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                transition: 'all 300ms ease',
              }}
            >
              <div>
                <label style={labelStyle}>Razon Social *</label>
                <input
                  type="text"
                  value={form.razonSocial}
                  onChange={e => update('razonSocial', e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={inputStyle(!!errors.razonSocial)}
                  placeholder="Ej: Mi Empresa S.A."
                />
                {errors.razonSocial && <span className="text-xs text-red-500 mt-1">{errors.razonSocial}</span>}
              </div>

              <div>
                <label style={labelStyle}>Nombre Fantasia</label>
                <input
                  type="text"
                  value={form.nombreFantasia}
                  onChange={e => update('nombreFantasia', e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={inputStyle()}
                  placeholder="Opcional"
                />
              </div>

              <div>
                <label style={labelStyle}>CUIT *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.cuit}
                  onChange={e => update('cuit', e.target.value.replace(/[^\d-]/g, ''))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={inputStyle(!!errors.cuit)}
                  placeholder="XX-XXXXXXXX-X"
                />
                {errors.cuit && <span className="text-xs text-red-500 mt-1">{errors.cuit}</span>}
              </div>

              <div>
                <label style={labelStyle}>Condicion ante el IVA</label>
                <select
                  value={form.condicionIva}
                  onChange={e => update('condicionIva', e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none appearance-none"
                  style={inputStyle()}
                >
                  {TAX_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Particular fields */}
          {form.clientType === 'particular' && (
            <div
              className="space-y-3"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(10px)',
                transition: 'all 300ms ease',
              }}
            >
              <div>
                <label style={labelStyle}>Nombre completo *</label>
                <input
                  type="text"
                  value={form.nombreCompleto}
                  onChange={e => update('nombreCompleto', e.target.value)}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={inputStyle(!!errors.nombreCompleto)}
                  placeholder="Tu nombre y apellido"
                />
                {errors.nombreCompleto && <span className="text-xs text-red-500 mt-1">{errors.nombreCompleto}</span>}
              </div>

              <div>
                <label style={labelStyle}>DNI</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.dni}
                  onChange={e => update('dni', e.target.value.replace(/\D/g, ''))}
                  className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                  style={inputStyle()}
                  placeholder="Opcional"
                />
              </div>

              <div
                className="text-xs px-3 py-2 rounded-lg"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  background: 'var(--retail-surface)',
                  color: 'var(--retail-text-muted)',
                }}
              >
                Consumidor Final
              </div>
            </div>
          )}

          {/* Common contact fields */}
          <div className="space-y-3">
            <div
              className="text-xs font-semibold uppercase tracking-wider mt-2"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text-muted)',
              }}
            >
              Contacto
            </div>

            <div>
              <label style={labelStyle}>Email *</label>
              <input
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                style={inputStyle(!!errors.email)}
                placeholder="tu@email.com"
              />
              {errors.email && <span className="text-xs text-red-500 mt-1">{errors.email}</span>}
            </div>

            <div>
              <label style={labelStyle}>Telefono / WhatsApp *</label>
              <input
                type="tel"
                value={form.telefono}
                onChange={e => update('telefono', e.target.value)}
                className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none"
                style={inputStyle(!!errors.telefono)}
                placeholder="11 XXXX-XXXX"
              />
              {errors.telefono && <span className="text-xs text-red-500 mt-1">{errors.telefono}</span>}
            </div>
          </div>

          {/* Message */}
          <div>
            <label style={labelStyle}>Mensaje (opcional)</label>
            <textarea
              value={form.mensaje}
              onChange={e => update('mensaje', e.target.value)}
              className="w-full mt-1 px-4 py-3 rounded-xl border-2 outline-none resize-none"
              style={{ ...inputStyle(), minHeight: '80px' }}
              placeholder="Algo que quieras contarnos sobre tu pedido..."
              rows={3}
            />
            {avisoImpresion && (
              <div
                className="mt-2 rounded-xl px-4 py-3 text-sm leading-snug"
                style={{ background: '#FFF8E6', border: '1px solid #E8D9A8', color: '#6B5620' }}
              >
                {avisoImpresion}
              </div>
            )}
          </div>

          {/* Legal text */}
          <p
            className="text-[10px] text-center leading-tight"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              color: 'var(--retail-text-muted)',
            }}
          >
            Al continuar aceptas recibir la cotizacion y ser contactado por Quilmes Corrugados.
          </p>

          {/* Error general */}
          {errors._general && (
            <p className="text-xs text-red-500 text-center">{errors._general}</p>
          )}
        </div>
      </div>

      {/* Buttons */}
      <div
        className="px-6 pb-safe-bottom pb-6 space-y-3 max-w-sm mx-auto w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'all 400ms cubic-bezier(0.4, 0, 0.2, 1) 200ms',
        }}
      >
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95 disabled:opacity-50"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'var(--retail-primary)',
            color: '#fff',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          {submitting ? 'CARGANDO...' : 'VER COTIZACION'}
        </button>
        <button
          onClick={onBack}
          disabled={submitting}
          className="w-full rounded-2xl py-3 text-sm font-medium tracking-wide active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: 'transparent',
            color: 'var(--retail-text-muted)',
            border: 'none',
            transition: 'transform 150ms',
          }}
        >
          Empezar de nuevo
        </button>
      </div>
    </div>
  );
}
