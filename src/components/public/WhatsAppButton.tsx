'use client';

import { MessageCircle } from 'lucide-react';

const WHATSAPP_NUMBER = '5491169249801';
const DEFAULT_MESSAGE = 'Hola, quiero consultar por cajas de cartón';

interface WhatsAppButtonProps {
  message?: string;
  className?: string;
}

export function WhatsAppButton({ message = DEFAULT_MESSAGE, className = '' }: WhatsAppButtonProps) {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`fixed bottom-6 right-6 z-50 flex items-center justify-center w-14 h-14 bg-green-500 hover:bg-green-600 text-white rounded-full shadow-lg transition-all hover:scale-110 ${className}`}
      aria-label="Contactar por WhatsApp"
    >
      <MessageCircle className="w-7 h-7" />
    </a>
  );
}
