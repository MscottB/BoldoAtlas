import type { Sentencia } from "@/db/cliente";
import { ahora } from "@/lib/ids";
import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA } from "@/db/tipos";
import { guardarMeta } from "./meta";

/** Tipos de unidad que siembra la migración 0001 (un test los compara con ella). */
export const TIPOS_SEMILLA = [
  { id: TIPO_GERENCIA, nombre: "Gerencia", orden: 10 },
  { id: TIPO_AREA, nombre: "Área", orden: 20 },
  { id: TIPO_SUBAREA, nombre: "Subárea", orden: 30 },
  { id: TIPO_OTRA, nombre: "Otra", orden: 40 },
];

// Todas las tablas de la organización; `meta` (identidad y revisión de la base) no. Las claves foráneas son
// diferidas: el orden no importa dentro de la transacción.
export const TABLAS_ORGANIZACION = [
  "actividad_roles",
  "actividades",
  "procesos",
  "vistas",
  "subarboles_guardados",
  "unidad_etiquetas",
  "etiquetas",
  "conexiones",
  "asignaciones",
  "puestos",
  "leyendas",
  "trabajadores",
  "jornadas",
  "sedes",
  "tipos_contrato",
  "cargos",
  "unidades",
  "tipos_unidad",
];

/**
 * Deja la base como recién instalada, salvo su identidad: borra de verdad (no es borrado lógico) todo dato de la
 * organización, vuelve a sembrar los tipos de unidad y quita el logo. Solo se usa tras un respaldo, dentro del lote
 * que escribe lo nuevo.
 */
export function vaciarOrganizacion(): Sentencia[] {
  const t = ahora();
  return [
    ...TABLAS_ORGANIZACION.map((tabla) => ({ sql: `DELETE FROM ${tabla}` })),
    ...TIPOS_SEMILLA.map((s) => ({
      sql: "INSERT INTO tipos_unidad (id, nombre, orden, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      params: [s.id, s.nombre, s.orden, t, t],
    })),
    ...guardarMeta("logo_png", ""),
  ];
}
