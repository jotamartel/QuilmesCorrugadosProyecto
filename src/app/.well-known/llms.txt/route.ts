/**
 * /.well-known/llms.txt — el mismo contenido que /llms.txt.
 *
 * Antes esto era un archivo estatico en public/ que hacia de puntero: decia
 * "la version canonica esta en la raiz" y daba la direccion. Como era estatico
 * nunca se actualizo, asi que apuntaba al dominio viejo de Vercel y traia el
 * telefono anterior. Todo asistente que leia la convencion .well-known se
 * llevaba las dos cosas mal, y de paso Google seguia viendo enlaces a
 * quilmes-corrugados.vercel.app desde nuestro propio sitio.
 *
 * Se reexporta el handler en vez de duplicar contenido: no hay dos versiones
 * que se puedan separar, porque es literalmente la misma funcion.
 */
export { GET } from '../../llms.txt/route';
