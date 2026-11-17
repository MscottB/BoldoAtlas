import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { SQL_ELIMINADOS_PERSONAS, SQL_ELIMINADOS_PUESTOS, SQL_ELIMINADOS_UNIDADES } from "./eliminados";
import { crearTrabajador, eliminarTrabajador, restaurarTrabajador } from "./trabajadores";
import { crearUnidad, eliminarUnidad } from "./unidades";
import { crearValor } from "./catalogos";
import { crearPuesto, eliminarPuesto } from "./puestos";
import { TIPO_GERENCIA, type Unidad } from "@/db/tipos";

let bd: BasePrueba;
const ids = (sql: string) => bd.consultar<{ id: string }>(sql).map((f) => f.id);
const unidad = (id: string) => bd.consultar<Unidad>("SELECT * FROM unidades WHERE id = ?", [id])[0]!;

beforeEach(() => {
  bd = abrirBasePrueba();
});

describe("consultas de Eliminados", () => {
  it("traen solo lo eliminado, con la unidad que impide restaurar; la persona restaurada sale", () => {
    const cargo = crearValor("cargos", "Analista");
    bd.aplicar(cargo.sentencias);
    const raiz = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Raíz" });
    bd.aplicar(raiz.sentencias);
    const hija = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Hija", parent_id: raiz.id });
    bd.aplicar(hija.sentencias);
    const puesto = crearPuesto({ unidad_id: hija.id, cargo_id: cargo.id });
    bd.aplicar(puesto.sentencias);
    const ana = crearTrabajador({ nombre: "Ana" });
    bd.aplicar(ana.sentencias);
    expect(ids(SQL_ELIMINADOS_PERSONAS)).toEqual([]);
    expect(ids(SQL_ELIMINADOS_UNIDADES)).toEqual([]);
    expect(ids(SQL_ELIMINADOS_PUESTOS)).toEqual([]);

    bd.aplicar(eliminarTrabajador(ana.id));
    bd.aplicar(eliminarPuesto(puesto.id));
    bd.aplicar(eliminarUnidad(unidad(hija.id), { hijos: [], puestos: [] }));
    bd.aplicar(eliminarUnidad(unidad(raiz.id), { hijos: [], puestos: [] }));

    expect(ids(SQL_ELIMINADOS_PERSONAS)).toEqual([ana.id]);
    expect(ids(SQL_ELIMINADOS_PUESTOS)).toEqual([puesto.id]);
    const us = bd.consultar<{ id: string; padre_nombre: string | null; padre_eliminado: number }>(
      SQL_ELIMINADOS_UNIDADES,
    );
    expect(us.map((x) => x.id).sort()).toEqual([hija.id, raiz.id].sort());
    expect(us.find((x) => x.id === hija.id)).toMatchObject({ padre_nombre: "Raíz", padre_eliminado: 1 });
    expect(bd.consultar<{ nombre: string; padre_nombre: string }>(SQL_ELIMINADOS_PUESTOS)[0]).toMatchObject({
      nombre: "Analista",
      padre_nombre: "Hija",
      padre_eliminado: 1,
    });

    bd.aplicar(restaurarTrabajador(ana.id));
    expect(ids(SQL_ELIMINADOS_PERSONAS)).toEqual([]);
  });
});
