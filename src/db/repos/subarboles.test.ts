import { describe, it, expect, beforeEach } from "vitest";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import type { SubarbolGuardado } from "@/db/tipos";
import { crearUnidad, eliminarUnidad } from "./unidades";
import {
  guardarSubarbol,
  renombrarSubarbol,
  moverSubarbol,
  quitarSubarbol,
  SQL_SUBARBOLES,
} from "./subarboles";

let bd: BasePrueba;
let raiz: string;
let a: string;
let b: string;

const leer = () => bd.consultar<SubarbolGuardado>(SQL_SUBARBOLES);

beforeEach(() => {
  bd = abrirBasePrueba();
  const r = crearUnidad({ tipo: "gerencia", nombre: "Raíz" });
  const ua = crearUnidad({ tipo: "area", nombre: "A", parent_id: r.id });
  const ub = crearUnidad({ tipo: "area", nombre: "B", parent_id: r.id });
  bd.aplicar([...r.sentencias, ...ua.sentencias, ...ub.sentencias]);
  [raiz, a, b] = [r.id, ua.id, ub.id];
});

describe("subárboles guardados", () => {
  it("guarda con orden creciente y sin nombre propio por defecto", () => {
    const s1 = guardarSubarbol(a);
    const s2 = guardarSubarbol(b, "  Mi rama  ");
    bd.aplicar(s1.sentencias);
    bd.aplicar(s2.sentencias);
    expect(leer()).toEqual([
      { id: s1.id, unidad_id: a, nombre: null, orden: 1 },
      { id: s2.id, unidad_id: b, nombre: "Mi rama", orden: 2 },
    ]);
  });

  it("renombra (vacío vuelve al nombre de la unidad), mueve y quita", () => {
    const s1 = guardarSubarbol(a);
    bd.aplicar(s1.sentencias);
    bd.aplicar(renombrarSubarbol(s1.id, " Otro "));
    expect(leer()[0].nombre).toBe("Otro");
    bd.aplicar(renombrarSubarbol(s1.id, "   "));
    expect(leer()[0].nombre).toBeNull();
    bd.aplicar(moverSubarbol(s1.id, 7));
    expect(leer()[0].orden).toBe(7);
    bd.aplicar(quitarSubarbol(s1.id));
    expect(leer()).toEqual([]);
    expect(bd.consultar("SELECT id FROM subarboles_guardados")).toHaveLength(1); // borrado lógico
  });

  it("mover a un orden ocupado intercambia los lugares en un solo lote", () => {
    const s1 = guardarSubarbol(a);
    const s2 = guardarSubarbol(b);
    bd.aplicar(s1.sentencias);
    bd.aplicar(s2.sentencias);
    bd.aplicar(moverSubarbol(s2.id, 1));
    expect(leer().map((s) => s.id)).toEqual([s2.id, s1.id]);
  });

  it("la lectura omite los subárboles de unidades eliminadas", () => {
    bd.aplicar(guardarSubarbol(a).sentencias);
    bd.aplicar(
      eliminarUnidad(
        { id: a, tipo: "area", nombre: "A", descripcion: null, parent_id: raiz, jefe_id: null, orden: 0 },
        { hijos: [], personas: [] },
      ),
    );
    expect(leer()).toEqual([]);
  });
});
