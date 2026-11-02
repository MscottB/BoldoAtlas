import { describe, expect, it } from "vitest";
import type { Zona } from "@/db/tipos";
import type { Caja } from "./lateral";
import { zonasDibujadas } from "./zonas";

const caja = (x: number, y: number, ancho = 100, alto = 50): Caja => ({ x, y, ancho, alto });
const norte: Zona = { id: "z1", nombre: "Norte", color: "#0f766e" };
const sur: Zona = { id: "z2", nombre: "Sur", color: "#be123c" };
const en = (zona_id: string, ...unidades: string[]) =>
  unidades.map((unidad_id) => ({ zona_id, unidad_id }));

// Una fila: a b c d, separadas por 40 px.
const fila = new Map([
  ["a", caja(0, 0)],
  ["b", caja(140, 0)],
  ["c", caja(280, 0)],
  ["d", caja(420, 0)],
]);

describe("zonasDibujadas", () => {
  it("unidades contiguas: un recuadro que las envuelve con su margen", () => {
    const r = zonasDibujadas([norte], en("z1", "a", "b"), fila, [], 10);
    expect(r.recuadros).toEqual([{ zona: norte, caja: { x: -10, y: -10, ancho: 260, alto: 70 } }]);
    expect(r.marcadas).toEqual([]);
    expect(r.marcas.size).toBe(0);
  });

  it("unidades lejanas: si el recuadro cubriría a otra unidad, marca de color y leyenda", () => {
    const r = zonasDibujadas([norte], en("z1", "a", "c"), fila, [], 10);
    expect(r.recuadros).toEqual([]);
    expect(r.marcadas).toEqual([norte]);
    expect([...r.marcas.keys()].sort()).toEqual(["a", "c"]);
    expect(r.marcas.get("a")).toEqual([norte]);
  });

  it("el margen cuenta: tocar a otra por el margen ya es cubrirla, y solo rozarla no", () => {
    const juntas = new Map([
      ["a", caja(0, 0)],
      ["b", caja(110, 0)],
    ]);
    expect(zonasDibujadas([norte], en("z1", "a"), juntas, [], 11).marcadas).toEqual([norte]);
    expect(zonasDibujadas([norte], en("z1", "a"), juntas, [], 10).marcadas).toEqual([]);
  });

  it("los puestos de sus unidades van dentro; un puesto de otra unidad es otra tarjeta", () => {
    const cajas = new Map([
      ["a", caja(0, 0)],
      ["pa", caja(0, 60)],
      ["b", caja(0, 120)],
      ["c", caja(0, 180)],
      ["pc", caja(0, 240)],
    ]);
    const puestos = [
      { id: "pa", unidad_id: "a" },
      { id: "pc", unidad_id: "c" },
    ];
    const r = zonasDibujadas([norte, sur], [...en("z1", "a"), ...en("z2", "b", "pc-no")], cajas, puestos, 5);
    expect(r.recuadros.map((x) => [x.zona.id, x.caja])).toEqual([
      ["z1", { x: -5, y: -5, ancho: 110, alto: 120 }],
      ["z2", { x: -5, y: 115, ancho: 110, alto: 60 }],
    ]);
    expect(zonasDibujadas([norte], en("z1", "a", "c"), cajas, puestos, 5).marcadas).toEqual([norte]);
  });

  it("solo cuenta lo dibujado: una rama plegada no estira el recuadro ni una zona sin nada a la vista aparece", () => {
    const r = zonasDibujadas(
      [norte, sur],
      [...en("z1", "a", "plegada"), ...en("z2", "plegada")],
      fila,
      [],
      0,
    );
    expect(r.recuadros).toEqual([{ zona: norte, caja: caja(0, 0) }]);
    expect(r.marcadas).toEqual([]);
  });

  it("una unidad en dos zonas marcadas lleva las dos", () => {
    const r = zonasDibujadas([norte, sur], [...en("z1", "a", "c"), ...en("z2", "a", "d")], fila, [], 0);
    expect(r.marcas.get("a")).toEqual([norte, sur]);
    expect(r.marcadas).toEqual([norte, sur]);
  });

  it("un recuadro no cuenta como otra tarjeta: dos zonas vecinas siguen siendo recuadros", () => {
    const r = zonasDibujadas([norte, sur], [...en("z1", "a"), ...en("z2", "b")], fila, [], 30);
    expect(r.recuadros).toHaveLength(2);
  });
});
