import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, TIPO_SUBAREA } from "@/db/tipos";

/** Tipos de unidad que siembra la migración 0001 (un test los compara con ella). */
export const TIPOS_SEMILLA = [
  { id: TIPO_GERENCIA, nombre: "Gerencia", orden: 10 },
  { id: TIPO_AREA, nombre: "Área", orden: 20 },
  { id: TIPO_SUBAREA, nombre: "Subárea", orden: 30 },
  { id: TIPO_OTRA, nombre: "Otra", orden: 40 },
];