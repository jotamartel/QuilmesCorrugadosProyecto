'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import type { BoxQuoteLine } from '@/lib/retail/types';
import type { RetailConfig } from '@/lib/retail/config';
import { formatPrecio, calcularPrecioMinorista } from '@/lib/retail/pricing';
import { RETAIL_CONFIG } from '@/lib/retail/config';

export interface StandardSuggestion {
  id: string;
  name: string;
  length_mm: number;
  width_mm: number;
  height_mm: number;
  m2_per_box: number;
  stock: number;
  /**
   * Si lo que iba a entrar en la medida que tipeo entra en esta. Lo calcula el
   * endpoint: el alto contra el alto —la apertura va arriba, rotarla la deja
   * abierta de costado— y el largo con el ancho intercambiables entre si.
   *
   * No filtra: se ofrecen las mas parecidas y el cliente elige. Pero si es mas
   * chica hay que decirlo, porque el que compra sabe que va adentro y nosotros
   * no.
   */
  entra?: boolean;
}

interface QuoteResultProps {
  boxes: BoxQuoteLine[];
  visible: boolean;
  onReset: () => void;
  onOrder: () => void;
  onSelectStandard?: (box: StandardSuggestion, boxIndex: number) => void;
  retailConfig?: RetailConfig;
}

export default function QuoteResult({ boxes, visible, onReset, onOrder, onSelectStandard, retailConfig }: QuoteResultProps) {

  const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
  const totalM2 = boxes.reduce((sum, b) => sum + b.totalM2, 0);
  // Supera el tope del canal de stock: a este volumen ya se produce a medida
  // y lo cotiza el mayorista, con su propia escalera de precios.
  const superaTope = boxes.some(b => b.isMayorista);
  const topeM2 = (retailConfig ?? RETAIL_CONFIG).WHOLESALE_THRESHOLD_M2;
  // El piso de venta se mide en carton, no en plata: un minimo en pesos deja
  // pasar 4 m² y ese pedido no se puede producir. Sale de la config para que
  // moverlo no requiera deploy.
  const minM2Pedido = (retailConfig ?? RETAIL_CONFIG).MIN_M2_PEDIDO;
  const belowMinimum = totalM2 > 0 && totalM2 < minM2Pedido;
  const m2Faltantes = Math.max(0, minM2Pedido - totalM2);
  // Cuantas cajas mas de la ultima medida cargada cubren lo que falta: decir
  // solo "te faltan 380 m²" no le sirve a nadie que piensa en cajas.
  const m2UltimaCaja = boxes.length > 0 ? boxes[boxes.length - 1].m2PerBox : 0;
  const cajasFaltantes = m2UltimaCaja > 0 ? Math.ceil(m2Faltantes / m2UltimaCaja) : 0;

  // Standard box suggestions per box index (only for < 1000 m²)
  const [suggestionsMap, setSuggestionsMap] = useState<Record<number, StandardSuggestion[]>>({});
  const [allBoxes, setAllBoxes] = useState<StandardSuggestion[]>([]);
  const [showAllForIndex, setShowAllForIndex] = useState<number | null>(null);
  const [loadingAll, setLoadingAll] = useState(false);
  // Debajo del tope no se fabrica una medida propia: solo se venden medidas
  // estandar de catalogo. El 1.000 estaba escrito a mano aca.
  const showSuggestions = totalM2 < topeM2 && onSelectStandard;

  // Cajas que todavia son una medida propia y por lo tanto no se pueden producir
  // a este volumen. Esto BLOQUEA el pedido, exista o no una sugerencia cargada:
  // antes se derivaba de la lista de sugerencias, asi que si la lista volvia
  // vacia el boton de continuar aparecia y se podia pedir una medida que la
  // fabrica no puede hacer.
  const cajasQueNecesitanEstandar = useMemo(() => {
    if (!showSuggestions) return [];
    return boxes
      .map((box, index) => ({ box, index }))
      .filter(({ box }) => box.standardBoxId == null);
  }, [showSuggestions, boxes]);

  const mustSelectStandard = cajasQueNecesitanEstandar.length > 0;

  // Las que ademas ya tienen sugerencias para mostrar.
  const boxesNeedingStandard = useMemo(
    () => cajasQueNecesitanEstandar.filter(({ index }) => (suggestionsMap[index]?.length ?? 0) > 0),
    [cajasQueNecesitanEstandar, suggestionsMap]
  );

  // Stable key for dimension dependencies — only re-fetch when non-standard box dimensions change
  const nonStandardDimsKey = useMemo(() => {
    return boxes
      .map((b, i) => b.standardBoxId == null ? `${i}:${b.largo},${b.ancho},${b.alto}` : '')
      .filter(Boolean)
      .join('|');
  }, [boxes]);

  useEffect(() => {
    if (!visible || !showSuggestions) {
      setSuggestionsMap({});
      setShowAllForIndex(null);
      return;
    }

    const nonStandardBoxes = boxes
      .map((b, i) => ({ box: b, index: i }))
      .filter(({ box }) => box.standardBoxId == null);

    if (nonStandardBoxes.length === 0) {
      setSuggestionsMap({});
      return;
    }

    let cancelled = false;

    // Clear old suggestions for boxes that no longer exist
    setSuggestionsMap(prev => {
      const next: Record<number, StandardSuggestion[]> = {};
      nonStandardBoxes.forEach(({ index }) => {
        if (prev[index]) next[index] = prev[index];
      });
      return next;
    });

    nonStandardBoxes.forEach(({ box, index }) => {
      fetch(`/api/public/standard-suggestions?l=${box.largo}&w=${box.ancho}&h=${box.alto}&qty=${box.cantidad}`)
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          // La medida tipeada ya es de catalogo: se marca sola y no se le pide
          // que elija otra. onSelectStandard mantiene la cantidad.
          if (data.exacta && onSelectStandard) {
            onSelectStandard(data.exacta, index);
            return;
          }
          if (data.suggestions) {
            setSuggestionsMap(prev => ({ ...prev, [index]: data.suggestions }));
          }
        })
        .catch((err) => {
          // Las sugerencias son opcionales, pero un fallo silencioso acá ya escondió
          // un bug entero una vez: dejar rastro.
          console.error('[retail] Error obteniendo sugerencias estandar:', err);
        });
    });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, showSuggestions, nonStandardDimsKey]);

  // Load all standard boxes when "ver todas las medidas" is clicked
  const handleShowAllBoxes = (boxIndex: number) => {
    if (allBoxes.length > 0) {
      setShowAllForIndex(boxIndex);
      return;
    }
    setLoadingAll(true);
    fetch('/api/public/standard-boxes')
      .then((res) => res.json())
      .then((data) => {
        if (data.boxes) {
          setAllBoxes(data.boxes);
          setShowAllForIndex(boxIndex);
        }
      })
      .catch(() => {
        // Silently fail
      })
      .finally(() => {
        setLoadingAll(false);
      });
  };

  // Render a suggestion card for a specific box index
  const renderBoxCard = (sug: StandardSuggestion, boxIndex: number, isDashed: boolean) => {
    const targetBox = boxes[boxIndex];
    if (!targetBox) return null;

    // La cantidad que va a quedar si elige esta medida. Tiene que coincidir con lo
    // que hace selectStandardBox en BoxGame: una medida mas chica necesita mas
    // cajas para el mismo piso de m², y eso hay que mostrarlo ANTES de elegir.
    const m2Otras = boxes.reduce((suma, b, i) => (i === boxIndex ? suma : suma + b.totalM2), 0);
    const minParaElPiso = Math.ceil(Math.max(0, minM2Pedido - m2Otras) / sug.m2_per_box);
    const cantidadFinal = Math.max(targetBox.cantidad, minParaElPiso);
    const subeLaCantidad = cantidadFinal > targetBox.cantidad;

    const price = calcularPrecioMinorista(
      sug.length_mm, sug.width_mm, sug.height_mm, cantidadFinal, retailConfig
    );
    // El stock define el plazo, no si se puede comprar: lo que hay sale en 24/48 hs
    // y el resto se fabrica. Antes esto estaba al reves y una medida con stock 0
    // decia "Entrega inmediata".
    const cubreTodo = sug.stock >= cantidadFinal;
    return (
      <div
        key={sug.id}
        className="rounded-xl p-4 flex items-center justify-between gap-3"
        style={{
          background: 'var(--retail-surface)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          border: isDashed
            ? `1px dashed ${cubreTodo ? 'var(--retail-primary)' : 'var(--retail-border, #d0d0d0)'}`
            : `1px solid var(--retail-border, #e0e0e0)`,
        }}
      >
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold tabular-nums"
            style={{
              fontFamily: 'var(--font-retail-mono), monospace',
              color: 'var(--retail-text)',
            }}
          >
            {sug.length_mm} x {sug.width_mm} x {sug.height_mm} mm
          </div>
          <div className="flex items-baseline gap-3 mt-1">
            <span
              className="text-xs tabular-nums"
              style={{
                fontFamily: 'var(--font-retail-mono), monospace',
                color: 'var(--retail-primary)',
              }}
            >
              {formatPrecio(price.precioUnitario)} x unidad
            </span>
            <span
              className="text-xs"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: cubreTodo ? '#16a34a' : 'var(--retail-text-muted)',
              }}
            >
              {cubreTodo
                ? 'Entrega inmediata'
                : sug.stock > 0
                  ? `${sug.stock.toLocaleString('es-AR')} en stock, el resto se fabrica`
                  : 'A fabricar'}
            </span>
          </div>
          {sug.entra === false && (
            <div
              className="text-xs mt-1"
              style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: '#b45309' }}
            >
              Mas chica que la que armaste
            </div>
          )}
          {subeLaCantidad && (
            <div
              className="text-xs mt-1"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text-muted)',
              }}
            >
              {cantidadFinal.toLocaleString('es-AR')} cajas, que es el minimo de{' '}
              {minM2Pedido} m² en esta medida
            </div>
          )}
        </div>
        <button
          onClick={() => onSelectStandard!(sug, boxIndex)}
          className="rounded-xl px-4 py-2 text-xs font-semibold tracking-wide whitespace-nowrap active:scale-95"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            background: cubreTodo ? 'var(--retail-primary)' : 'transparent',
            color: cubreTodo ? '#fff' : 'var(--retail-primary)',
            border: cubreTodo ? 'none' : '2px solid var(--retail-primary)',
            transition: 'transform 150ms',
          }}
        >
          ELEGIR
        </button>
      </div>
    );
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
          className="text-2xl font-bold"
          style={{
            fontFamily: 'var(--font-retail-sans), sans-serif',
            color: 'var(--retail-text)',
          }}
        >
          Tu cotizacion
        </h2>
      </div>

      {/* Box list */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <div className="max-w-sm mx-auto space-y-3">
          {boxes.map((box, i) => (
            <div
              key={i}
              className="rounded-xl p-4"
              style={{
                background: 'var(--retail-surface)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${150 + i * 100}ms`,
              }}
            >
              <div className="flex items-baseline justify-between mb-1">
                <span
                  className="text-sm font-semibold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text)',
                  }}
                >
                  {box.largo} x {box.ancho} x {box.alto} mm
                </span>
                <span
                  className="text-xs"
                  style={{
                    fontFamily: 'var(--font-retail-sans), sans-serif',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  x{box.cantidad}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span
                  className="text-xs tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-text-muted)',
                  }}
                >
                  {formatPrecio(box.precioUnitario)} x unidad
                  {box.isMayorista && (
                    <span style={{ color: '#d97706', marginLeft: '6px' }}>
                      supera stock
                    </span>
                  )}
                </span>
                <span
                  className="text-base font-bold tabular-nums"
                  style={{
                    fontFamily: 'var(--font-retail-mono), monospace',
                    color: 'var(--retail-primary)',
                  }}
                >
                  {formatPrecio(box.subtotal)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div
          className="max-w-sm mx-auto mt-4 pt-4"
          style={{
            borderTop: '2px solid var(--retail-text)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(20px)',
            transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${150 + boxes.length * 100}ms`,
          }}
        >
          <div className="flex items-baseline justify-between">
            <span
              className="text-base font-semibold"
              style={{
                fontFamily: 'var(--font-retail-sans), sans-serif',
                color: 'var(--retail-text)',
              }}
            >
              TOTAL
            </span>
            <span
              className="text-2xl font-bold tabular-nums"
              style={{
                fontFamily: 'var(--font-retail-mono), monospace',
                color: 'var(--retail-text)',
              }}
            >
              {formatPrecio(precioTotal)}
            </span>
          </div>
          <p
            className="text-xs mt-2 text-center tabular-nums"
            style={{
              fontFamily: 'var(--font-retail-mono), monospace',
              color: superaTope ? '#d97706' : 'var(--retail-text-muted)',
            }}
          >
            {totalM2.toFixed(1)} m²
          </p>

          {/* A este volumen ya no sale de stock: hay que derivar al mayorista */}
          {superaTope && (
            <div
              className="max-w-sm mx-auto mt-4 rounded-xl p-4 text-center"
              style={{ background: '#FBF2E0', border: '1px solid #E8C98A' }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: '#7A4E00' }}
              >
                Este pedido pasa los <strong>{topeM2.toLocaleString('es-AR')} m²</strong> que
                tenemos en stock. A ese volumen lo fabricamos a medida y el precio por m² baja.
              </p>
              <Link
                href="/#cotizador"
                className="inline-block mt-3 rounded-xl px-5 py-2.5 text-sm font-semibold"
                style={{
                  fontFamily: 'var(--font-retail-sans), sans-serif',
                  background: 'var(--retail-primary)',
                  color: '#fff',
                  textDecoration: 'none',
                }}
              >
                Cotizar a medida
              </Link>
            </div>
          )}

          {/* Debajo del piso no se vende. Se dice el minimo y cuanto falta,
              en cajas, que es como lo piensa quien esta comprando. */}
          {belowMinimum && (
            <div
              className="max-w-sm mx-auto mt-4 rounded-xl p-4 text-center"
              style={{ background: '#FBF2E0', border: '1px solid #E8C98A' }}
            >
              <p
                className="text-sm leading-relaxed"
                style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: '#7A4E00' }}
              >
                El minimo de compra es <strong>{minM2Pedido.toLocaleString('es-AR')} m²</strong> de
                carton y este pedido son {totalM2.toFixed(1)} m².
                {cajasFaltantes > 0 && (
                  <> Con esta medida te faltan <strong>{cajasFaltantes.toLocaleString('es-AR')}</strong> cajas.</>
                )}
              </p>
            </div>
          )}
        </div>

        {/* No hay ninguna sugerencia cargada pero igual hace falta una medida
            estandar: no dejar al comprador sin salida. */}
        {mustSelectStandard && boxesNeedingStandard.length === 0 && (
          <div
            className="max-w-sm mx-auto mt-6 rounded-xl p-4 text-center"
            style={{ background: '#FBF2E0', border: '1px solid #E8C98A' }}
          >
            <p
              className="text-sm leading-relaxed"
              style={{ fontFamily: 'var(--font-retail-sans), sans-serif', color: '#7A4E00' }}
            >
              A este volumen fabricamos solo medidas de catalogo, y no pudimos cargarlas.
              Escribinos por WhatsApp y te decimos cual se ajusta a lo que necesitas.
            </p>
          </div>
        )}

        {/* Standard box suggestions — per box that needs it */}
        {mustSelectStandard && boxesNeedingStandard.length > 0 && (
          <div
            className="max-w-sm mx-auto mt-6 space-y-6"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${300 + boxes.length * 100}ms`,
            }}
          >
            {boxesNeedingStandard.map(({ box, index }) => {
              const boxSuggestions = suggestionsMap[index] || [];
              const isShowingAll = showAllForIndex === index;
              const boxLabel = boxes.length > 1
                ? `Caja ${index + 1} (${box.largo}x${box.ancho}x${box.alto})`
                : undefined;

              return (
                <div key={index}>
                  {boxLabel && (
                    <p
                      className="text-xs tracking-[0.15em] uppercase text-center mb-2"
                      style={{
                        fontFamily: 'var(--font-retail-mono), monospace',
                        color: 'var(--retail-primary)',
                      }}
                    >
                      {boxLabel}
                    </p>
                  )}
                  <p
                    className="text-sm text-center mb-4 leading-relaxed"
                    style={{
                      fontFamily: 'var(--font-retail-sans), sans-serif',
                      color: 'var(--retail-text)',
                    }}
                  >
                    {boxes.length > 1
                      ? 'Elegi una medida estandar para esta caja:'
                      : 'El volumen de cajas solicitado no alcanza para producirlas a medida, elegi alguna de nuestro catalogo, estas son las mas parecidas:'}
                  </p>

                  {/* Top 2 closest suggestions */}
                  <div className="space-y-2">
                    {boxSuggestions.map((sug) => renderBoxCard(sug, index, true))}
                  </div>

                  {/* "Ver todas las medidas" toggle */}
                  {!isShowingAll && (
                    <button
                      onClick={() => handleShowAllBoxes(index)}
                      disabled={loadingAll}
                      className="w-full mt-4 py-2 text-sm font-medium tracking-wide active:scale-95"
                      style={{
                        fontFamily: 'var(--font-retail-sans), sans-serif',
                        background: 'transparent',
                        color: 'var(--retail-primary)',
                        border: 'none',
                        textDecoration: 'underline',
                        textUnderlineOffset: '3px',
                        cursor: 'pointer',
                        transition: 'transform 150ms',
                        opacity: loadingAll ? 0.5 : 1,
                      }}
                    >
                      {loadingAll ? 'Cargando...' : 'Ver todas las medidas'}
                    </button>
                  )}

                  {/* All boxes list */}
                  {isShowingAll && allBoxes.length > 0 && (
                    <div className="mt-4">
                      <p
                        className="text-xs tracking-[0.15em] uppercase text-center mb-3"
                        style={{
                          fontFamily: 'var(--font-retail-sans), sans-serif',
                          color: 'var(--retail-text-muted)',
                        }}
                      >
                        Todas las medidas
                      </p>
                      <div className="space-y-2">
                        {allBoxes
                          // Don't re-show boxes already in the top-2 suggestions
                          .filter((b) => !boxSuggestions.some((s) => s.id === b.id))
                          .map((b) => renderBoxCard(b, index, false))}
                      </div>
                      <button
                        onClick={() => setShowAllForIndex(null)}
                        className="w-full mt-3 py-2 text-xs font-medium tracking-wide"
                        style={{
                          fontFamily: 'var(--font-retail-sans), sans-serif',
                          background: 'transparent',
                          color: 'var(--retail-text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        Ocultar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Buttons */}
      <div
        className="px-6 pb-safe-bottom pb-6 space-y-3 max-w-sm mx-auto w-full"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: `all 400ms cubic-bezier(0.4, 0, 0.2, 1) ${300 + boxes.length * 100}ms`,
        }}
      >
        {/* Solo si no tiene que elegir estandar, no supera el tope de stock y
            llega al piso de venta: arriba del tope el servidor rechaza el
            pedido y hay que derivar; abajo del piso no se vende. */}
        {!mustSelectStandard && !superaTope && !belowMinimum && (
          <button
            onClick={onOrder}
            className="w-full rounded-2xl py-4 text-base font-semibold tracking-wide active:scale-95"
            style={{
              fontFamily: 'var(--font-retail-sans), sans-serif',
              background: 'var(--retail-primary)',
              color: '#fff',
              border: 'none',
              transition: 'transform 150ms',
            }}
          >
            COTIZAR ENVIO
          </button>
        )}
        <button
          onClick={onReset}
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
