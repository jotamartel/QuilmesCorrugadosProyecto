'use client';

import { Download, FileText } from 'lucide-react';

interface BoxTemplateDownloadProps {
  length: number;
  width: number;
  height: number;
}

export function BoxTemplateDownload({ length, width, height }: BoxTemplateDownloadProps) {
  const handleDownload = () => {
    const url = `/api/box-template?length=${length}&width=${width}&height=${height}`;
    window.open(url, '_blank');
  };

  // Solo mostrar si las dimensiones son válidas
  const isValid = length >= 200 && width >= 200 && height >= 100;

  if (!isValid) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-4">
      <div className="flex items-start gap-3">
        <div className="text-[#002E55] mt-0.5">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-medium text-[#001a33]">Plantilla para tu diseño</h4>
          <p className="text-sm text-[#4F6D87] mt-1">
            Descargá la plantilla con las medidas exactas de tu caja para ubicar tu diseño correctamente.
          </p>
          <button
            onClick={handleDownload}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#002E55] hover:bg-[#001a33] text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Download className="w-4 h-4" />
            Descargar plantilla PDF
          </button>
          <p className="text-xs text-[#4F6D87] mt-2">
            Incluye líneas de corte, plegado y áreas de impresión
          </p>
        </div>
      </div>
    </div>
  );
}
