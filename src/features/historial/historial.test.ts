import { describe, expect, it } from "vitest";
import {
  agruparPorDia,
  camposVisibles,
  destinoDe,
  instantes,
  leerVarias,
  posicionEstasAqui,
  textoCampo,
} from "./historial";
import type { AccionBreve, FilaBreve } from "./tipos";

const accion = (id: string, fecha: string, extra: Partial<AccionBreve> = {}): AccionBreve => ({
  id,
  fecha,
  origen: "app",
  datos: {},
  estado: "hecha",
  bloqueada: false,
  filas: 1,
  muestra: [],
  ...extra,
});

describe("agruparPorDia", () => {
  it("agrupa por el día local de la zona, en el orden que llegan", () => {
    const a = [
      accion("3", "2026-11-18T10:00:00.000Z"),
      accion("2", "2026-11-18T02:00:00.000Z"), // en Santiago (UTC-3) aún es el 17
      accion("1", "2026-11-17T12:00:00.000Z"),
    ];
    expect(agruparPorDia(a, "America/Santiago").map((g) => [g.dia, g.acciones.map((x) => x.id)])).toEqual([
      ["2026-11-18", ["3"]],
      ["2026-11-17", ["2", "1"]],
    ]);
    expect(agruparPorDia(a, "UTC").map((g) => g.dia)).toEqual(["2026-11-18", "2026-11-17"]);
    expect(agruparPorDia([], "UTC")).toEqual([]);
  });
});

describe("posicionEstasAqui", () => {
  it("es la primera hecha: lo de arriba está deshecho", () => {
    const d = { estado: "deshecha" as const };
    expect(posicionEstasAqui([accion("3", "x", d), accion("2", "x", d), accion("1", "x")])).toBe(2);
    expect(posicionEstasAqui([accion("1", "x")])).toBe(0);
    expect(posicionEstasAqui([accion("1", "x", d)])).toBe(-1);
  });
});

describe("instantes", () => {
  it("desde el inicio del día local hasta el inicio del día siguiente, en UTC", () => {
    expect(instantes("2026-11-17", "2026-11-18")).toEqual({
      desde: new Date(2026, 10, 17).toISOString(),
      hasta: new Date(2026, 10, 19).toISOString(),
    });
    // fin de mes
    expect(instantes("", "2026-11-30").hasta).toBe(new Date(2026, 11, 1).toISOString());
    expect(instantes("", "")).toEqual({ desde: undefined, hasta: undefined });
  });
});

describe("destinoDe", () => {
  const fila = (tabla: string, fila_id: string): FilaBreve => ({
    tabla,
    fila_id,
    op: "update",
    campos: [],
    nombre: null,
    nombre_antes: null,
    nombre_despues: null,
    elimina: false,
  });
  const datos = {
    porId: new Map([["u1", {}]]),
    puestos: [{ id: "p1", unidad_id: "u1" }],
    trabajadores: [{ id: "w1" }],
    asignaciones: [{ id: "as1", trabajador_id: "w1" }],
  };
  const de = (...m: FilaBreve[]) => destinoDe(accion("1", "x", { muestra: m }), datos);

  it("la primera fila que sigue existiendo", () => {
    expect(de(fila("unidades", "u1"))).toEqual({ unidad: "u1" });
    expect(de(fila("puestos", "p1"))).toEqual({ puesto: { id: "p1", unidad_id: "u1" } });
    expect(de(fila("trabajadores", "w1"))).toEqual({ persona: "w1" });
    expect(de(fila("asignaciones", "as1"))).toEqual({ persona: "w1" });
    expect(de(fila("unidades", "borrada"), fila("trabajadores", "w1"))).toEqual({ persona: "w1" });
  });

  it("nada si ya no está o no tiene dónde ir", () => {
    expect(de(fila("unidades", "borrada"))).toBeNull();
    expect(de(fila("cargos", "c1"))).toBeNull();
    expect(de()).toBeNull();
  });
});

describe("leerVarias", () => {
  // 450 acciones, ids "449" a "0" de la más nueva a la más antigua
  const todas = Array.from({ length: 450 }, (_, i) => accion(String(449 - i), "x"));
  const pedidos: [string | null, number][] = [];
  const pagina = async (antes: string | null, cuantas: number) => {
    pedidos.push([antes, cuantas]);
    const desde = antes === null ? 0 : todas.findIndex((a) => a.id === antes) + 1;
    return todas.slice(desde, desde + Math.min(cuantas, 200));
  };

  it("pide de a 200 hasta tener las que se piden, o todas", async () => {
    pedidos.length = 0;
    const r = await leerVarias(pagina, null, 260);
    expect([r.acciones.length, r.fin, r.acciones[259]!.id]).toEqual([260, false, "190"]);
    expect(pedidos).toEqual([
      [null, 200],
      ["250", 60],
    ]);
    const todo = await leerVarias(pagina, null, Infinity);
    expect([todo.acciones.length, todo.fin]).toEqual([450, true]);
    const resto = await leerVarias(pagina, "50", 50);
    // justo las que quedaban: aún no sabe que no hay más; la siguiente vuelta llega vacía
    expect([resto.acciones[0]!.id, resto.acciones.length, resto.fin]).toEqual(["49", 50, false]);
    expect(await leerVarias(pagina, "0", 50)).toEqual({ acciones: [], fin: true });
  });
});

describe("el detalle, campo por campo", () => {
  const t = (clave: string, v?: Record<string, unknown>) =>
    v ? `[${clave} ${JSON.stringify(v)}]` : `[${clave}]`;
  const nombreDe = (columna: string, id: string) =>
    columna === "parent_id" && id === "u1" ? "Ventas" : null;
  const texto = (columna: string, v: unknown) => textoCampo(columna, v, nombreDe, t);

  it("sin ids ni fechas internas", () => {
    const f = {
      tabla: "unidades",
      fila_id: "u1",
      op: "insert" as const,
      nombre: "Ventas",
      campos: [
        ["id", null, "u1"],
        ["nombre", null, "Ventas"],
        ["created_at", null, "x"],
        ["updated_at", null, "x"],
      ] as [string, unknown, unknown][],
    };
    expect(camposVisibles(f).map(([c]) => c)).toEqual(["nombre"]);
  });

  it("cada valor como se lee", () => {
    expect(texto("nombre", "Norte")).toBe("Norte");
    expect(texto("nombre", null)).toBe("[intercambio.revisar.vacio]");
    expect(texto("parent_id", "u1")).toBe("Ventas");
    expect(texto("parent_id", "borrada")).toBe("[historial.vista.otro]");
    expect(texto("orden", 2)).toBe('[intercambio.revisar.posicion {"n":3}]');
    expect(texto("logo_png", "iVBORw0KGgo")).toBe("[historial.vista.imagen]");
    expect([texto("deleted_at", "2026-11-18T10:00:00.000Z"), texto("deleted_at", null)]).toEqual([
      "[historial.vista.si]",
      "[historial.vista.no]",
    ]);
  });
});
