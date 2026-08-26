import Link from 'next/link';
import { ShoppingBag, Pizza, Home, Warehouse, ArrowRight } from 'lucide-react';

/**
 * Tarjetas hacia las landings verticales.
 *
 * Existe porque esas cuatro páginas no recibían ningún link interno desde la
 * home, /productos ni /precios: solo se enlazaban entre sí, así que para el
 * bot eran hojas sueltas sin PageRank interno. Este módulo las cuelga de las
 * tres páginas más fuertes del sitio con anchor text descriptivo.
 *
 * Sin hooks a propósito: se usa igual desde páginas server (/precios) y
 * client (home, /productos).
 */
const RUBROS = [
  {
    href: '/cajas-ecommerce',
    icon: ShoppingBag,
    titulo: 'Cajas para e-commerce',
    descripcion: 'Medidas para correo y Mercado Envíos, con tu logo.',
  },
  {
    href: '/cajas-alimentos',
    icon: Pizza,
    titulo: 'Cajas para delivery y gastronomía',
    descripcion: 'Pizzas, empanadas y catering. Cartón apto alimentos.',
  },
  {
    href: '/cajas-mudanza',
    icon: Home,
    titulo: 'Cajas para mudanza',
    descripcion: 'Resistentes, en medidas grandes, listas para cargar.',
  },
  {
    href: '/mayorista',
    icon: Warehouse,
    titulo: 'Venta mayorista',
    descripcion: 'Directo de fábrica, con escalera de precios por volumen.',
  },
];

export function CajasPorRubro({ className = '' }: { className?: string }) {
  return (
    <section className={`px-4 py-12 ${className}`} aria-labelledby="rubros-titulo">
      <div className="mx-auto max-w-7xl">
        <h2 id="rubros-titulo" className="mb-2 text-center text-2xl font-bold text-gray-900">
          Cajas para cada rubro
        </h2>
        <p className="mx-auto mb-8 max-w-2xl text-center text-gray-600">
          La misma fábrica y el mismo cotizador, con lo que cambia según tu uso:
          medidas, resistencia e impresión.
        </p>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {RUBROS.map((rubro) => (
            <Link
              key={rubro.href}
              href={rubro.href}
              className="group rounded-xl border border-gray-200 bg-white p-6 transition-shadow hover:shadow-lg"
            >
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                <rubro.icon className="h-6 w-6 text-[#002E55]" />
              </div>
              <h3 className="mb-2 font-semibold text-gray-900">{rubro.titulo}</h3>
              <p className="mb-3 text-sm text-gray-600">{rubro.descripcion}</p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-[#002E55] group-hover:underline">
                Ver más
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
