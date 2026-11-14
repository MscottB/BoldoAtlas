// Qué lleva la exportación completa (spec §11): las hojas y las columnas de cada una, en su orden. «id» es el id
// interno del registro, para cruzar con otro archivo.
export const HOJAS = {
  unidades: [
    "id",
    "tipo",
    "nombre",
    "descripcion",
    "superior",
    "ruta",
    "jefe",
    "correoJefe",
    "etiquetas",
    "dotacionDirecta",
    "dotacionTotal",
    "vacantes",
  ],
  puestos: [
    "id",
    "unidad",
    "ruta",
    "cargo",
    "descripcion",
    "leyenda",
    "titular",
    "reemplazo",
    "vacante",
    "diasVacante",
  ],
  asignaciones: ["id", "persona", "correo", "cargo", "unidad", "tipo", "desde", "hasta", "motivo"],
  conexiones: ["id", "origen", "destino", "etiqueta"],
  trabajadores: [
    "id",
    "nombre",
    "correo",
    "telefono",
    "tipoContrato",
    "sede",
    "jornada",
    "cargos",
    "unidades",
    "rutas",
    "jefes",
    "notas",
  ],
  mantenedores: ["id", "catalogo", "nombre", "usos"],
  zonas: ["id", "zona", "color", "unidad", "ruta"],
} as const;

export type IdHoja = keyof typeof HOJAS;
export const ID_HOJAS = Object.keys(HOJAS) as IdHoja[];

/** Vienen sin marcar: el id interno y las notas (spec §11: todas marcadas salvo notas y costos). */
const SIN_MARCAR: ReadonlySet<string> = new Set(["id", "notas"]);

export type Seleccion = Record<IdHoja, { incluida: boolean; columnas: Record<string, boolean> }>;

const objeto = (x: unknown): Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

/** Lo guardado (por PC), validado: lo que falta o no es un sí/no vuelve a lo de fábrica; lo desconocido se descarta. */
export function leerSeleccion(crudo: unknown): Seleccion {
  const guardada = objeto(crudo);
  return Object.fromEntries(
    ID_HOJAS.map((h) => {
      const hoja = objeto(guardada[h]);
      const columnas = objeto(hoja.columnas);
      return [
        h,
        {
          incluida: typeof hoja.incluida === "boolean" ? hoja.incluida : true,
          columnas: Object.fromEntries(
            HOJAS[h].map((c) => [c, typeof columnas[c] === "boolean" ? columnas[c] : !SIN_MARCAR.has(c)]),
          ),
        },
      ];
    }),
  ) as Seleccion;
}

/** Clave de i18n del título de una columna (el de la casilla y el de la hoja). */
export const claveColumna = (h: IdHoja, c: string): string =>
  c === "id" ? "excel.completa.id" : `excel.completa.columnas.${h}.${c}`;

/** Las columnas marcadas de una hoja, en su orden. */
export const columnasElegidas = (s: Seleccion, h: IdHoja): string[] =>
  HOJAS[h].filter((c) => s[h].columnas[c]);
