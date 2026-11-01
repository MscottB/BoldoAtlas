import { describe, expect, it } from "vitest";
import type { Trabajador } from "@/db/tipos";
import { a, p, puestos, asignaciones } from "./fixture";
import { vigentesPorPuesto } from "./jerarquia";
import { indicePersonas, puestoConTarjeta, puestosPorPersona, unidadesConPersona } from "./ubicar";
import { VISTA_POR_DEFECTO } from "./vista";

const persona = (id: string, nombre: string, correo: string | null = null) => ({ id, nombre, correo }) as Trabajador;

describe("puestos de una persona a una fecha", () => {
  it("hoy: titular y reemplazo vigentes; sin puestos cerrados ni de puestos eliminados", () => {
    const m = puestosPorPersona(
      [...puestos, { ...p("p9", "gg"), deleted_at: "2026-03-01" }],
      vigentesPorPuesto([...asignaciones, a("a9", "p9", "t3")]),
    );
    // t3: titular en Mantención (p3) y reemplazo en Mecánica (p6); p9 está eliminado.
    expect(m.get("t3")).toEqual([
      { puestoId: "p3", unidadId: "mantencion", cargoId: "cargo", reemplazo: false },
      { puestoId: "p6", unidadId: "mecanica", cargoId: "cargo", reemplazo: true },
    ]);
    expect(m.has("t2")).toBe(false); // su titularidad en p2 terminó
  });

  it("a una fecha pasada: los puestos vigentes ese día", () => {
    const vigentesEnero = vigentesPorPuesto(asignaciones, "2026-01-15");
    expect(puestosPorPersona(puestos, vigentesEnero).get("t2")).toEqual([
      { puestoId: "p2", unidadId: "finanzas", cargoId: "cargo", reemplazo: false },
    ]);
    // Antes de que empezara cualquier asignación, nadie tiene puesto.
    expect(puestosPorPersona(puestos, vigentesPorPuesto(asignaciones, "2025-12-31")).size).toBe(0);
  });
});

describe("unidades que coinciden con el texto de una persona", () => {
  const trabajadores = [
    persona("t3", "Andrés Núñez", "anunez@empresa.cl"),
    persona("t4", "Beatriz Rojas", "brojas@empresa.cl"),
    persona("t2", "Carla Díaz", "cdiaz@empresa.cl"), // sin puesto vigente hoy
  ];
  const indice = indicePersonas(trabajadores);
  const porPersona = puestosPorPersona(puestos, vigentesPorPuesto(asignaciones));
  const buscar = (texto: string) => unidadesConPersona(texto, indice, porPersona);

  it("sin texto devuelve null (no filtra)", () => {
    expect(buscar("")).toBeNull();
    expect(buscar("   ")).toBeNull();
  });

  it("por nombre, sin tildes ni mayúsculas: titular y reemplazo cuentan", () => {
    expect(buscar("NUNEZ")).toEqual(new Set(["mantencion", "mecanica"]));
  });

  it("por correo", () => expect(buscar("brojas@")).toEqual(new Set(["mecanica"])));

  it("una persona sin puesto vigente no resalta nada", () => expect(buscar("carla")).toEqual(new Set()));
});

describe("puestoConTarjeta", () => {
  const con = { ...VISTA_POR_DEFECTO, verPuestos: true };
  it("sin «Ver puestos» ningún puesto tiene tarjeta", () =>
    expect(puestoConTarjeta({ id: "p1" }, { jefe_puesto_id: null }, VISTA_POR_DEFECTO)).toBe(false));
  it("con «Ver puestos», todos salvo la jefatura que va dentro de la tarjeta de la unidad", () => {
    expect(puestoConTarjeta({ id: "p1" }, { jefe_puesto_id: null }, con)).toBe(true);
    const jefeEnTarjeta = { ...con, densidad: "normal", personasEnTarjetas: true, mostrarJefe: true } as const;
    expect(puestoConTarjeta({ id: "p1" }, { jefe_puesto_id: "p1" }, jefeEnTarjeta)).toBe(false);
    expect(puestoConTarjeta({ id: "p1" }, { jefe_puesto_id: "p1" }, { ...jefeEnTarjeta, mostrarJefe: false })).toBe(
      true,
    );
  });
});
