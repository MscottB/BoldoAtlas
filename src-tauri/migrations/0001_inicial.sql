-- BoldoAtlas · esquema 1. Reglas: spec §5. PRAGMA user_version lo fija Rust (src/db.rs).
-- Toda tabla de negocio: id UUID v7, created_at/updated_at ISO-8601 UTC, deleted_at = borrado lógico.

CREATE TABLE meta (
  clave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE unidades (
  id          TEXT PRIMARY KEY,
  tipo        TEXT NOT NULL CHECK (tipo IN ('gerencia', 'area', 'subarea', 'otra')),
  nombre      TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  descripcion TEXT,
  parent_id   TEXT REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  jefe_id     TEXT REFERENCES trabajadores(id) DEFERRABLE INITIALLY DEFERRED,
  orden       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_unidades_parent_id ON unidades(parent_id);
CREATE INDEX idx_unidades_jefe_id ON unidades(jefe_id);

CREATE TABLE trabajadores (
  id         TEXT PRIMARY KEY,
  estado     TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'vacante')),
  nombre     TEXT,
  correo     TEXT,
  telefono   TEXT,
  cargo      TEXT,
  unidad_id  TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  foto_png   TEXT,
  notas      TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  CHECK (estado = 'vacante' OR length(trim(coalesce(nombre, ''))) > 0),
  CHECK (estado = 'activo' OR length(trim(coalesce(cargo, ''))) > 0)
);
CREATE INDEX idx_trabajadores_unidad_id ON trabajadores(unidad_id);
CREATE UNIQUE INDEX ux_trabajadores_correo ON trabajadores(lower(trim(correo)))
  WHERE correo IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE conexiones (
  id         TEXT PRIMARY KEY,
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
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  color      TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_etiquetas_nombre ON etiquetas(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE unidad_etiquetas (
  id          TEXT PRIMARY KEY,
  unidad_id   TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  etiqueta_id TEXT NOT NULL REFERENCES etiquetas(id) DEFERRABLE INITIALLY DEFERRED,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  deleted_at  TEXT
);
CREATE INDEX idx_unidad_etiquetas_etiqueta_id ON unidad_etiquetas(etiqueta_id);
CREATE UNIQUE INDEX ux_unidad_etiquetas ON unidad_etiquetas(unidad_id, etiqueta_id) WHERE deleted_at IS NULL;

CREATE TABLE procesos (
  id            TEXT PRIMARY KEY,
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
  id          TEXT PRIMARY KEY,
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
  id            TEXT PRIMARY KEY,
  actividad_id  TEXT NOT NULL REFERENCES actividades(id) DEFERRABLE INITIALLY DEFERRED,
  trabajador_id TEXT NOT NULL REFERENCES trabajadores(id) DEFERRABLE INITIALLY DEFERRED,
  rol           TEXT NOT NULL CHECK (rol IN ('R', 'A', 'C', 'I')),
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  deleted_at    TEXT
);
CREATE INDEX idx_actividad_roles_trabajador_id ON actividad_roles(trabajador_id);
CREATE UNIQUE INDEX ux_roles_persona ON actividad_roles(actividad_id, trabajador_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX ux_roles_aprobador ON actividad_roles(actividad_id) WHERE rol = 'A' AND deleted_at IS NULL;
