'use client';

import { useState, useCallback, useRef } from 'react';
import type { GameState, BoxQuoteLine, OrderFormData, ShippingData } from '@/lib/retail/types';
import type { StandardSuggestion } from './QuoteResult';
import { RETAIL_CONFIG } from '@/lib/retail/config';
import { calcularPrecioMinorista } from '@/lib/retail/pricing';
import { trackEvent } from '@/lib/retail/tracking';

import Box3D from './Box3D';
import GameHeader from './GameHeader';
import ConfirmButton from './ConfirmButton';
import DimensionSlider from './DimensionSlider';
import ScrubSlider from './ScrubSlider';
import QuantityInput from './QuantityInput';
import AddMorePrompt from './AddMorePrompt';
import PreviousBoxesList from './PreviousBoxesList';
import QuoteResult from './QuoteResult';
import OrderForm from './OrderForm';
import ShippingStep from './ShippingStep';
import OrderConfirmation from './OrderConfirmation';

function useBoxGame() {
  const [state, setState] = useState<GameState>('IDLE');
  const [largo, setLargo] = useState<number>(RETAIL_CONFIG.DEFAULT_LARGO);
  const [ancho, setAncho] = useState<number>(RETAIL_CONFIG.DEFAULT_ANCHO);
  const [alto, setAlto] = useState<number>(RETAIL_CONFIG.DEFAULT_ALTO);
  const [cantidad, setCantidad] = useState<number>(0);
  const [boxes, setBoxes] = useState<BoxQuoteLine[]>([]);
  const [formData, setFormData] = useState<OrderFormData | null>(null);
  const [shippingData, setShippingData] = useState<ShippingData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const hintShownFor = useRef(new Set<GameState>());

  const transition = useCallback((nextState: GameState) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setState(nextState);
      setIsTransitioning(false);

      // Show hint if not shown before for this state
      if (
        (nextState === 'SET_LARGO' || nextState === 'SET_ANCHO' || nextState === 'SET_ALTO') &&
        !hintShownFor.current.has(nextState)
      ) {
        hintShownFor.current.add(nextState);
        setShowHint(true);
        setTimeout(() => setShowHint(false), RETAIL_CONFIG.HINT_DURATION);
      }

      // Track state transitions
      if (nextState === 'SET_LARGO') {
        trackEvent('ViewContent');
      } else if (nextState === 'ADD_MORE') {
        trackEvent('AddToCart');
      } else if (nextState === 'ORDER_FORM') {
        trackEvent('InitiateCheckout');
      }
    }, RETAIL_CONFIG.TRANSITION_DURATION);
  }, []);

  // Start game from IDLE
  const start = useCallback(() => {
    setTimeout(() => {
      transition('SET_LARGO');
    }, 500);
  }, [transition]);

  const confirmDimension = useCallback(() => {
    switch (state) {
      case 'SET_LARGO':
        transition('SET_ANCHO');
        break;
      case 'SET_ANCHO':
        transition('SET_ALTO');
        break;
      case 'SET_ALTO':
        transition('SET_CANTIDAD');
        break;
    }
  }, [state, transition]);

  const confirmQuantity = useCallback(() => {
    if (cantidad < RETAIL_CONFIG.MIN_CANTIDAD) return;
    transition('ADD_MORE');
  }, [cantidad, transition]);

  const addMore = useCallback(() => {
    // Save current box (replace if editing, append if new)
    const result = calcularPrecioMinorista(largo, ancho, alto, cantidad);
    const newBox: BoxQuoteLine = { largo, ancho, alto, cantidad, ...result };

    if (editingIndex !== null) {
      setBoxes(prev => prev.map((b, i) => i === editingIndex ? newBox : b));
      setEditingIndex(null);
    } else {
      setBoxes(prev => [...prev, newBox]);
    }

    // Reset current box
    setLargo(RETAIL_CONFIG.DEFAULT_LARGO);
    setAncho(RETAIL_CONFIG.DEFAULT_ANCHO);
    setAlto(RETAIL_CONFIG.DEFAULT_ALTO);
    setCantidad(0);

    transition('SET_LARGO');
  }, [largo, ancho, alto, cantidad, editingIndex, transition]);

  const finishQuote = useCallback(() => {
    // Save current box (replace if editing, append if new)
    const result = calcularPrecioMinorista(largo, ancho, alto, cantidad);
    const newBox: BoxQuoteLine = { largo, ancho, alto, cantidad, ...result };

    if (editingIndex !== null) {
      setBoxes(prev => prev.map((b, i) => i === editingIndex ? newBox : b));
      setEditingIndex(null);
    } else {
      setBoxes(prev => [...prev, newBox]);
    }

    // Go to ORDER_FORM first (collect contact before revealing prices)
    transition('ORDER_FORM');
  }, [largo, ancho, alto, cantidad, editingIndex, transition]);

  // Edit a previously saved box
  const startEdit = useCallback((index: number) => {
    const box = boxes[index];
    if (!box) return;

    setEditingIndex(index);
    setLargo(box.largo);
    setAncho(box.ancho);
    setAlto(box.alto);
    setCantidad(box.cantidad);

    transition('SET_LARGO');
  }, [boxes, transition]);

  const reset = useCallback(() => {
    setBoxes([]);
    setFormData(null);
    setShippingData(null);
    setEditingIndex(null);
    setLargo(RETAIL_CONFIG.DEFAULT_LARGO);
    setAncho(RETAIL_CONFIG.DEFAULT_ANCHO);
    setAlto(RETAIL_CONFIG.DEFAULT_ALTO);
    setCantidad(0);
    hintShownFor.current.clear();
    transition('SET_LARGO');
  }, [transition]);

  // After contact form, reveal the quote
  const revealQuote = useCallback(async (data: OrderFormData) => {
    setFormData(data);
    transition('QUOTE');
  }, [transition]);

  const backToForm = useCallback(() => {
    transition('ORDER_FORM');
  }, [transition]);

  // From QUOTE → SHIPPING step
  const goToShipping = useCallback(() => {
    transition('SHIPPING');
  }, [transition]);

  // From SHIPPING → back to QUOTE
  const backToQuote = useCallback(() => {
    transition('QUOTE');
  }, [transition]);

  // Select a standard box from suggestions (replaces the primary box)
  const selectStandardBox = useCallback((sug: StandardSuggestion) => {
    if (boxes.length === 0) return;
    const primaryQty = boxes[0].cantidad;
    const result = calcularPrecioMinorista(sug.length_mm, sug.width_mm, sug.height_mm, primaryQty);
    const newBox: BoxQuoteLine = {
      largo: sug.length_mm,
      ancho: sug.width_mm,
      alto: sug.height_mm,
      cantidad: primaryQty,
      standardBoxId: sug.id,
      ...result,
    };
    setBoxes(prev => [newBox, ...prev.slice(1)]);
  }, [boxes]);

  // Submit order from SHIPPING step
  // For confirmed-price methods: creates MercadoPago checkout and redirects
  // For "a confirmar" methods: saves quote directly (no payment)
  const submitOrder = useCallback(async (shipping: ShippingData) => {
    if (!formData) return;
    setShippingData(shipping);

    const payload = {
      ...formData,
      direccion: shipping.direccion,
      ciudad: shipping.ciudad,
      provincia: shipping.provincia,
      codigoPostal: shipping.codigoPostal,
      shippingMethod: shipping.method,
      shippingCost: shipping.cost,
      shippingCostConfirmed: shipping.costConfirmed,
      boxes: boxes.map(b => ({
        largo: b.largo,
        ancho: b.ancho,
        alto: b.alto,
        cantidad: b.cantidad,
        precioUnitario: b.precioUnitario,
        subtotal: b.subtotal,
        m2PerBox: b.m2PerBox,
        totalM2: b.totalM2,
        isMayorista: b.isMayorista,
        standardBoxId: b.standardBoxId,
      })),
    };

    // If shipping cost is NOT confirmed (resto del país), skip payment — just save quote
    if (!shipping.costConfirmed) {
      const response = await fetch('/api/public/retail-quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Error al enviar');
      }

      const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
      trackEvent('Lead', { value: precioTotal, currency: 'ARS' });
      transition('ORDER_SENT');
      return;
    }

    // For confirmed-price orders: create MercadoPago checkout
    const response = await fetch('/api/public/retail-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json();
      // If MP not configured, fall back to regular quote saving
      if (response.status === 503) {
        const fallback = await fetch('/api/public/retail-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!fallback.ok) {
          const fallbackErr = await fallback.json();
          throw new Error(fallbackErr.error || 'Error al enviar');
        }
        const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
        trackEvent('Lead', { value: precioTotal + shipping.cost, currency: 'ARS' });
        transition('ORDER_SENT');
        return;
      }
      throw new Error(err.error || 'Error al crear el pago');
    }

    const data = await response.json();

    // Track checkout initiation
    const precioTotal = boxes.reduce((sum, b) => sum + b.subtotal, 0);
    trackEvent('InitiateCheckout', { value: precioTotal + shipping.cost, currency: 'ARS' });

    // Redirect to MercadoPago checkout
    // Use sandbox_init_point for test mode, init_point for production
    const checkoutUrl = data.sandbox_init_point || data.init_point;
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      throw new Error('No se pudo obtener el link de pago');
    }
  }, [boxes, formData, transition]);

  // Validate ancho considering MAX_SHEET_WIDTH
  const validateAncho = useCallback((newAncho: number): number => {
    if (alto + newAncho > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      return RETAIL_CONFIG.MAX_SHEET_WIDTH - alto;
    }
    return newAncho;
  }, [alto]);

  // Validate alto considering MAX_SHEET_WIDTH
  const validateAlto = useCallback((newAlto: number): number => {
    if (newAlto + ancho > RETAIL_CONFIG.MAX_SHEET_WIDTH) {
      return RETAIL_CONFIG.MAX_SHEET_WIDTH - ancho;
    }
    return newAlto;
  }, [ancho]);

  return {
    state, largo, ancho, alto, cantidad, boxes, formData, shippingData, editingIndex, isTransitioning, showHint,
    setLargo, setAncho, setAlto, setCantidad,
    start, confirmDimension, confirmQuantity, addMore, finishQuote, reset,
    startEdit, revealQuote, backToForm, goToShipping, backToQuote, selectStandardBox, submitOrder,
    validateAncho, validateAlto,
  };
}

export default function BoxGame() {
  const game = useBoxGame();
  const hasStarted = useRef(false);

  // Auto-start on mount
  if (!hasStarted.current && game.state === 'IDLE') {
    hasStarted.current = true;
    // Use setTimeout to avoid setState during render
    setTimeout(() => game.start(), 0);
  }

  const isDimensionState = game.state === 'SET_LARGO' || game.state === 'SET_ANCHO' || game.state === 'SET_ALTO';
  const isHorizontalDimension = game.state === 'SET_LARGO' || game.state === 'SET_ANCHO';
  const isAltoState = game.state === 'SET_ALTO';
  const isQuantityState = game.state === 'SET_CANTIDAD';
  const isAddMore = game.state === 'ADD_MORE';
  const isQuote = game.state === 'QUOTE';
  const isOrderForm = game.state === 'ORDER_FORM';
  const isShipping = game.state === 'SHIPPING';
  const isOrderSent = game.state === 'ORDER_SENT';
  const showBox = !isQuote && !isOrderForm && !isShipping && !isOrderSent;

  // Hint text
  const getHintText = () => {
    if (game.state === 'SET_ALTO') return '\u2191 Desliza para ajustar \u2193';
    return '\u2190 Desliza para ajustar \u2192';
  };

  // Dimension slider config
  const getSliderConfig = () => {
    switch (game.state) {
      case 'SET_LARGO':
        return {
          axis: 'horizontal' as const,
          value: game.largo,
          min: RETAIL_CONFIG.MIN_LARGO,
          max: RETAIL_CONFIG.MAX_LARGO,
          onChange: game.setLargo,
          validate: undefined,
        };
      case 'SET_ANCHO':
        return {
          axis: 'horizontal' as const,
          value: game.ancho,
          min: RETAIL_CONFIG.MIN_ANCHO,
          max: RETAIL_CONFIG.MAX_ANCHO,
          onChange: game.setAncho,
          validate: game.validateAncho,
        };
      case 'SET_ALTO':
        return {
          axis: 'vertical' as const,
          value: game.alto,
          min: RETAIL_CONFIG.MIN_ALTO,
          max: RETAIL_CONFIG.MAX_ALTO,
          onChange: game.setAlto,
          validate: game.validateAlto,
        };
      default:
        return null;
    }
  };

  const sliderConfig = getSliderConfig();

  return (
    <div
      className="select-none"
      style={{
        position: 'fixed',
        inset: 0,
        overflow: 'hidden',
        background: 'var(--retail-bg)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
      }}
    >
      {/* HEADER */}
      <GameHeader
        state={game.state}
        largo={game.largo}
        ancho={game.ancho}
        alto={game.alto}
        cantidad={game.cantidad}
        editingIndex={game.editingIndex}
        scrub={isHorizontalDimension && sliderConfig ? {
          value: sliderConfig.value,
          min: sliderConfig.min,
          max: sliderConfig.max,
          onChange: sliderConfig.onChange,
          validate: sliderConfig.validate,
        } : undefined}
      />

      {/* SCENE (Box + slider overlay) */}
      <div className="relative flex items-center justify-center overflow-hidden">
        {/* Vertical scrub slider on left margin for SET_ALTO */}
        {isAltoState && sliderConfig && (
          <div
            className="absolute left-2 z-20 flex items-center"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <ScrubSlider
              value={sliderConfig.value}
              min={sliderConfig.min}
              max={sliderConfig.max}
              onChange={sliderConfig.onChange}
              validate={sliderConfig.validate}
              visible={isAltoState}
              orientation="vertical"
            />
          </div>
        )}

        {showBox && (
          <div
            style={{
              opacity: game.state === 'IDLE' ? 0 : 1,
              transform: game.state === 'IDLE' ? 'scale(0)' : 'scale(1)',
              transition: 'all 600ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <Box3D
              largo={game.largo}
              ancho={game.ancho}
              alto={game.alto}
              activeState={game.state}
              isTransitioning={game.isTransitioning}
            />
          </div>
        )}

        {/* Touch overlay for dimension dragging */}
        {isDimensionState && sliderConfig && (
          <DimensionSlider
            axis={sliderConfig.axis}
            value={sliderConfig.value}
            min={sliderConfig.min}
            max={sliderConfig.max}
            onChange={sliderConfig.onChange}
            validate={sliderConfig.validate}
            active={isDimensionState}
            showHint={game.showHint}
            hintText={getHintText()}
          />
        )}

        {/* Previous boxes list (visible during ADD_MORE when there are saved boxes) */}
        {isAddMore && game.boxes.length > 0 && (
          <div
            className="absolute left-0 right-0 bottom-4 z-10 px-6"
            style={{ maxHeight: '40%', overflowY: 'auto' }}
          >
            <PreviousBoxesList
              boxes={game.boxes}
              onEdit={game.startEdit}
              visible={isAddMore}
              editingIndex={game.editingIndex}
            />
          </div>
        )}

        {/* Order form overlay (appears BEFORE quote to collect contact) */}
        <OrderForm
          boxes={game.boxes}
          visible={isOrderForm}
          onSubmit={game.revealQuote}
          onBack={game.reset}
          savedData={game.formData}
        />

        {/* Quote result overlay (appears AFTER contact form) */}
        <QuoteResult
          boxes={game.boxes}
          visible={isQuote}
          onReset={game.reset}
          onOrder={game.goToShipping}
          onSelectStandard={game.selectStandardBox}
        />

        {/* Shipping step overlay */}
        <ShippingStep
          boxes={game.boxes}
          visible={isShipping}
          onSubmit={game.submitOrder}
          onBack={game.backToQuote}
          savedShipping={game.shippingData}
        />

        {/* Order confirmation overlay */}
        <OrderConfirmation
          boxes={game.boxes}
          visible={isOrderSent}
          onReset={game.reset}
          shippingData={game.shippingData}
        />
      </div>

      {/* FOOTER (changes by state) */}
      <div
        className="relative z-10 px-6 flex flex-col items-center gap-3"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 32px)' }}
      >
        {/* Quantity input */}
        {isQuantityState && (
          <QuantityInput
            value={game.cantidad}
            onChange={game.setCantidad}
            visible={isQuantityState}
            largo={game.largo}
            ancho={game.ancho}
            alto={game.alto}
          />
        )}

        {/* Add more prompt */}
        {isAddMore && (
          <AddMorePrompt
            largo={game.largo}
            ancho={game.ancho}
            alto={game.alto}
            cantidad={game.cantidad}
            onAddMore={game.addMore}
            onFinish={game.finishQuote}
            visible={isAddMore}
            editingIndex={game.editingIndex}
          />
        )}

        {/* Confirm button (dimension states + quantity) */}
        <ConfirmButton
          label={isAltoState ? 'CANTIDAD' : isDimensionState ? 'SIGUIENTE CARA' : 'LISTO'}
          onClick={isDimensionState ? game.confirmDimension : game.confirmQuantity}
          visible={(isDimensionState || (isQuantityState && game.cantidad >= RETAIL_CONFIG.MIN_CANTIDAD)) && !game.isTransitioning}
        />
      </div>
    </div>
  );
}
