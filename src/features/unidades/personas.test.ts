import { describe, expect, it } from "vitest";
import type { Trabajador, ValorCatalogo } from "@/db/tipos";
import { a, asignaciones, p, puestos, unidades } from "@/features/arbol/fixture";
import { indexar, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import {
  correosUnicos,
  filtrarPersonasUnidad,
  personasDelAlcance,
  puestosDelAlcance,
  puestosDePersona,
  resumenPorCargo,
} from "./personas";

const w = (id: string, nombre: string, correo: string | null = null): Trabajador => ({
  id,
  nombre,
  correo,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  foto_png: null,
  notas: null,
});
const trabajadores = [
  w("t1", "Ana Pérez", "ana@x.cl"),
  w("t2", "Beto Ruiz"),
  w("t3", "Carla Muñoz", "carla@x.cl"),
  w("t4", "Diego Soto", "ANA@x.cl"),
  w("t5", "Elena Vidal", " "),
  w("t7", "Gabriel Lagos", "gabriel@x.cl"),
  w("t8", "Hugo Tapia"),
];
const cargos: ValorCatalogo[] = [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }];
const vigentes = vigentesPorPuesto(asignaciones);
const porId = indexar(unidades);
const personas = (id: string, rama: boolean) =>
  personasDelAlcance(puestosDelAlcance(unidades, puestos, id, rama), vigentes, trabajadores, cargos, porId);

describe("personasDelAlcance", () => {
  it("solo la unidad: sus titulares y reemplazos vigentes con cargo y unidad", () => {
    expect(personas("mecanica", false)).toEqual([
      expect.objectContaining({
        clave: "a4",
        nombre: "Diego Soto",
        tipo: "titular",
        cargo: "Analista",
        unidad: "Mecánica",
      }),
      expect.objectContaining({ clave: "a5", nombre: "Elena Vidal", tipo: "titular" }),
      expect.objectContaining({ clave: "a6", nombre: "Carla Muñoz", tipo: "reemplazo", puestoId: "p6" }),
    ]);
  });

  it("con subunidades suma toda la rama; una persona con dos puestos aparece dos veces", () => {
    const filas = personas("mantencion", true);
    expect(filas.map((f) => f.clave).sort()).toEqual(["a3", "a4", "a5", "a6", "a7", "a8"]);
    expect(filas.filter((f) => f.personaId === "t3").map((f) => f.unidad)).toEqual([
      "Mantención",
      "Mecánica",
    ]);
  });

  it("omite asignaciones cerradas y personas que ya no existen", () => {
    expect(personas("finanzas", true)).toEqual([]);
    const sinT1 = personasDelAlcance(puestos, vigentes, trabajadores.slice(1), cargos, porId);
    expect(sinT1.some((f) => f.personaId === "t1")).toBe(false);
  });

  it("con los vigentes de una fecha muestra a quien estaba ese día", () => {
    const delDia = vigentesPorPuesto(asignaciones, "2026-01-15");
    const filas = personasDelAlcance(
      puestosDelAlcance(unidades, puestos, "finanzas", false),
      delDia,
      trabajadores,
      cargos,
      porId,
    );
    expect(filas.map((f) => f.nombre)).toEqual(["Beto Ruiz"]);
  });

  it("recorre una rama de 10.000 personas sin demora", () => {
    const muchos = Array.from({ length: 10_000 }, (_, i) => p(`q${i}`, i % 2 ? "mecanica" : "electrica"));
    const asig = muchos.map((x, i) => a(`b${i}`, x.id, `w${i}`));
    const gente = muchos.map((_, i) => w(`w${i}`, `Persona ${i}`));
    const inicio = performance.now();
    const filas = personasDelAlcance(
      puestosDelAlcance(unidades, muchos, "gg", true),
      vigentesPorPuesto(asig),
      gente,
      cargos,
      porId,
    );
    filtrarPersonasUnidad(filas, "persona 9", "nombre");
    expect(filas).toHaveLength(10_000);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});

describe("filtrarPersonasUnidad", () => {
  const filas = personas("gg", true);
  it("busca en nombre, cargo, unidad y correo sin tildes ni mayúsculas", () => {
    expect(filtrarPersonasUnidad(filas, "munoz", "nombre").map((f) => f.clave)).toEqual(["a3", "a6"]);
    expect(filtrarPersonasUnidad(filas, "ELECTRICA", "nombre").map((f) => f.nombre)).toEqual([
      "Gabriel Lagos",
      "Hugo Tapia",
    ]);
    expect(filtrarPersonasUnidad(filas, "gabriel@", "nombre")).toHaveLength(1);
  });

  it("ordena por nombre, cargo o unidad; los empates por nombre", () => {
    expect(filtrarPersonasUnidad(filas, "", "nombre").map((f) => f.nombre)[0]).toBe("Ana Pérez");
    expect(filtrarPersonasUnidad(filas, "", "unidad").map((f) => f.unidad)).toEqual([
      "Eléctrica",
      "Eléctrica",
      "Gerencia General",
      "Mantención",
      "Mecánica",
      "Mecánica",
      "Mecánica",
    ]);
  });
});

describe("resumenPorCargo", () => {
  it("cuenta puestos y vacantes por cargo; un reemplazo cubre la vacante pero no la llena", () => {
    const cargo2 = { ...p("p9", "mecanica"), cargo_id: "jefe" };
    const alcance = [...puestosDelAlcance(unidades, puestos, "mantencion", true), cargo2];
    expect(
      resumenPorCargo(alcance, vigentes, [...cargos, { ...cargos[0], id: "jefe", nombre: "Jefe" }]),
    ).toEqual([
      { cargoId: "cargo", cargo: "Analista", puestos: 6, vacantes: 1, cubiertas: 1 },
      { cargoId: "jefe", cargo: "Jefe", puestos: 1, vacantes: 1, cubiertas: 0 },
    ]);
  });
});

describe("correosUnicos", () => {
  it("sin vacíos ni repetidos (sin distinguir mayúsculas), en el orden de la lista", () => {
    expect(correosUnicos(personas("gg", true))).toEqual(["ana@x.cl", "carla@x.cl", "gabriel@x.cl"]);
    expect(correosUnicos([])).toEqual([]);
  });
});

describe("puestosDePersona", () => {
  const historia = [
    { ...a("h1", "p1", "t9", "titular", "2025-06-01"), desde: "2024-01-01" },
    { ...a("h2", "p3", "t9"), desde: "2025-06-01" },
  ];
  it("hoy: vigentes e historial", () => {
    const r = puestosDePersona(puestos, historia, "t9");
    expect(r.vigentes.map((f) => f.asignacion.id)).toEqual(["h2"]);
    expect(r.cerradas.map((f) => f.asignacion.id)).toEqual(["h1"]);
  });
  it("a una fecha: lo vigente ese día; lo posterior no aparece", () => {
    const r = puestosDePersona(puestos, historia, "t9", "2025-01-01");
    expect(r.vigentes.map((f) => f.asignacion.id)).toEqual(["h1"]);
    expect(r.cerradas).toEqual([]);
  });
});
