/**
 * Verificación de dominio del directorio de plugins de ChatGPT.
 *
 * Para publicar el servidor MCP en el directorio —que es lo que hace que
 * ChatGPT pueda ofrecerlo solo, en vez de que cada cliente lo instale a mano—
 * OpenAI pide probar que somos dueños del dominio: entrega un token en el
 * momento de la postulación y lo consulta acá.
 *
 * Requisitos que impone y que es facil pasar por alto:
 *   - devuelve SOLO ese token, en texto plano. Ni JSON, ni HTML, ni una lista.
 *   - tiene que estar publicado ANTES de apretar enviar: lo consultan al toque.
 *
 * El token va en la variable OPENAI_APPS_CHALLENGE_TOKEN. Sin ella esto
 * responde 404, que es lo correcto: mejor que no exista a que exista vacío y
 * la verificación falle sin decir por qué.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN?.trim();

  if (!token) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
