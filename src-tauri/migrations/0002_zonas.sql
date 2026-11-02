-- BoldoAtlas · esquema 2. Zonas: recuadro de color con nombre que agrupa unidades, también de ramas distintas. No cambia la jerarquía.
-- color = #rrggbb en minúsculas, como en leyendas.
CREATE TABLE zonas (
  id         TEXT PRIMARY KEY NOT NULL,
  nombre     TEXT NOT NULL CHECK (length(trim(nombre)) > 0),
  color      TEXT NOT NULL CHECK (color GLOB '#[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE UNIQUE INDEX ux_zonas_nombre ON zonas(lower(trim(nombre))) WHERE deleted_at IS NULL;

CREATE TABLE zona_unidades (
  id         TEXT PRIMARY KEY NOT NULL,
  zona_id    TEXT NOT NULL REFERENCES zonas(id) DEFERRABLE INITIALLY DEFERRED,
  unidad_id  TEXT NOT NULL REFERENCES unidades(id) DEFERRABLE INITIALLY DEFERRED,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_zona_unidades_zona_id ON zona_unidades(zona_id);
CREATE INDEX idx_zona_unidades_unidad_id ON zona_unidades(unidad_id);
CREATE UNIQUE INDEX ux_zona_unidades ON zona_unidades(zona_id, unidad_id) WHERE deleted_at IS NULL;
