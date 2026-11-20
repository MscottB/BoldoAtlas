import type { Puesto, Unidad } from "@/db/tipos";
import { jefeVisible, type Vigentes } from "./jerarquia";

/** Criterios de «Colorear por» con escala: antigüedad del titular en el puesto y personas a cargo de la jefatura. */
export type CriterioEscala = "antiguedad" | "aCargo";
export const CRITERIOS_ESCALA: readonly CriterioEscala[] = ["antiguedad", "aCargo"];
export const esCriterioEscala = (c: string): c is CriterioEscala =>
  CRITERIOS_ESCALA.includes(c as CriterioEscala);

/**
 * Rangos fijos y legibles (no salen de los datos): el inicio de cada rango desde el segundo, inclusive.
 * Antigüedad en años: menos de 1, 1 a 3, 3 a 5, 5 a 10, 10 o más. A cargo: 1 a 5, 6 a 15, 16 a 50, 51 a 200, más de 200.
 */
export const LIMITES: Record<CriterioEscala, readonly number[]> = {
  antiguedad: [1, 3, 5, 10],
  aCargo: [6, 16, 51, 201],
};

/**
 * Escala secuencial de un tono (de claro a oscuro), un color por rango. El texto sobre cada uno (textoSobre) pasa
 * 4,5:1; los extremos casi no se distinguen de la tarjeta en un tema y llevan contorno (marcaTenue), como las marcas.
 */
export const COLORES_ESCALA = ["#c6e6f2", "#7cc4dc", "#3a9cc4", "#1f6aa6", "#1b3d78"] as const;
/** Lo que queda fuera de la escala (vacantes, sin jefatura, sin personas a cargo): gris, sin el tono de la escala. */
export const COLOR_NEUTRO = "#a3a3a3";

/** Por qué una tarjeta queda fuera de la escala. */
export type Aparte = "vacante" | "sinJefatura" | "sinPersonas";
const APARTES: readonly Aparte[] = ["vacante", "sinJefatura", "sinPersonas"];
/** Lo que una tarjeta muestra con un criterio de escala: su valor y su rango, o por qué queda aparte. */
export type ValorEscala = { valor: number; rango: number } | { aparte: Aparte };
/** Una clase de la leyenda: el índice de un rango o lo que va aparte. */
export type ClaseEscala = number | Aparte;

/** Índice del rango de `valor`: cuántos inicios de rango alcanza. */
export const rango = (valor: number, limites: readonly number[]) => limites.filter((l) => valor >= l).length;

/**
 * Años cumplidos entre dos días AAAA-MM-DD (nunca negativo: un `desde` posterior es cero). Quien entró un 29 de febrero
 * cumple el 1 de marzo en los años no bisiestos.
 */
export function aniosCumplidos(desde: string, fecha: string): number {
  const anios =
    Number(fecha.slice(0, 4)) - Number(desde.slice(0, 4)) - (fecha.slice(5) < desde.slice(5) ? 1 : 0);
  return Math.max(0, anios);
}

/**
 * Valor de cada tarjeta (unidades y puestos, por id) para el criterio, el día `fecha` (hoy o el que se ve).
 * Antigüedad: cada puesto por su titular vigente (un reemplazo no es titular) y la unidad por el titular de su jefatura.
 * A cargo: la dotación total de la rama sin el jefe, en la unidad y en su puesto de jefatura; los demás puestos no van.
 * Al jefe (titular o, si no hay, el reemplazo) se le descuenta cada puesto que la dotación le cuenta en la rama: ninguno
 * si su jefatura es de otra unidad (los datos importados no lo impiden) o si es un reemplazo de fuera.
 */
export function escalaPorTarjeta(
  criterio: CriterioEscala,
  unidades: Unidad[],
  puestos: (Puesto & { deleted_at?: string | null })[],
  vigentes: Vigentes,
  dotaciones: ReadonlyMap<string, { total: number }>,
  fecha: string,
): Map<string, ValorEscala> {
  const res = new Map<string, ValorEscala>();
  const limites = LIMITES[criterio];
  const conValor = (valor: number): ValorEscala => ({ valor, rango: rango(valor, limites) });
  if (criterio === "antiguedad") {
    const delPuesto = (id: string): ValorEscala => {
      const t = vigentes.get(id)?.titular;
      return t ? conValor(aniosCumplidos(t.desde, fecha)) : { aparte: "vacante" };
    };
    for (const p of puestos) res.set(p.id, delPuesto(p.id));
    for (const u of unidades)
      res.set(u.id, u.jefe_puesto_id ? delPuesto(u.jefe_puesto_id) : { aparte: "sinJefatura" });
    return res;
  }
  // Puestos vivos donde cada persona es titular (lo que suma a la dotación) y el superior de cada unidad.
  const unidadDe = new Map(puestos.filter((p) => !p.deleted_at).map((p) => [p.id, p.unidad_id]));
  const titularEn = new Map<string, string[]>();
  for (const [id, v] of vigentes)
    if (v.titular && unidadDe.has(id))
      titularEn.set(v.titular.trabajador_id, [...(titularEn.get(v.titular.trabajador_id) ?? []), id]);
  const padre = new Map(unidades.map((u) => [u.id, u.parent_id]));
  // Sube desde la unidad del puesto hasta la raíz pedida; el tope de pasos corta un ciclo en los datos.
  const enRama = (unidad: string | null | undefined, raiz: string) => {
    for (let pasos = 0; unidad && pasos <= padre.size; pasos++, unidad = padre.get(unidad))
      if (unidad === raiz) return true;
    return false;
  };
  for (const u of unidades) {
    const jefe = u.jefe_puesto_id ? jefeVisible(u, vigentes) : null;
    if (!u.jefe_puesto_id || !jefe) {
      res.set(u.id, { aparte: "sinJefatura" });
      continue;
    }
    const propios = (titularEn.get(jefe.trabajador_id) ?? []).filter((id) => enRama(unidadDe.get(id), u.id));
    const n = (dotaciones.get(u.id)?.total ?? 0) - propios.length;
    const v: ValorEscala = n > 0 ? conValor(n) : { aparte: "sinPersonas" };
    res.set(u.id, v);
    res.set(u.jefe_puesto_id, v);
  }
  return res;
}

/** Clases que usan las tarjetas `ids`, una vez cada una: los rangos de menor a mayor y después lo que va aparte. */
export function clasesEnUso(valores: ReadonlyMap<string, ValorEscala>, ids: Iterable<string>): ClaseEscala[] {
  const usadas = new Set<ClaseEscala>();
  for (const id of ids) {
    const v = valores.get(id);
    if (v) usadas.add(claseDe(v));
  }
  const rangos = [...usadas].filter((c): c is number => typeof c === "number").sort((x, y) => x - y);
  return [...rangos, ...APARTES.filter((x) => usadas.has(x))];
}

/** Clase de un valor: su rango o lo que va aparte. */
export const claseDe = (v: ValorEscala): ClaseEscala => ("aparte" in v ? v.aparte : v.rango);

/** Color de una clase: el de su rango o el neutro. */
export const colorDeClase = (c: ClaseEscala) => (typeof c === "number" ? COLORES_ESCALA[c] : COLOR_NEUTRO);

/** Lo que la tarjeta escribe junto al color (el color nunca va solo): clave de i18n y su número («3 años», «0 a cargo»). */
export function textoEscala(criterio: CriterioEscala, v: ValorEscala): { clave: string; n: number } {
  if ("aparte" in v)
    return v.aparte === "sinPersonas"
      ? { clave: "arbol.vista.aCargoValor", n: 0 }
      : { clave: `arbol.vista.aparte.${v.aparte}`, n: 0 };
  return { clave: criterio === "antiguedad" ? "arbol.vista.anios" : "arbol.vista.aCargoValor", n: v.valor };
}

/** El `t` de vue-i18n (`i18n.global.t` o el de useI18n), con las formas que usan las tarjetas. */
export type Traducir = {
  (clave: string): string;
  (clave: string, nombrados: Record<string, unknown>): string;
  (clave: string, nombrados: Record<string, unknown>, plural: number): string;
};

/** Lo que dibuja una tarjeta coloreada con escala: su color, el valor escrito y el nombre del criterio; null sin valor. */
export function etiquetaEscala(t: Traducir, criterio: string, v: ValorEscala | undefined) {
  if (!v || !esCriterioEscala(criterio)) return null;
  const { clave, n } = textoEscala(criterio, v);
  return {
    color: colorDeClase(claseDe(v)),
    texto: t(clave, { n }, n),
    criterio: t(`arbol.vista.${criterio}`),
  };
}
