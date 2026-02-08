# 🔴 Problema DNS: NXDOMAIN en quilmescorrugados.com.ar

## Problema Actual

El dominio `quilmescorrugados.com.ar` está devolviendo `DNS_PROBE_FINISHED_NXDOMAIN`, lo que significa que el DNS no está resolviendo correctamente.

## Estado Verificado

### ✅ Configuración Correcta en Cloudflare:
- **Registro A:** `quilmescorrugados.com.ar` → `76.76.21.21` ✅
- **Nameservers:** `meg.ns.cloudflare.com`, `seamus.ns.cloudflare.com` ✅
- **Zona DNS:** Configurada correctamente ✅

### ❌ Problema:
- El dominio no resuelve desde ningún DNS público
- `dig quilmescorrugados.com.ar` retorna vacío
- `nslookup` retorna `NXDOMAIN`

## Posibles Causas

### 1. Delegación de Nameservers en NIC Argentina
Los dominios `.com.ar` están gestionados por **NIC Argentina**. Los nameservers deben estar delegados correctamente en el registrador.

**Verificar:**
1. Accede al panel de gestión de tu dominio en NIC Argentina
2. Verifica que los nameservers estén configurados como:
   - `meg.ns.cloudflare.com`
   - `seamus.ns.cloudflare.com`

### 2. Propagación DNS Pendiente
Si acabas de cambiar los nameservers, puede tomar hasta 48 horas para propagarse completamente.

**Verificar propagación:**
- https://dnschecker.org/#A/quilmescorrugados.com.ar
- https://www.whatsmydns.net/#A/quilmescorrugados.com.ar

### 3. Cache DNS Local
Tu navegador o sistema puede tener cache DNS antiguo.

**Solución:**
```bash
# Limpiar cache DNS en macOS
sudo dscacheutil -flushcache
sudo killall -HUP mDNSResponder

# O cambiar DNS temporalmente a Google DNS
# 8.8.8.8 y 8.8.4.4
```

## Solución Temporal: Usar URL de Vercel

Mientras se resuelve el problema DNS, puedes:

1. **Probar OAuth desde Vercel:**
   ```
   https://quilmes-corrugados.vercel.app/login
   ```

2. **Verificar que OAuth funcione correctamente** desde esta URL

3. **Una vez resuelto el DNS**, el dominio `quilmescorrugados.com.ar` funcionará automáticamente

## Pasos para Resolver

### 1. Configurar Delegaciones en NIC Argentina

**IMPORTANTE:** El panel muestra "No tenés delegaciones". Debes agregarlas:

#### Opción A: Autodelegar (Más Fácil)
1. En el panel de NIC Argentina, haz clic en **"+ Autodelegar"**
2. Esto configurará automáticamente los nameservers de Cloudflare

#### Opción B: Agregar Delegación Manual
1. Haz clic en **"+ Agregar una nueva delegación"**
2. Agrega los nameservers de Cloudflare:
   - **Host 1:** `meg.ns.cloudflare.com`
   - **Host 2:** `seamus.ns.cloudflare.com`
3. Haz clic en **"EJECUTAR CAMBIOS"**

**Ver documentación completa:** `docs/CONFIGURAR_DELEGACIONES_NIC.md`

### 2. Esperar Propagación
- Tiempo típico: 15 minutos - 2 horas
- Máximo: 48 horas

### 3. Verificar Propagación
```bash
# Desde diferentes DNS
dig @8.8.8.8 quilmescorrugados.com.ar A +short
dig @1.1.1.1 quilmescorrugados.com.ar A +short
dig @208.67.222.222 quilmescorrugados.com.ar A +short
```

### 4. Limpiar Cache
- Reinicia el navegador
- Limpia cache DNS del sistema
- Prueba desde modo incógnito

## Verificación de OAuth

Una vez que el DNS esté funcionando, verifica OAuth:

1. Abre: `https://quilmescorrugados.com.ar/login`
2. Abre consola del navegador (F12)
3. Haz clic en "Continuar con Google"
4. Verifica los logs:
   ```
   [Auth Debug] Redirect URL: https://quilmescorrugados.com.ar/auth/callback
   [Auth Debug] Hostname: quilmescorrugados.com.ar
   [Auth Debug] NEXT_PUBLIC_SITE_URL: https://quilmescorrugados.com.ar
   ```

## Contacto

Si el problema persiste después de 48 horas:
1. Contacta soporte de NIC Argentina
2. Verifica que el dominio esté activo y pagado
3. Contacta soporte de Cloudflare si los nameservers no se propagan
