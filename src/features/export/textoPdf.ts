// Solo para las pruebas: lee el texto de un PDF hecho con `compress: false`.

/** Los mapas ToUnicode de cada fuente: el número de cada glifo → su letra. */
function mapas(s: string): Map<number, string>[] {
  return [...s.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)].map(([, rangos]) => {
    const m = new Map<number, string>();
    for (const [, desde, letras] of rangos!.matchAll(/<([0-9a-f]+)> <[0-9a-f]+> \[([^\]]*)\]/g))
      // Una ligadura trae varias letras: «fi» es <0066 0069>.
      [...letras!.matchAll(/<([0-9a-f ]+)>/g)].forEach(([, u], i) =>
        m.set(parseInt(desde!, 16) + i, String.fromCharCode(...u!.split(" ").map((x) => parseInt(x, 16)))),
      );
    return m;
  });
}

function leer(s: string, m: Map<number, string>[]): string {
  const lineas = s
    .split("\n")
    .filter((l) => /T[Jj]$/.test(l))
    .map((l) => [...l.matchAll(/<([0-9a-f]+)>/g)].map(([, h]) => h).join(""));
  return m
    .flatMap((mapa) =>
      lineas.map((h) => (h.match(/.{4}/g) ?? []).map((g) => mapa.get(parseInt(g, 16)) ?? "?").join("")),
    )
    .join("\n");
}

/**
 * El texto que se ve en el PDF. pdfkit escribe cada letra como el número de su glifo en la fuente; el mapa ToUnicode de
 * cada fuente dice qué letra es. Sin saber qué fuente usa cada línea, se lee con todos los mapas: sobra, pero no falta.
 * pdfmake escribe cada palabra aparte.
 */
export function textoDelPdf(pdf: Uint8Array): string {
  const s = new TextDecoder("latin1").decode(pdf);
  return leer(s, mapas(s));
}

/** El texto de cada página, en orden: el flujo de contenido de cada una, leído como `textoDelPdf`. */
export function textoPorPagina(pdf: Uint8Array): string[] {
  const s = new TextDecoder("latin1").decode(pdf);
  const m = mapas(s);
  return [...s.matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map(([, flujo]) => flujo!)
    .filter((f) => /^BT$/m.test(f))
    .map((f) => leer(f, m));
}
