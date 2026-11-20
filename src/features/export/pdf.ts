import {
  ENCABEZADO,
  HOJAS,
  MARGEN,
  PIE,
  areaUtil,
  type Hoja,
  type Hojita,
  type Orientacion,
} from "./paginas";

/** Una página del PDF: el dibujo de `dibujarSvg` y, en cuadrícula, la parte que le toca. */
export interface PaginaPdf {
  svg: string;
  ancho: number;
  alto: number;
  /** Lo que va arriba, bajo el encabezado: «viene de la página M» o «fila F, columna C». */
  arriba?: string;
  recorte?: Hojita;
}

export interface OpcionesPdf {
  hoja: Hoja;
  orientacion: Orientacion;
  /** Lo que va en el encabezado de cada página. `logo`: una URL `data:image/...;base64`; va en el pie. */
  encabezado: { organizacion: string; alcance: string; fecha: string; logo: string | null };
  /** El pie, ya traducido, con `{n}` y `{m}`. Si falta: «Página {n} de {m}». */
  pagina?: string;
}

/** Un nodo de pdfmake, que no trae sus tipos. */
type Nodo = Record<string, unknown>;

/** Lo que se usa de la definición de un documento de pdfmake. */
export interface TDocumentDefinitions {
  pageSize: { width: number; height: number };
  pageMargins: [number, number, number, number];
  info: { title: string };
  defaultStyle: Nodo;
  content: Nodo[];
  header: (pagina: number, total: number) => Nodo;
  footer: (pagina: number, total: number) => Nodo;
}

const TENUE = "#737373";
// pdfmake solo lee PNG y JPG; otro logo no va en el pie.
const LOGO_PDF = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const CORTE = 6; // largo de cada marca de corte, en pt

/** El dibujo con la raíz cambiada para mostrar solo el rectángulo `r`: el visor recorta lo de afuera. */
const recortar = (svg: string, r: Hojita) =>
  svg.replace(/^<svg[^>]*>/, (raiz) =>
    raiz
      .replace(/ width="[^"]*"/, ` width="${r.ancho}"`)
      .replace(/ height="[^"]*"/, ` height="${r.alto}"`)
      .replace(/ viewBox="[^"]*"/, ` viewBox="${r.x} ${r.y} ${r.ancho} ${r.alto}"`),
  );

/** El dibujo entero con las hojas de la cuadrícula encima, cada una con su «fila·columna». */
function mapa(p: PaginaPdf, hojitas: Hojita[]): string {
  const trazo = Math.max(p.ancho, p.alto) / 400;
  const marcas = hojitas.map((h) => {
    const letra = Math.min(h.ancho, h.alto) / 5;
    return (
      `<rect x="${h.x}" y="${h.y}" width="${h.ancho}" height="${h.alto}" fill="none" stroke="#2563eb" stroke-width="${trazo}"/>` +
      `<text x="${h.x + h.ancho / 2}" y="${h.y + h.alto / 2 + letra / 3}" font-size="${letra}" text-anchor="middle" fill="#2563eb" fill-opacity="0.6">${h.fila}·${h.columna}</text>`
    );
  });
  return p.svg.replace(/<\/svg>$/, `${marcas.join("")}</svg>`);
}

/**
 * La definición del documento de pdfmake. Cada página lleva arriba la organización, el alcance, la fecha y su línea
 * `arriba`; abajo, el logo y «Página N de M». El dibujo se achica hasta caber en el área útil (nunca se agranda). Si
 * las páginas traen `recorte` (cuadrícula), la primera es el mapa y cada hoja lleva marcas de corte en las esquinas.
 * Los metadatos solo dicen «Organigrama»: ni personas ni la organización.
 */
export function documentoPdf(paginas: PaginaPdf[], o: OpcionesPdf): TDocumentDefinitions {
  const { ancho: w, alto: h } = HOJAS[o.hoja];
  const [anchoHoja, altoHoja] = o.orientacion === "vertical" ? [w, h] : [h, w];
  const area = areaUtil(o.hoja, o.orientacion);
  const arriba = MARGEN + ENCABEZADO;
  const hojitas = paginas.flatMap((p) => (p.recorte ? [p.recorte] : []));
  const conMapa = hojitas.length > 0;

  const cabe = (ancho: number, alto: number) => Math.min(1, area.ancho / ancho, area.alto / alto);
  // Todas las hojas con la escala de las enteras (la menor): una hoja más angosta, al final, no sale más grande.
  const escalaHojas = Math.min(...hojitas.map((r) => cabe(r.ancho, r.alto)));

  const dibujo = (svg: string, ancho: number, alto: number, e: number, corte: boolean): Nodo => {
    const nodo = { svg, width: ancho * e, height: alto * e };
    if (!corte) return { ...nodo, alignment: "center" };
    // Las marcas, en las esquinas del dibujo y hacia afuera, para cortar justo por el borde.
    const [x0, y0, x1, y1] = [MARGEN, arriba, MARGEN + ancho * e, arriba + alto * e];
    const lineas = [x0, x1].flatMap((x) =>
      [y0, y1].flatMap((y) => {
        const [dx, dy] = [x === x0 ? -1 : 1, y === y0 ? -1 : 1];
        return [
          { x1: x + dx * 2, y1: y, x2: x + dx * (2 + CORTE), y2: y },
          { x1: x, y1: y + dy * 2, x2: x, y2: y + dy * (2 + CORTE) },
        ];
      }),
    );
    const canvas = lineas.map((l) => ({ type: "line", ...l, lineWidth: 0.5, lineColor: "#000000" }));
    return { stack: [nodo, { canvas, absolutePosition: { x: 0, y: 0 } }] };
  };

  const p0 = paginas[0];
  const content = [
    ...(conMapa && p0 ? [dibujo(mapa(p0, hojitas), p0.ancho, p0.alto, cabe(p0.ancho, p0.alto), false)] : []),
    ...paginas.map(({ svg, ancho, alto, recorte: r }) =>
      r
        ? dibujo(recortar(svg, r), r.ancho, r.alto, escalaHojas, true)
        : dibujo(svg, ancho, alto, cabe(ancho, alto), false),
    ),
  ].map((n, i) => (i ? { ...n, pageBreak: "before" } : n));

  const { organizacion, alcance, fecha, logo } = o.encabezado;
  const plantilla = o.pagina ?? "Página {n} de {m}";
  return {
    pageSize: { width: anchoHoja, height: altoHoja },
    pageMargins: [MARGEN, arriba, MARGEN, MARGEN + PIE],
    info: { title: "Organigrama" },
    defaultStyle: { fontSize: 8, color: TENUE },
    content,
    header: (n) => ({
      margin: [MARGEN, MARGEN, MARGEN, 0],
      stack: [
        {
          columns: [
            { text: organizacion, bold: true, fontSize: 9, color: "#0a0a0a" },
            { text: `${alcance} · ${fecha}`, alignment: "right" },
          ],
        },
        { text: paginas[n - 1 - (conMapa ? 1 : 0)]?.arriba ?? "" },
      ],
    }),
    footer: (n, m) => ({
      margin: [MARGEN, 10, MARGEN, 0],
      columns: [
        logo && LOGO_PDF.test(logo) ? { image: logo, fit: [48, 12] } : { text: "" },
        { text: plantilla.replace("{n}", String(n)).replace("{m}", String(m)), alignment: "right" },
      ],
    }),
  };
}
