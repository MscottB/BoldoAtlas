import { describe, expect, it } from "vitest";
import type { Asignacion, Puesto, Trabajador } from "@/db/tipos";
import { vigentesPorPuesto } from "@/features/arbol/jerarquia";
import {
  asignacionesDePersona,
  descripcionPorGuardar,
  esTitularVigente,
  filtrarPersonas,
  formatearFecha,
  historialPuesto,
  hayPuestoNuevoPendiente,
  hoyISO,
  puedeCrearPersona,
} from "./puestos";

const asig = (
  id: string,
  p: string,
  w: string,
  tipo: Asignacion["tipo"],
  desde: string,
  hasta: string | null = null,
) => ({ id, puesto_id: p, trabajador_id: w, tipo, desde, hasta, motivo: null }) satisfies Asignacion;
const puesto = (id: string): Puesto => ({
  id,
  unidad_id: "u",
  cargo_id: "c",
  descripcion: null,
  leyenda_id: null,
  orden: 0,
});
const persona = (id: string, nombre: string) => ({ id, nombre }) as Trabajador;

describe("historialPuesto", () => {
  it("solo el puesto pedido, por desde descendente; a igual fecha, la vigente primero", () => {
    const a = [
      asig("1", "p", "ana", "titular", "2020-01-01", "2022-01-01"),
      asig("2", "p", "beto", "titular", "2022-01-01"),
      asig("3", "p", "cris", "reemplazo", "2022-01-01", "2022-02-01"),
      asig("4", "otro", "ana", "titular", "2030-01-01"),
    ];
    expect(historialPuesto(a, "p").map((x) => x.id)).toEqual(["2", "3", "1"]);
  });
});

describe("filtrarPersonas", () => {
  const todos = [persona("1", "Ñandú Pérez"), persona("2", "ana Rojas"), persona("3", "Zoe")];
  it("ignora tildes y mayúsculas, ordena por nombre", () => {
    expect(filtrarPersonas(todos, "PEREZ").map((x) => x.id)).toEqual(["1"]);
    expect(filtrarPersonas(todos, "").map((x) => x.id)).toEqual(["2", "1", "3"]);
  });
  it("limita la cantidad", () => {
    expect(filtrarPersonas(todos, "", 2)).toHaveLength(2);
  });
});

describe("puedeCrearPersona", () => {
  const todos = [persona("1", "Ana Rojas")];
  it("no ofrece crear vacío ni un nombre ya existente (sin tildes ni mayúsculas)", () => {
    expect(puedeCrearPersona(todos, "  ")).toBe(false);
    expect(puedeCrearPersona(todos, "ana  ROJAS")).toBe(false);
    expect(puedeCrearPersona(todos, "Ana")).toBe(true);
  });
});

describe("esTitularVigente", () => {
  const v = vigentesPorPuesto([
    asig("1", "p", "ana", "titular", "2020-01-01"),
    asig("2", "p", "beto", "reemplazo", "2021-01-01"),
    asig("3", "q", "cris", "titular", "2020-01-01", "2021-01-01"),
  ]);
  it("solo si la persona es hoy el titular de ese puesto", () => {
    expect(esTitularVigente(v, "p", "ana")).toBe(true);
    expect(esTitularVigente(v, "p", "beto")).toBe(false); // es reemplazo
    expect(esTitularVigente(v, "q", "cris")).toBe(false); // ya terminó
  });
});

describe("asignacionesDePersona", () => {
  it("separa vigentes y cerradas, cada una con su puesto, por desde descendente; ignora puestos borrados", () => {
    const a = [
      asig("1", "p", "ana", "titular", "2020-01-01"),
      asig("2", "q", "ana", "reemplazo", "2023-01-01"),
      asig("3", "p", "ana", "titular", "2010-01-01", "2020-01-01"),
      asig("4", "p", "beto", "titular", "2000-01-01"),
      asig("5", "borrado", "ana", "titular", "2000-01-01"),
    ];
    const r = asignacionesDePersona([puesto("p"), puesto("q")], a, "ana");
    expect(r.vigentes.map((x) => [x.asignacion.id, x.puesto.id])).toEqual([
      ["2", "q"],
      ["1", "p"],
    ]);
    expect(r.cerradas.map((x) => x.asignacion.id)).toEqual(["3"]);
  });
});

describe("fechas", () => {
  it("hoyISO usa la fecha local", () => {
    expect(hoyISO(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("formatearFecha sigue el idioma", () => {
    expect(formatearFecha("2026-03-05", "es")).toMatch(/5.*mar.*2026/i);
    expect(formatearFecha("2026-03-05", "en")).toMatch(/Mar.*5.*2026/);
  });
  it("formatearFecha respeta años de menos de cuatro cifras (no los lleva a 19xx)", () => {
    expect(formatearFecha("0002-03-05", "en")).not.toMatch(/1902/);
    expect(formatearFecha("0099-12-31", "en")).toMatch(/, 99$/);
  });
});

describe("descripcionPorGuardar", () => {
  it("undefined si no cambió (ignorando espacios); null si quedó vacía; el texto recortado si cambió", () => {
    expect(descripcionPorGuardar("Turno noche", "  Turno noche ")).toBeUndefined();
    expect(descripcionPorGuardar(null, "   ")).toBeUndefined();
    expect(descripcionPorGuardar("Turno noche", " ")).toBeNull();
    expect(descripcionPorGuardar(null, " Nueva ")).toBe("Nueva");
  });
});

describe("hayPuestoNuevoPendiente", () => {
  it("hay algo por perder si se eligió cargo o se escribió descripción", () => {
    expect(hayPuestoNuevoPendiente(null, "  ")).toBe(false);
    expect(hayPuestoNuevoPendiente("c", "")).toBe(true);
    expect(hayPuestoNuevoPendiente(null, "Turno")).toBe(true);
  });
});
