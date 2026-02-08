# 🔐 Configurar OAuth Google - URLs de Redirect

## Problema

Cuando se autentica con Google OAuth, redirige a `localhost:3000` en lugar de la URL de producción.

## Solución Implementada

Se actualizó `src/lib/auth/client.ts` para usar la URL correcta según el entorno:

- **Desarrollo:** Usa `window.location.origin` (localhost:3000)
- **Producción:** Usa `NEXT_PUBLIC_SITE_URL` o URL de Vercel

## Configuración Requerida

### 1. Variable de Entorno en Vercel

Agrega la variable de entorno `NEXT_PUBLIC_SITE_URL` en Vercel:

```bash
vercel env add NEXT_PUBLIC_SITE_URL
```

Valor: `https://quilmescorrugados.com.ar` (o tu dominio de producción)

O desde el Dashboard de Vercel:
1. Ve a tu proyecto → Settings → Environment Variables
2. Agrega: `NEXT_PUBLIC_SITE_URL` = `https://quilmescorrugados.com.ar`

### 2. Configurar URLs en Supabase

**Opción A: Usando CLI (Recomendado)**

1. Obtén tu Access Token de Supabase:
   - Ve a: https://supabase.com/dashboard/account/tokens
   - Genera un nuevo token o usa uno existente

2. Ejecuta el script desde la raíz del proyecto:
   ```bash
   SUPABASE_ACCESS_TOKEN=tu_token ./scripts/update-supabase-auth-urls.sh
   ```

   O si prefieres usar la versión TypeScript (requiere `tsx`):
   ```bash
   npm install -D tsx dotenv
   SUPABASE_ACCESS_TOKEN=tu_token tsx scripts/update-supabase-auth-urls.ts
   ```

El script automáticamente:
- Extrae el project reference ID de `NEXT_PUBLIC_SUPABASE_URL`
- Agrega las URLs de redirect necesarias
- Configura el Site URL

**Opción B: Manualmente desde Dashboard**

1. Ve a: https://supabase.com/dashboard → Tu proyecto → Authentication → URL Configuration
2. Agrega estas URLs en **"Redirect URLs"**:
   - `https://quilmescorrugados.com.ar/auth/callback`
   - `https://quilmes-corrugados.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (para desarrollo)

3. En **"Site URL"**, configura:
   - `https://quilmescorrugados.com.ar`

### 3. Configurar Google OAuth en Supabase

1. Ve a: Authentication → Providers → Google
2. Habilita Google Provider
3. Configura Client ID y Client Secret de Google Cloud Console
4. Verifica que las URLs de redirect estén configuradas

### 4. Configurar Google Cloud Console

En Google Cloud Console (https://console.cloud.google.com):

1. Ve a **APIs & Services** → **Credentials**
2. Selecciona tu OAuth 2.0 Client ID
3. En **Authorized redirect URIs**, agrega:
   - `https://[tu-proyecto-supabase].supabase.co/auth/v1/callback`
   - (Supabase te muestra esta URL en el dashboard)

## Verificación

### Probar en Desarrollo:
```bash
npm run dev
# Abre http://localhost:3000/login
# Click en "Continuar con Google"
# Debe redirigir a: http://localhost:3000/auth/callback
```

### Probar en Producción:
1. Deploy a Vercel
2. Abre `https://quilmescorrugados.com.ar/login`
3. Click en "Continuar con Google"
4. Debe redirigir a: `https://quilmescorrugados.com.ar/auth/callback`

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Causa:** La URL de redirect no está en la lista de URLs permitidas.

**Solución:**
1. Verifica en Supabase Dashboard → Authentication → URL Configuration
2. Verifica en Google Cloud Console → OAuth 2.0 → Authorized redirect URIs
3. Asegúrate de que ambas listas incluyan la URL exacta que se está usando

### Redirige a localhost en producción

**Causa:** `NEXT_PUBLIC_SITE_URL` no está configurada o `window.location.origin` detecta incorrectamente.

**Solución:**
1. Verifica que `NEXT_PUBLIC_SITE_URL` esté configurada en Vercel
2. Verifica que el valor sea correcto: `https://quilmescorrugados.com.ar`
3. Haz un nuevo deploy después de agregar la variable

### Error después de autenticar

**Causa:** El callback no puede procesar la sesión.

**Solución:**
1. Verifica logs en Vercel
2. Verifica que `/auth/callback` esté funcionando
3. Verifica que el usuario esté en `authorized_users`

## Código Actualizado

El código ahora detecta automáticamente la URL correcta:

```typescript
function getBaseUrl(): string {
  // En producción, usar variable de entorno
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  
  // En desarrollo, usar window.location.origin
  return window.location.origin;
}
```

## Checklist

- [ ] Variable `NEXT_PUBLIC_SITE_URL` configurada en Vercel
- [ ] URLs de redirect agregadas en Supabase Dashboard
- [ ] Google OAuth configurado en Supabase
- [ ] Google Cloud Console configurado con redirect URI de Supabase
- [ ] Probado en desarrollo (localhost)
- [ ] Probado en producción (quilmescorrugados.com.ar)
