import { toRaw } from "vue";
import { i18n } from "@/i18n";
import { indiceHijos } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import {
  LETRA_MIN_PT,
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
import { dibujarSvg, letraMinima, type EntradaSvg } from "./treeSvg";

/** Sobre esta cifra de páginas, el diálogo avisa antes de armar el PDF. */
export const LIMITE_PAGINAS = 200;

/** Lo que necesita `armarPdf`, salvo los textos fijos. */
export interface PdfDeAlcance {
  /** El dibujo de la primera página, para la vista previa: en cuadrícula, el del mapa. */
  primera: string;
  /** En cuadrícula: el dibujo entero, para el mapa (`o.mapa` de `documentoPdf`). */
  mapa?: { svg: string; ancho: number; alto: number };
  /** Cuántas páginas tendrá el PDF, con el mapa. */
  total: number;
  /** Alguna página tendría letra bajo 8 pt. */
  ilegible: boolean;
  /** El de cada página del PDF: organización, alcance, fecha y logo. */
  encabezado: EntradaSvg["encabezado"];
  /**
   * Las páginas para `armarPdf`, sin el mapa. En cuadrícula, las hojas se dibujan recién aquí, al guardar, y de a poco:
   * la ventana sigue respondiendo y `senal` las detiene.
   */
  paginas: (senal?: AbortSignal) => Promise<PaginaPdf[]>;
}

// Solo el dibujo: el encabezado lo lleva cada página del PDF, y la leyenda va en su propia página (sus 9 pt, a la escala
// de la hoja, bajarían de 8).
const dibujo = (e: EntradaSvg, recorte?: Hojita) =>
  dibujarSvg({ ...e, leyenda: null }, { sinEncabezado: true, recorte });
const HOJAS_POR_VUELTA = 8;

/**
 * Las páginas del PDF del pedido, repartidas como se elige. Cada una sale de `prepararImagen` y `dibujarSvg`, con el
 * nivel del pedido. Por ramas, cada página se mide con el mismo dibujo que llevará, «sigue en la página N» incluido.
 * `entero`: la entrada del pedido ya calculada (la del diálogo), para no repetir su layout. Con `senal` abortada, se
 * rechaza con su motivo (un «AbortError») en el siguiente paso.
 */
export async function paginasPdf(
  pedido: PedidoImagen,
  o: { hoja: Hoja; orientacion: Orientacion; reparto: Reparto },
  { senal, entero: dada }: { senal?: AbortSignal; entero?: Promise<EntradaSvg> } = {},
): Promise<PdfDeAlcance> {
  const t = i18n.global.t;
  const { hoja, orientacion } = o;
  const entero = await (dada ?? prepararImagen(pedido));
  senal?.throwIfAborted();
  const legible = (p: { ancho: number; alto: number }) =>
    !escalaParaHoja(p.ancho, p.alto, hoja, orientacion, pedido.nivel).ilegible;
  const { leyenda, encabezado } = entero;
  const extra: PaginaPdf[] =
    entero.nivel === "pantalla" && leyenda?.entradas.length
      ? [
          {
            ...dibujarSvg(
              { ...entero, tarjetas: [], aristas: [], laterales: [], zonas: null },
              { sinEncabezado: true },
            ),
            arriba: t("pdf.leyenda"),
          },
        ]
      : [];

  if (o.reparto === "cuadricula") {
    const mapa = dibujo(entero);
    const { hojas } = cuadricula(mapa.ancho, mapa.alto, hoja, orientacion, pedido.nivel);
    return {
      primera: mapa.svg,
      mapa,
      total: 1 + hojas.length + extra.length,
      // Las hojas van a 8 pt, salvo que la letra ya sea menor a escala 1 (cuadricula no agranda).
      ilegible: letraMinima(pedido.nivel) < LETRA_MIN_PT || !extra.every(legible),
      encabezado,
      paginas: async (s) => {
        const lista: PaginaPdf[] = [];
        for (const [i, h] of hojas.entries()) {
          // Cada hoja recorre el dibujo entero: entre tanda y tanda, la ventana atiende lo suyo.
          if (i % HOJAS_POR_VUELTA === 0) await new Promise((r) => setTimeout(r));
          s?.throwIfAborted();
          lista.push({
            ...dibujo(entero, h),
            recorte: h,
            arriba: t("pdf.filaColumna", { fila: h.fila, columna: h.columna }),
          });
        }
        return [...lista, ...extra];
      },
    };
  }
  const lista = [
    ...(o.reparto === "una" ? [dibujo(entero)] : await porRamas(pedido, entero, hoja, orientacion, senal)),
    ...extra,
  ];
  return {
    primera: lista[0]!.svg,
    total: lista.length,
    ilegible: !lista.every(legible),
    encabezado,
    paginas: async () => lista,
  };
}

async function porRamas(
  pedido: PedidoImagen,
  entero: EntradaSvg,
  hoja: Hoja,
  orientacion: Orientacion,
  senal?: AbortSignal,
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
    senal?.throwIfAborted(); // cada página es un layout: al cerrar la ventana o cambiar algo, no se sigue
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
    const e = await entradaDe(raiz, profundidad, tramo);
    senal?.throwIfAborted();
    const { ancho, alto } = dibujo(e);
    return { ancho, alto };
  };

  // Cada raíz del alcance se reparte aparte; sus números siguen a los de la anterior.
  const paginas: PaginaPdf[] = [];
  for (const raiz of raices) {
    const antes = paginas.length;
    for (const p of await repartirPorRamas(raiz, hijosDe, medir, hoja, orientacion, pedido.nivel)) {
      const e = await entradaDe(p.raiz, p.profundidad, p.hijas && [p.hijas.desde, p.hijas.hasta]);
      senal?.throwIfAborted();
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
    ...(r.ilegible
      ? [
          t(
            { una: "pdf.ilegible", ramas: "pdf.ilegibleAlguna", cuadricula: "pdf.ilegibleCuadricula" }[
              reparto
            ],
          ),
        ]
      : []),
    ...(r.total > LIMITE_PAGINAS
      ? [t("pdf.muchas", { n: r.total.toLocaleString(locale), limite: LIMITE_PAGINAS })]
      : []),
  ];
}
