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
import { anchoTexto, recortar as recortarTexto } from "./medida";

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
  /** El pie, ya traducido, con `{n}` y `{m}`: «Página {n} de {m}». */
  pagina: string;
  /** El título de los metadatos, ya traducido: «Organigrama». Lo único que dicen, con la fecha que pone pdfkit. */
  titulo: string;
  /** En cuadrícula, el dibujo entero para el mapa: cada hoja puede traer solo su parte. */
  mapa?: { svg: string; ancho: number; alto: number };
}

/** Lo común a todo PDF: la hoja, el encabezado, el pie y los metadatos. */
export type OpcionesMarco = Omit<OpcionesPdf, "mapa">;

/** Un nodo de pdfmake, que no trae sus tipos. */
export type Nodo = Record<string, unknown>;

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

export const TENUE = "#737373";
// pdfmake solo lee PNG y JPG; otro logo no va.
export const LOGO_PDF = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/;
const CORTE = 6; // largo de cada marca de corte, en pt

/**
 * El dibujo entero con las hojas de la cuadrícula encima, cada una con su «fila·columna»: la primera página del PDF en
 * cuadrícula, y su vista previa.
 */
export function mapa(p: { svg: string; ancho: number; alto: number }, hojitas: Hojita[]): string {
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
 * las páginas traen `recorte` (cuadrícula), la primera es el mapa y cada hoja lleva marcas de corte en las esquinas; su
 * dibujo ya viene recortado (`dibujarSvg` con `recorte`).
 * Los metadatos solo llevan `o.titulo`: ni personas ni la organización. En cuadrícula, `o.mapa` es obligatorio.
 */
export function documentoPdf(paginas: PaginaPdf[], o: OpcionesPdf): TDocumentDefinitions {
  const area = areaUtil(o.hoja, o.orientacion);
  const arriba = MARGEN + ENCABEZADO;
  const hojitas = paginas.flatMap((p) => (p.recorte ? [p.recorte] : []));
  const conMapa = hojitas.length > 0;
  if (conMapa && !o.mapa) throw new Error("En cuadrícula falta el dibujo entero para el mapa (o.mapa).");

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

  const entero = conMapa ? o.mapa : undefined;
  const content = [
    ...(entero
      ? [dibujo(mapa(entero, hojitas), entero.ancho, entero.alto, cabe(entero.ancho, entero.alto), false)]
      : []),
    ...paginas.map(({ svg, ancho, alto, recorte: r }) =>
      r
        ? dibujo(svg, r.ancho, r.alto, escalaHojas, true)
        : dibujo(svg, ancho, alto, cabe(ancho, alto), false),
    ),
  ].map((n, i) => (i ? { ...n, pageBreak: "before" } : n));

  return {
    ...marcoPdf(o, (n) => paginas[n - 1 - (conMapa ? 1 : 0)]?.arriba ?? ""),
    content,
  };
}

/**
 * La hoja, los márgenes y los metadatos (solo `o.titulo`), y en cada página el encabezado (organización, alcance, fecha
 * y la línea `arriba(n)` de la página n) y el pie (logo y «Página N de M»).
 */
export function marcoPdf(
  o: OpcionesMarco,
  arriba: (pagina: number) => string,
): Omit<TDocumentDefinitions, "content"> {
  const { ancho: w, alto: h } = HOJAS[o.hoja];
  const [anchoHoja, altoHoja] = o.orientacion === "vertical" ? [w, h] : [h, w];
  const { organizacion, alcance, fecha, logo } = o.encabezado;
  // Todo en una línea: un nombre largo se corta con «…» y el encabezado no pasa de sus 28 pt.
  const anchoUtil = anchoHoja - 2 * MARGEN;
  const derecha = recortarTexto(`${alcance} · ${fecha}`, anchoUtil / 2, 8);
  const izquierda = recortarTexto(organizacion, anchoUtil - anchoTexto(derecha, 8) - 12, 9, true);
  return {
    pageSize: { width: anchoHoja, height: altoHoja },
    pageMargins: [MARGEN, MARGEN + ENCABEZADO, MARGEN, MARGEN + PIE],
    info: { title: o.titulo },
    defaultStyle: { fontSize: 8, color: TENUE },
    header: (n) => ({
      margin: [MARGEN, MARGEN, MARGEN, 0],
      stack: [
        {
          columns: [
            { text: izquierda, bold: true, fontSize: 9, color: "#0a0a0a", noWrap: true },
            { text: derecha, alignment: "right", noWrap: true, width: "auto" },
          ],
        },
        { text: recortarTexto(arriba(n), anchoUtil, 8), noWrap: true },
      ],
    }),
    footer: (n, m) => ({
      margin: [MARGEN, 10, MARGEN, 0],
      columns: [
        logo && LOGO_PDF.test(logo) ? { image: logo, fit: [48, 12] } : { text: "" },
        { text: o.pagina.replace("{n}", String(n)).replace("{m}", String(m)), alignment: "right" },
      ],
    }),
  };
}
