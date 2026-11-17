-- BoldoAtlas · esquema 3: historial de cambios. Los triggers se generan con scripts/generar-historial.mjs.
CREATE TABLE historial_acciones (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  origen TEXT NOT NULL CHECK (origen IN ('app','importar','revisar','suprimir')),
  datos TEXT NOT NULL DEFAULT '{}',
  estado TEXT NOT NULL DEFAULT 'hecha' CHECK (estado IN ('hecha','deshecha')),
  rehacible INTEGER,
  bloqueada INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX historial_acciones_fecha ON historial_acciones (fecha);
CREATE TABLE historial_filas (
  accion_id TEXT NOT NULL REFERENCES historial_acciones (id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
  orden INTEGER NOT NULL,
  tabla TEXT NOT NULL,
  fila_id TEXT NOT NULL,
  op TEXT NOT NULL CHECK (op IN ('insert','update','delete')),
  antes TEXT,
  despues TEXT,
  PRIMARY KEY (accion_id, orden)
);
CREATE INDEX historial_filas_fila ON historial_filas (tabla, fila_id);
CREATE TABLE historial_en_curso (uno INTEGER PRIMARY KEY CHECK (uno = 1), accion_id TEXT);
INSERT INTO historial_en_curso VALUES (1, NULL);

CREATE TRIGGER historial_actividad_roles_insert AFTER INSERT ON actividad_roles WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividad_roles', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'actividad_id', NEW.actividad_id, 'trabajador_id', NEW.trabajador_id, 'rol', NEW.rol, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_actividad_roles_update AFTER UPDATE ON actividad_roles WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividad_roles', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'actividad_id' AS k, OLD.actividad_id AS a, NEW.actividad_id AS d WHERE OLD.actividad_id IS NOT NEW.actividad_id
    UNION ALL SELECT 'trabajador_id' AS k, OLD.trabajador_id AS a, NEW.trabajador_id AS d WHERE OLD.trabajador_id IS NOT NEW.trabajador_id
    UNION ALL SELECT 'rol' AS k, OLD.rol AS a, NEW.rol AS d WHERE OLD.rol IS NOT NEW.rol
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_actividad_roles_delete AFTER DELETE ON actividad_roles WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividad_roles', OLD.id, 'delete', json_object('id', OLD.id, 'actividad_id', OLD.actividad_id, 'trabajador_id', OLD.trabajador_id, 'rol', OLD.rol, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_actividades_insert AFTER INSERT ON actividades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividades', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'proceso_id', NEW.proceso_id, 'nombre', NEW.nombre, 'descripcion', NEW.descripcion, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_actividades_update AFTER UPDATE ON actividades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividades', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'proceso_id' AS k, OLD.proceso_id AS a, NEW.proceso_id AS d WHERE OLD.proceso_id IS NOT NEW.proceso_id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'descripcion' AS k, OLD.descripcion AS a, NEW.descripcion AS d WHERE OLD.descripcion IS NOT NEW.descripcion
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_actividades_delete AFTER DELETE ON actividades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'actividades', OLD.id, 'delete', json_object('id', OLD.id, 'proceso_id', OLD.proceso_id, 'nombre', OLD.nombre, 'descripcion', OLD.descripcion, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_asignaciones_insert AFTER INSERT ON asignaciones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'asignaciones', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'puesto_id', NEW.puesto_id, 'trabajador_id', NEW.trabajador_id, 'tipo', NEW.tipo, 'desde', NEW.desde, 'hasta', NEW.hasta, 'motivo', NEW.motivo, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_asignaciones_update AFTER UPDATE ON asignaciones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'asignaciones', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'puesto_id' AS k, OLD.puesto_id AS a, NEW.puesto_id AS d WHERE OLD.puesto_id IS NOT NEW.puesto_id
    UNION ALL SELECT 'trabajador_id' AS k, OLD.trabajador_id AS a, NEW.trabajador_id AS d WHERE OLD.trabajador_id IS NOT NEW.trabajador_id
    UNION ALL SELECT 'tipo' AS k, OLD.tipo AS a, NEW.tipo AS d WHERE OLD.tipo IS NOT NEW.tipo
    UNION ALL SELECT 'desde' AS k, OLD.desde AS a, NEW.desde AS d WHERE OLD.desde IS NOT NEW.desde
    UNION ALL SELECT 'hasta' AS k, OLD.hasta AS a, NEW.hasta AS d WHERE OLD.hasta IS NOT NEW.hasta
    UNION ALL SELECT 'motivo' AS k, OLD.motivo AS a, NEW.motivo AS d WHERE OLD.motivo IS NOT NEW.motivo
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_asignaciones_delete AFTER DELETE ON asignaciones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'asignaciones', OLD.id, 'delete', json_object('id', OLD.id, 'puesto_id', OLD.puesto_id, 'trabajador_id', OLD.trabajador_id, 'tipo', OLD.tipo, 'desde', OLD.desde, 'hasta', OLD.hasta, 'motivo', OLD.motivo, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_cargos_insert AFTER INSERT ON cargos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'cargos', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_cargos_update AFTER UPDATE ON cargos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'cargos', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_cargos_delete AFTER DELETE ON cargos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'cargos', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_conexiones_insert AFTER INSERT ON conexiones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'conexiones', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'origen_id', NEW.origen_id, 'destino_id', NEW.destino_id, 'etiqueta', NEW.etiqueta, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_conexiones_update AFTER UPDATE ON conexiones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'conexiones', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'origen_id' AS k, OLD.origen_id AS a, NEW.origen_id AS d WHERE OLD.origen_id IS NOT NEW.origen_id
    UNION ALL SELECT 'destino_id' AS k, OLD.destino_id AS a, NEW.destino_id AS d WHERE OLD.destino_id IS NOT NEW.destino_id
    UNION ALL SELECT 'etiqueta' AS k, OLD.etiqueta AS a, NEW.etiqueta AS d WHERE OLD.etiqueta IS NOT NEW.etiqueta
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_conexiones_delete AFTER DELETE ON conexiones WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'conexiones', OLD.id, 'delete', json_object('id', OLD.id, 'origen_id', OLD.origen_id, 'destino_id', OLD.destino_id, 'etiqueta', OLD.etiqueta, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_etiquetas_insert AFTER INSERT ON etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'etiquetas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'color', NEW.color, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_etiquetas_update AFTER UPDATE ON etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'etiquetas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'color' AS k, OLD.color AS a, NEW.color AS d WHERE OLD.color IS NOT NEW.color
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_etiquetas_delete AFTER DELETE ON etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'etiquetas', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'color', OLD.color, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_jornadas_insert AFTER INSERT ON jornadas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'jornadas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_jornadas_update AFTER UPDATE ON jornadas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'jornadas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_jornadas_delete AFTER DELETE ON jornadas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'jornadas', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_leyendas_insert AFTER INSERT ON leyendas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'leyendas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'color', NEW.color, 'descripcion', NEW.descripcion, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_leyendas_update AFTER UPDATE ON leyendas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'leyendas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'color' AS k, OLD.color AS a, NEW.color AS d WHERE OLD.color IS NOT NEW.color
    UNION ALL SELECT 'descripcion' AS k, OLD.descripcion AS a, NEW.descripcion AS d WHERE OLD.descripcion IS NOT NEW.descripcion
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_leyendas_delete AFTER DELETE ON leyendas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'leyendas', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'color', OLD.color, 'descripcion', OLD.descripcion, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_meta_insert AFTER INSERT ON meta WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL AND NEW.clave IN ('org_nombre','logo_png','revision_bien','historial_plazo_dias')
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'meta', NEW.clave, 'insert', NULL, json_object('clave', NEW.clave, 'valor', NEW.valor);
END;
CREATE TRIGGER historial_meta_update AFTER UPDATE ON meta WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL AND NEW.clave IN ('org_nombre','logo_png','revision_bien','historial_plazo_dias')
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'meta', NEW.clave, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'clave' AS k, OLD.clave AS a, NEW.clave AS d WHERE OLD.clave IS NOT NEW.clave
    UNION ALL SELECT 'valor' AS k, OLD.valor AS a, NEW.valor AS d WHERE OLD.valor IS NOT NEW.valor)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_meta_delete AFTER DELETE ON meta WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL AND OLD.clave IN ('org_nombre','logo_png','revision_bien','historial_plazo_dias')
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'meta', OLD.clave, 'delete', json_object('clave', OLD.clave, 'valor', OLD.valor), NULL;
END;
CREATE TRIGGER historial_procesos_insert AFTER INSERT ON procesos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'procesos', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'unidad_id', NEW.unidad_id, 'nombre', NEW.nombre, 'descripcion', NEW.descripcion, 'proveedores', NEW.proveedores, 'entradas', NEW.entradas, 'salidas', NEW.salidas, 'clientes', NEW.clientes, 'frecuencia', NEW.frecuencia, 'criticidad', NEW.criticidad, 'estado', NEW.estado, 'documento_ref', NEW.documento_ref, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_procesos_update AFTER UPDATE ON procesos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'procesos', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'unidad_id' AS k, OLD.unidad_id AS a, NEW.unidad_id AS d WHERE OLD.unidad_id IS NOT NEW.unidad_id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'descripcion' AS k, OLD.descripcion AS a, NEW.descripcion AS d WHERE OLD.descripcion IS NOT NEW.descripcion
    UNION ALL SELECT 'proveedores' AS k, OLD.proveedores AS a, NEW.proveedores AS d WHERE OLD.proveedores IS NOT NEW.proveedores
    UNION ALL SELECT 'entradas' AS k, OLD.entradas AS a, NEW.entradas AS d WHERE OLD.entradas IS NOT NEW.entradas
    UNION ALL SELECT 'salidas' AS k, OLD.salidas AS a, NEW.salidas AS d WHERE OLD.salidas IS NOT NEW.salidas
    UNION ALL SELECT 'clientes' AS k, OLD.clientes AS a, NEW.clientes AS d WHERE OLD.clientes IS NOT NEW.clientes
    UNION ALL SELECT 'frecuencia' AS k, OLD.frecuencia AS a, NEW.frecuencia AS d WHERE OLD.frecuencia IS NOT NEW.frecuencia
    UNION ALL SELECT 'criticidad' AS k, OLD.criticidad AS a, NEW.criticidad AS d WHERE OLD.criticidad IS NOT NEW.criticidad
    UNION ALL SELECT 'estado' AS k, OLD.estado AS a, NEW.estado AS d WHERE OLD.estado IS NOT NEW.estado
    UNION ALL SELECT 'documento_ref' AS k, OLD.documento_ref AS a, NEW.documento_ref AS d WHERE OLD.documento_ref IS NOT NEW.documento_ref
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_procesos_delete AFTER DELETE ON procesos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'procesos', OLD.id, 'delete', json_object('id', OLD.id, 'unidad_id', OLD.unidad_id, 'nombre', OLD.nombre, 'descripcion', OLD.descripcion, 'proveedores', OLD.proveedores, 'entradas', OLD.entradas, 'salidas', OLD.salidas, 'clientes', OLD.clientes, 'frecuencia', OLD.frecuencia, 'criticidad', OLD.criticidad, 'estado', OLD.estado, 'documento_ref', OLD.documento_ref, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_puestos_insert AFTER INSERT ON puestos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'puestos', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'unidad_id', NEW.unidad_id, 'cargo_id', NEW.cargo_id, 'descripcion', NEW.descripcion, 'leyenda_id', NEW.leyenda_id, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_puestos_update AFTER UPDATE ON puestos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'puestos', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'unidad_id' AS k, OLD.unidad_id AS a, NEW.unidad_id AS d WHERE OLD.unidad_id IS NOT NEW.unidad_id
    UNION ALL SELECT 'cargo_id' AS k, OLD.cargo_id AS a, NEW.cargo_id AS d WHERE OLD.cargo_id IS NOT NEW.cargo_id
    UNION ALL SELECT 'descripcion' AS k, OLD.descripcion AS a, NEW.descripcion AS d WHERE OLD.descripcion IS NOT NEW.descripcion
    UNION ALL SELECT 'leyenda_id' AS k, OLD.leyenda_id AS a, NEW.leyenda_id AS d WHERE OLD.leyenda_id IS NOT NEW.leyenda_id
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_puestos_delete AFTER DELETE ON puestos WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'puestos', OLD.id, 'delete', json_object('id', OLD.id, 'unidad_id', OLD.unidad_id, 'cargo_id', OLD.cargo_id, 'descripcion', OLD.descripcion, 'leyenda_id', OLD.leyenda_id, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_sedes_insert AFTER INSERT ON sedes WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'sedes', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_sedes_update AFTER UPDATE ON sedes WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'sedes', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_sedes_delete AFTER DELETE ON sedes WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'sedes', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_subarboles_guardados_insert AFTER INSERT ON subarboles_guardados WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'subarboles_guardados', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'unidad_id', NEW.unidad_id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_subarboles_guardados_update AFTER UPDATE ON subarboles_guardados WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'subarboles_guardados', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'unidad_id' AS k, OLD.unidad_id AS a, NEW.unidad_id AS d WHERE OLD.unidad_id IS NOT NEW.unidad_id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_subarboles_guardados_delete AFTER DELETE ON subarboles_guardados WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'subarboles_guardados', OLD.id, 'delete', json_object('id', OLD.id, 'unidad_id', OLD.unidad_id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_tipos_contrato_insert AFTER INSERT ON tipos_contrato WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_contrato', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_tipos_contrato_update AFTER UPDATE ON tipos_contrato WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_contrato', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_tipos_contrato_delete AFTER DELETE ON tipos_contrato WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_contrato', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_tipos_unidad_insert AFTER INSERT ON tipos_unidad WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_unidad', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_tipos_unidad_update AFTER UPDATE ON tipos_unidad WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_unidad', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_tipos_unidad_delete AFTER DELETE ON tipos_unidad WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'tipos_unidad', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_trabajadores_insert AFTER INSERT ON trabajadores WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'trabajadores', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'correo', NEW.correo, 'telefono', NEW.telefono, 'tipo_contrato_id', NEW.tipo_contrato_id, 'sede_id', NEW.sede_id, 'jornada_id', NEW.jornada_id, 'foto_png', NEW.foto_png, 'notas', NEW.notas, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_trabajadores_update AFTER UPDATE ON trabajadores WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'trabajadores', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'correo' AS k, OLD.correo AS a, NEW.correo AS d WHERE OLD.correo IS NOT NEW.correo
    UNION ALL SELECT 'telefono' AS k, OLD.telefono AS a, NEW.telefono AS d WHERE OLD.telefono IS NOT NEW.telefono
    UNION ALL SELECT 'tipo_contrato_id' AS k, OLD.tipo_contrato_id AS a, NEW.tipo_contrato_id AS d WHERE OLD.tipo_contrato_id IS NOT NEW.tipo_contrato_id
    UNION ALL SELECT 'sede_id' AS k, OLD.sede_id AS a, NEW.sede_id AS d WHERE OLD.sede_id IS NOT NEW.sede_id
    UNION ALL SELECT 'jornada_id' AS k, OLD.jornada_id AS a, NEW.jornada_id AS d WHERE OLD.jornada_id IS NOT NEW.jornada_id
    UNION ALL SELECT 'foto_png' AS k, OLD.foto_png AS a, NEW.foto_png AS d WHERE OLD.foto_png IS NOT NEW.foto_png
    UNION ALL SELECT 'notas' AS k, OLD.notas AS a, NEW.notas AS d WHERE OLD.notas IS NOT NEW.notas
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_trabajadores_delete AFTER DELETE ON trabajadores WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'trabajadores', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'correo', OLD.correo, 'telefono', OLD.telefono, 'tipo_contrato_id', OLD.tipo_contrato_id, 'sede_id', OLD.sede_id, 'jornada_id', OLD.jornada_id, 'foto_png', OLD.foto_png, 'notas', OLD.notas, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_unidad_etiquetas_insert AFTER INSERT ON unidad_etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidad_etiquetas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'unidad_id', NEW.unidad_id, 'etiqueta_id', NEW.etiqueta_id, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_unidad_etiquetas_update AFTER UPDATE ON unidad_etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidad_etiquetas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'unidad_id' AS k, OLD.unidad_id AS a, NEW.unidad_id AS d WHERE OLD.unidad_id IS NOT NEW.unidad_id
    UNION ALL SELECT 'etiqueta_id' AS k, OLD.etiqueta_id AS a, NEW.etiqueta_id AS d WHERE OLD.etiqueta_id IS NOT NEW.etiqueta_id
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_unidad_etiquetas_delete AFTER DELETE ON unidad_etiquetas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidad_etiquetas', OLD.id, 'delete', json_object('id', OLD.id, 'unidad_id', OLD.unidad_id, 'etiqueta_id', OLD.etiqueta_id, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_unidades_insert AFTER INSERT ON unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidades', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'tipo_id', NEW.tipo_id, 'nombre', NEW.nombre, 'descripcion', NEW.descripcion, 'parent_id', NEW.parent_id, 'jefe_puesto_id', NEW.jefe_puesto_id, 'marca_color', NEW.marca_color, 'marca_codigo', NEW.marca_codigo, 'orden', NEW.orden, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_unidades_update AFTER UPDATE ON unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidades', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'tipo_id' AS k, OLD.tipo_id AS a, NEW.tipo_id AS d WHERE OLD.tipo_id IS NOT NEW.tipo_id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'descripcion' AS k, OLD.descripcion AS a, NEW.descripcion AS d WHERE OLD.descripcion IS NOT NEW.descripcion
    UNION ALL SELECT 'parent_id' AS k, OLD.parent_id AS a, NEW.parent_id AS d WHERE OLD.parent_id IS NOT NEW.parent_id
    UNION ALL SELECT 'jefe_puesto_id' AS k, OLD.jefe_puesto_id AS a, NEW.jefe_puesto_id AS d WHERE OLD.jefe_puesto_id IS NOT NEW.jefe_puesto_id
    UNION ALL SELECT 'marca_color' AS k, OLD.marca_color AS a, NEW.marca_color AS d WHERE OLD.marca_color IS NOT NEW.marca_color
    UNION ALL SELECT 'marca_codigo' AS k, OLD.marca_codigo AS a, NEW.marca_codigo AS d WHERE OLD.marca_codigo IS NOT NEW.marca_codigo
    UNION ALL SELECT 'orden' AS k, OLD.orden AS a, NEW.orden AS d WHERE OLD.orden IS NOT NEW.orden
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_unidades_delete AFTER DELETE ON unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'unidades', OLD.id, 'delete', json_object('id', OLD.id, 'tipo_id', OLD.tipo_id, 'nombre', OLD.nombre, 'descripcion', OLD.descripcion, 'parent_id', OLD.parent_id, 'jefe_puesto_id', OLD.jefe_puesto_id, 'marca_color', OLD.marca_color, 'marca_codigo', OLD.marca_codigo, 'orden', OLD.orden, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_vistas_insert AFTER INSERT ON vistas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'vistas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'arbol_id', NEW.arbol_id, 'nombre', NEW.nombre, 'config', NEW.config, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_vistas_update AFTER UPDATE ON vistas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'vistas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'arbol_id' AS k, OLD.arbol_id AS a, NEW.arbol_id AS d WHERE OLD.arbol_id IS NOT NEW.arbol_id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'config' AS k, OLD.config AS a, NEW.config AS d WHERE OLD.config IS NOT NEW.config
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_vistas_delete AFTER DELETE ON vistas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'vistas', OLD.id, 'delete', json_object('id', OLD.id, 'arbol_id', OLD.arbol_id, 'nombre', OLD.nombre, 'config', OLD.config, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_zona_unidades_insert AFTER INSERT ON zona_unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zona_unidades', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'zona_id', NEW.zona_id, 'unidad_id', NEW.unidad_id, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_zona_unidades_update AFTER UPDATE ON zona_unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zona_unidades', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'zona_id' AS k, OLD.zona_id AS a, NEW.zona_id AS d WHERE OLD.zona_id IS NOT NEW.zona_id
    UNION ALL SELECT 'unidad_id' AS k, OLD.unidad_id AS a, NEW.unidad_id AS d WHERE OLD.unidad_id IS NOT NEW.unidad_id
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_zona_unidades_delete AFTER DELETE ON zona_unidades WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zona_unidades', OLD.id, 'delete', json_object('id', OLD.id, 'zona_id', OLD.zona_id, 'unidad_id', OLD.unidad_id, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
CREATE TRIGGER historial_zonas_insert AFTER INSERT ON zonas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zonas', NEW.id, 'insert', NULL, json_object('id', NEW.id, 'nombre', NEW.nombre, 'color', NEW.color, 'created_at', NEW.created_at, 'updated_at', NEW.updated_at, 'deleted_at', NEW.deleted_at);
END;
CREATE TRIGGER historial_zonas_update AFTER UPDATE ON zonas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zonas', NEW.id, 'update', json_group_object(k, a), json_group_object(k, d)
  FROM (SELECT 'id' AS k, OLD.id AS a, NEW.id AS d WHERE OLD.id IS NOT NEW.id
    UNION ALL SELECT 'nombre' AS k, OLD.nombre AS a, NEW.nombre AS d WHERE OLD.nombre IS NOT NEW.nombre
    UNION ALL SELECT 'color' AS k, OLD.color AS a, NEW.color AS d WHERE OLD.color IS NOT NEW.color
    UNION ALL SELECT 'created_at' AS k, OLD.created_at AS a, NEW.created_at AS d WHERE OLD.created_at IS NOT NEW.created_at
    UNION ALL SELECT 'updated_at' AS k, OLD.updated_at AS a, NEW.updated_at AS d WHERE OLD.updated_at IS NOT NEW.updated_at
    UNION ALL SELECT 'deleted_at' AS k, OLD.deleted_at AS a, NEW.deleted_at AS d WHERE OLD.deleted_at IS NOT NEW.deleted_at)
  HAVING count(*) > 0;
END;
CREATE TRIGGER historial_zonas_delete AFTER DELETE ON zonas WHEN (SELECT accion_id FROM historial_en_curso) IS NOT NULL
BEGIN
  INSERT INTO historial_filas (accion_id, orden, tabla, fila_id, op, antes, despues)
  SELECT (SELECT accion_id FROM historial_en_curso), COALESCE((SELECT max(orden) FROM historial_filas WHERE accion_id = (SELECT accion_id FROM historial_en_curso)), 0) + 1, 'zonas', OLD.id, 'delete', json_object('id', OLD.id, 'nombre', OLD.nombre, 'color', OLD.color, 'created_at', OLD.created_at, 'updated_at', OLD.updated_at, 'deleted_at', OLD.deleted_at), NULL;
END;
