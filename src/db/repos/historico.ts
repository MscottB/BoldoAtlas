// Solo lectura, para «ver el organigrama a una fecha»: a diferencia de las lecturas normales, trae también lo
// eliminado (con su deleted_at) para decidir por fecha qué existía. Nunca se mezcla con los datos que se editan.
export const SQL_HISTORICO = {
  unidades: `SELECT id, tipo_id, nombre, descripcion, parent_id, jefe_puesto_id, marca_color, marca_codigo, orden,
    created_at, deleted_at FROM unidades ORDER BY orden, nombre`,
  puestos: `SELECT id, unidad_id, cargo_id, descripcion, leyenda_id, orden, created_at, deleted_at
    FROM puestos ORDER BY orden`,
  asignaciones: `SELECT id, puesto_id, trabajador_id, tipo, desde, hasta, motivo, created_at, deleted_at
    FROM asignaciones ORDER BY desde, created_at`,
  // Como SQL_TRABAJADORES: sin foto ni notas, que no se muestran hasta pedirlas.
  trabajadores: `SELECT id, nombre, correo, telefono, tipo_contrato_id, sede_id, jornada_id,
    COALESCE(octet_length(foto_png) > 0, 0) AS tiene_foto, updated_at, deleted_at
    FROM trabajadores ORDER BY nombre`,
};
