// Lo eliminado (borrado lógico) para la lista «Eliminados». Como SQL_HISTORICO, trae lo que las lecturas normales
// ocultan. `padre_*`: la unidad (del puesto) o el superior (de la unidad) y si también está eliminada, que impide restaurar.
// A las personas suprimidas las quita `armarEliminados` con meta.suprimidas.
export const SQL_ELIMINADOS_PERSONAS = `SELECT id, nombre, deleted_at AS fecha, NULL AS padre_nombre, 0 AS padre_eliminado
  FROM trabajadores WHERE deleted_at IS NOT NULL`;

export const SQL_ELIMINADOS_UNIDADES = `SELECT u.id, u.nombre, u.deleted_at AS fecha, p.nombre AS padre_nombre,
  p.deleted_at IS NOT NULL AS padre_eliminado
  FROM unidades u LEFT JOIN unidades p ON p.id = u.parent_id WHERE u.deleted_at IS NOT NULL`;

export const SQL_ELIMINADOS_PUESTOS = `SELECT q.id, c.nombre AS nombre, q.deleted_at AS fecha, u.nombre AS padre_nombre,
  u.deleted_at IS NOT NULL AS padre_eliminado
  FROM puestos q JOIN cargos c ON c.id = q.cargo_id JOIN unidades u ON u.id = q.unidad_id
  WHERE q.deleted_at IS NOT NULL`;
