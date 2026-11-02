import { describe, expect, it } from "vitest";
import {
  TIPO_AREA,
  TIPO_GERENCIA,
  TIPO_OTRA,
  TIPO_SUBAREA,
  type Trabajador,
  type ValorCatalogo,
} from "@/db/tipos";
import { a, asignaciones, p, puestos as puestosBase, tipos, unidades } from "@/features/arbol/fixture";
import {
  SIN_FILTROS,
  candidatasDirectorio,
  columnaVisible,
  filtrarDirectorio,
  filtrarYOrdenar,
  leerColumnas,
  leerEstadoDirectorio,
  type EstadoDirectorio,
  type Filtros,
  type Orden,
} from "./filtrar";

const BORRADO = "2026-01-01T00:00:00.000Z";
const cat = (id: string, nombre: string, deleted_at: string | null = null): ValorCatalogo => ({
  id,
  nombre,
  orden: 0,
  deleted_at,
});
const trab = (id: string, nombre: string, extra: Partial<Trabajador> = {}): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  tiene_foto: 0,
  updated_at: "",
  ...extra,
});

// Puestos del fixture: p1 GG, p2 Finanzas (vacante), p3 Mantención, p4-p6 Mecánica (p6: vacante con reemplazo t3),
// p7-p8 Eléctrica. t2 (titular cerrado) y t9 no tienen puesto vigente. t3 es titular de p3 y reemplazo de p6.
const cargoDe: Record<string, string> = { p1: "c-jefe", p3: "c-jefe", p7: "c-viejo" };
const estado: EstadoDirectorio = {
  unidades,
  puestos: puestosBase.map((x) => ({ ...x, cargo_id: cargoDe[x.id] ?? "c-tec" })),
  asignaciones,
  trabajadores: [
    trab("t1", "Ana Pérez", { correo: "ana@x.cl", sede_id: "s-norte", tipo_contrato_id: "k-ind" }),
    trab("t2", "Beatriz Soto"),
    trab("t3", "Carlos Muñoz", { correo: "carlos@x.cl", sede_id: "s-sur", jornada_id: "j-completa" }),
    trab("t4", "Diego Rojas", { sede_id: "s-sur", tipo_contrato_id: "k-ind" }),
    trab("t5", "Elena Díaz", { sede_id: "s-norte" }),
    trab("t7", "Fabián Vera", { jornada_id: "j-parcial" }),
    trab("t8", "Gloria Lagos"),
    trab("t9", "Héctor Sin Puesto", { sede_id: "s-norte" }),
  ],
  unidadEtiquetas: [
    { unidad_id: "mantencion", etiqueta_id: "e-turnos" },
    { unidad_id: "finanzas", etiqueta_id: "e-oficina" },
  ],
  catalogos: {
    cargos: [cat("c-jefe", "Jefe"), cat("c-tec", "Técnico"), cat("c-viejo", "Archivista", BORRADO)],
    tipos_contrato: [cat("k-ind", "Indefinido"), cat("k-plazo", "Plazo fijo", BORRADO)],
    sedes: [cat("s-norte", "Norte"), cat("s-sur", "Sur")],
    jornadas: [cat("j-completa", "Completa"), cat("j-parcial", "Parcial", BORRADO)],
    tipos_unidad: tipos,
  },
};
const sinFiltros: Filtros = SIN_FILTROS;
const porPersona: Orden = { campo: "persona", asc: true };
const claves = (f: Partial<Filtros> = {}, o: Orden = porPersona, e = estado) =>
  filtrarDirectorio(e, { ...sinFiltros, ...f }, o).map((x) => x.clave);

describe("filtro por persona", () => {
  it("deja solo las filas donde esa persona es la titular o la persona sin puesto, no donde es reemplazo", () => {
    expect(claves({ persona: "t3" })).toEqual(["puesto:p3"]); // t3 también reemplaza en p6: esa fila no
    expect(claves({ persona: "t9" })).toEqual(["persona:t9"]);
    expect(claves({ persona: "nadie" })).toEqual([]);
  });
});

describe("leerEstadoDirectorio", () => {
  it("valida cada campo y deja lo inválido en su valor inicial", () => {
    expect(leerEstadoDirectorio(null)).toEqual({
      filtros: SIN_FILTROS,
      orden: { campo: "persona", asc: true },
    });
    const e = leerEstadoDirectorio({
      filtros: { texto: 5, unidad: "u1", cargo_id: 3, estado: "raro", persona: "t1", sede_id: "" },
      orden: { campo: "cargo", asc: "no" },
    });
    expect(e.filtros).toEqual({ ...SIN_FILTROS, unidad: "u1", persona: "t1" });
    expect(e.orden).toEqual({ campo: "cargo", asc: true });
    expect(leerEstadoDirectorio({ filtros: { texto: "ana", estado: "vacante" } }).filtros).toMatchObject({
      texto: "ana",
      estado: "vacante",
    });
  });
});

describe("filtrarDirectorio", () => {
  it("una fila por puesto más una por persona sin puesto vigente", () => {
    const filas = filtrarDirectorio(estado, sinFiltros, porPersona);
    expect(filas).toHaveLength(10);
    expect(filas.filter((f) => f.estado === "sinPuesto").map((f) => f.persona)).toEqual([
      "Beatriz Soto",
      "Héctor Sin Puesto",
    ]);
    expect(filas.find((f) => f.puestoId === "p1")).toMatchObject({
      clave: "puesto:p1",
      personaId: "t1",
      persona: "Ana Pérez",
      reemplazo: null,
      cargo: "Jefe",
      unidadId: "gg",
      correo: "ana@x.cl",
      tipoContrato: "Indefinido",
      sede: "Norte",
      jornada: null,
      estado: "ocupado",
    });
  });

  it("vacante: sin persona ni datos de persona; el reemplazo vigente va en su columna", () => {
    const filas = filtrarDirectorio(estado, sinFiltros, porPersona);
    expect(filas.find((f) => f.puestoId === "p2")).toMatchObject({
      estado: "vacante",
      personaId: null,
      persona: null,
      reemplazo: null,
      correo: null,
      sede: null,
    });
    expect(filas.find((f) => f.puestoId === "p6")).toMatchObject({
      estado: "vacante",
      persona: null,
      reemplazo: "Carlos Muñoz",
    });
  });

  it("una persona con dos puestos aparece en dos filas; quien solo es reemplazo, en la fila de su puesto", () => {
    expect(claves({ texto: "carlos" }).sort()).toEqual(["puesto:p3", "puesto:p6"]);
  });

  it("sin puesto: ruta vacía y sin unidad; muestra los datos de la persona", () => {
    const f = filtrarDirectorio(estado, sinFiltros, porPersona).find((x) => x.personaId === "t9")!;
    expect(f).toMatchObject({
      clave: "persona:t9",
      puestoId: null,
      unidadId: null,
      ruta: [],
      cargo: null,
      sede: "Norte",
    });
  });

  it("ruta: la unidad más cercana de cada tipo, incluida la propia", () => {
    const f = filtrarDirectorio(estado, sinFiltros, porPersona).find((x) => x.puestoId === "p4")!;
    expect(f.ruta.map((r) => r.nombre)).toEqual([
      "Operaciones",
      "Mantención",
      "Mecánica",
      "Gerencia General",
    ]);
    expect(f.ruta[1].tipoId).toBe(TIPO_AREA);
  });

  it("filtrar por unidad incluye su rama", () => {
    expect(claves({ unidad: "mantencion" }).sort()).toEqual([
      "puesto:p3",
      "puesto:p4",
      "puesto:p5",
      "puesto:p6",
      "puesto:p7",
      "puesto:p8",
    ]);
    expect(claves({ unidad: "electrica" }).sort()).toEqual(["puesto:p7", "puesto:p8"]);
  });

  it("filtrar por etiqueta usa las etiquetas de la unidad de la fila", () => {
    expect(claves({ etiqueta: "e-oficina" })).toEqual(["puesto:p2"]);
    expect(claves({ etiqueta: "e-turnos" })).toEqual(["puesto:p3"]);
  });

  it("cargo, tipo de contrato, sede y jornada filtran por id exacto; contrato, sede y jornada, solo los del titular", () => {
    expect(claves({ cargo_id: "c-jefe" }).sort()).toEqual(["puesto:p1", "puesto:p3"]);
    expect(claves({ sede_id: "s-sur" }).sort()).toEqual(["puesto:p3", "puesto:p4"]); // p6 solo tiene a Carlos de reemplazo
    expect(claves({ tipo_contrato_id: "k-ind" }).sort()).toEqual(["puesto:p1", "puesto:p4"]);
    expect(claves({ jornada_id: "j-completa" })).toEqual(["puesto:p3"]);
    expect(claves({ sede_id: "s-norte" }).sort()).toEqual(["persona:t9", "puesto:p1", "puesto:p5"]);
  });

  it("un valor de catálogo desactivado sigue filtrando y mostrando su nombre", () => {
    const filas = filtrarDirectorio(estado, { ...sinFiltros, cargo_id: "c-viejo" }, porPersona);
    expect(filas.map((x) => [x.clave, x.cargo])).toEqual([["puesto:p7", "Archivista"]]);
    const parcial = filtrarDirectorio(estado, { ...sinFiltros, jornada_id: "j-parcial" }, porPersona);
    expect(parcial.map((x) => x.jornada)).toEqual(["Parcial"]);
  });

  it("estado: ocupado, vacante o sin puesto", () => {
    expect(claves({ estado: "vacante" }).sort()).toEqual(["puesto:p2", "puesto:p6"]);
    expect(claves({ estado: "sinPuesto" }).sort()).toEqual(["persona:t2", "persona:t9"]);
    expect(claves({ estado: "ocupado" })).toHaveLength(6);
  });

  it("el texto busca en persona, reemplazo, cargo y correo sin tildes ni mayúsculas", () => {
    expect(claves({ texto: "munoz" }).sort()).toEqual(["puesto:p3", "puesto:p6"]);
    expect(claves({ texto: "TECNICO" }).sort()).toEqual([
      "puesto:p2",
      "puesto:p4",
      "puesto:p5",
      "puesto:p6",
      "puesto:p8",
    ]);
    expect(claves({ texto: "ana@x" })).toEqual(["puesto:p1"]);
    expect(claves({ texto: "carlos@x" })).toEqual(["puesto:p3"]); // el correo es el del titular; el nombre del reemplazo sí cuenta
    expect(claves({ texto: "  " })).toHaveLength(10);
  });

  it("ordena por persona (vacíos al final), por cargo y por unidad (por su ruta), ascendente y descendente", () => {
    expect(claves({}, porPersona).slice(0, 3)).toEqual(["puesto:p1", "persona:t2", "puesto:p3"]);
    expect(claves({}, porPersona).slice(-2).sort()).toEqual(["puesto:p2", "puesto:p6"]);
    const desc = claves({}, { campo: "persona", asc: false });
    expect(desc[0]).toBe("persona:t9");
    expect(desc.slice(-2).sort()).toEqual(["puesto:p2", "puesto:p6"]);
    expect(claves({}, { campo: "cargo", asc: true }).slice(0, 3)).toEqual([
      "puesto:p7",
      "puesto:p1",
      "puesto:p3",
    ]);
    // Rutas: «Finanzas › …» < «Gerencia General» < «Operaciones › … › Eléctrica › …» < «Operaciones › … › Mecánica › …».
    const porUnidad = claves({}, { campo: "unidad", asc: true });
    expect(porUnidad.slice(0, 2)).toEqual(["puesto:p2", "puesto:p1"]);
    expect(porUnidad.indexOf("puesto:p7")).toBeLessThan(porUnidad.indexOf("puesto:p4"));
    expect(porUnidad.slice(-2).sort()).toEqual(["persona:t2", "persona:t9"]);
    expect(claves({}, { campo: "unidad", asc: false })[0]).toBe("puesto:p4");
  });

  it("las candidatas se arman una vez y sirven para cualquier filtro y orden", () => {
    const c = candidatasDirectorio(estado);
    for (const f of [{ texto: "munoz" }, { unidad: "mantencion" }, { estado: "vacante" as const }]) {
      const filtros = { ...sinFiltros, ...f };
      expect(filtrarYOrdenar(c, filtros, porPersona)).toEqual(filtrarDirectorio(estado, filtros, porPersona));
    }
  });

  it("ignora puestos y asignaciones borrados y puestos de unidades borradas", () => {
    const e: EstadoDirectorio = {
      ...estado,
      puestos: [...estado.puestos, { ...p("p9", "mecanica"), deleted_at: BORRADO }, p("p10", "borrada")],
      asignaciones: [...asignaciones, a("a9", "p9", "t9"), a("a10", "p10", "t8")],
    };
    expect(claves({}, porPersona, e)).toHaveLength(10);
    expect(claves({ estado: "sinPuesto" }, porPersona, e)).toContain("persona:t9");
  });
});

describe("columnas del directorio", () => {
  const enUso = [{ id: TIPO_OTRA }, { id: TIPO_GERENCIA }, { id: TIPO_AREA }, { id: TIPO_SUBAREA }];

  it("leerColumnas guarda solo los sí/no; lo demás se descarta", () => {
    expect(leerColumnas({ sede: true, jornada: "si", reemplazo: false, x: null })).toEqual({
      sede: true,
      reemplazo: false,
    });
    for (const crudo of [null, "texto", 3, [true]]) expect(leerColumnas(crudo)).toEqual({});
  });

  it("sin elegir: Gerencia y Área a la vista; Reemplazo, contrato, sede, jornada y los demás tipos ocultos", () => {
    const ver = (clave: string) => columnaVisible({}, clave, enUso);
    expect(ver(`tipo:${TIPO_GERENCIA}`)).toBe(true);
    expect(ver(`tipo:${TIPO_AREA}`)).toBe(true);
    for (const clave of [
      `tipo:${TIPO_OTRA}`,
      `tipo:${TIPO_SUBAREA}`,
      "reemplazo",
      "tipoContrato",
      "sede",
      "jornada",
    ])
      expect(ver(clave)).toBe(false);
  });

  it("sin Gerencia ni Área en uso se ve el primer tipo; lo elegido manda", () => {
    const otros = [{ id: TIPO_OTRA }, { id: TIPO_SUBAREA }];
    expect(columnaVisible({}, `tipo:${TIPO_OTRA}`, otros)).toBe(true);
    expect(columnaVisible({}, `tipo:${TIPO_SUBAREA}`, otros)).toBe(false);
    expect(
      columnaVisible({ [`tipo:${TIPO_GERENCIA}`]: false, sede: true }, `tipo:${TIPO_GERENCIA}`, enUso),
    ).toBe(false);
    expect(columnaVisible({ sede: true }, "sede", enUso)).toBe(true);
  });
});
