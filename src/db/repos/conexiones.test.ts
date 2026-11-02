import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { crearUnidad } from "./unidades";
import { actualizarConexion, crearConexion, eliminarConexion, restaurarConexion } from "./conexiones";
import { TIPO_GERENCIA } from "@/db/tipos";

let bd: BasePrueba;
let a: string;
let b: string;
let d: string;

beforeEach(() => {
  bd = abrirBasePrueba();
  const ua = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "A" });
  const ub = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "B" });
  const ud = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "D" });
  bd.aplicar([...ua.sentencias, ...ub.sentencias, ...ud.sentencias]);
  a = ua.id;
  b = ub.id;
  d = ud.id;
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
    bd.aplicar(restaurarConexion(c.id));
    expect(bd.consultar("SELECT etiqueta FROM conexiones WHERE deleted_at IS NULL")).toEqual([
      { etiqueta: "colabora con" },
    ]);
  });

  it("una unidad consigo misma falla por CHECK", () => {
    expect(() => bd.aplicar(crearConexion(a, a, null).sentencias)).toThrow(/CHECK/);
  });
});

describe("actualizarConexion", () => {
  const fila = (id: string) =>
    bd.consultar<{ origen_id: string; destino_id: string; etiqueta: string | null; updated_at: string }>(
      "SELECT origen_id, destino_id, etiqueta, updated_at FROM conexiones WHERE id = ?",
      [id],
    )[0];
  let id: string;

  beforeEach(() => {
    const c = crearConexion(a, b, "Apoyo");
    bd.aplicar(c.sentencias);
    id = c.id;
    // Fecha vieja a propósito: así se nota que la edición la renueva, aunque corra en el mismo milisegundo.
    bd.aplicar([{ sql: "UPDATE conexiones SET updated_at = 'antes' WHERE id = ?", params: [id] }]);
  });

  it("edita la descripción, la deja vacía y renueva updated_at", () => {
    bd.aplicar(actualizarConexion(id, { etiqueta: "Repuestos" }));
    expect(fila(id)).toMatchObject({ origen_id: a, destino_id: b, etiqueta: "Repuestos" });
    expect(fila(id).updated_at).not.toBe("antes");
    bd.aplicar(actualizarConexion(id, { etiqueta: null }));
    expect(fila(id).etiqueta).toBeNull();
  });

  it("cambia un extremo sin tocar lo demás", () => {
    bd.aplicar(actualizarConexion(id, { destino_id: d }));
    expect(fila(id)).toMatchObject({ origen_id: a, destino_id: d, etiqueta: "Apoyo" });
    bd.aplicar(actualizarConexion(id, { origen_id: b }));
    expect(fila(id)).toMatchObject({ origen_id: b, destino_id: d });
  });

  it("consigo misma falla por CHECK", () => {
    expect(() => bd.aplicar(actualizarConexion(id, { destino_id: a }))).toThrow(/CHECK/);
  });

  it("la base no impide el duplicado: lo rechaza el store", () => {
    const otra = crearConexion(a, d, null);
    bd.aplicar(otra.sentencias);
    bd.aplicar(actualizarConexion(otra.id, { destino_id: b }));
    expect(
      bd.consultar("SELECT id FROM conexiones WHERE origen_id = ? AND destino_id = ?", [a, b]),
    ).toHaveLength(2);
  });
});
