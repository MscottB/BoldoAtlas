// Opciones del panel «Vista»: una sola configuración tipada por PC. La Task 11f suma aquí dirección, densidad y trazo.
export interface ConfigVista {
  verPuestos: boolean;
  mostrarCargo: boolean;
  mostrarPersona: boolean;
  /** Tipos de unidad cuyo superior más cercano se muestra en cada tarjeta. */
  rutaTipos: string[];
  /** Criterio de color: "ninguno" o "marca:<tipoId>". La Task 11d suma "leyenda" (leyenda del puesto). */
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
      typeof c.colorearPor === "string" && /^(ninguno|marca:.+)$/.test(c.colorearPor)
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
