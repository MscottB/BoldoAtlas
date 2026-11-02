import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import { TIPO_GERENCIA } from "@/db/tipos";
import { crearUnidad, eliminarUnidad, restaurarUnidad } from "./unidades";
import {
  agregarAZona,
  crearZona,
  editarZona,
  eliminarZona,
  quitarDeZona,
  restaurarZona,
  SQL_ZONAS,
  SQL_ZONA_UNIDADES,
} from "./zonas";

let bd: BasePrueba;
let a: string;
let b: string;
let z: string;
const pertenencias = () =>
  bd
    .consultar<{ zona_id: string; unidad_id: string }>(SQL_ZONA_UNIDADES)
    .map((x) => x.unidad_id)
    .sort();
const sinContenido = { hijos: [], puestos: [] };
const fila = (id: string) => ({
  id,
  tipo_id: TIPO_GERENCIA,
  nombre: "x",
  descripcion: null,
  parent_id: null,
  jefe_puesto_id: null,
  marca_color: null,
  marca_codigo: null,
  orden: 0,
});

// Cada paso, en su propio instante: la baja se reconoce por su marca de tiempo.
const paso = (s: Parameters<BasePrueba["aplicar"]>[0]) => {
  bd.aplicar(s);
  vi.advanceTimersByTime(1);
};

afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.useFakeTimers();
  bd = abrirBasePrueba();
  const ua = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "A" });
  const ub = crearUnidad({ tipo_id: TIPO_GERENCIA, nombre: "B" });
  const zona = crearZona("  Norte ", "#0f766e");
  bd.aplicar([...ua.sentencias, ...ub.sentencias, ...zona.sentencias]);
  [a, b, z] = [ua.id, ub.id, zona.id];
});

describe("zonas", () => {
  it("guarda el nombre sin espacios sobrantes", () =>
    expect(bd.consultar(SQL_ZONAS)).toEqual([{ id: z, nombre: "Norte", color: "#0f766e" }]));

  it("agregar dos veces falla por UNIQUE; quitar permite volver a agregar", () => {
    bd.aplicar(agregarAZona(z, a));
    expect(() => bd.aplicar(agregarAZona(z, a))).toThrow(/UNIQUE/);
    bd.aplicar(quitarDeZona(z, a));
    expect(pertenencias()).toEqual([]);
    bd.aplicar(agregarAZona(z, a));
    expect(pertenencias()).toEqual([a]);
  });

  it("edita nombre y color", () => {
    bd.aplicar(editarZona(z, { nombre: " Sur ", color: "#be123c" }));
    expect(bd.consultar(SQL_ZONAS)).toEqual([{ id: z, nombre: "Sur", color: "#be123c" }]);
  });

  it("eliminar la unidad da de baja sus pertenencias en el mismo lote y restaurarla las devuelve", () => {
    bd.aplicar([...agregarAZona(z, a), ...agregarAZona(z, b)]);
    bd.aplicar(eliminarUnidad(fila(a), sinContenido));
    expect(pertenencias()).toEqual([b]);
    expect(
      bd.consultar("SELECT id FROM zona_unidades WHERE unidad_id = ? AND deleted_at IS NULL", [a]),
    ).toHaveLength(0);
    bd.aplicar(restaurarUnidad(a, sinContenido));
    expect(pertenencias()).toEqual([a, b].sort());
  });

  it("restaurar la unidad no devuelve lo que ya se había quitado antes", () => {
    paso(agregarAZona(z, a));
    paso(quitarDeZona(z, a));
    paso(eliminarUnidad(fila(a), sinContenido));
    paso(restaurarUnidad(a, sinContenido));
    expect(pertenencias()).toEqual([]);
  });

  it("eliminar la zona da de baja sus pertenencias; restaurarla devuelve solo esas", () => {
    paso([...agregarAZona(z, a), ...agregarAZona(z, b)]);
    paso(quitarDeZona(z, b));
    paso(eliminarZona(z));
    expect(bd.consultar(SQL_ZONAS)).toEqual([]);
    expect(bd.consultar("SELECT id FROM zona_unidades WHERE deleted_at IS NULL")).toEqual([]);
    paso(restaurarZona(z));
    expect(bd.consultar(SQL_ZONAS)).toHaveLength(1);
    expect(pertenencias()).toEqual([a]);
  });

  it("la lectura omite las pertenencias de una zona o unidad eliminada aunque la fila siga viva", () => {
    bd.aplicar(agregarAZona(z, a));
    bd.db.exec(`UPDATE zonas SET deleted_at = 'x' WHERE id = '${z}'`);
    expect(pertenencias()).toEqual([]);
  });
});
