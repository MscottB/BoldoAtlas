import { describe, expect, it } from "vitest";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { TIPO_AREA } from "@/db/tipos";
import * as U from "./unidades";
import * as C from "./catalogos";
import { TABLAS_ORGANIZACION, TIPOS_SEMILLA, vaciarOrganizacion } from "./reemplazo";

const semillas = (bd: ReturnType<typeof abrirBasePrueba>) =>
  bd.consultar<{ id: string; nombre: string; orden: number; deleted_at: string | null }>(
    "SELECT id, nombre, orden, deleted_at FROM tipos_unidad ORDER BY orden",
  );

describe("vaciarOrganizacion", () => {
  it("las semillas del repo son las mismas que siembra la migración", () => {
    const fresca = semillas(abrirBasePrueba()).map(({ id, nombre, orden }) => ({ id, nombre, orden }));
    expect(TIPOS_SEMILLA).toEqual(fresca);
  });

  it("cubre todas las tablas de la base salvo meta (una migración nueva debe agregarse a la lista)", () => {
    const reales = abrirBasePrueba()
      .consultar<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name <> 'meta' AND name NOT LIKE 'sqlite_%'",
      )
      .map((t) => t.name);
    expect([...TABLAS_ORGANIZACION].sort()).toEqual(reales.sort());
  });

  it("no queda ninguna fila de ninguna tabla, tampoco de procesos, actividades y roles", () => {
    const bd = abrirBasePrueba();
    const ahora = "2026-01-01T00:00:00.000Z";
    bd.db.exec(`
      INSERT INTO unidades (id, tipo_id, nombre, created_at, updated_at) VALUES ('u', '${TIPO_AREA}', 'U', '${ahora}', '${ahora}');
      INSERT INTO trabajadores (id, nombre, created_at, updated_at) VALUES ('t', 'T', '${ahora}', '${ahora}');
      INSERT INTO procesos (id, unidad_id, nombre, created_at, updated_at) VALUES ('p', 'u', 'P', '${ahora}', '${ahora}');
      INSERT INTO actividades (id, proceso_id, nombre, created_at, updated_at) VALUES ('a', 'p', 'A', '${ahora}', '${ahora}');
      INSERT INTO actividad_roles (id, actividad_id, trabajador_id, rol, created_at, updated_at) VALUES ('r', 'a', 't', 'R', '${ahora}', '${ahora}');
    `);
    bd.aplicar(vaciarOrganizacion());
    for (const t of TABLAS_ORGANIZACION.filter((x) => x !== "tipos_unidad"))
      expect(bd.consultar(`SELECT 1 FROM ${t}`), t).toHaveLength(0);
  });

  it("borra de verdad todas las filas y deja los tipos de unidad como al instalar", () => {
    const bd = abrirBasePrueba();
    const raiz = U.crearUnidad({ tipo_id: TIPO_AREA, nombre: "Vieja" });
    const cargo = C.crearValor("cargos", "Cargo");
    bd.aplicar([
      ...raiz.sentencias,
      ...cargo.sentencias,
      ...C.crearValor("tipos_unidad", "Extra").sentencias,
      ...C.renombrarValor("tipos_unidad", TIPO_AREA, "Otro nombre"),
    ]);
    bd.db.exec("UPDATE unidades SET deleted_at = '2026-01-01'"); // lo borrado en forma lógica también se va
    bd.aplicar(vaciarOrganizacion());
    for (const t of ["unidades", "cargos", "puestos", "asignaciones", "vistas", "subarboles_guardados"])
      expect(bd.consultar(`SELECT 1 FROM ${t}`), t).toHaveLength(0);
    expect(semillas(bd).map(({ id, nombre, orden }) => ({ id, nombre, orden }))).toEqual(TIPOS_SEMILLA);
    expect(semillas(bd).every((t) => t.deleted_at === null)).toBe(true);
  });

  it("deja intacta la identidad de la base y quita el logo", () => {
    const bd = abrirBasePrueba();
    bd.db.exec("INSERT INTO meta (clave, valor) VALUES ('db_id', 'abc'), ('logo_png', 'xx')");
    bd.aplicar(vaciarOrganizacion());
    const meta = Object.fromEntries(
      bd
        .consultar<{ clave: string; valor: string }>("SELECT clave, valor FROM meta")
        .map((f) => [f.clave, f.valor]),
    );
    expect(meta.db_id).toBe("abc");
    expect(meta.logo_png).toBe("");
    expect(meta.data_revision).toBe("1");
  });
});
