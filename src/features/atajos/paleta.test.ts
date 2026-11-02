import { describe, expect, it } from "vitest";
import type { Trabajador, ValorCatalogo } from "@/db/tipos";
import { asignaciones, puestos, tipos, unidades } from "../arbol/fixture";
import { vigentesPorPuesto } from "../arbol/jerarquia";
import { buscarEnPaleta, indexarPaleta } from "./paleta";

const persona = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  tiene_foto: 0,
  updated_at: "",
});
const trabajadores = [persona("t1", "Ana Pérez"), persona("t3", "Luis Muñoz"), persona("t9", "Marta Soto")];
const cargos: ValorCatalogo[] = [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }];

const datos = (extra: Partial<Parameters<typeof indexarPaleta>[0]> = {}) => ({
  unidades,
  trabajadores,
  puestos,
  vigentes: vigentesPorPuesto(asignaciones),
  cargos,
  tipos,
  ...extra,
});
const acciones = [
  { id: "nueva", etiqueta: "Nueva unidad" },
  { id: "directorio", etiqueta: "Ir al directorio" },
  { id: "tema", etiqueta: "Cambiar tema" },
];
const buscar = (texto: string, extra = {}, limite = 20) =>
  buscarEnPaleta(indexarPaleta(datos(extra)), texto, acciones, limite);

describe("paleta de comandos: búsqueda", () => {
  it("sin texto solo ofrece las acciones", () => {
    const r = buscar("  ");
    expect(r.acciones.items.map((x) => x.id)).toEqual(["nueva", "directorio", "tema"]);
    expect(r.unidades.items).toEqual([]);
    expect(r.personas.items).toEqual([]);
    expect(r.vacantes.items).toEqual([]);
  });

  it("busca unidades sin distinguir tildes ni mayúsculas y muestra su ruta por tipo", () => {
    const r = buscar("MANTENCION");
    expect(r.unidades.items.map((x) => x.id)).toEqual(["mantencion"]);
    // Sus superiores por tipo, en el orden del catálogo (Gerencia antes que Otra)
    expect(r.unidades.items[0]!.ruta).toBe("Operaciones › Gerencia General");
    expect(buscar("meca").unidades.items.map((x) => x.id)).toEqual(["mecanica"]);
  });

  it("busca personas por nombre y lista sus cargos vigentes con la unidad", () => {
    const r = buscar("munoz");
    expect(r.personas.items).toEqual([
      { id: "t3", nombre: "Luis Muñoz", cargos: ["Analista · Mantención", "Analista · Mecánica"] },
    ]);
    // t9 no tiene puestos: aparece igual, sin cargos
    expect(buscar("marta").personas.items).toEqual([{ id: "t9", nombre: "Marta Soto", cargos: [] }]);
  });

  it("los puestos sin titular vigente son vacantes (cargo + unidad); el reemplazo no los cubre", () => {
    const r = buscar("analista");
    expect(r.vacantes.items.map((x) => x.id).sort()).toEqual(["p2", "p6"]);
    expect(r.vacantes.items.find((x) => x.id === "p6")).toMatchObject({
      cargo: "Analista",
      unidad: "Mecánica",
    });
    expect(buscar("finanzas").vacantes.items.map((x) => x.id)).toEqual(["p2"]);
  });

  it("las acciones también se buscan sin tildes", () => {
    expect(buscar("DIRECTORIO").acciones.items.map((x) => x.id)).toEqual(["directorio"]);
    expect(buscar("zzz").acciones.items).toEqual([]);
  });

  it("limita cada grupo e informa cuántos hay en total", () => {
    const muchas = Array.from({ length: 30 }, (_, i) => ({
      ...unidades[0]!,
      id: `x${i}`,
      nombre: `Taller ${i}`,
    }));
    const r = buscar("taller", { unidades: muchas }, 20);
    expect(r.unidades.items).toHaveLength(20);
    expect(r.unidades.total).toBe(30);
    expect(buscar("taller", { unidades: muchas }, 50).unidades.total).toBe(30);
  });

  it("ordena por nombre", () => {
    const r = buscar("a", { trabajadores: [persona("2", "Zoe Alva"), persona("1", "Álvaro Díaz")] });
    expect(r.personas.items.map((x) => x.nombre)).toEqual(["Álvaro Díaz", "Zoe Alva"]);
  });

  it("indexa y busca 2.000 unidades y 5.000 personas sin demora", () => {
    const us = Array.from({ length: 2000 }, (_, i) => ({
      ...unidades[0]!,
      id: `u${i}`,
      nombre: `Unidad ${i}`,
      parent_id: i ? `u${Math.floor((i - 1) / 4)}` : null,
    }));
    const ts = Array.from({ length: 5000 }, (_, i) => persona(`w${i}`, `Persona ${i}`));
    const ini = performance.now();
    const indice = indexarPaleta(datos({ unidades: us, trabajadores: ts, puestos: [], vigentes: new Map() }));
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) buscarEnPaleta(indice, "pers", acciones);
    const t2 = performance.now();
    expect(t1 - ini).toBeLessThan(1000);
    expect((t2 - t1) / 20).toBeLessThan(50);
  });
});
