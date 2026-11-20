import { toRaw } from "vue";
import { i18n } from "@/i18n";
import { indiceHijos } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import {
  cuadricula,
  escalaParaHoja,
  repartirPorRamas,
  type Hoja,
  type Hojita,
  type Orientacion,
  type Reparto,
} from "./paginas";
import type { PaginaPdf } from "./pdf";
import { prepararImagen, unidadesDe, type PedidoImagen } from "./preparar";
import { dibujarSvg, type EntradaSvg } from "./treeSvg";

/** Sobre esta cifra de páginas, el diálogo avisa antes de armar el PDF. */
export const LIMITE_PAGINAS = 200;

/** Lo que necesita `armarPdf`, salvo los textos fijos. */
export interface PdfDeAlcance {
  paginas: PaginaPdf[];
  /** En cuadrícula: el dibujo entero, para el mapa (`o.mapa` de `documentoPdf`). */
  mapa?: { svg: string; ancho: number; alto: number };
  /** Cuántas páginas tendrá el PDF, con el mapa. */
  total: number;
  /** En una página: la letra quedaría bajo 8 pt. */
  ilegible: boolean;
  /** El de cada página del PDF: organización, alcance, fecha y logo. */
  encabezado: EntradaSvg["encabezado"];
}

// Solo el dibujo: el encabezado lo lleva cada página del PDF, y la leyenda va en su propia página (sus 9 pt, a la escala
// de la hoja, bajarían de 8).
const dibujo = (e: EntradaSvg, recorte?: Hojita) =>
  dibujarSvg({ ...e, leyenda: null }, { sinEncabezado: true, recorte });

/**
 * Las páginas del PDF del pedido, repartidas como se elige. Cada una sale de `prepararImagen` y `dibujarSvg`, con el
 * nivel del pedido. Por ramas, cada página se mide con el mismo dibujo que llevará, «sigue en la página N» incluido.
 */
export async function paginasPdf(
  pedido: PedidoImagen,
  o: { hoja: Hoja; orientacion: Orientacion; reparto: Reparto },
): Promise<PdfDeAlcance> {
  const t = i18n.global.t;
  const { hoja, orientacion } = o;
  const entero = await prepararImagen(pedido);
  let paginas: PaginaPdf[];
  let mapa: PdfDeAlcance["mapa"];
  let ilegible = false;
  if (o.reparto === "una") {
    const d = dibujo(entero);
    ilegible = escalaParaHoja(d.ancho, d.alto, hoja, orientacion, pedido.nivel).ilegible;
    paginas = [d];
  } else if (o.reparto === "cuadricula") {
    const d = (mapa = dibujo(entero));
    paginas = cuadricula(d.ancho, d.alto, hoja, orientacion, pedido.nivel).hojas.map((h) => ({
      ...dibujo(entero, h),
      recorte: h,
      arriba: t("pdf.filaColumna", { fila: h.fila, columna: h.columna }),
    }));
  } else paginas = await porRamas(pedido, entero, hoja, orientacion);

  const { leyenda } = entero;
  if (entero.nivel === "pantalla" && leyenda?.entradas.length)
    paginas.push({
      ...dibujarSvg(
        { ...entero, tarjetas: [], aristas: [], laterales: [], zonas: null },
        { sinEncabezado: true },
      ),
      arriba: t("pdf.leyenda"),
    });
  return { paginas, mapa, total: paginas.length + (mapa ? 1 : 0), ilegible, encabezado: entero.encabezado };
}

async function porRamas(
  pedido: PedidoImagen,
  entero: EntradaSvg,
  hoja: Hoja,
  orientacion: Orientacion,
): Promise<PaginaPdf[]> {
  const t = i18n.global.t;
  // Las ramas como se ven en el dibujo entero: una unidad plegada ahí no tiene hijas que repartir.
  const unidades = unidadesDe(toRaw(useOrganizacion().enFecha.unidades), pedido.alcance);
  const nombres = new Map(unidades.map((x) => [x.id, x.nombre]));
  const vistas = new Set(entero.tarjetas.map((x) => x.id));
  const indice = indiceHijos(unidades);
  const hijos = new Map(
    [...vistas].map((id) => [id, (indice.get(id) ?? []).flatMap((x) => (vistas.has(x.id) ? [x.id] : []))]),
  );
  const hijosDe = (id: string) => hijos.get(id) ?? [];
  const raices = (indice.get(null) ?? []).filter((x) => vistas.has(x.id)).map((x) => x.id);

  // La página de `raiz` con `profundidad` niveles y, si viene, solo las hijas [desde, hasta). Se guarda: la que se
  // midió al repartir es la misma que se dibuja.
  const entradas = new Map<string, Promise<EntradaSvg>>();
  const entradaDe = (raiz: string, profundidad: number, tramo?: [number, number]) => {
    const clave = `${raiz} ${profundidad} ${tramo?.join(" ") ?? ""}`;
    let e = entradas.get(clave);
    if (!e) {
      const hijas = hijosDe(raiz);
      const dentro = new Set(tramo ? hijas.slice(...tramo) : hijas);
      let fila = profundidad ? [...dentro] : [raiz];
      for (let n = 1; n < profundidad; n++) fila = fila.flatMap(hijosDe);
      const pagina = {
        raiz,
        cortadas: new Set(fila.filter((x) => hijosDe(x).length)),
        fuera: new Set(hijas.filter((x) => !dentro.has(x))),
      };
      e = prepararImagen({ ...pedido, pagina });
      entradas.set(clave, e);
    }
    return e;
  };
  const medir = async (raiz: string, profundidad: number, tramo?: [number, number]) => {
    const { ancho, alto } = dibujo(await entradaDe(raiz, profundidad, tramo));
    return { ancho, alto };
  };

  // Cada raíz del alcance se reparte aparte; sus números siguen a los de la anterior.
  const paginas: PaginaPdf[] = [];
  for (const raiz of raices) {
    const antes = paginas.length;
    for (const p of await repartirPorRamas(raiz, hijosDe, medir, hoja, orientacion, pedido.nivel)) {
      const e = await entradaDe(p.raiz, p.profundidad, p.hijas && [p.hijas.desde, p.hijas.hasta]);
      const sigue = new Map(p.sigue.map((s) => [s.unidad, s.pagina + antes]));
      const tarjetas = e.tarjetas.map((x) => {
        const n = sigue.get(x.id);
        return n ? { ...x, textoMas: t("pdf.sigue", { n }) } : x;
      });
      const arriba = [
        p.viene && t("pdf.viene", { n: p.viene + antes }),
        p.hijas &&
          t("pdf.continuacion", { nombre: nombres.get(p.raiz), k: p.hijas.parte, n: p.hijas.partes }),
      ]
        .filter(Boolean)
        .join(" · ");
      paginas.push({ ...dibujo({ ...e, tarjetas }), ...(arriba && { arriba }) });
    }
  }
  return paginas.length ? paginas : [dibujo(entero)];
}

/** Lo que se avisa antes de armar el PDF, ya traducido. */
export function avisosPdf(
  reparto: Reparto,
  r: { ilegible: boolean; total: number },
  locale: string,
): string[] {
  const t = i18n.global.t;
  return [
    ...(reparto === "una" && r.ilegible ? [t("pdf.ilegible")] : []),
    ...(r.total > LIMITE_PAGINAS
      ? [t("pdf.muchas", { n: r.total.toLocaleString(locale), limite: LIMITE_PAGINAS })]
      : []),
  ];
}
