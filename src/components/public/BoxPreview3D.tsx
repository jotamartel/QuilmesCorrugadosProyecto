'use client';

import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text, Html } from '@react-three/drei';
import * as THREE from 'three';

interface BoxPreview3DProps {
  length: number; // mm
  width: number;  // mm
  height: number; // mm
  autoRotate?: boolean;
}

function Box3D({ length, width, height, autoRotate = true }: BoxPreview3DProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const edgesRef = useRef<THREE.LineSegments>(null);

  // Normalizar dimensiones para que quepan bien en la vista
  // Escalar todo a un rango de 0-3 unidades
  const maxDim = Math.max(length, width, height);
  const scale = 2.5 / maxDim;

  const scaledL = length * scale;
  const scaledW = width * scale;
  const scaledH = height * scale;

  useFrame((state) => {
    if (autoRotate && meshRef.current && edgesRef.current) {
      const t = state.clock.getElapsedTime();
      meshRef.current.rotation.y = t * 0.3;
      edgesRef.current.rotation.y = t * 0.3;
    }
  });

  // Color kraft marrón
  const kraftColor = new THREE.Color('#C4A77D');

  return (
    <group>
      {/* Caja principal */}
      <mesh ref={meshRef} castShadow receiveShadow>
        <boxGeometry args={[scaledL, scaledH, scaledW]} />
        <meshStandardMaterial
          color={kraftColor}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Bordes de la caja */}
      <lineSegments ref={edgesRef}>
        <edgesGeometry args={[new THREE.BoxGeometry(scaledL, scaledH, scaledW)]} />
        <lineBasicMaterial color="#8B6914" linewidth={2} />
      </lineSegments>

      {/* Labels de dimensiones - posicionado más abajo en el centro */}
      <Html
        position={[0, -2.2, 0]}
        center
        style={{ pointerEvents: 'none' }}
      >
        <div className="text-xs bg-white/90 px-2 py-1 rounded shadow text-gray-700 whitespace-nowrap">
          {length} x {width} x {height} mm
        </div>
      </Html>
    </group>
  );
}

function LoadingFallback() {
  return (
    <Html center>
      <div className="text-gray-500 text-sm">Cargando vista 3D...</div>
    </Html>
  );
}

export function BoxPreview3D({ length, width, height, autoRotate = true }: BoxPreview3DProps) {
  // Validar dimensiones mínimas
  if (length < 100 || width < 100 || height < 50) {
    return (
      <div className="w-full aspect-[4/3] bg-gray-100 rounded-lg flex items-center justify-center">
        <p className="text-gray-500 text-sm">Ingresá las dimensiones para ver la caja</p>
      </div>
    );
  }

  return (
    <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg overflow-hidden">
      <Canvas
        camera={{ position: [4, 3, 4], fov: 50 }}
        shadows
      >
        <Suspense fallback={<LoadingFallback />}>
          {/* Iluminación */}
          <ambientLight intensity={0.5} />
          <directionalLight
            position={[5, 5, 5]}
            intensity={1}
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
          />
          <directionalLight position={[-5, 3, -5]} intensity={0.3} />

          {/* Caja */}
          <Box3D
            length={length}
            width={width}
            height={height}
            autoRotate={autoRotate}
          />

          {/* Controles */}
          <OrbitControls
            enablePan={false}
            enableZoom={true}
            minDistance={3}
            maxDistance={10}
            autoRotate={false}
          />

          {/* Plano de fondo */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.5, 0]} receiveShadow>
            <planeGeometry args={[10, 10]} />
            <shadowMaterial opacity={0.1} />
          </mesh>
        </Suspense>
      </Canvas>
    </div>
  );
}

// Fallback SVG para casos donde Three.js falla
export function BoxPreview2D({ length, width, height }: BoxPreview3DProps) {
  // Vista isométrica simple en SVG
  const scale = 0.3;
  const l = length * scale;
  const w = width * scale;
  const h = height * scale;

  // Proyección isométrica
  const isoX = (x: number, y: number) => (x - y) * Math.cos(Math.PI / 6);
  const isoY = (x: number, y: number, z: number) => (x + y) * Math.sin(Math.PI / 6) - z;

  const centerX = 150;
  const centerY = 120;

  // Puntos de la caja
  const points = {
    // Cara frontal
    f1: [centerX + isoX(0, 0), centerY + isoY(0, 0, 0)],
    f2: [centerX + isoX(l, 0), centerY + isoY(l, 0, 0)],
    f3: [centerX + isoX(l, 0), centerY + isoY(l, 0, h)],
    f4: [centerX + isoX(0, 0), centerY + isoY(0, 0, h)],
    // Cara lateral
    s1: [centerX + isoX(l, 0), centerY + isoY(l, 0, 0)],
    s2: [centerX + isoX(l, w), centerY + isoY(l, w, 0)],
    s3: [centerX + isoX(l, w), centerY + isoY(l, w, h)],
    // Cara superior
    t1: [centerX + isoX(0, 0), centerY + isoY(0, 0, h)],
    t2: [centerX + isoX(l, 0), centerY + isoY(l, 0, h)],
    t3: [centerX + isoX(l, w), centerY + isoY(l, w, h)],
    t4: [centerX + isoX(0, w), centerY + isoY(0, w, h)],
  };

  return (
    <div className="w-full aspect-[4/3] bg-gradient-to-br from-gray-50 to-gray-100 rounded-lg flex items-center justify-center">
      <svg viewBox="0 0 300 200" className="w-full h-full">
        {/* Cara frontal */}
        <polygon
          points={`${points.f1.join(',')} ${points.f2.join(',')} ${points.f3.join(',')} ${points.f4.join(',')}`}
          fill="#C4A77D"
          stroke="#8B6914"
          strokeWidth="1.5"
        />
        {/* Cara lateral */}
        <polygon
          points={`${points.s1.join(',')} ${points.s2.join(',')} ${points.s3.join(',')} ${points.f3.join(',')}`}
          fill="#B09468"
          stroke="#8B6914"
          strokeWidth="1.5"
        />
        {/* Cara superior */}
        <polygon
          points={`${points.t1.join(',')} ${points.t2.join(',')} ${points.t3.join(',')} ${points.t4.join(',')}`}
          fill="#D4B78D"
          stroke="#8B6914"
          strokeWidth="1.5"
        />
        {/* Dimensiones */}
        <text x="150" y="190" textAnchor="middle" className="text-xs fill-gray-600">
          {length} x {width} x {height} mm
        </text>
      </svg>
    </div>
  );
}
