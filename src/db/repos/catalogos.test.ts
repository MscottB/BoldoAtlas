import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "./unidades";
import { crearPuesto } from "./puestos";
import { crearValor, renombrarValor, moverValor, desactivarValor, reactivarValor } from "./catalogos";
import type { ValorCatalogo } from "@/db/tipos";

let bd: BasePrueba;
const valores = () =>
  bd.consultar<ValorCatalogo>("SELECT id, nombre, orden, deleted_at FROM cargos ORDER BY orden");

beforeEach(() => {
  bd = abrirBasePrueba();
});

describe("catalogos", () => {
  it("crearValor crea el valor con su orden", () => {
    const a = crearValor("cargos", "  Analista ");
    const b = crearValor("cargos", "Jefe");
    bd.aplicar(a.sentencias);
    bd.aplicar(b.sentencias);
    expect(valores().map((v) => [v.id, v.nombre, v.orden])).toEqual([
      [a.id, "Analista", 1],
      [b.id, "Jefe", 2],
    ]);
  });

  it("rechaza una tabla que no es un catálogo", () => {
    expect(() => crearValor("usuarios" as never, "x")).toThrow("Catálogo desconocido");
    expect(() => desactivarValor("trabajadores" as never, "x")).toThrow("Catálogo desconocido");
  });

  it("renombrarValor y moverValor actualizan la fila", () => {
    const { id, sentencias } = crearValor("cargos", "Analista");
    bd.aplicar(sentencias);
    bd.aplicar(renombrarValor("cargos", id, " Analista senior "));
    bd.aplicar(moverValor("cargos", id, 7));
    expect(valores()).toMatchObject([{ nombre: "Analista senior", orden: 7 }]);
  });

  it("desactivar deja deleted_at y el puesto conserva su cargo; reactivar lo devuelve", () => {
    const cargo = crearValor("cargos", "Analista");
    const unidad = crearUnidad({ tipo: "gerencia", nombre: "Operaciones" });
    const p = crearPuesto({ cargo_id: cargo.id, unidad_id: unidad.id });
    bd.aplicar([...cargo.sentencias, ...unidad.sentencias, ...p.sentencias]);

    bd.aplicar(desactivarValor("cargos", cargo.id));
    expect(valores()[0].deleted_at).not.toBeNull();
    expect(bd.consultar<{ cargo_id: string }>("SELECT cargo_id FROM puestos")[0].cargo_id).toBe(cargo.id);

    bd.aplicar(reactivarValor("cargos", cargo.id));
    expect(valores()[0].deleted_at).toBeNull();
  });

  it("funciona en las cuatro tablas", () => {
    for (const tabla of ["cargos", "tipos_contrato", "sedes", "jornadas"] as const) {
      bd.aplicar(crearValor(tabla, "X").sentencias);
      expect(bd.consultar(`SELECT id FROM ${tabla}`)).toHaveLength(1);
    }
  });
});
