# 🔐 Validar Dominio en Resend

## Pasos para Validar `quilmescorrugados.com.ar` en Resend

### 1. Agregar Dominio en Resend Dashboard

1. Ve a: https://resend.com/domains
2. Click en **"Add Domain"**
3. Ingresa: `quilmescorrugados.com.ar`
4. Resend te mostrará los registros DNS que necesitas agregar

### 2. Registros DNS Requeridos

Resend requiere estos registros DNS:

#### **SPF Record** (TXT)
```
Tipo: TXT
Nombre: @ (o quilmescorrugados.com.ar)
Valor: v=spf1 include:resend.com ~all
TTL: Auto
```

#### **DKIM Records** (TXT)
Resend te dará 3 registros DKIM únicos, algo como:
```
Tipo: TXT
Nombre: resend._domainkey (o similar)
Valor: [valor único de Resend]
TTL: Auto
```

#### **DMARC Record** (Opcional pero recomendado)
```
Tipo: TXT
Nombre: _dmarc
Valor: v=DMARC1; p=none; rua=mailto:dmarc@quilmescorrugados.com.ar
TTL: Auto
```

### 3. Agregar Registros en Cloudflare

Una vez que tengas los valores de Resend, agrégalos en Cloudflare.

---

## 🚀 Script Automatizado

He creado un script que te ayuda a agregar los registros automáticamente.

**Uso:**
```bash
export CLOUDFLARE_API_TOKEN='tu-token'
export RESEND_DOMAIN_KEY='valor-dkim-de-resend'
./scripts/add-resend-dns.sh
```

---

## 📋 Checklist de Validación

- [ ] Dominio agregado en Resend dashboard
- [ ] SPF record agregado en Cloudflare
- [ ] DKIM records agregados (3 registros)
- [ ] DMARC record agregado (opcional)
- [ ] Esperar propagación DNS (5-30 minutos)
- [ ] Verificar en Resend dashboard que el dominio está verificado
- [ ] Probar envío de email

---

## 🔍 Verificar Estado

### En Resend Dashboard:
- Ve a: https://resend.com/domains
- Click en tu dominio
- Verás el estado de cada registro DNS

### Verificar DNS desde terminal:
```bash
# Verificar SPF
dig TXT quilmescorrugados.com.ar | grep spf

# Verificar DKIM
dig TXT resend._domainkey.quilmescorrugados.com.ar

# Verificar DMARC
dig TXT _dmarc.quilmescorrugados.com.ar
```

---

## ⚠️ Notas Importantes

1. **Propagación DNS:** Puede tardar hasta 48 horas, pero generalmente es 5-30 minutos
2. **Emails existentes:** Los emails enviados antes de validar pueden ir a spam
3. **Subdominios:** Si usas `notificaciones@` o `cotizaciones@`, el dominio raíz debe estar validado
4. **Verificación:** Resend verificará automáticamente cuando los registros estén correctos

---

## 🐛 Troubleshooting

### Dominio no se verifica

**Causas:**
- Registros DNS incorrectos
- Propagación DNS incompleta
- Valores copiados incorrectamente

**Solución:**
1. Verifica que los valores estén exactamente como Resend los muestra
2. Espera más tiempo para propagación
3. Usa `dig` o herramientas online para verificar los registros

### Emails van a spam

**Causas:**
- Dominio no verificado
- SPF/DKIM no configurados
- Reputación del dominio

**Solución:**
- Completa la validación del dominio
- Configura DMARC
- Espera a que mejore la reputación

---

## 📚 Recursos

- **Resend Domains:** https://resend.com/domains
- **Resend Docs:** https://resend.com/docs/dashboard/domains/introduction
- **Cloudflare DNS:** https://dash.cloudflare.com
