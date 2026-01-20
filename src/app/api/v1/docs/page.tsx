'use client';

import { useState } from 'react';
import { Check, Copy, ExternalLink, Zap, Box, Calculator, Clock, Shield } from 'lucide-react';

export default function ApiDocsPage() {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const exampleRequest = `{
  "boxes": [
    {
      "length_mm": 400,
      "width_mm": 300,
      "height_mm": 200,
      "quantity": 1000,
      "has_printing": false,
      "printing_colors": 0
    }
  ]
}`;

  const exampleResponse = `{
  "success": true,
  "quote": {
    "boxes": [
      {
        "length_mm": 400,
        "width_mm": 300,
        "height_mm": 200,
        "quantity": 1000,
        "has_printing": false,
        "printing_colors": 0,
        "sheet_width_mm": 500,
        "sheet_length_mm": 1450,
        "sqm_per_box": 0.725,
        "total_sqm": 725,
        "price_per_m2": 900,
        "unit_price": 652.50,
        "subtotal": 652500
      }
    ],
    "total_m2": 725,
    "subtotal": 652500,
    "currency": "ARS",
    "estimated_days": 7,
    "valid_until": "2025-02-19",
    "minimum_m2": 3000,
    "meets_minimum": false
  },
  "rate_limit": {
    "remaining": 9,
    "reset_at": "2025-01-19T12:01:00.000Z"
  }
}`;

  const curlExample = `curl -X POST https://quilmes-corrugados.vercel.app/api/v1/quote \\
  -H "Content-Type: application/json" \\
  -d '${exampleRequest.replace(/\n/g, '').replace(/  /g, '')}'`;

  const pythonExample = `import requests

response = requests.post(
    "https://quilmes-corrugados.vercel.app/api/v1/quote",
    json={
        "boxes": [{
            "length_mm": 400,
            "width_mm": 300,
            "height_mm": 200,
            "quantity": 1000
        }]
    }
)

quote = response.json()
print(f"Total: ARS {quote['quote']['subtotal']:,.2f}")`;

  const jsExample = `const response = await fetch('https://quilmes-corrugados.vercel.app/api/v1/quote', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    boxes: [{
      length_mm: 400,
      width_mm: 300,
      height_mm: 200,
      quantity: 1000
    }]
  })
});

const { quote } = await response.json();
console.log(\`Total: ARS \${quote.subtotal.toLocaleString()}\`);`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#002E55] text-white py-12">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-2 text-blue-200 text-sm mb-4">
            <a href="https://quilmes-corrugados.vercel.app" className="hover:text-white">Quilmes Corrugados</a>
            <span>/</span>
            <span>API v1</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            Quote API Documentation
          </h1>
          <p className="text-blue-100 text-lg max-w-2xl">
            API pública para cotización automática de cajas de cartón corrugado.
            Diseñada para integración con LLMs, agentes de IA y sistemas B2B.
          </p>
          <div className="flex flex-wrap gap-4 mt-6">
            <a
              href="/api/v1/openapi.json"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              OpenAPI Spec
            </a>
            <a
              href="/llms.txt"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              llms.txt
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 space-y-12">
        {/* Quick Start */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            Quick Start
          </h2>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
              <span className="text-gray-400 text-sm">cURL</span>
              <button
                onClick={() => copyToClipboard(curlExample, 'curl')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copiedSection === 'curl' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{curlExample}</code>
            </pre>
          </div>
        </section>

        {/* Features */}
        <section className="grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Box className="w-8 h-8 text-blue-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Múltiples cajas</h3>
            <p className="text-gray-600 text-sm">
              Cotizá hasta 10 tipos de cajas diferentes en una sola request.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Calculator className="w-8 h-8 text-green-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Precios en tiempo real</h3>
            <p className="text-gray-600 text-sm">
              Precios actualizados automáticamente según configuración vigente.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Clock className="w-8 h-8 text-purple-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Tiempo de producción</h3>
            <p className="text-gray-600 text-sm">
              Estimación de días hábiles según complejidad del pedido.
            </p>
          </div>
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <Shield className="w-8 h-8 text-amber-600 mb-4" />
            <h3 className="font-semibold text-gray-900 mb-2">Rate limiting</h3>
            <p className="text-gray-600 text-sm">
              10 req/min sin API key, 100 req/min con API key.
            </p>
          </div>
        </section>

        {/* Endpoint */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Endpoint</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                  POST
                </span>
                <code className="text-gray-900 font-mono">
                  https://quilmes-corrugados.vercel.app/api/v1/quote
                </code>
              </div>
            </div>
            <div className="p-6">
              <p className="text-gray-600 mb-4">
                Calcula el precio de cajas de cartón corrugado según dimensiones y cantidad.
              </p>
              <h4 className="font-semibold text-gray-900 mb-3">Headers</h4>
              <table className="w-full text-sm mb-6">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-500 font-medium">Header</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Tipo</th>
                    <th className="text-left py-2 text-gray-500 font-medium">Descripción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-2 font-mono text-gray-900">Content-Type</td>
                    <td className="py-2 text-gray-600">Requerido</td>
                    <td className="py-2 text-gray-600">application/json</td>
                  </tr>
                  <tr>
                    <td className="py-2 font-mono text-gray-900">X-API-Key</td>
                    <td className="py-2 text-gray-600">Opcional</td>
                    <td className="py-2 text-gray-600">API key para rate limit extendido</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Request Body */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Request Body</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Parámetros de boxes[]</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 text-gray-500 font-medium">Campo</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Tipo</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Rango</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 font-mono text-gray-900">length_mm</td>
                  <td className="py-2 text-gray-600">integer</td>
                  <td className="py-2 text-gray-600">100-2000</td>
                  <td className="py-2 text-gray-600">Largo de la caja en mm</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono text-gray-900">width_mm</td>
                  <td className="py-2 text-gray-600">integer</td>
                  <td className="py-2 text-gray-600">100-2000</td>
                  <td className="py-2 text-gray-600">Ancho de la caja en mm</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono text-gray-900">height_mm</td>
                  <td className="py-2 text-gray-600">integer</td>
                  <td className="py-2 text-gray-600">50-1500</td>
                  <td className="py-2 text-gray-600">Alto de la caja en mm</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono text-gray-900">quantity</td>
                  <td className="py-2 text-gray-600">integer</td>
                  <td className="py-2 text-gray-600">≥1</td>
                  <td className="py-2 text-gray-600">Cantidad de cajas</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 font-mono text-gray-900">has_printing</td>
                  <td className="py-2 text-gray-600">boolean</td>
                  <td className="py-2 text-gray-600">-</td>
                  <td className="py-2 text-gray-600">Si tiene impresión (opcional)</td>
                </tr>
                <tr>
                  <td className="py-2 font-mono text-gray-900">printing_colors</td>
                  <td className="py-2 text-gray-600">integer</td>
                  <td className="py-2 text-gray-600">0-4</td>
                  <td className="py-2 text-gray-600">Cantidad de colores (opcional)</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-6 bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
              <span className="text-gray-400 text-sm">Ejemplo de request</span>
              <button
                onClick={() => copyToClipboard(exampleRequest, 'request')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copiedSection === 'request' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{exampleRequest}</code>
            </pre>
          </div>
        </section>

        {/* Response */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Response</h2>
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
              <span className="text-gray-400 text-sm">Ejemplo de response (200 OK)</span>
              <button
                onClick={() => copyToClipboard(exampleResponse, 'response')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copiedSection === 'response' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{exampleResponse}</code>
            </pre>
          </div>

          <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h4 className="font-semibold text-gray-900 mb-4">Campos importantes</h4>
            <ul className="space-y-3 text-sm text-gray-600">
              <li>
                <strong className="text-gray-900">meets_minimum</strong>: Indica si el pedido cumple el mínimo de 3.000 m².
                Si es <code className="bg-gray-100 px-1 rounded">false</code>, el pedido no puede procesarse.
              </li>
              <li>
                <strong className="text-gray-900">currency</strong>: Siempre &quot;ARS&quot; (Peso Argentino).
              </li>
              <li>
                <strong className="text-gray-900">subtotal</strong>: Precio sin IVA.
              </li>
              <li>
                <strong className="text-gray-900">valid_until</strong>: Fecha hasta la cual el precio cotizado es válido.
              </li>
            </ul>
          </div>
        </section>

        {/* Error Codes */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Códigos de Error</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Código</th>
                  <th className="text-left px-6 py-3 text-gray-500 font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-6 py-3 font-mono text-gray-900">200</td>
                  <td className="px-6 py-3 text-gray-600">Cotización exitosa</td>
                </tr>
                <tr className="border-b">
                  <td className="px-6 py-3 font-mono text-gray-900">400</td>
                  <td className="px-6 py-3 text-gray-600">Error de validación (parámetros inválidos)</td>
                </tr>
                <tr className="border-b">
                  <td className="px-6 py-3 font-mono text-gray-900">429</td>
                  <td className="px-6 py-3 text-gray-600">Rate limit excedido</td>
                </tr>
                <tr>
                  <td className="px-6 py-3 font-mono text-gray-900">500</td>
                  <td className="px-6 py-3 text-gray-600">Error interno del servidor</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Code Examples */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Ejemplos de Código</h2>

          {/* Python */}
          <div className="mb-6 bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
              <span className="text-gray-400 text-sm">Python</span>
              <button
                onClick={() => copyToClipboard(pythonExample, 'python')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copiedSection === 'python' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{pythonExample}</code>
            </pre>
          </div>

          {/* JavaScript */}
          <div className="bg-gray-900 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-800">
              <span className="text-gray-400 text-sm">JavaScript / Node.js</span>
              <button
                onClick={() => copyToClipboard(jsExample, 'js')}
                className="text-gray-400 hover:text-white transition-colors"
              >
                {copiedSection === 'js' ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <pre className="p-4 text-sm text-gray-100 overflow-x-auto">
              <code>{jsExample}</code>
            </pre>
          </div>
        </section>

        {/* Rate Limiting */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Rate Limiting</h2>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <p className="text-gray-600 mb-4">
              La API implementa rate limiting por IP o API key:
            </p>
            <ul className="space-y-2 text-sm text-gray-600 mb-6">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
                <strong>Sin API key:</strong> 10 requests por minuto
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <strong>Con API key:</strong> 100 requests por minuto
              </li>
            </ul>
            <p className="text-sm text-gray-500">
              Los headers <code className="bg-gray-100 px-1 rounded">X-RateLimit-Remaining</code> y{' '}
              <code className="bg-gray-100 px-1 rounded">X-RateLimit-Reset</code> indican el estado del rate limit.
            </p>
          </div>
        </section>

        {/* Contact */}
        <section className="bg-[#002E55] rounded-xl p-8 text-white">
          <h2 className="text-xl font-bold mb-4">¿Necesitás una API key?</h2>
          <p className="text-blue-100 mb-6">
            Si necesitás un rate limit mayor para tu integración, contactanos para obtener una API key personalizada.
          </p>
          <a
            href="mailto:info@quilmescorrugados.com.ar?subject=Solicitud%20de%20API%20Key"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white text-[#002E55] rounded-lg font-medium hover:bg-gray-100 transition-colors"
          >
            Solicitar API Key
            <ExternalLink className="w-4 h-4" />
          </a>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-8 mt-12">
        <div className="max-w-4xl mx-auto px-6 text-center text-sm text-gray-500">
          <p>© {new Date().getFullYear()} Quilmes Corrugados S.A. Todos los derechos reservados.</p>
          <p className="mt-2">
            <a href="https://quilmes-corrugados.vercel.app" className="hover:text-gray-700">quilmes-corrugados.vercel.app</a>
            {' · '}
            <a href="/llms.txt" className="hover:text-gray-700">llms.txt</a>
            {' · '}
            <a href="/api/v1/openapi.json" className="hover:text-gray-700">OpenAPI</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
