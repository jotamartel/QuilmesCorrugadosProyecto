'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
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
  Eye,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import { AuthGuard, LogoutButton, useAuth } from '@/components/auth';

const navigation = [
  { name: 'Dashboard', href: '/inicio', icon: LayoutDashboard },
  { name: 'Cotizaciones', href: '/cotizaciones', icon: FileText },
  { name: 'Cot. Web', href: '/cotizaciones-web', icon: Globe },
  { name: 'Leads Web', href: '/leads-web', icon: UserPlus },
  { name: 'Cot. Wpp', href: '/whatsapp', icon: MessageCircle },
  { name: 'Ordenes', href: '/ordenes', icon: ShoppingCart },
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
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
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

        {/* Navigation */}
        <nav className="p-4 space-y-1">
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
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
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
