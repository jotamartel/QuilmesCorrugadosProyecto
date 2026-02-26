'use client';

import { useMemo } from 'react';
import type { GameState } from '@/lib/retail/types';

interface Box3DProps {
  largo: number;   // mm
  ancho: number;   // mm
  alto: number;    // mm
  activeState: GameState;
  isTransitioning: boolean;
}

const MAX_VISUAL_SIZE = 200; // px max dimension

export default function Box3D({ largo, ancho, alto, activeState, isTransitioning }: Box3DProps) {
  const W = useMemo(() => {
    const scale = MAX_VISUAL_SIZE / Math.max(largo, ancho, alto);
    return {
      w: largo * scale,   // visual width (largo)
      d: ancho * scale,   // visual depth (ancho)
      h: alto * scale,    // visual height (alto)
    };
  }, [largo, ancho, alto]);

  const { w, d, h } = W;

  const getRotation = () => {
    switch (activeState) {
      case 'SET_ANCHO':
        return 'rotateX(-20deg) rotateY(-40deg)';
      case 'SET_ALTO':
        return 'rotateX(-18deg) rotateY(-25deg)';
      case 'SET_LARGO':
      case 'SET_CANTIDAD':
      case 'ADD_MORE':
      default:
        return 'rotateX(-20deg) rotateY(-25deg)';
    }
  };

  const isFrontActive = activeState === 'SET_LARGO' || activeState === 'SET_ALTO';
  const isRightActive = activeState === 'SET_ANCHO' || activeState === 'SET_ALTO';

  const boxScale = activeState === 'SET_CANTIDAD' || activeState === 'ADD_MORE' ? 0.75 : 1;
  const shadowSize = Math.max(w, d) * 1.1;

  // Shared base style for all 6 faces
  const faceBase: React.CSSProperties = {
    position: 'absolute',
    backfaceVisibility: 'hidden',
  };

  // Cardboard texture overlay
  const texture = (
    <div className="absolute inset-0" style={{
      backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 5px, rgba(0,0,0,0.02) 5px, rgba(0,0,0,0.02) 6px)',
    }} />
  );

  return (
    <div
      className="relative flex items-center justify-center"
      style={{
        perspective: '600px',
        perspectiveOrigin: '50% 45%',
        width: '100%',
        height: '100%',
        minHeight: '200px',
      }}
    >
      {/* Shadow */}
      <div
        className="absolute rounded-[50%]"
        style={{
          width: `${shadowSize}px`,
          height: `${shadowSize * 0.2}px`,
          top: `calc(50% + ${h * boxScale * 0.45 + 20}px)`,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'radial-gradient(ellipse, rgba(0,0,0,0.12) 0%, transparent 70%)',
          filter: 'blur(10px)',
          transition: `all ${isTransitioning ? 400 : 80}ms ease-out`,
        }}
      />

      {/* 3D Box - container matches front face dimensions */}
      <div
        style={{
          transformStyle: 'preserve-3d',
          transform: `${getRotation()} scale(${boxScale})`,
          transition: `transform ${isTransitioning ? 400 : 80}ms cubic-bezier(0.4, 0, 0.2, 1)`,
          width: `${w}px`,
          height: `${h}px`,
          position: 'relative',
        }}
      >
        {/* ===== FRONT face (w x h) — faces viewer ===== */}
        <div
          style={{
            ...faceBase,
            width: `${w}px`,
            height: `${h}px`,
            left: 0,
            top: 0,
            background: isFrontActive ? 'var(--retail-box-active)' : 'var(--retail-box-front)',
            transform: `translateZ(${d / 2}px)`,
            transition: 'background 250ms',
            boxShadow: isFrontActive
              ? 'inset 0 0 0 2.5px rgba(232,115,74,0.5)'
              : 'none',
          }}
        >
          {texture}
        </div>

        {/* ===== BACK face (w x h) ===== */}
        <div
          style={{
            ...faceBase,
            width: `${w}px`,
            height: `${h}px`,
            left: 0,
            top: 0,
            background: 'var(--retail-box-front)',
            transform: `rotateY(180deg) translateZ(${d / 2}px)`,
          }}
        >
          {texture}
        </div>

        {/* ===== RIGHT face (d x h) — centered then pushed right ===== */}
        <div
          style={{
            ...faceBase,
            width: `${d}px`,
            height: `${h}px`,
            left: `${(w - d) / 2}px`,
            top: 0,
            background: isRightActive ? 'var(--retail-box-active)' : 'var(--retail-box-right)',
            transform: `rotateY(90deg) translateZ(${w / 2}px)`,
            transition: 'background 250ms',
            boxShadow: isRightActive
              ? 'inset 0 0 0 2.5px rgba(232,115,74,0.5)'
              : 'none',
          }}
        >
          {texture}
        </div>

        {/* ===== LEFT face (d x h) ===== */}
        <div
          style={{
            ...faceBase,
            width: `${d}px`,
            height: `${h}px`,
            left: `${(w - d) / 2}px`,
            top: 0,
            background: 'var(--retail-box-right)',
            transform: `rotateY(-90deg) translateZ(${w / 2}px)`,
          }}
        >
          {texture}
        </div>

        {/* ===== TOP face (w x d) — centered then pushed up ===== */}
        <div
          style={{
            ...faceBase,
            width: `${w}px`,
            height: `${d}px`,
            left: 0,
            top: `${(h - d) / 2}px`,
            background: 'var(--retail-box-top)',
            transform: `rotateX(90deg) translateZ(${h / 2}px)`,
          }}
        >
          {/* Flap cross lines */}
          <div className="absolute inset-0 opacity-[0.12]">
            <div className="absolute left-1/2 top-0 h-full w-px bg-black/30" style={{ transform: 'translateX(-50%)' }} />
            <div className="absolute left-0 top-1/2 w-full h-px bg-black/30" style={{ transform: 'translateY(-50%)' }} />
          </div>
        </div>

        {/* ===== BOTTOM face (w x d) ===== */}
        <div
          style={{
            ...faceBase,
            width: `${w}px`,
            height: `${d}px`,
            left: 0,
            top: `${(h - d) / 2}px`,
            background: 'var(--retail-box-front)',
            transform: `rotateX(-90deg) translateZ(${h / 2}px)`,
          }}
        />
      </div>
    </div>
  );
}
