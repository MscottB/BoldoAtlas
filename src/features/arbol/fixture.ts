import type { Trabajador, Unidad } from "../../db/tipos";

// Fixture compartido por los tests del árbol.
export type ConBorrado<T> = T & { deleted_at?: string | null };

export function u(
  id: string,
  tipo: Unidad["tipo"],
  nombre: string,
  parent_id: string | null,
  orden = 0,
): ConBorrado<Unidad> {
  return { id, tipo, nombre, descripcion: null, parent_id, jefe_id: null, orden };
}

export function t(
  id: string,
  unidad_id: string,
  estado: Trabajador["estado"] = "activo",
): ConBorrado<Trabajador> {
  return {
    id,
    estado,
    nombre: estado === "activo" ? id : null,
    correo: null,
    telefono: null,
    cargo_id: null,
    tipo_contrato_id: null,
    sede_id: null,
    jornada_id: null,
    unidad_id,
    foto_png: null,
    notas: null,
  };
}

// GG › Operaciones › Mantención › {Mecánica, Eléctrica}; GG › Finanzas (+ una unidad borrada).
export const unidades: ConBorrado<Unidad>[] = [
  u("gg", "otra", "Gerencia General", null),
  u("finanzas", "gerencia", "Finanzas", "gg", 1),
  u("operaciones", "gerencia", "Operaciones", "gg", 0),
  u("mantencion", "area", "Mantención", "operaciones"),
  u("mecanica", "subarea", "Mecánica", "mantencion"),
  u("electrica", "subarea", "Eléctrica", "mantencion"),
  { ...u("borrada", "subarea", "Borrada", "mantencion"), deleted_at: "2026-01-01T00:00:00.000Z" },
];

// 8 trabajadores, 2 vacantes. Rama de Mantención: 5 activos + 1 vacante.
export const trabajadores: ConBorrado<Trabajador>[] = [
  t("t1", "gg"),
  t("t2", "finanzas", "vacante"),
  t("t3", "mantencion"),
  t("t4", "mecanica"),
  t("t5", "mecanica"),
  t("t6", "mecanica", "vacante"),
  t("t7", "electrica"),
  t("t8", "electrica"),
];
