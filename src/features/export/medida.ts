// Ancho del texto sin el DOM (el dibujo es puro y se prueba en node): una estimación fija por letra, algo generosa
// para que el texto no se salga de la tarjeta con la letra de Windows.
const ANGOSTAS = new Set("iljtfrI.,:;'|!()[] ");
const ANCHAS = new Set("mwMW@%");

// Letras de ancho completo (chino, japonés, coreano) y emojis: ocupan un cuadrado entero.
const completa = (cp: number) =>
  (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2600 && cp <= 0x27bf) || cp >= 0x2e80;

/** Ancho aproximado, en px, de `texto` con letra de `tam` px. */
export function anchoTexto(texto: string, tam: number, negrita = false): number {
  let em = 0;
  for (const c of texto)
    em += completa(c.codePointAt(0)!)
      ? 1
      : ANGOSTAS.has(c)
        ? 0.32
        : ANCHAS.has(c)
          ? 0.9
          : c !== c.toLowerCase() || /\d/.test(c)
            ? 0.68
            : 0.56;
  return em * tam * (negrita ? 1.08 : 1);
}

/** `texto` tal cual si cabe en `ancho`; si no, recortado con «…». */
export function recortar(texto: string, ancho: number, tam: number, negrita = false): string {
  if (anchoTexto(texto, tam, negrita) <= ancho) return texto;
  const letras = [...texto];
  while (letras.length && anchoTexto(`${letras.join("")}…`, tam, negrita) > ancho) letras.pop();
  return `${letras.join("").trimEnd()}…`;
}

/** `texto` en hasta `maxLineas` líneas de `ancho`, cortando entre palabras; la última lleva «…» si sobra texto. */
export function partir(
  texto: string,
  ancho: number,
  tam: number,
  maxLineas: number,
  negrita = false,
): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const junto = actual ? `${actual} ${palabra}` : palabra;
    // En la última línea se junta todo: recortar le pone «…».
    if (!actual || lineas.length === maxLineas - 1 || anchoTexto(junto, tam, negrita) <= ancho)
      actual = junto;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.map((l) => recortar(l, ancho, tam, negrita));
}
