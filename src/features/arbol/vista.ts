import type { Leyenda } from "@/db/tipos";

/** Qué unidades se resaltan (las demás se atenúan): texto, etiqueta, vacantes y datos de sus puestos/personas. Sin criterios, todas. */
export interface Resaltado {
  etiqueta: string | null;
  texto: string;
  /** La unidad tiene al menos un puesto sin titular vigente. */
  vacantes: boolean;
  /** Ids de mantenedor; la unidad tiene un titular vigente con ese valor (cargo: un puesto con ese cargo). */
  sede: string | null;
  contrato: string | null;
  jornada: string | null;
  cargo: string | null;
}

// Opciones del panel «Vista»: una sola configuración tipada por PC, y lo que guarda cada vista nombrada.
export interface ConfigVista {
  direccion: "vertical" | "horizontal";
  densidad: "normal" | "compacta";
  /** Tipo de arista jerárquica de Vue Flow: rectas en ángulo o curvas. */
  lineas: "smoothstep" | "bezier";
  mostrarTipo: boolean;
  mostrarJefe: boolean;
  mostrarFoto: boolean;
  mostrarDotacion: boolean;
  mostrarVacantes: boolean;
  mostrarEtiquetas: boolean;
  verPuestos: boolean;
  /** Cada unidad en la fila (o columna) de su tipo, en el orden del catálogo de tipos (ver filasPorTipo). */
  alinearPorTipo: boolean;
  mostrarCargo: boolean;
  mostrarPersona: boolean;
  /** Tipos de unidad cuyo superior más cercano se muestra en cada tarjeta. */
  rutaTipos: string[];
  /** Criterio de color: "ninguno", "marca:<tipoId>" o "leyenda" (la leyenda del puesto). */
  colorearPor: string;
  /** Leyenda flotante visible (solo se dibuja si hay criterio de color). */
  leyenda: boolean;
  resaltar: Resaltado;
}

export const VISTA_POR_DEFECTO: ConfigVista = {
  direccion: "vertical",
  densidad: "normal",
  lineas: "smoothstep",
  mostrarTipo: true,
  mostrarJefe: true,
  mostrarFoto: true,
  mostrarDotacion: true,
  mostrarVacantes: true,
  mostrarEtiquetas: true,
  verPuestos: false,
  alinearPorTipo: false,
  mostrarCargo: true,
  mostrarPersona: true,
  rutaTipos: [],
  colorearPor: "ninguno",
  leyenda: true,
  resaltar: {
    etiqueta: null,
    texto: "",
    vacantes: false,
    sede: null,
    contrato: null,
    jornada: null,
    cargo: null,
  },
};

// El texto de las tarjetas es rem: con la escala de la interfaz (90 %–125 %) la tarjeta crece igual, o el texto no cabe.
const escalar = (ancho: number, alto: number, escala: number) => ({
  ancho: Math.round((ancho * escala) / 100),
  alto: Math.round((alto * escala) / 100),
});

/** Tamaño de las tarjetas: lo usan el layout y los nodos (una sola fuente). Compacta = una línea. */
export function tamUnidad(c: Pick<ConfigVista, "densidad">, conRuta: boolean, escala = 100) {
  if (c.densidad === "compacta") return escalar(220, 40, escala);
  return escalar(220, conRuta ? ALTO_UNIDAD_CON_RUTA : ALTO_UNIDAD, escala);
}
export const tamPuesto = (c: Pick<ConfigVista, "densidad">, escala = 100) =>
  escalar(200, c.densidad === "compacta" ? 32 : 68, escala);

/** Separación (px) entre tarjetas hermanas y entre un nivel y el siguiente. */
export const separaciones = (c: Pick<ConfigVista, "densidad">) =>
  c.densidad === "compacta" ? { hermanos: 10, niveles: 28 } : { hermanos: 28, niveles: 64 };

/**
 * Opciones de elk. mrtree es un árbol ordenado: cada superior centrado sobre sus hijos, los hermanos en el orden en que
 * llegan (el de `orden`) y cada profundidad en una fila. Usa la misma separación entre hermanos y entre niveles: la de
 * niveles la agrega calcularLayout. El tamaño de las tarjetas va aparte (tamUnidad/tamPuesto).
 */
export function opcionesElk(c: Pick<ConfigVista, "direccion" | "densidad">): Record<string, string> {
  return {
    "elk.algorithm": "mrtree",
    "elk.direction": c.direccion === "horizontal" ? "RIGHT" : "DOWN",
    "elk.spacing.nodeNode": String(separaciones(c).hermanos),
    "elk.mrtree.weighting": "MODEL_ORDER",
  };
}

export const ALTO_UNIDAD = 112;
/** Con la ruta por tipo la tarjeta suma una línea. */
export const ALTO_UNIDAD_CON_RUTA = 132;

/** Criterio «Colorear por»: cada puesto usa el color de su entrada de leyenda. */
export const CRITERIO_LEYENDA = "leyenda";

export const criterioMarca = (tipoId: string) => `marca:${tipoId}`;

/** Tipo de arista de Vue Flow para la opción de líneas: «bezier» no es un tipo suyo (el de las curvas es «default»). */
export const tipoArista = (lineas: ConfigVista["lineas"]): "default" | "smoothstep" =>
  lineas === "bezier" ? "default" : lineas;

/** Lo guardado (preferencia o vista nombrada) puede venir de otra versión o dañado: cada campo inválido vuelve a su valor por defecto. */
export function leerVista(crudo: unknown): ConfigVista {
  const objeto = (x: unknown) => (typeof x === "object" && x !== null ? x : {}) as Record<string, unknown>;
  const c = objeto(crudo);
  const r = objeto(c.resaltar);
  const d = VISTA_POR_DEFECTO;
  const bool = <T extends object>(o: Record<string, unknown>, def: T, k: keyof T & string): boolean =>
    typeof o[k] === "boolean" ? o[k] : (def[k] as boolean);
  const opcion = <T extends string>(v: unknown, validos: readonly T[], def: T): T =>
    validos.includes(v as T) ? (v as T) : def;
  const id = (k: keyof Resaltado) => (typeof r[k] === "string" && r[k] ? (r[k] as string) : null);
  return {
    direccion: opcion(c.direccion, ["vertical", "horizontal"], d.direccion),
    densidad: opcion(c.densidad, ["normal", "compacta"], d.densidad),
    lineas: opcion(c.lineas, ["smoothstep", "bezier"], d.lineas),
    mostrarTipo: bool(c, d, "mostrarTipo"),
    mostrarJefe: bool(c, d, "mostrarJefe"),
    mostrarFoto: bool(c, d, "mostrarFoto"),
    mostrarDotacion: bool(c, d, "mostrarDotacion"),
    mostrarVacantes: bool(c, d, "mostrarVacantes"),
    mostrarEtiquetas: bool(c, d, "mostrarEtiquetas"),
    verPuestos: bool(c, d, "verPuestos"),
    // Antes se llamaba nivelesEstrictos: se acepta en preferencias y vistas guardadas con ese nombre.
    alinearPorTipo:
      typeof c.alinearPorTipo === "boolean"
        ? c.alinearPorTipo
        : typeof c.nivelesEstrictos === "boolean"
          ? c.nivelesEstrictos
          : d.alinearPorTipo,
    mostrarCargo: bool(c, d, "mostrarCargo"),
    mostrarPersona: bool(c, d, "mostrarPersona"),
    rutaTipos:
      Array.isArray(c.rutaTipos) && c.rutaTipos.every((t) => typeof t === "string")
        ? c.rutaTipos
        : d.rutaTipos,
    colorearPor:
      typeof c.colorearPor === "string" && /^(ninguno|leyenda|marca:.+)$/.test(c.colorearPor)
        ? c.colorearPor
        : d.colorearPor,
    leyenda: bool(c, d, "leyenda"),
    // Siempre un objeto nuevo: la app lo muta y no debe tocar el valor por defecto.
    resaltar: {
      etiqueta: id("etiqueta"),
      texto: typeof r.texto === "string" ? r.texto : "",
      vacantes: bool(r, d.resaltar, "vacantes"),
      sede: id("sede"),
      contrato: id("contrato"),
      jornada: id("jornada"),
      cargo: id("cargo"),
    },
  };
}

/** El resaltado es de la sesión: no se recuerda por PC ni por árbol (solo las vistas guardadas lo incluyen). */
export const sinResaltar = (c: ConfigVista): ConfigVista => ({
  ...c,
  resaltar: { ...VISTA_POR_DEFECTO.resaltar },
});

/** Lo que guarda una vista nombrada: la configuración completa y las ramas plegadas en ese momento. */
export const configDeVista = (vista: ConfigVista, colapsados: Set<string>) => ({
  vista,
  colapsados: [...colapsados],
});

/** Lee lo guardado en `vistas.config` (nunca lanza). `colapsados` null = la vista no dice nada: no se tocan las ramas. */
export function aplicarVista(
  texto: string,
  unidadesVivas: Set<string>,
): { vista: ConfigVista; colapsados: Set<string> | null } {
  let crudo: unknown;
  try {
    crudo = JSON.parse(texto);
  } catch {
    crudo = null;
  }
  const c = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  return {
    vista: leerVista(c.vista),
    colapsados: Array.isArray(c.colapsados)
      ? new Set(c.colapsados.filter((x): x is string => typeof x === "string" && unidadesVivas.has(x)))
      : null,
  };
}

/** Árbol de las vistas del lienzo: null = completo; el id del subárbol guardado cuya raíz se ve; undefined = una rama que no está guardada. */
export const arbolDeVista = (raiz: string | null, subarboles: { id: string; unidad_id: string }[]) =>
  raiz ? subarboles.find((s) => s.unidad_id === raiz)?.id : null;

/** Tipo cuya marca se dibuja; null si no se colorea por marca o ese tipo ya no lo usa ninguna unidad. */
export function tipoDeMarca(colorearPor: string, enUso: { id: string }[]): string | null {
  const id = /^marca:(.+)$/.exec(colorearPor)?.[1];
  return id && enUso.some((t) => t.id === id) ? id : null;
}

/** Entradas de leyenda que usan los puestos dibujados, una vez cada una y en el orden de la lista (incluye las desactivadas en uso). */
export function leyendasEnUso(puestos: { leyenda_id: string | null }[], leyendas: Leyenda[]): Leyenda[] {
  const usadas = new Set(puestos.map((p) => p.leyenda_id));
  return leyendas.filter((l) => usadas.has(l.id));
}
