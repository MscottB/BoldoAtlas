import {
  TIPO_AREA,
  TIPO_GERENCIA,
  TIPO_OTRA,
  TIPO_SUBAREA,
  type Asignacion,
  type Puesto,
  type Unidad,
  type ValorCatalogo,
} from "../../db/tipos";

// Fixture compartido por los tests del árbol.
export type ConBorrado<T> = T & { deleted_at?: string | null };

export function u(
  id: string,
  tipo_id: string,
  nombre: string,
  parent_id: string | null,
  orden = 0,
): ConBorrado<Unidad> {
  return {
    id,
    tipo_id,
    nombre,
    descripcion: null,
    parent_id,
    jefe_puesto_id: null,
    marca_color: null,
    marca_codigo: null,
    orden,
  };
}

export const p = (id: string, unidad_id: string): ConBorrado<Puesto> => ({
  id,
  unidad_id,
  cargo_id: "cargo",
  descripcion: null,
  orden: 0,
});

/** Asignación vigente salvo que se indique `hasta`. */
export const a = (
  id: string,
  puesto_id: string,
  trabajador_id: string,
  tipo: Asignacion["tipo"] = "titular",
  hasta: string | null = null,
): ConBorrado<Asignacion> => ({
  id,
  puesto_id,
  trabajador_id,
  tipo,
  desde: "2026-01-01",
  hasta,
  motivo: null,
});

// Los tipos que siembra la migración.
export const tipos: ValorCatalogo[] = [
  { id: TIPO_GERENCIA, nombre: "Gerencia", orden: 10, deleted_at: null },
  { id: TIPO_AREA, nombre: "Área", orden: 20, deleted_at: null },
  { id: TIPO_SUBAREA, nombre: "Subárea", orden: 30, deleted_at: null },
  { id: TIPO_OTRA, nombre: "Otra", orden: 40, deleted_at: null },
];

// GG › Operaciones › Mantención › {Mecánica, Eléctrica}; GG › Finanzas (+ una unidad borrada).
export const unidades: ConBorrado<Unidad>[] = [
  u("gg", TIPO_OTRA, "Gerencia General", null),
  u("finanzas", TIPO_GERENCIA, "Finanzas", "gg", 1),
  u("operaciones", TIPO_GERENCIA, "Operaciones", "gg", 0),
  u("mantencion", TIPO_AREA, "Mantención", "operaciones"),
  u("mecanica", TIPO_SUBAREA, "Mecánica", "mantencion"),
  u("electrica", TIPO_SUBAREA, "Eléctrica", "mantencion"),
  { ...u("borrada", TIPO_SUBAREA, "Borrada", "mantencion"), deleted_at: "2026-01-01T00:00:00.000Z" },
];

// 8 puestos, 2 vacantes (p2 y p6). Rama de Mantención: 5 con titular + 1 vacante.
export const puestos: ConBorrado<Puesto>[] = [
  p("p1", "gg"),
  p("p2", "finanzas"),
  p("p3", "mantencion"),
  p("p4", "mecanica"),
  p("p5", "mecanica"),
  p("p6", "mecanica"),
  p("p7", "electrica"),
  p("p8", "electrica"),
];

// Titulares vigentes en los puestos ocupados; p2 solo tiene un titular cerrado y p6 un reemplazo vigente.
export const asignaciones: ConBorrado<Asignacion>[] = [
  a("a1", "p1", "t1"),
  a("a2", "p2", "t2", "titular", "2026-02-01"),
  a("a3", "p3", "t3"),
  a("a4", "p4", "t4"),
  a("a5", "p5", "t5"),
  a("a6", "p6", "t3", "reemplazo"),
  a("a7", "p7", "t7"),
  a("a8", "p8", "t8"),
];
