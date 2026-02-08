# 🔧 Solución: Error DNS en Móvil (NXDOMAIN)

## Problema

El dominio `quilmescorrugados.com.ar` muestra error `DNS_PROBE_FINISHED_NXDOMAIN` en dispositivos móviles.

## Estado Actual

✅ **Registro DNS correcto:** `quilmescorrugados.com.ar` → `76.76.21.21`  
✅ **Nameservers correctos:** Cloudflare (`meg.ns.cloudflare.com`, `seamus.ns.cloudflare.com`)  
✅ **Google DNS resuelve:** Sí  
⚠️ **Cloudflare DNS (1.1.1.1):** Puede tardar en propagarse  

## Causas Probables

1. **Cache DNS en el móvil** (más común)
2. **Propagación DNS incompleta** en algunos servidores DNS
3. **DNS del operador móvil** aún no actualizado

## Soluciones

### Solución 1: Limpiar Cache DNS en el Móvil (Recomendado)

#### Android:
1. Ve a **Configuración** → **Conexiones** → **WiFi**
2. Mantén presionado tu red WiFi → **Modificar red**
3. **Opciones avanzadas** → Cambia **IP** a **Estática** temporalmente
4. Guarda y vuelve a cambiar a **DHCP**
5. O simplemente: **Desconecta y reconecta WiFi**

#### iPhone/iOS:
1. Ve a **Configuración** → **WiFi**
2. Toca el (i) junto a tu red
3. **Renovar concesión DHCP**
4. O: **Activa/Desactiva WiFi** o **Modo Avión** por 10 segundos

### Solución 2: Cambiar DNS en el Móvil

#### Android:
1. **Configuración** → **Conexiones** → **WiFi**
2. Mantén presionado tu red → **Modificar red**
3. **Opciones avanzadas** → **IP** → **Estática**
4. **DNS 1:** `8.8.8.8` (Google)
5. **DNS 2:** `1.1.1.1` (Cloudflare)
6. Guarda

#### iPhone/iOS:
1. **Configuración** → **WiFi**
2. Toca el (i) junto a tu red
3. **Configurar DNS** → **Manual**
4. Agrega: `8.8.8.8` y `1.1.1.1`
5. Guarda

### Solución 3: Usar Datos Móviles

Si estás en WiFi, prueba con **datos móviles** (4G/5G) para verificar si es problema del WiFi/router.

### Solución 4: Esperar Propagación

La propagación DNS puede tardar:
- **Mínimo:** 5 minutos
- **Promedio:** 15-30 minutos  
- **Máximo:** 48 horas (raro)

## Verificación

### Desde Terminal:
```bash
# Verificar resolución
dig quilmescorrugados.com.ar A +short
nslookup quilmescorrugados.com.ar 8.8.8.8

# Verificar desde diferentes DNS
dig @8.8.8.8 quilmescorrugados.com.ar A +short
dig @1.1.1.1 quilmescorrugados.com.ar A +short
```

### Herramientas Online:
- **DNS Checker:** https://dnschecker.org/#A/quilmescorrugados.com.ar
- **WhatsMyDNS:** https://www.whatsmydns.net/#A/quilmescorrugados.com.ar

## Estado en Vercel

Verifica que el dominio esté correctamente configurado:

```bash
vercel domains inspect quilmescorrugados.com.ar
```

El dominio debe mostrar:
- ✅ Registro A configurado: `76.76.21.21`
- ✅ Verificación pendiente o completada

## Si el Problema Persiste

### Verificar en Cloudflare:
1. Ve a: https://dash.cloudflare.com
2. Selecciona el dominio `quilmescorrugados.com.ar`
3. **DNS** → Verifica que el registro A existe y apunta a `76.76.21.21`
4. Verifica que **Proxy** esté **desactivado** (nube gris, no naranja)

### Verificar en NIC Argentina:
Los dominios `.com.ar` están gestionados por NIC Argentina. Verifica que:
1. Los nameservers estén correctamente delegados a Cloudflare
2. No haya restricciones o problemas con el dominio

## Checklist de Verificación

- [ ] Registro A existe en Cloudflare: `quilmescorrugados.com.ar` → `76.76.21.21`
- [ ] Nameservers correctos: `meg.ns.cloudflare.com`, `seamus.ns.cloudflare.com`
- [ ] Proxy desactivado en Cloudflare (nube gris)
- [ ] Cache DNS limpiado en móvil
- [ ] Probado con datos móviles
- [ ] Esperado tiempo de propagación (15-30 min)

## Comandos Útiles

```bash
# Diagnóstico completo
./scripts/fix-dns-resolution.sh

# Verificar registros DNS
./scripts/verify-resend-dns.sh

# Ver estado en Vercel
vercel domains inspect quilmescorrugados.com.ar
```

## Contacto

Si el problema persiste después de 24 horas:
1. Verifica en NIC Argentina el estado del dominio
2. Contacta soporte de Cloudflare si hay problemas con nameservers
3. Verifica logs de Vercel para errores de deploy
