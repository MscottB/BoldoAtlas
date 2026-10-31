import { describe, it, expect } from "vitest";
import { abrirBasePrueba } from "@/db/prueba/sqlite";
import { TIPO_AREA, TIPO_GERENCIA, type Unidad } from "@/db/tipos";
import { crearUnidad, eliminarUnidad, SQL_UNIDADES } from "./unidades";
import { crearValor } from "./catalogos";
import { crearPuesto, eliminarPuesto, SQL_PUESTOS } from "./puestos";
import { crearTrabajador, eliminarTrabajador, SQL_TRABAJADORES } from "./trabajadores";
import { asignarTitular, SQL_ASIGNACIONES } from "./asignaciones";
import { SQL_HISTORICO } from "./historico";

describe("lectura histórica", () => {
  it("trae también lo eliminado, con created_at y deleted_at, y la lectura normal no", () => {
    const bd = abrirBasePrueba();
    const raiz = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Raíz" });
    const hija = crearUnidad({ tipo_id: TIPO_AREA, nombre: "Hija", parent_id: raiz.id });
    const cargo = crearValor("cargos", "Analista");
    const puesto = crearPuesto({ unidad_id: hija.id, cargo_id: cargo.id });
    const ana = crearTrabajador({ nombre: "Ana" });
    const titular = asignarTitular(puesto.id, ana.id, "2024-01-01");
    bd.aplicar([raiz, hija, cargo, puesto, ana].flatMap((x) => x.sentencias).concat(titular.sentencias));
    const filaHija = bd.consultar<Unidad>(SQL_UNIDADES).find((u) => u.id === hija.id)!;
    bd.aplicar([
      ...eliminarUnidad(filaHija, { hijos: [], puestos: [] }),
      ...eliminarPuesto(puesto.id),
      ...eliminarTrabajador(ana.id),
    ]);

    expect(bd.consultar<Unidad>(SQL_UNIDADES).map((u) => u.id)).toEqual([raiz.id]);
    expect(bd.consultar(SQL_PUESTOS)).toEqual([]);
    expect(bd.consultar(SQL_TRABAJADORES)).toEqual([]);
    expect(bd.consultar(SQL_ASIGNACIONES)).toEqual([]);

    const unidades = bd.consultar<{ id: string; created_at: string; deleted_at: string | null }>(
      SQL_HISTORICO.unidades,
    );
    expect(unidades.map((u) => u.id).sort()).toEqual([raiz.id, hija.id].sort());
    expect(unidades.find((u) => u.id === hija.id)).toMatchObject({ parent_id: raiz.id });
    expect(unidades.find((u) => u.id === hija.id)?.deleted_at).toEqual(expect.any(String));
    expect(unidades.find((u) => u.id === raiz.id)).toMatchObject({
      deleted_at: null,
      created_at: expect.any(String),
    });

    const puestos = bd.consultar<{ id: string; deleted_at: string | null; created_at: string }>(
      SQL_HISTORICO.puestos,
    );
    expect(puestos).toEqual([expect.objectContaining({ id: puesto.id, created_at: expect.any(String) })]);
    expect(puestos[0].deleted_at).toEqual(expect.any(String));

    expect(bd.consultar(SQL_HISTORICO.asignaciones)).toEqual([
      expect.objectContaining({ id: titular.id, desde: "2024-01-01", hasta: null, trabajador_id: ana.id }),
    ]);
    expect(bd.consultar(SQL_HISTORICO.trabajadores)).toEqual([
      expect.objectContaining({ id: ana.id, nombre: "Ana", deleted_at: expect.any(String) }),
    ]);
  });
});
