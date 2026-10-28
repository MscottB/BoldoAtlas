// Filas tal como las devuelven las lecturas de src/db/repos (sin created_at/updated_at/deleted_at).
export interface Unidad {
  id: string;
  tipo: "gerencia" | "area" | "subarea" | "otra";
  nombre: string;
  descripcion: string | null;
  parent_id: string | null;
  jefe_id: string | null;
  orden: number;
}

export interface Trabajador {
  id: string;
  estado: "activo" | "vacante";
  nombre: string | null;
  correo: string | null;
  telefono: string | null;
  cargo_id: string | null;
  tipo_contrato_id: string | null;
  sede_id: string | null;
  jornada_id: string | null;
  unidad_id: string;
  foto_png: string | null;
  notas: string | null;
}

export type TablaCatalogo = "cargos" | "tipos_contrato" | "sedes" | "jornadas";

export const TABLAS_CATALOGO: readonly TablaCatalogo[] = ["cargos", "tipos_contrato", "sedes", "jornadas"];

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

export interface Conexion {
  id: string;
  origen_id: string;
  destino_id: string;
  etiqueta: string | null;
}
