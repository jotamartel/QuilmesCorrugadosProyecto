# 🔧 Configurar Delegaciones DNS en NIC Argentina

## Problema Identificado

El dominio `quilmescorrugados.com.ar` muestra "No tenés delegaciones" en el panel de NIC Argentina, lo que causa el error `DNS_PROBE_FINISHED_NXDOMAIN`.

## Solución: Agregar Delegaciones

### Opción 1: Autodelegar (Recomendado)

1. En el panel de NIC Argentina, haz clic en **"+ Autodelegar"**
2. Esto configurará automáticamente los nameservers de Cloudflare

### Opción 2: Agregar Delegación Manual

1. Haz clic en **"+ Agregar una nueva delegación"**

2. Configura los siguientes nameservers de Cloudflare:

   **Delegación 1:**
   - **Host:** `meg.ns.cloudflare.com`
   - **IPv4:** (dejar vacío o usar la IP si NIC lo requiere)
   - **IPv6:** (opcional, dejar vacío)

   **Delegación 2:**
   - **Host:** `seamus.ns.cloudflare.com`
   - **IPv4:** (dejar vacío o usar la IP si NIC lo requiere)
   - **IPv6:** (opcional, dejar vacío)

3. Haz clic en **"EJECUTAR CAMBIOS"**

## Verificación

Después de configurar las delegaciones:

1. **Espera 15-30 minutos** para la propagación inicial
2. **Verifica la propagación:**
   ```bash
   dig NS quilmescorrugados.com.ar +short
   ```
   
   Deberías ver:
   ```
   meg.ns.cloudflare.com.
   seamus.ns.cloudflare.com.
   ```

3. **Verifica la resolución del dominio:**
   ```bash
   dig quilmescorrugados.com.ar A +short
   ```
   
   Deberías ver:
   ```
   76.76.21.21
   ```

4. **Verifica en herramientas online:**
   - https://dnschecker.org/#A/quilmescorrugados.com.ar
   - https://www.whatsmydns.net/#A/quilmescorrugados.com.ar

## Tiempo de Propagación

- **Mínimo:** 15 minutos
- **Típico:** 1-2 horas
- **Máximo:** 48 horas

## Después de Configurar

Una vez que el DNS esté funcionando:

1. El dominio `quilmescorrugados.com.ar` será accesible
2. OAuth funcionará correctamente desde producción
3. Los logs mostrarán:
   ```
   [Auth Debug] Redirect URL: https://quilmescorrugados.com.ar/auth/callback
   [Auth Debug] Hostname: quilmescorrugados.com.ar
   ```

## Notas Importantes

- **No elimines** las delegaciones existentes si las hay
- **Verifica** que los nameservers sean exactamente:
  - `meg.ns.cloudflare.com`
  - `seamus.ns.cloudflare.com`
- **Espera** la propagación antes de probar OAuth desde el dominio personalizado

## Troubleshooting

### Si después de 2 horas aún no funciona:

1. Verifica en Cloudflare que la zona esté activa
2. Verifica que los nameservers en Cloudflare sean correctos
3. Contacta soporte de NIC Argentina si el problema persiste

### Si necesitas IPs de los nameservers:

```bash
dig meg.ns.cloudflare.com A +short
dig seamus.ns.cloudflare.com A +short
```

Pero normalmente NIC Argentina solo requiere los nombres de los nameservers, no las IPs.
