import type { Leyenda } from "@/db/tipos";

// Opciones del panel «Vista»: una sola configuración tipada por PC. La Task 11f suma aquí dirección, densidad y trazo.
export interface ConfigVista {
  verPuestos: boolean;
  mostrarCargo: boolean;
  mostrarPersona: boolean;
  /** Tipos de unidad cuyo superior más cercano se muestra en cada tarjeta. */
  rutaTipos: string[];
  /** Criterio de color: "ninguno", "marca:<tipoId>" o "leyenda" (la leyenda del puesto). */
  colorearPor: string;
  /** Leyenda flotante visible (solo se dibuja si hay criterio de color). */
  leyenda: boolean;
}

export const VISTA_POR_DEFECTO: ConfigVista = {
  verPuestos: false,
  mostrarCargo: true,
  mostrarPersona: true,
  rutaTipos: [],
  colorearPor: "ninguno",
  leyenda: true,
};

export const ALTO_UNIDAD = 112;
/** Con la ruta por tipo la tarjeta suma una línea. */
export const ALTO_UNIDAD_CON_RUTA = 132;

/** Criterio «Colorear por»: cada puesto usa el color de su entrada de leyenda. */
export const CRITERIO_LEYENDA = "leyenda";

export const criterioMarca = (tipoId: string) => `marca:${tipoId}`;

/** Lo guardado en localStorage puede venir de otra versión o dañado: cada campo inválido vuelve a su valor por defecto. */
export function leerVista(crudo: unknown): ConfigVista {
  const c = (typeof crudo === "object" && crudo !== null ? crudo : {}) as Record<string, unknown>;
  const d = VISTA_POR_DEFECTO;
  const bool = (k: "verPuestos" | "mostrarCargo" | "mostrarPersona" | "leyenda") =>
    typeof c[k] === "boolean" ? c[k] : d[k];
  return {
    verPuestos: bool("verPuestos"),
    mostrarCargo: bool("mostrarCargo"),
    mostrarPersona: bool("mostrarPersona"),
    rutaTipos:
      Array.isArray(c.rutaTipos) && c.rutaTipos.every((t) => typeof t === "string")
        ? c.rutaTipos
        : d.rutaTipos,
    colorearPor:
      typeof c.colorearPor === "string" && /^(ninguno|leyenda|marca:.+)$/.test(c.colorearPor)
        ? c.colorearPor
        : d.colorearPor,
    leyenda: bool("leyenda"),
  };
}

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
