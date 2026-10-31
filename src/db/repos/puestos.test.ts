import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { TIPO_GERENCIA, type Puesto } from "@/db/tipos";
import { crearUnidad } from "./unidades";
import { crearValor } from "./catalogos";
import { SQL_PUESTOS, crearPuesto, editarPuesto, eliminarPuesto, restaurarPuesto } from "./puestos";

let bd: BasePrueba;
let unidadId: string;
let cargoId: string;

beforeEach(() => {
  bd = abrirBasePrueba();
  const u = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Operaciones" });
  const c = crearValor("cargos", "Analista");
  bd.aplicar([...u.sentencias, ...c.sentencias]);
  [unidadId, cargoId] = [u.id, c.id];
});

describe("puestos", () => {
  it("crea, edita, elimina y restaura", () => {
    const p = crearPuesto({ unidad_id: unidadId, cargo_id: cargoId });
    bd.aplicar(p.sentencias);
    expect(bd.consultar<Puesto>(SQL_PUESTOS)).toEqual([
      {
        id: p.id,
        unidad_id: unidadId,
        cargo_id: cargoId,
        descripcion: null,
        leyenda_id: null,
        orden: 0,
        created_at: expect.any(String),
      },
    ]);
    bd.aplicar(editarPuesto(p.id, { descripcion: "Turno noche", orden: 2 }));
    expect(bd.consultar<Puesto>(SQL_PUESTOS)[0]).toMatchObject({ descripcion: "Turno noche", orden: 2 });
    bd.aplicar(eliminarPuesto(p.id));
    expect(bd.consultar(SQL_PUESTOS)).toEqual([]);
    bd.aplicar(restaurarPuesto(p.id));
    expect(bd.consultar(SQL_PUESTOS)).toHaveLength(1);
  });

  it("no se puede crear sin un cargo existente", () => {
    expect(() => bd.aplicar(crearPuesto({ unidad_id: unidadId, cargo_id: "no-existe" }).sentencias)).toThrow(
      /FOREIGN KEY/,
    );
  });
});
