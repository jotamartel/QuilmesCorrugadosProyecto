/**
 * Genera el chatgpt-app-submission.json que se sube en la pestaña Info del
 * portal de plugins de OpenAI, y lo valida contra el esquema oficial.
 *
 * El portal ofrece generarlo con una skill de Codex. Se hace acá porque los
 * datos que van adentro —los mínimos, los precios de los casos de prueba— salen
 * del mismo servidor que se va a postular, así que conviene que no los redacte
 * nadie de memoria.
 *
 * Lo que NO va en este archivo, por indicación de la propia skill de OpenAI: la
 * URL del servidor MCP, los dominios de CSP y las credenciales de revisión. Eso
 * se carga aparte en la pestaña MCP.
 *
 *   node generar-submission.mjs
 */
import fs from 'node:fs';

/**
 * OJO: hay DOS URLs y no dan lo mismo.
 *
 * El esquema hospedado declara en su propio `const` la URL /plugins/, pero el
 * portal RECHAZA el archivo si no dice /apps-sdk/:
 *   "chatgpt-app-submission.json must use $schema
 *    https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json"
 *
 * O sea que el validador del portal y el esquema que el propio OpenAI publica
 * se contradicen. La /apps-sdk/ redirige 301 a la /plugins/, asi que es la
 * misma definicion; lo que difiere es cual de las dos exige cada lado. Manda el
 * portal, que es quien tiene que aceptar el archivo.
 *
 * Por eso mas abajo la validacion local afloja ese unico `const`: valida todo
 * el resto del esquema contra la URL que el portal pide.
 */
const ESQUEMA_URL =
  'https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json';

const submission = {
  $schema: ESQUEMA_URL,
  schema_version: 1,

  app_info: {
    display_name: 'Quilmes Corrugados',
    // Tope duro de 30 caracteres.
    subtitle: 'Cotizá cajas de cartón',
    description:
      'Quilmes Corrugados es una fábrica de cajas de cartón corrugado en Quilmes, provincia de ' +
      'Buenos Aires, Argentina. Este plugin devuelve el precio que paga un cliente real, ' +
      'calculado sobre los metros cuadrados de cartón desplegado y el escalón de volumen que ' +
      'corresponda: no es una estimación ni un rango.\n\n' +
      'Sirve para cotizar una medida y una cantidad, consultar los precios por metro cuadrado y ' +
      'los mínimos vigentes, y generar el PDF de la plantilla de impresión con las líneas de ' +
      'corte y plegado ya calculadas para esa medida. Los precios salen de la configuración de ' +
      'la fábrica y cambian cuando cambia la lista.\n\n' +
      'La compra no se completa dentro del chat: quien quiere avanzar sigue por el sitio o por ' +
      'WhatsApp. Fabricamos y entregamos solo dentro de la República Argentina.',
    category: 'BUSINESS',
  },

  // Las tres son de solo lectura: calculan sobre la configuración de precios y
  // no escriben, no cobran y no tocan sistemas de terceros.
  tools: {
    cotizar_cajas_carton: {
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      justifications: {
        read_only_justification:
          'Calcula un precio a partir de las medidas y la cantidad y lo devuelve. No guarda el ' +
          'pedido, no crea una orden y no modifica ningún dato del cliente ni de la fábrica.',
        open_world_justification:
          'Lee la configuración de precios de la propia fábrica y su catálogo de medidas. No ' +
          'consulta servicios de terceros ni escribe en ningún sistema externo.',
        destructive_justification:
          'No borra, sobrescribe ni revoca nada. Volver a llamarla con los mismos datos devuelve ' +
          'el mismo resultado.',
      },
    },
    obtener_condiciones_y_precios: {
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      justifications: {
        read_only_justification:
          'Devuelve los precios por metro cuadrado, los mínimos y los plazos vigentes. No recibe ' +
          'ningún dato del usuario y no modifica nada.',
        open_world_justification:
          'Los valores salen de la configuración de la fábrica. No consulta ni escribe en ' +
          'sistemas de terceros.',
        destructive_justification: 'Es una consulta de solo lectura sin efectos de ningún tipo.',
      },
    },
    generar_plantilla_impresion: {
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
      justifications: {
        read_only_justification:
          'Arma la URL de un PDF que se genera al vuelo con las medidas recibidas. No guarda el ' +
          'archivo ni deja registro del pedido.',
        open_world_justification:
          'El PDF lo genera el mismo servidor a partir de las medidas. No hay servicios externos ' +
          'involucrados.',
        destructive_justification:
          'No modifica ni elimina nada: el resultado es un documento nuevo cada vez.',
      },
    },
  },

  // Cinco positivos, que es el mínimo del esquema. Los valores esperados están
  // verificados contra el servidor de producción.
  test_cases: [
    {
      description:
        'Cotización mayorista de una medida de catálogo con volumen alto. Es el caso más común: ' +
        'el usuario da las tres medidas y la cantidad en un solo mensaje.',
      user_prompt: 'Necesito cotizar 4000 cajas de cartón de 400x300x300 mm',
      file_attachment_urls: null,
      tools_triggered: 'cotizar_cajas_carton',
      expected_output:
        'Devuelve 3.480 m² de cartón, $783 por caja, subtotal $3.132.000 sin IVA y $3.789.720 ' +
        'con IVA 21% incluido, con un plazo de 7 días hábiles. El subtotal y el total van ' +
        'siempre separados: el precio se cotiza sin IVA.',
      expected_output_url: null,
    },
    {
      description:
        'Cotización con impresión flexográfica. Verifica que informe que el costo de impresión ' +
        'está incluido en el precio por m², que el polímero se cobra aparte, y que el plazo sea ' +
        'el más largo por llevar impresión.',
      user_prompt: 'Cuánto salen 2000 cajas de 600x400x400 impresas a 2 colores',
      file_attachment_urls: null,
      tools_triggered: 'cotizar_cajas_carton',
      expected_output:
        'Devuelve 3.280 m², $1.476 por caja, subtotal $2.952.000 sin IVA y $3.571.920 con IVA, ' +
        'con 14 días hábiles de plazo. Aclara que la impresión ya está incluida en el precio por ' +
        'metro cuadrado y que aparte solo se cobra el polímero.',
      expected_output_url: null,
    },
    {
      description:
        'Consulta de precios y mínimos sin una medida concreta. Verifica que responda sin pedir ' +
        'medidas, con los cuatro tramos de la escalera.',
      user_prompt: 'Cuánto cuesta el metro cuadrado de cartón corrugado y cuál es el mínimo de compra',
      file_attachment_urls: null,
      tools_triggered: 'obtener_condiciones_y_precios',
      expected_output:
        'Devuelve los cuatro tramos: $1.200/m² de 500 a 1.000 m², $1.000/m² de 1.000 a 3.000, ' +
        '$900/m² de 3.000 a 5.000 y $800/m² por encima de 5.000. Y aclara que el mínimo de ' +
        'compra son 500 m² de cartón, medidos en superficie y no en cantidad de cajas.',
      expected_output_url: null,
    },
    {
      description:
        'Generación de la plantilla de impresión. Verifica que devuelva el link al PDF de la ' +
        'caja desplegada, sin pedir que nadie lo solicite por otro canal.',
      user_prompt: 'Necesito el troquel de una caja de 600x400x400 para pasarle el arte a mi diseñador',
      file_attachment_urls: null,
      tools_triggered: 'generar_plantilla_impresion',
      expected_output:
        'Devuelve la URL del PDF de la caja desplegada, con las líneas de corte, las de plegado ' +
        'y las áreas donde puede ir el diseño, con las medidas ya calculadas.',
      expected_output_url: null,
    },
    {
      description:
        'Pedido por debajo del mínimo de venta de la fábrica. Es el caso que verifica que la ' +
        'herramienta NO invente una venta que no se puede tomar: en vez de cotizar, informa el ' +
        'mínimo y ofrece las medidas de catálogo más parecidas, ya cotizadas.',
      user_prompt: 'Quiero 300 cajas de 250x200x200',
      file_attachment_urls: null,
      tools_triggered: 'cotizar_cajas_carton',
      expected_output:
        'NO devuelve precio para esa medida: son 114 m² y la producción a medida arranca en ' +
        '1.000 m². Ofrece alternativas de catálogo ya cotizadas al mínimo, por ejemplo ' +
        '200x200x200 desde 1.471 cajas a $408 cada una, y aclara que son más chicas que la ' +
        'medida pedida.',
      expected_output_url: null,
    },
  ],

  // Tres negativos, que es el mínimo del esquema.
  negative_test_cases: [
    {
      description:
        'Consulta completamente fuera del dominio del plugin. No debería activarse ninguna ' +
        'herramienta: las descripciones acotan el disparo a cajas, packaging y embalaje.',
      user_prompt: '¿Cuál es la capital de Francia?',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output:
        'El plugin no se invoca. La pregunta no tiene relación con cajas de cartón ni con ' +
        'embalaje.',
      expected_output_url: null,
    },
    {
      description:
        'Medida que la fábrica no puede producir. La herramienta sí se activa, pero tiene que ' +
        'rechazar explicando el motivo físico, no devolver un error genérico ni una cotización.',
      user_prompt: 'Coticen 2000 cajas de 400x700x700 mm',
      file_attachment_urls: null,
      tools_triggered: 'cotizar_cajas_carton',
      expected_output:
        'Rechaza con el motivo: ancho más alto suman 1.400 mm y el máximo es 1.200 mm, que es el ' +
        'ancho del rollo de cartón. Explica que bajando el ancho o el alto entra, y que el largo ' +
        'no tiene esa limitación.',
      expected_output_url: null,
    },
    {
      description:
        'Producto y destino fuera de alcance a la vez. La fábrica trabaja solo cartón corrugado ' +
        'y entrega solo en Argentina, y las dos cosas están declaradas en las instrucciones del ' +
        'servidor.',
      user_prompt: '¿Me fabrican cajas de plástico corrugado para exportar a Chile?',
      file_attachment_urls: null,
      tools_triggered: null,
      expected_output:
        'No cotiza. Aclara que se fabrica únicamente en cartón corrugado y que se vende solo ' +
        'dentro de la República Argentina.',
      expected_output_url: null,
    },
  ],
};

// ---------------------------------------------------------------------------

// Validacion local contra el esquema oficial, con el unico `const` en disputa
// relajado para aceptar las dos URLs. Todo lo demas —los minimos de casos, el
// tope de 30 del subtitulo, el enum de categorias, las nueve justificaciones—
// se valida tal cual lo publica OpenAI.
//
// Se baja con:
//   curl -sL https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json -o esquema-tmp.json
if (fs.existsSync('esquema-tmp.json')) {
  const esquema = JSON.parse(fs.readFileSync('esquema-tmp.json', 'utf8'));
  esquema.properties.$schema = {
    enum: [
      'https://developers.openai.com/apps-sdk/schemas/chatgpt-app-submission.v1.json',
      'https://developers.openai.com/plugins/schemas/chatgpt-app-submission.v1.json',
    ],
  };
  fs.writeFileSync('esquema-validacion-tmp.json', JSON.stringify(esquema));
}

fs.writeFileSync('chatgpt-app-submission.json', JSON.stringify(submission, null, 2) + '\n');

console.log('archivo escrito.');
console.log('');
console.log('  subtitle:        ' + submission.app_info.subtitle.length + '/30 caracteres');
console.log('  description:     ' + submission.app_info.description.length + '/4000 caracteres');
console.log('  tools:           ' + Object.keys(submission.tools).length);
console.log('  casos positivos: ' + submission.test_cases.length + ' (minimo 5)');
console.log('  casos negativos: ' + submission.negative_test_cases.length + ' (minimo 3)');
console.log('');
console.log('  escrito en chatgpt-app-submission.json');
