import { describe, expect, it } from "vitest";
import type { Trabajador, Unidad } from "@/db/tipos";
import { a, asignaciones, p, puestos, unidades } from "@/features/arbol/fixture";
import { totalesInicio } from "./totales";

const gente = [{ id: "t1" }, { id: "t2" }, { id: "t3" }] as Trabajador[];

describe("totalesInicio", () => {
  it("cuenta las unidades vivas, las personas y las vacantes de toda la organización", () => {
    // el fixture trae una unidad borrada, 8 puestos y 2 vacantes
    expect(totalesInicio({ unidades, trabajadores: gente, puestos, asignaciones })).toEqual({
      unidades: 6,
      personas: 3,
      vacantes: 2,
    });
  });

  it("una organización sin puestos no tiene vacantes", () => {
    expect(totalesInicio({ unidades, trabajadores: [], puestos: [], asignaciones: [] })).toEqual({
      unidades: 6,
      personas: 0,
      vacantes: 0,
    });
  });

  it("suma las vacantes de cada raíz", () => {
    const dos: Unidad[] = [...unidades, { ...unidades[0]!, id: "otra", nombre: "Otra", parent_id: null }];
    const ps = [...puestos, p("px", "otra"), p("py", "otra")];
    const as = [...asignaciones, a("ax", "px", "t1")];
    expect(
      totalesInicio({ unidades: dos, trabajadores: gente, puestos: ps, asignaciones: as }),
    ).toMatchObject({
      unidades: 7,
      vacantes: 3,
    });
  });
});
