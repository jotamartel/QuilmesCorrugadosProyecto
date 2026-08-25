'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Factory,
  ShoppingBag,
  Users,
  Box,
  Settings,
  BarChart3,
  Menu,
  X,
  CreditCard,
  Receipt,
  DollarSign,
  Globe,
  UserPlus,
  Activity,
  Key,
  MessageCircle,
  MessageCircleQuestion,
  MessageSquare,
  Eye,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { useState } from 'react';
import { AuthGuard, LogoutButton, useAuth } from '@/components/auth';

const navigation = [
  { name: 'Dashboard', href: '/inicio', icon: LayoutDashboard },
  { name: 'Cotizaciones', href: '/cotizaciones', icon: FileText },
  { name: 'Cot. Web', href: '/cotizaciones-web', icon: Globe },
  { name: 'Leads Web', href: '/leads-web', icon: UserPlus },
  { name: 'Menores al Mínimo', href: '/leads-web/below-minimum', icon: AlertCircle },
  { name: 'Cot. Wpp', href: '/whatsapp', icon: MessageCircle },
  // Aparte de Cot. Wpp a proposito: en WhatsApp la bandeja es una lista de
  // pendientes que se pueden contestar; el chat del sitio es anonimo y no se
  // puede responder. Mezclarlos ensucia la bandeja que si sirve para atender.
  { name: 'Chat del sitio', href: '/chat-web', icon: MessageSquare },
  { name: 'Sin responder', href: '/conocimiento', icon: MessageCircleQuestion },
  { name: 'Ordenes', href: '/ordenes', icon: ShoppingCart },
  // Va pegada a Ordenes pero es otra pregunta: /ordenes es la gestion del
  // pedido, /produccion es que fabricar hoy y en que orden.
  { name: 'Produccion', href: '/produccion', icon: Factory },
  { name: 'Ventas Retail', href: '/ventas-retail', icon: ShoppingBag },
  { name: 'Clientes', href: '/clientes', icon: Users },
  { name: 'Pagos', href: '/pagos', icon: Receipt },
  { name: 'Cheques', href: '/cheques', icon: CreditCard },
  { name: 'Catalogo', href: '/catalogo', icon: Box },
  { name: 'Costos', href: '/costos', icon: DollarSign },
  { name: 'Reportes', href: '/reportes', icon: BarChart3 },
  { name: 'Tráfico en Vivo', href: '/trafico', icon: Eye },
  { name: 'Funnels', href: '/funnels', icon: TrendingUp },
  { name: 'API Stats', href: '/api-stats', icon: Activity },
  { name: 'API Keys', href: '/api-keys', icon: Key },
  { name: 'Configuracion', href: '/configuracion', icon: Settings },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {/* El aside es una COLUMNA FLEX, y no es decorativo.
          Antes era un bloque suelto con el footer en absolute bottom-0: el nav
          crecía más que la pantalla y el cartel de la versión quedaba apoyado
          encima del último ítem del menú, que hoy es "API Keys". Cada vez que
          se agrega una entrada al menú el problema empeora.
          Ahora el nav se lleva el espacio sobrante y scrollea solo; el footer
          es un hermano más, no algo flotando por arriba. */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200
          flex flex-col
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="shrink-0 flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <Link href="/" className="flex items-center gap-2">
            <Box className="w-8 h-8 text-blue-600" />
            <span className="font-bold text-gray-900">Quilmes</span>
          </Link>
          <button
            className="lg:hidden p-1 rounded-md hover:bg-gray-100"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation
            min-h-0 va junto con flex-1: sin eso, el min-height:auto que traen
            los items flex impide que se achique y el overflow-y no scrollea
            nunca — vuelve a desbordar, en silencio. */}
        <nav className="flex-1 min-h-0 overflow-y-auto p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                  transition-colors
                  ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
                onClick={() => setSidebarOpen(false)}
              >
                <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="shrink-0 p-4 border-t border-gray-200 bg-white">
          <p className="text-xs text-gray-500 text-center">
            Quilmes Corrugados v1.0
          </p>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            <button
              className="lg:hidden p-2 rounded-md hover:bg-gray-100"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1 lg:flex-none" />
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">
                {user?.name || user?.email || 'Usuario'}
              </span>
              <LogoutButton variant="ghost" showText={false} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <DashboardContent>{children}</DashboardContent>
    </AuthGuard>
  );
}
