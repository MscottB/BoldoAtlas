import { describe, expect, it } from "vitest";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { TIPO_AREA } from "@/db/tipos";
import * as U from "./unidades";
import * as C from "./catalogos";
import { TIPOS_SEMILLA, vaciarOrganizacion } from "./reemplazo";

const semillas = (bd: ReturnType<typeof abrirBasePrueba>) =>
  bd.consultar<{ id: string; nombre: string; orden: number; deleted_at: string | null }>(
    "SELECT id, nombre, orden, deleted_at FROM tipos_unidad ORDER BY orden",
  );

describe("vaciarOrganizacion", () => {
  it("las semillas del repo son las mismas que siembra la migración", () => {
    const fresca = semillas(abrirBasePrueba()).map(({ id, nombre, orden }) => ({ id, nombre, orden }));
    expect(TIPOS_SEMILLA).toEqual(fresca);
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
      bd.consultar<{ clave: string; valor: string }>("SELECT clave, valor FROM meta").map((f) => [f.clave, f.valor]),
    );
    expect(meta.db_id).toBe("abc");
    expect(meta.logo_png).toBe("");
    expect(meta.data_revision).toBe("1");
  });
});
