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
import { mapa, type PaginaPdf } from "./pdf";
import { prepararImagen, unidadesDe, type PedidoImagen } from "./preparar";
import { dibujarSvg, letraMinima, type EntradaSvg } from "./treeSvg";

/** Sobre esta cifra de páginas, el diálogo avisa antes de armar el PDF. */
export const LIMITE_PAGINAS = 200;

/** Las páginas que van al PDF, sin el mapa, y lo que se sabe de todas. */
export interface PaginasPdf {
  lista: PaginaPdf[];
  /** Cuántas páginas tendrá el PDF, con el mapa. */
  total: number;
  /** Alguna página tendría letra bajo 8 pt. */
  ilegible: boolean;
}

/** Lo que necesita `armarPdf`, salvo los textos fijos. */
export interface PdfDeAlcance {
  /** El dibujo de la primera página, para la vista previa: en cuadrícula, el mapa con sus hojas. */
  primera: string;
  /** En cuadrícula: el dibujo entero, para el mapa (`o.mapa` de `documentoPdf`). */
  mapa?: { svg: string; ancho: number; alto: number };
  /** Cuántas páginas tendrá el PDF, con el mapa. null por ramas: se cuentan al guardar, con `paginas`. */
  total: number | null;
  /** Alguna página tendría letra bajo 8 pt. Por ramas, solo de las de la raíz: las otras se ven al guardar. */
  ilegible: boolean;
  /** El de cada página del PDF: organización, alcance, fecha y logo. */
  encabezado: EntradaSvg["encabezado"];
  /**
   * Las páginas para `armarPdf`. Por ramas y en cuadrícula se arman recién aquí, al guardar, y de a poco: la ventana
   * sigue respondiendo, `senal` las detiene y `alAvanzar` dice cuántas van.
   */
  paginas: (senal?: AbortSignal, alAvanzar?: (n: number) => void) => Promise<PaginasPdf>;
}

// Solo el dibujo: el encabezado lo lleva cada página del PDF, y la leyenda va en su propia página (sus 9 pt, a la escala
// de la hoja, bajarían de 8).
const dibujo = (e: EntradaSvg, recorte?: Hojita) =>
  dibujarSvg({ ...e, leyenda: null }, { sinEncabezado: true, recorte });
const HOJAS_POR_VUELTA = 8;

/**
 * Las páginas del PDF del pedido, repartidas como se elige. Cada una sale de `prepararImagen` y `dibujarSvg`, con el
 * nivel del pedido. Por ramas, cada página se mide con el mismo dibujo que llevará, «sigue en la página N» incluido;
 * la vista previa reparte solo la raíz (con miles de unidades, repartirlo todo tarda) y `paginas`, todo.
 * `entero`: la entrada del pedido ya calculada (la del diálogo), para no repetir su layout. Con `senal` abortada, se
 * rechaza con su motivo (un «AbortError») en el siguiente paso. `claves`: las de «sigue» y «viene» (el manual dice
 * «lámina»); por defecto, las del PDF, con «página».
 */
export async function paginasPdf(
  pedido: PedidoImagen,
  o: { hoja: Hoja; orientacion: Orientacion; reparto: Reparto; claves?: Claves },
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
    const m = dibujo(entero);
    const { hojas } = cuadricula(m.ancho, m.alto, hoja, orientacion, pedido.nivel);
    const total = 1 + hojas.length + extra.length;
    // Las hojas van a 8 pt, salvo que la letra ya sea menor a escala 1 (cuadricula no agranda).
    const ilegible = letraMinima(pedido.nivel) < LETRA_MIN_PT || !extra.every(legible);
    return {
      primera: mapa(m, hojas),
      mapa: m,
      total,
      ilegible,
      encabezado,
      paginas: async (s, alAvanzar) => {
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
          alAvanzar?.(lista.length);
        }
        return { lista: [...lista, ...extra], total, ilegible };
      },
    };
  }
  const contar = (lista: PaginaPdf[]) => ({ lista, total: lista.length, ilegible: !lista.every(legible) });
  if (o.reparto === "una") {
    const todas = contar([dibujo(entero), ...extra]);
    const { lista, total, ilegible } = todas;
    return { primera: lista[0]!.svg, total, ilegible, encabezado, paginas: async () => todas };
  }
  // Los layouts de la vista previa sirven al guardar: las páginas de la raíz no se vuelven a medir.
  const entradas: Entradas = new Map();
  const claves = o.claves ?? CLAVES_PDF;
  const raiz = await porRamas(pedido, entero, hoja, orientacion, entradas, claves, {
    senal,
    soloPrimera: true,
  });
  // Si la raíz no deja nada para después, la vista previa ya tiene todas las páginas y se sabe cuántas son.
  if (raiz.completa) {
    const todas = contar([...raiz.paginas, ...extra]);
    return {
      primera: todas.lista[0]!.svg,
      total: todas.total,
      ilegible: todas.ilegible,
      encabezado,
      paginas: async () => todas,
    };
  }
  return {
    primera: raiz.paginas[0]!.svg,
    total: null,
    ilegible: !raiz.paginas.every(legible),
    encabezado,
    paginas: async (s, alAvanzar) =>
      contar([
        ...(await porRamas(pedido, entero, hoja, orientacion, entradas, claves, { senal: s, alAvanzar }))
          .paginas,
        ...extra,
      ]),
  };
}

type Entradas = Map<string, Promise<EntradaSvg>>;
/** Las claves de i18n de «sigue en la … {n}» y «viene de la … {n}». */
type Claves = { sigue: string; viene: string };
const CLAVES_PDF: Claves = { sigue: "pdf.sigue", viene: "pdf.viene" };

/**
 * Las páginas por ramas. `entradas` guarda el layout de cada página medida, para no repetirlo. `soloPrimera`: solo las
 * de la raíz, con «sigue en la página …» sin número (las otras ramas no se repartieron).
 */
async function porRamas(
  pedido: PedidoImagen,
  entero: EntradaSvg,
  hoja: Hoja,
  orientacion: Orientacion,
  entradas: Entradas,
  claves: Claves,
  {
    senal,
    soloPrimera = false,
    alAvanzar,
  }: { senal?: AbortSignal; soloPrimera?: boolean; alAvanzar?: (n: number) => void },
): Promise<{ paginas: PaginaPdf[]; completa: boolean }> {
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
  // midió al repartir es la misma que se dibuja. Si falla, se vuelve a pedir.
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
      const nueva = prepararImagen({ ...pedido, pagina });
      nueva.catch(() => entradas.get(clave) === nueva && entradas.delete(clave));
      entradas.set(clave, (e = nueva));
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
  // Con `soloPrimera`, queda completo si hay una sola raíz y ninguna de sus páginas manda a otra.
  let completa = !soloPrimera || raices.length <= 1;
  for (const raiz of soloPrimera ? raices.slice(0, 1) : raices) {
    const antes = paginas.length;
    const reparto = await repartirPorRamas(raiz, hijosDe, medir, hoja, orientacion, pedido.nivel, {
      soloPrimera,
      alAvanzar: alAvanzar && ((n) => alAvanzar(antes + n)),
    });
    for (const p of reparto) {
      const e = await entradaDe(p.raiz, p.profundidad, p.hijas && [p.hijas.desde, p.hijas.hasta]);
      senal?.throwIfAborted();
      if (p.sigue.length) completa &&= !soloPrimera;
      const sigue = new Map(p.sigue.map((s) => [s.unidad, soloPrimera ? "…" : s.pagina + antes]));
      const tarjetas = e.tarjetas.map((x) => {
        const n = sigue.get(x.id);
        return n ? { ...x, textoMas: t(claves.sigue, { n }) } : x;
      });
      const arriba = [
        p.viene && t(claves.viene, { n: p.viene + antes }),
        p.hijas &&
          t("pdf.continuacion", { nombre: nombres.get(p.raiz), k: p.hijas.parte, n: p.hijas.partes }),
      ]
        .filter(Boolean)
        .join(" · ");
      paginas.push({ ...dibujo({ ...e, tarjetas }), ...(arriba && { arriba }) });
    }
  }
  return { paginas: paginas.length ? paginas : [dibujo(entero)], completa };
}

/** Lo que se avisa antes de armar el PDF, ya traducido. `claveMuchas`: la del manual, que avisa ya armado. */
export function avisosPdf(
  reparto: Reparto,
  r: { ilegible: boolean; total: number | null },
  locale: string,
  claveMuchas = "pdf.muchas",
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
    // Sin la cifra (por ramas, en la vista previa) no se avisa: Guardar cuenta las páginas antes del aviso.
    ...(r.total !== null && r.total > LIMITE_PAGINAS
      ? [t(claveMuchas, { n: r.total.toLocaleString(locale), limite: LIMITE_PAGINAS })]
      : []),
  ];
}

/** El motivo con que `programar` corta Guardar: cambió el organigrama o la fecha. */
export const CAMBIO = new DOMException("cambio", "AbortError");
/** Con esto se rechaza un layout que otro más nuevo dejó sin uso (colaDeUltimo). */
export const REEMPLAZADO = new Error("reemplazado");

/**
 * Qué se dice si Guardar falla. `senal`: la de Guardar. Un corte (AbortError, o en el PDF un layout reemplazado) es
 * «interrumpido» si fue por un cambio (`CAMBIO`, o la vista previa que se cortó sola); si lo canceló la persona o se
 * cerró la ventana, nada. Solo el PDF se interrumpe así; lo demás es un error.
 */
export function falloAlGuardar(
  e: unknown,
  pdf: boolean,
  senal: AbortSignal | undefined,
): "interrumpido" | "nada" | "error" {
  const corte = e instanceof DOMException && e.name === "AbortError";
  if (pdf && (corte || e === REEMPLAZADO))
    return senal?.reason === CAMBIO || !senal?.aborted ? "interrumpido" : "nada";
  return corte ? "nada" : "error";
}
