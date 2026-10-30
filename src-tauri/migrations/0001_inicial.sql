-- BoldoAtlas · esquema 1. Reglas: spec §5. PRAGMA user_version lo fija Rust (src/db.rs).
-- Toda tabla de negocio: id UUID v7, created_at/updated_at ISO-8601 UTC, deleted_at = borrado lógico.

CREATE TABLE meta (
  clave TEXT PRIMARY KEY NOT NULL,
  valor TEXT
);

-- Niveles que nombra cada organización (Gerencia, Superintendencia, Área…). orden = nivel sugerido; no restringe la estructura.
CREATE TABLE tipos_unidad (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_tipos_unidad_nombre ON tipos_unidad(lower(trim(nombre))) WHERE deleted_at IS NULL;
-- Semillas con ids fijos (TIPO_* en src/db/tipos.ts); el usuario las renombra, reordena o desactiva.
INSERT INTO tipos_unidad (id, nombre, orden, created_at, updated_at) VALUES
  ('00000000-0000-7000-8000-000000000001', 'Gerencia', 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('00000000-0000-7000-8000-000000000002', 'Área',     20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('00000000-0000-7000-8000-000000000003', 'Subárea',  30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('00000000-0000-7000-8000-000000000004', 'Otra',     40, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE unidades (
  id          TEXT PRIMARY KEY NOT NULL,
  tipo_id     TEXT NOT NULL REFERENCES tipos_unidad(id) DEFERRABLE INITIALLY DEFERRED,
  nombre      TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  descripcion TEXT,
  parent_id   TEXT REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  jefe_puesto_id TEXT REFERENCES puestos(id) DEFERRABLE INITIALLY DEFERRED,
  marca_color  TEXT,
  marca_codigo TEXT CHECK (length(marca_codigo) <= 4),
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_unidades_tipo_id ON unidades(tipo_id);
CREATE INDEX idx_unidades_parent_id ON unidades(parent_id);
CREATE INDEX idx_unidades_jefe_puesto_id ON unidades(jefe_puesto_id);

-- Mantenedores: valores de lista de la ficha del trabajador. Desactivar = deleted_at (la ficha conserva su id).
CREATE TABLE cargos (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_cargos_nombre ON cargos(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE tipos_contrato (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_tipos_contrato_nombre ON tipos_contrato(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE sedes (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_sedes_nombre ON sedes(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE jornadas (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_jornadas_nombre ON jornadas(lower(trim(nombre))) WHERE deleted_at IS NULL;

-- La persona; su unidad, cargo y jefatura salen de sus asignaciones vigentes a puestos.
CREATE TABLE trabajadores (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  correo     TEXT,
  telefono   TEXT,
  tipo_contrato_id TEXT REFERENCES tipos_contrato(id) DEFERRABLE INITIALLY DEFERRED,
  sede_id          TEXT REFERENCES sedes(id) DEFERRABLE INITIALLY DEFERRED,
  jornada_id       TEXT REFERENCES jornadas(id) DEFERRABLE INITIALLY DEFERRED,
  foto_png   TEXT,
  notas      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_trabajadores_tipo_contrato_id ON trabajadores(tipo_contrato_id);
CREATE INDEX idx_trabajadores_sede_id ON trabajadores(sede_id);
CREATE INDEX idx_trabajadores_jornada_id ON trabajadores(jornada_id);
CREATE UNIQUE INDEX ux_trabajadores_correo ON trabajadores(lower(trim(correo)))
  WHERE correo IS NOT NULL AND trim(correo) <> '' AND deleted_at IS NULL;

-- Puesto = un cargo en una unidad. Vacante = puesto sin titular vigente.
CREATE TABLE puestos (
  id          TEXT PRIMARY KEY NOT NULL,
  unidad_id   TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  cargo_id    TEXT NOT NULL REFERENCES cargos(id) DEFERRABLE INITIALLY DEFERRED,
  descripcion TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_puestos_unidad_id ON puestos(unidad_id);
CREATE INDEX idx_puestos_cargo_id ON puestos(cargo_id);

-- Quién ocupa cada puesto y desde/hasta cuándo (AAAA-MM-DD). hasta NULL = vigente; las cerradas son el historial.
CREATE TABLE asignaciones (
  id            TEXT PRIMARY KEY NOT NULL,
  puesto_id     TEXT NOT NULL REFERENCES puestos(id) DEFERRABLE INITIALLY DEFERRED,
  trabajador_id TEXT NOT NULL REFERENCES trabajadores(id) DEFERRABLE INITIALLY DEFERRED,
  tipo          TEXT NOT NULL CHECK (tipo IN ('titular', 'reemplazo')),
  desde         TEXT NOT NULL,
  hasta         TEXT CHECK (hasta IS NULL OR hasta >= desde),
  motivo        TEXT,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_asignaciones_puesto_id ON asignaciones(puesto_id);
CREATE INDEX idx_asignaciones_trabajador_id ON asignaciones(trabajador_id);
CREATE UNIQUE INDEX ux_asignaciones_titular_vigente ON asignaciones(puesto_id)
  WHERE tipo = 'titular' AND hasta IS NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX ux_asignaciones_reemplazo_vigente ON asignaciones(puesto_id)
  WHERE tipo = 'reemplazo' AND hasta IS NULL AND deleted_at IS NULL;

CREATE TABLE conexiones (
  id         TEXT PRIMARY KEY NOT NULL,
  origen_id  TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  destino_id TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  etiqueta   TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (origen_id <> destino_id)
);
CREATE INDEX idx_conexiones_origen_id ON conexiones(origen_id);
CREATE INDEX idx_conexiones_destino_id ON conexiones(destino_id);

CREATE TABLE etiquetas (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_etiquetas_nombre ON etiquetas(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE unidad_etiquetas (
  id          TEXT PRIMARY KEY NOT NULL,
  unidad_id   TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  etiqueta_id TEXT NOT NULL REFERENCES etiquetas(id) DEFERRABLE INITIALLY DEFERRED,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_unidad_etiquetas_unidad_id ON unidad_etiquetas(unidad_id);
CREATE INDEX idx_unidad_etiquetas_etiqueta_id ON unidad_etiquetas(etiqueta_id);
CREATE UNIQUE INDEX ux_unidad_etiquetas ON unidad_etiquetas(unidad_id, etiqueta_id) WHERE deleted_at IS NULL;

CREATE TABLE procesos (
  id            TEXT PRIMARY KEY NOT NULL,
  unidad_id     TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  nombre        TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  descripcion   TEXT,
  proveedores   TEXT,
  entradas      TEXT,
  salidas       TEXT,
  clientes      TEXT,
  frecuencia    TEXT CHECK (frecuencia IN ('diaria', 'semanal', 'mensual', 'trimestral', 'anual', 'eventual')),
  criticidad    TEXT CHECK (criticidad IN ('baja', 'media', 'alta')),
  estado        TEXT NOT NULL DEFAULT 'borrador'
                CHECK (estado IN ('borrador', 'documentado', 'en_revision', 'obsoleto')),
  documento_ref TEXT,
  orden         INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_procesos_unidad_id ON procesos(unidad_id);

CREATE TABLE actividades (
  id          TEXT PRIMARY KEY NOT NULL,
  proceso_id  TEXT NOT NULL REFERENCES procesos(id) DEFERRABLE INITIALLY DEFERRED,
  nombre      TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  descripcion TEXT,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_actividades_proceso_id ON actividades(proceso_id);

CREATE TABLE actividad_roles (
  id            TEXT PRIMARY KEY NOT NULL,
  actividad_id  TEXT NOT NULL REFERENCES actividades(id) DEFERRABLE INITIALLY DEFERRED,
  trabajador_id TEXT NOT NULL REFERENCES trabajadores(id) DEFERRABLE INITIALLY DEFERRED,
  rol           TEXT NOT NULL CHECK (rol IN ('R', 'A', 'C', 'I')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_actividad_roles_actividad_id ON actividad_roles(actividad_id);
CREATE INDEX idx_actividad_roles_trabajador_id ON actividad_roles(trabajador_id);
CREATE UNIQUE INDEX ux_roles_persona ON actividad_roles(actividad_id, trabajador_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_roles_aprobador ON actividad_roles(actividad_id) WHERE rol = 'A' AND deleted_at IS NULL;

-- Ramas guardadas en "Árboles": una unidad se abre como árbol propio sin dejar de colgar de su superior.
CREATE TABLE subarboles_guardados (
  id         TEXT PRIMARY KEY NOT NULL,
  unidad_id  TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  nombre     TEXT,
  orden      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_subarboles_guardados_unidad_id ON subarboles_guardados(unidad_id);
CREATE UNIQUE INDEX ux_subarboles_unidad ON subarboles_guardados(unidad_id) WHERE deleted_at IS NULL;
