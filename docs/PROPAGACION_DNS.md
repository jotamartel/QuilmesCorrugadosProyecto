# ⏱️ Propagación DNS - Estado y Soluciones

## Estado Actual

Según DNS Checker, la mayoría de los servidores DNS muestran **"Not Resolved"** para `quilmescorrugados.com.ar`.

**Esto es NORMAL** después de hacer cambios DNS. La propagación puede tardar:

- **Mínimo:** 5-15 minutos
- **Promedio:** 30 minutos - 2 horas
- **Máximo:** 24-48 horas (raro)

## ✅ Lo que está Correcto

1. **Registro A configurado:** `quilmescorrugados.com.ar` → `76.76.21.21`
2. **Nameservers correctos:** Cloudflare (`meg.ns.cloudflare.com`, `seamus.ns.cloudflare.com`)
3. **Algunos DNS ya resuelven:** Google DNS (Mountain View) muestra `76.76.21.21`
4. **Cloudflare nameservers resuelven correctamente**

## 🔍 Verificación

### Desde los Nameservers de Cloudflare (deberían resolver siempre):
```bash
dig @meg.ns.cloudflare.com quilmescorrugados.com.ar A +short
# Debe mostrar: 76.76.21.21

dig @seamus.ns.cloudflare.com quilmescorrugados.com.ar A +short
# Debe mostrar: 76.76.21.21
```

### Desde DNS públicos (pueden tardar en propagar):
```bash
dig @8.8.8.8 quilmescorrugados.com.ar A +short      # Google DNS
dig @1.1.1.1 quilmescorrugados.com.ar A +short    # Cloudflare DNS
dig @9.9.9.9 quilmescorrugados.com.ar A +short    # Quad9
```

## 🚀 Acelerar Propagación

### 1. Verificar TTL del Registro

El registro tiene **TTL: 1** (auto), lo cual es bueno para cambios rápidos. Sin embargo, algunos DNS pueden tener cache más largo.

### 2. Forzar Actualización en Cloudflare

A veces ayuda "tocar" el registro para forzar actualización:

```bash
# El script fix-dns-resolution.sh ya verifica y actualiza si es necesario
./scripts/fix-dns-resolution.sh
```

### 3. Verificar que el Registro esté Correcto

Asegúrate de que:
- ✅ Tipo: **A** (no CNAME)
- ✅ Nombre: `@` o `quilmescorrugados.com.ar`
- ✅ Contenido: `76.76.21.21`
- ✅ Proxy: **Desactivado** (nube gris, no naranja)
- ✅ TTL: `1` (auto) o `300` (5 minutos)

## ⚠️ Posibles Problemas

### Si después de 2 horas aún no propaga:

1. **Verificar en NIC Argentina:**
   - Los dominios `.com.ar` están gestionados por NIC Argentina
   - Verifica que los nameservers estén correctamente delegados
   - Puede haber un delay en la delegación

2. **Verificar Nameservers en el Registrador:**
   - Asegúrate de que en tu registrador (donde compraste el dominio)
   - Los nameservers estén configurados como:
     - `meg.ns.cloudflare.com`
     - `seamus.ns.cloudflare.com`

3. **Cache DNS persistente:**
   - Algunos ISPs tienen cache muy agresivo
   - Puede tardar hasta 48 horas en algunos casos extremos

## 📊 Monitoreo

### Herramientas Online:
- **DNS Checker:** https://dnschecker.org/#A/quilmescorrugados.com.ar
- **WhatsMyDNS:** https://www.whatsmydns.net/#A/quilmescorrugados.com.ar
- **DNSPerf:** https://www.dnsperf.com/

### Script Local:
```bash
./scripts/fix-dns-resolution.sh
```

## 🎯 Qué Esperar

### Timeline Típico:

**0-15 minutos:**
- Nameservers de Cloudflare resuelven ✅
- Algunos DNS públicos empiezan a resolver ✅

**15-60 minutos:**
- Mayoría de DNS públicos resuelven ✅
- Algunos ISPs aún pueden tener cache ❌

**1-24 horas:**
- Prácticamente todos los DNS públicos resuelven ✅
- Algunos ISPs con cache agresivo pueden tardar más ⏳

**24-48 horas:**
- 100% de propagación ✅

## 💡 Soluciones Temporales

Mientras esperas la propagación completa:

### Para Testing:
1. Usa los nameservers de Cloudflare directamente:
   ```bash
   dig @meg.ns.cloudflare.com quilmescorrugados.com.ar
   ```

2. Cambia DNS en tu dispositivo a Cloudflare (`1.1.1.1`) o Google (`8.8.8.8`)

3. Usa `www.quilmescorrugados.com.ar` que tiene CNAME a Vercel y puede resolver más rápido

### Para Producción:
- El sitio funcionará para usuarios cuyos DNS ya hayan propagado
- Los demás verán el error hasta que su DNS se actualice
- Esto es normal y se resolverá automáticamente

## 🔧 Comandos Útiles

```bash
# Verificar registro en Cloudflare
curl -X GET "https://api.cloudflare.com/client/v4/zones/36438015dff267e666cbd4beeaeafef5/dns_records?type=A&name=quilmescorrugados.com.ar" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"

# Verificar desde diferentes DNS
dig @8.8.8.8 quilmescorrugados.com.ar A +short
dig @1.1.1.1 quilmescorrugados.com.ar A +short
dig @9.9.9.9 quilmescorrugados.com.ar A +short

# Verificar nameservers
dig NS quilmescorrugados.com.ar +short
```

## ✅ Checklist

- [x] Registro A configurado correctamente
- [x] Nameservers correctos en Cloudflare
- [ ] Verificar nameservers en NIC Argentina/Registrador
- [ ] Esperar propagación (15 minutos - 2 horas típico)
- [ ] Monitorear con DNS Checker
- [ ] Verificar que usuarios puedan acceder

## 📞 Si el Problema Persiste

Si después de 24 horas aún hay problemas:

1. **Verifica en NIC Argentina:**
   - Que los nameservers estén delegados correctamente
   - Que no haya restricciones en el dominio

2. **Contacta Cloudflare:**
   - Si los nameservers no resuelven correctamente

3. **Verifica Vercel:**
   - Que el dominio esté correctamente agregado
   - Que la verificación esté completa
