import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "./unidades";
import { crearConexion, eliminarConexion } from "./conexiones";

let bd: BasePrueba;
let a: string;
let b: string;

beforeEach(() => {
  bd = abrirBasePrueba();
  const ua = crearUnidad({ tipo: "gerencia", nombre: "A" });
  const ub = crearUnidad({ tipo: "gerencia", nombre: "B" });
  bd.aplicar([...ua.sentencias, ...ub.sentencias]);
  a = ua.id;
  b = ub.id;
});

describe("conexiones", () => {
  it("crea y elimina (lógicamente) una conexión", () => {
    const c = crearConexion(a, b, "colabora con");
    bd.aplicar(c.sentencias);
    expect(bd.consultar("SELECT etiqueta FROM conexiones WHERE id = ?", [c.id])).toEqual([
      { etiqueta: "colabora con" },
    ]);
    bd.aplicar(eliminarConexion(c.id));
    expect(bd.consultar("SELECT id FROM conexiones WHERE deleted_at IS NULL")).toHaveLength(0);
  });

  it("una unidad consigo misma falla por CHECK", () => {
    expect(() => bd.aplicar(crearConexion(a, a, null).sentencias)).toThrow(/CHECK/);
  });
});
