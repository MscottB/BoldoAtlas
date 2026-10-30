// Filas tal como las devuelven las lecturas de src/db/repos (sin created_at/updated_at/deleted_at).
export interface Unidad {
  id: string;
  /** → `tipos_unidad`. */
  tipo_id: string;
  nombre: string;
  descripcion: string | null;
  parent_id: string | null;
  jefe_puesto_id: string | null;
  /** Hex `#rrggbb`. */
  marca_color: string | null;
  /** Hasta 4 caracteres. */
  marca_codigo: string | null;
  orden: number;
}

/** La persona; su unidad y cargo salen de sus asignaciones vigentes. */
export interface Trabajador {
  id: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  tipo_contrato_id: string | null;
  sede_id: string | null;
  jornada_id: string | null;
  foto_png: string | null;
  notas: string | null;
}

/** Un cargo en una unidad. */
export interface Puesto {
  id: string;
  unidad_id: string;
  cargo_id: string;
  descripcion: string | null;
  orden: number;
}

export interface Asignacion {
  id: string;
  puesto_id: string;
  trabajador_id: string;
  tipo: "titular" | "reemplazo";
  /** AAAA-MM-DD. */
  desde: string;
  /** AAAA-MM-DD; null = vigente. */
  hasta: string | null;
  motivo: string | null;
}

export type TablaCatalogo = "cargos" | "tipos_contrato" | "sedes" | "jornadas" | "tipos_unidad";

export const TABLAS_CATALOGO: readonly TablaCatalogo[] = [
  "cargos",
  "tipos_contrato",
  "sedes",
  "jornadas",
  "tipos_unidad",
];

// Ids de los tipos de unidad que siembra la migración: solo para semillas, datos de ejemplo y tests.
export const TIPO_GERENCIA = "00000000-0000-7000-8000-000000000001";
export const TIPO_AREA = "00000000-0000-7000-8000-000000000002";
export const TIPO_SUBAREA = "00000000-0000-7000-8000-000000000003";
export const TIPO_OTRA = "00000000-0000-7000-8000-000000000004";

export interface ValorCatalogo {
  id: string;
  nombre: string;
  orden: number;
  deleted_at: string | null;
}

export interface Etiqueta {
  id: string;
  nombre: string;
  color: string;
}

export interface SubarbolGuardado {
  id: string;
  unidad_id: string;
  nombre: string | null;
  orden: number;
}

export interface Conexion {
  id: string;
  origen_id: string;
  destino_id: string;
  etiqueta: string | null;
}
