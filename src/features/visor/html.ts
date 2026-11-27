import type { DatosVisor } from "./datos";
import { ESTILOS } from "./programa/estilos";

const ESCAPES_HTML: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const html = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES_HTML[c]);
// En el bloque de datos nada puede cerrar el <script> ni abrir un comentario: se escapa con \u (JSON lo lee igual).
const json = (d: DatosVisor) =>
  JSON.stringify(d).replace(new RegExp("[<>&\\u2028\\u2029]", "g"), (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);

async function huella(texto: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto)));
  return `'sha256-${btoa(String.fromCharCode(...h))}'`;
}

/** El archivo del visor: una sola página, con los datos, el programa y los estilos adentro, y una CSP que solo les da paso a ellos. */
export async function armarHtml(d: DatosVisor, programa: string): Promise<string> {
  if (/<\/script|<!--/i.test(programa))
    throw new Error("El programa del visor no puede cerrar el script ni abrir un comentario");
  const csp = [
    "default-src 'none'",
    `script-src ${await huella(programa)}`,
    `style-src ${await huella(ESTILOS)}`,
    "img-src data:",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  const { organizacion, alcance } = d.encabezado;
  return `<!doctype html>
<html lang="${d.idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>${html(`${organizacion} - ${alcance}`)}</title>
<style>${ESTILOS}</style>
</head>
<body>
<noscript>${html(d.textos["visor.sinJavascript"] ?? "")}</noscript>
<main data-visor="dibujo"></main>
<script type="application/json" id="datos-visor">${json(d)}</script>
<script>${programa}</script>
</body>
</html>
`;
}

/** Los datos de un archivo ya armado (para las pruebas y el arnés). */
export function leerDatos(archivo: string): DatosVisor {
  const m = /<script type="application\/json" id="datos-visor">([\s\S]*?)<\/script>/.exec(archivo);
  if (!m) throw new Error("El archivo no trae el bloque de datos del visor");
  return JSON.parse(m[1]);
}
