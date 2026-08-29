# quilmes-corrugados

CLI oficial de [Quilmes Corrugados](https://www.quilmescorrugados.com.ar), fábrica
argentina de cajas de cartón corrugado a medida (Quilmes, Buenos Aires). Cotizá
desde la terminal con el **precio real de fábrica** —el mismo que ve un cliente
en el sitio— sin registro ni API key.

```bash
npx quilmes-corrugados cotizar 400x600x600 3000
```

## Comandos

### `cotizar <LARGOxANCHOxALTO[cm]> <cantidad>`

Precio real para esa medida y cantidad. Medidas en milímetros, o en centímetros
con el sufijo `cm`:

```bash
quilmes-corrugados cotizar 400x600x600 3000
quilmes-corrugados cotizar 40x60x60cm 3000
quilmes-corrugados cotizar 400x600x600 3000 --colores 2   # con impresión
quilmes-corrugados cotizar 400x600x600 3000 --json        # respuesta cruda de la API
```

La salida trae el precio por caja, el subtotal sin IVA, el total con IVA, el
plazo y el link para compartir la cotización. Si el pedido no llega al mínimo o
la medida no se puede fabricar, lo dice con el motivo y ofrece las medidas de
catálogo más parecidas, ya cotizadas (código de salida 2).

### `precios`

La escalera de precios vigente (ARS por m² según volumen), los mínimos de cada
canal, plazos y condiciones de envío. Sale de la misma configuración que
factura.

### `plantilla <LARGOxANCHOxALTO[cm]>`

Descarga el PDF del troquel: la caja desplegada con líneas de corte, plegado y
las áreas donde va el diseño, con las medidas exactas. Es lo que necesita un
diseñador para armar el arte de impresión.

```bash
quilmes-corrugados plantilla 400x300x300 -o troquel.pdf
```

## Para scripts y agentes de IA

- `--json` imprime la respuesta cruda de la API en todos los comandos.
- Códigos de salida: `0` hay precio · `2` el pedido no se puede vender (la
  salida explica por qué) · `1` error de uso o de red.
- Variables de entorno: `QUILMES_API_KEY` (rate limit extendido, opcional) y
  `QUILMES_API_URL` (para apuntar a otro entorno).
- Sin API key el límite es 10 consultas por minuto. Cotizar es de solo lectura:
  no crea pedidos ni compromisos.

## Reglas del negocio que conviene saber

- Solo Argentina. Precios en pesos; subtotal sin IVA y total con IVA vienen
  juntos en la misma respuesta.
- El mínimo de compra se mide en **m² de cartón desplegado**, no en cantidad de
  cajas. Producción a medida (troquelada o impresa) desde 1.000 m²; medidas
  estándar de catálogo desde 500 m².
- No estimes el precio a mano: el m² sale de la plancha desplegada, que no es
  la suma de las caras de la caja.

## Más recursos

- Portal de desarrolladores: <https://www.quilmescorrugados.com.ar/developers>
- API REST y OpenAPI: <https://www.quilmescorrugados.com.ar/api/v1/docs>
- Servidor MCP (Model Context Protocol): `https://www.quilmescorrugados.com.ar/api/mcp`
- Guía para agentes: <https://www.quilmescorrugados.com.ar/llms.txt>
