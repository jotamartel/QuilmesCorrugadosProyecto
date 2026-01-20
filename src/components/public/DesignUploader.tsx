'use client';

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, FileText, Loader2 } from 'lucide-react';

interface DesignUploaderProps {
  onUpload: (url: string, fileName: string) => void;
  onRemove: () => void;
  currentFile?: { url: string; name: string } | null;
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/postscript': ['.ai', '.eps'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function DesignUploader({ onUpload, onRemove, currentFile }: DesignUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'public-designs');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Error al subir el archivo');
      }

      const data = await response.json();
      onUpload(data.url, file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir el archivo');
    } finally {
      setUploading(false);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: false,
    disabled: uploading,
    onDropRejected: (fileRejections) => {
      const rejection = fileRejections[0];
      if (rejection?.errors[0]?.code === 'file-too-large') {
        setError('El archivo excede el tamaño máximo de 10MB');
      } else if (rejection?.errors[0]?.code === 'file-invalid-type') {
        setError('Formato no soportado. Usá PDF, PNG, JPG, AI o EPS');
      }
    },
  });

  if (currentFile) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-amber-600" />
            <div>
              <p className="font-medium text-gray-900 text-sm">{currentFile.name}</p>
              <p className="text-xs text-gray-500">Archivo cargado</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 hover:bg-gray-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-amber-500 bg-amber-50' : 'border-gray-300 hover:border-amber-400'}
          ${uploading ? 'opacity-50 cursor-wait' : ''}
        `}
      >
        <input {...getInputProps()} />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
            <p className="text-sm text-gray-600">Subiendo archivo...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-600">
              {isDragActive ? 'Soltá el archivo aquí' : 'Arrastrá tu diseño o hacé click para subir'}
            </p>
            <p className="text-xs text-gray-400">
              PDF, PNG, JPG, AI, EPS (máx. 10MB)
            </p>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}

      <p className="mt-2 text-xs text-gray-500">
        Si no tenés el diseño ahora, podés enviarlo después por WhatsApp o email.
      </p>
    </div>
  );
}
