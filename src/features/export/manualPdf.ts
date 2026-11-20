// Aparte de manual.ts: el worker de pdfmake importa esto, y así no carga el store ni i18n (solo sus tipos).
import type { PuestoManual, TextosManual, UnidadManual } from "./manual";
import { anchoTexto, recortar as recortarTexto } from "./medida";
import { MARGEN, areaUtil, cajaDibujoManual, type CabezaSeccion } from "./paginas";
import {
  LOGO_PDF,
  TENUE,
  marcoPdf,
  type Nodo,
  type OpcionesMarco,
  type PaginaPdf,
  type TDocumentDefinitions,
} from "./pdf";

/** Lo que manda la ventana: las secciones, el organigrama general (por ramas) y el dibujo chico de cada unidad, por id. */
export interface DatosManualPdf {
  unidades: UnidadManual[];
  general: PaginaPdf[];
  dibujos: Map<string, PaginaPdf>;
}

export interface OpcionesManual extends OpcionesMarco {
  /** Con la columna «Ocupa». Sin personas, los datos ya vienen sin nombres: esto solo quita la columna vacía. */
  conPersonas: boolean;
  textos: TextosManual;
  /** Todo ya traducido; `version` y `revision` son las líneas enteras. `logo`: una URL `data:image/...;base64`. */
  portada: {
    organizacion: string;
    alcance: string;
    fecha: string;
    version: string;
    revision: string;
    logo: string | null;
  };
}

const OSCURO = "#0a0a0a";
// La segunda línea del encabezado: bajo la primera, de 9 pt.
const LINEA_ARRIBA = MARGEN + 10.5;

/** Un dibujo achicado hasta caber en `ancho` × `alto`, centrado. Nunca se agranda. */
const encajado = (p: PaginaPdf, ancho: number, alto: number): Nodo => {
  const e = Math.min(1, ancho / p.ancho, alto / p.alto);
  return { svg: p.svg, width: p.ancho * e, height: p.alto * e, alignment: "center" };
};

// «Gerente», «Gerente · Ximena», «Gerente (vacante)» o «Gerente (vacante) · Reemplazo: Carla».
const jefatura = (y: PuestoManual, t: TextosManual) => {
  const quien = y.titular ?? (y.reemplazo ? `${t.reemplazo}: ${y.reemplazo}` : null);
  return `${y.cargo}${y.estado === "vacante" ? ` (${t.jefaturaVacante})` : ""}${quien ? ` · ${quien}` : ""}`;
};

/** Lo que va arriba de la sección de una unidad: el documento lo escribe y `cajaDibujoManual` lo mide. */
export const cabezaDeSeccion = (x: UnidadManual, t: TextosManual): CabezaSeccion => ({
  titulo: `${x.numero}  ${x.nombre}`,
  ruta: x.ruta.length ? x.ruta.join(" › ") : null,
  jefatura: x.jefatura ? { etiqueta: `${t.jefatura}: `, texto: jefatura(x.jefatura, t) } : null,
});

/**
 * La definición de pdfmake del manual: portada, índice (`toc`: pdfmake pone el número de página), el organigrama
 * general y una sección por unidad, cada una en su página, con su ruta, su jefatura, su dibujo y la tabla de sus
 * puestos. El encabezado y el pie son los del PDF del organigrama; los metadatos solo llevan `o.titulo`.
 * El general va por ramas: su línea «viene de» va donde el PDF la pone, bajo el encabezado.
 */
export function documentoManual(d: DatosManualPdf, o: OpcionesManual): TDocumentDefinitions {
  const t = o.textos;
  const area = areaUtil(o.hoja, o.orientacion);
  const p = o.portada;

  const portada: Nodo = {
    stack: [
      ...(p.logo && LOGO_PDF.test(p.logo)
        ? [{ image: p.logo, fit: [160, 80], alignment: "center", margin: [0, 0, 0, 24] }]
        : []),
      { text: p.organizacion, fontSize: 18, bold: true },
      { text: o.titulo, fontSize: 26, bold: true, margin: [0, 12, 0, 24] },
      { text: p.alcance, fontSize: 14 },
      { text: p.fecha, fontSize: 12, margin: [0, 4, 0, 0] },
      { text: p.version, color: TENUE, margin: [0, 48, 0, 0] },
      { text: p.revision, color: TENUE },
    ],
    alignment: "center",
    color: OSCURO,
    margin: [0, area.alto / 4, 0, 0],
  };

  const indice: Nodo = {
    toc: {
      title: { text: t.indice, fontSize: 16, bold: true, color: OSCURO, margin: [0, 0, 0, 12] },
      textStyle: { fontSize: 10, color: OSCURO },
    },
    pageBreak: "before",
  };

  // El índice lleva solo «Organigrama general»: el «· viene de…» de cada hoja va en otra columna.
  const resto = area.ancho - anchoTexto(t.general, 8) - 3;
  const general = d.general.map((x, i): Nodo => ({
    stack: [
      encajado(x, area.ancho, area.alto),
      {
        absolutePosition: { x: MARGEN, y: LINEA_ARRIBA },
        columnGap: 3,
        columns: [
          { text: t.general, width: "auto", noWrap: true, ...(i ? {} : { tocItem: true }) },
          ...(x.arriba ? [{ text: recortarTexto(`· ${x.arriba}`, resto, 8), noWrap: true }] : []),
        ],
      },
    ],
    pageBreak: "before",
  }));

  const tabla = (x: UnidadManual): Nodo => ({
    margin: [0, 12, 0, 0],
    fontSize: 9,
    layout: "lightHorizontalLines",
    table: {
      headerRows: 1,
      dontBreakRows: true,
      widths: o.conPersonas ? ["25%", "*", "25%", "auto"] : ["30%", "*", "auto"],
      body: [
        [t.cargo, t.descripcion, ...(o.conPersonas ? [t.ocupa] : []), t.estado].map((text) => ({
          text,
          bold: true,
          color: OSCURO,
        })),
        ...x.puestos.map((y) => [
          { text: y.cargo, color: OSCURO },
          y.descripcion ? { text: y.descripcion } : { text: t.sinDescripcion, italics: true },
          ...(o.conPersonas
            ? [{ stack: [y.titular ?? "", ...(y.reemplazo ? [`${t.reemplazo}: ${y.reemplazo}`] : [])] }]
            : []),
          { text: y.estado === "ocupado" ? t.ocupado : t.vacante },
        ]),
      ],
    },
  });

  const secciones = d.unidades.map((x): Nodo => {
    const dibujo = d.dibujos.get(x.id);
    const c = cabezaDeSeccion(x, t);
    const caja = cajaDibujoManual(area, c);
    return {
      stack: [
        {
          text: c.titulo,
          tocItem: true,
          // En el índice, cada nivel un poco más adentro.
          tocMargin: [(x.numero.split(".").length - 1) * 12, 0, 0, 0],
          fontSize: 14,
          bold: true,
          color: OSCURO,
        },
        ...(c.ruta ? [{ text: c.ruta, margin: [0, 2, 0, 0] }] : []),
        ...(c.jefatura
          ? [
              {
                text: [{ text: c.jefatura.etiqueta, bold: true }, c.jefatura.texto],
                fontSize: 10,
                color: OSCURO,
                margin: [0, 6, 0, 0],
              },
            ]
          : []),
        // El dibujo, en lo que deja la cabeza; si no cabe, va a la página siguiente y la tabla lo sigue.
        ...(dibujo ? [{ ...encajado(dibujo, caja.ancho, caja.alto), margin: [0, 12, 0, 0] }] : []),
        ...(x.puestos.length ? [tabla(x)] : []),
      ],
      pageBreak: "before",
    };
  });

  return { ...marcoPdf(o, () => ""), content: [portada, indice, ...general, ...secciones] };
}
