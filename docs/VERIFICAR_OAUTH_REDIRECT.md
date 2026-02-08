# 🔍 Verificar OAuth Redirect - Guía de Debugging

## Problema Actual

OAuth redirige a `localhost:3000` en lugar de `https://quilmescorrugados.com.ar/auth/callback`.

## Causas Posibles

1. **Supabase Site URL incorrecta**: Supabase puede estar usando su Site URL configurada en lugar del `redirectTo` que pasamos.
2. **Variable de entorno no inyectada**: `NEXT_PUBLIC_SITE_URL` puede no estar disponible en el cliente durante el build.
3. **Cache del navegador**: El navegador puede estar cacheando la URL antigua.

## Pasos para Verificar

### 1. Verificar Variable de Entorno en Vercel

```bash
vercel env ls | grep SITE_URL
```

Debe mostrar:
```
NEXT_PUBLIC_SITE_URL = https://quilmescorrugados.com.ar
```

### 2. Verificar en el Navegador

1. Abre `https://quilmescorrugados.com.ar/login` (o la URL de producción)
2. Abre la consola del navegador (F12)
3. Haz clic en "Continuar con Google"
4. Revisa los logs que empiezan con `[Auth Debug]`:
   - `[Auth Debug] Redirect URL:` → Debe ser `https://quilmescorrugados.com.ar/auth/callback`
   - `[Auth Debug] NEXT_PUBLIC_SITE_URL:` → Debe mostrar la URL de producción

### 3. Verificar Configuración en Supabase

1. Ve a: https://supabase.com/dashboard → Tu proyecto → Authentication → URL Configuration
2. Verifica que **Site URL** sea: `https://quilmescorrugados.com.ar`
3. Verifica que en **Redirect URLs** esté:
   - `https://quilmescorrugados.com.ar/auth/callback`
   - `https://quilmes-corrugados.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback` (solo para desarrollo)

### 4. Verificar el Redirect Real

Cuando hagas clic en OAuth, revisa la URL a la que Google redirige. Debe ser algo como:

```
https://fuzrrodnwzxuosokooyx.supabase.co/auth/v1/callback?redirect_to=https%3A%2F%2Fquilmescorrugados.com.ar%2Fauth%2Fcallback
```

**NO debe contener `localhost`** en el parámetro `redirect_to`.

## Soluciones

### Solución 1: Actualizar Site URL en Supabase

Si el Site URL en Supabase está en `localhost`, actualízalo:

```bash
SUPABASE_ACCESS_TOKEN=tu_token ./scripts/update-supabase-auth-urls.sh
```

O manualmente:
1. Ve a Supabase Dashboard → Authentication → URL Configuration
2. Cambia **Site URL** a: `https://quilmescorrugados.com.ar`
3. Guarda los cambios

### Solución 2: Forzar Redeploy en Vercel

Después de cambiar variables de entorno, fuerza un redeploy:

```bash
vercel --prod
```

O desde el dashboard de Vercel:
1. Ve a Deployments
2. Haz clic en "..." del último deployment
3. Selecciona "Redeploy"

### Solución 3: Limpiar Cache del Navegador

1. Abre DevTools (F12)
2. Click derecho en el botón de refresh
3. Selecciona "Empty Cache and Hard Reload"
4. O prueba en modo incógnito

## Debugging Avanzado

### Ver qué URL está usando Supabase

En la consola del navegador, después de hacer clic en OAuth, busca en la red (Network tab) la petición a:
- `accounts.google.com/v3/signin/...`
- Revisa el parámetro `redirect_to` en la URL

### Verificar Build de Vercel

1. Ve a Vercel Dashboard → Deployments → Último deployment → Build Logs
2. Busca `NEXT_PUBLIC_SITE_URL` en los logs
3. Verifica que se esté inyectando correctamente

## Estado Actual

- ✅ Variable `NEXT_PUBLIC_SITE_URL` configurada en Vercel (Production, Preview, Development)
- ✅ Código actualizado para priorizar `NEXT_PUBLIC_SITE_URL`
- ✅ Logs de debug agregados
- ⚠️ Pendiente: Verificar Site URL en Supabase Dashboard

## Próximos Pasos

1. Verificar Site URL en Supabase Dashboard
2. Si está en `localhost`, actualizarla a `https://quilmescorrugados.com.ar`
3. Probar OAuth nuevamente
4. Revisar logs en la consola del navegador
