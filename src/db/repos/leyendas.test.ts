import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { TIPO_GERENCIA, type Leyenda } from "@/db/tipos";
import { crearUnidad } from "./unidades";
import { crearValor, desactivarValor, moverValor, reactivarValor, renombrarValor } from "./catalogos";
import { crearPuesto, editarPuesto, SQL_PUESTOS } from "./puestos";
import { SQL_LEYENDAS, crearLeyenda, editarLeyenda, normalizarColor } from "./leyendas";

let bd: BasePrueba;
const leyendas = () => bd.consultar<Leyenda>(SQL_LEYENDAS);

beforeEach(() => {
  bd = abrirBasePrueba();
});

describe("normalizarColor", () => {
  it("acepta #rrggbb sin importar mayúsculas ni espacios y lo deja en minúsculas", () => {
    expect(normalizarColor(" #BE123C ")).toBe("#be123c");
    expect(normalizarColor("#0f766e")).toBe("#0f766e");
  });
  it.each(["", "rojo", "#be123", "#be123cc", "be123c", "#be123g", "#fff"])("rechaza %j", (c) =>
    expect(normalizarColor(c)).toBeNull(),
  );
});

describe("leyendas", () => {
  it("crea con orden correlativo, descripción opcional y color en minúsculas", () => {
    const a = crearLeyenda({
      nombre: "  Crítico ",
      color: "#BE123C",
      descripcion: "No puede quedar vacante",
    });
    const b = crearLeyenda({ nombre: "En sucesión", color: "#b45309" });
    bd.aplicar([...a.sentencias, ...b.sentencias]);
    expect(leyendas()).toEqual([
      {
        id: a.id,
        nombre: "Crítico",
        color: "#be123c",
        descripcion: "No puede quedar vacante",
        orden: 1,
        deleted_at: null,
      },
      { id: b.id, nombre: "En sucesión", color: "#b45309", descripcion: null, orden: 2, deleted_at: null },
    ]);
  });

  it("edita color y descripción; renombrar, ordenar y desactivar reutilizan los catálogos", () => {
    const a = crearLeyenda({ nombre: "Crítico", color: "#be123c" });
    bd.aplicar(a.sentencias);
    bd.aplicar(editarLeyenda(a.id, { color: "#0F766E", descripcion: "  Clave  " }));
    bd.aplicar(renombrarValor("leyendas", a.id, " Muy crítico "));
    bd.aplicar(moverValor("leyendas", a.id, 9));
    expect(leyendas()[0]).toMatchObject({
      nombre: "Muy crítico",
      color: "#0f766e",
      descripcion: "Clave",
      orden: 9,
    });
    bd.aplicar(editarLeyenda(a.id, { descripcion: "" }));
    expect(leyendas()[0].descripcion).toBeNull();
    bd.aplicar(desactivarValor("leyendas", a.id));
    expect(leyendas()[0].deleted_at).not.toBeNull(); // la lectura incluye las desactivadas
    bd.aplicar(reactivarValor("leyendas", a.id));
    expect(leyendas()[0].deleted_at).toBeNull();
  });

  it("un color inválido lo rechaza el esquema", () => {
    expect(() => bd.aplicar(crearLeyenda({ nombre: "X", color: "rojo" }).sentencias)).toThrow(/CHECK/);
    const a = crearLeyenda({ nombre: "Y", color: "#be123c" });
    bd.aplicar(a.sentencias);
    expect(() => bd.aplicar(editarLeyenda(a.id, { color: "#zzz" }))).toThrow(/CHECK/);
  });

  it("un puesto usa una leyenda, la conserva al desactivarla y la pierde al quitarla", () => {
    const u = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "Operaciones" });
    const c = crearValor("cargos", "Analista");
    const l = crearLeyenda({ nombre: "Crítico", color: "#be123c" });
    const p = crearPuesto({ unidad_id: u.id, cargo_id: c.id, leyenda_id: l.id });
    bd.aplicar([...u.sentencias, ...c.sentencias, ...l.sentencias, ...p.sentencias]);
    const leyendaDe = () => bd.consultar<{ leyenda_id: string | null }>(SQL_PUESTOS)[0].leyenda_id;
    expect(leyendaDe()).toBe(l.id);
    bd.aplicar(desactivarValor("leyendas", l.id));
    expect(leyendaDe()).toBe(l.id);
    bd.aplicar(editarPuesto(p.id, { leyenda_id: null }));
    expect(leyendaDe()).toBeNull();
  });
});
