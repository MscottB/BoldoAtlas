import { describe, expect, it } from "vitest";
import { TIPO_AREA, TIPO_GERENCIA, type Leyenda, type Trabajador, type ValorCatalogo } from "@/db/tipos";
import { a, asignaciones, p, puestos as puestosBase, u, unidades } from "@/features/arbol/fixture";
import {
  avisos,
  contarAvisos,
  correosRepetidos,
  nombresParecidos,
  personasSinPuesto,
  puestosVacantes,
  reemplazosVigentes,
  unidadesSinJefatura,
  unidadesVacias,
  valoresSinUso,
  type EstadoRevision,
} from "./revision";

const BORRADO = "2026-01-01T00:00:00.000Z";
const HOY = new Date("2026-03-11T12:00:00Z");
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
  foto_png: null,
  notas: null,
  ...extra,
});
const ley = (id: string, deleted_at: string | null = null): Leyenda => ({
  id,
  nombre: id,
  color: "#aabbcc",
  descripcion: null,
  orden: 0,
  deleted_at,
});

const vacio: EstadoRevision = {
  unidades: [],
  trabajadores: [],
  puestos: [],
  asignaciones: [],
  leyendas: [],
  catalogos: { cargos: [], tipos_contrato: [], sedes: [], jornadas: [], tipos_unidad: [] },
};
const con = (e: Partial<EstadoRevision>): EstadoRevision => ({ ...vacio, ...e });

describe("unidadesSinJefatura", () => {
  it("sin jefe, con un puesto borrado o sin titular ni reemplazo vigente", () => {
    const e = con({
      unidades: [
        u("sin", TIPO_AREA, "Sin jefe", null),
        { ...u("borrado", TIPO_AREA, "Jefe borrado", "sin"), jefe_puesto_id: "pb" },
        { ...u("vacio", TIPO_AREA, "Jefe vacante", "sin"), jefe_puesto_id: "pv" },
        { ...u("ok", TIPO_AREA, "Con titular", "sin"), jefe_puesto_id: "po" },
        { ...u("rem", TIPO_AREA, "Con reemplazo", "sin"), jefe_puesto_id: "pr" },
        { ...u("eliminada", TIPO_AREA, "Eliminada", "sin"), deleted_at: BORRADO },
      ],
      puestos: [
        { ...p("pb", "sin"), deleted_at: BORRADO },
        p("pv", "vacio"),
        p("po", "ok"),
        p("pr", "rem"),
      ],
      asignaciones: [
        a("a1", "pb", "t1"),
        a("a2", "po", "t1"),
        a("a3", "pr", "t1", "reemplazo"),
        a("a4", "pv", "t1", "titular", "2026-02-01"),
      ],
    });
    expect(unidadesSinJefatura(e).map((f) => f.unidadId)).toEqual(["sin", "borrado", "vacio"]);
    expect(unidadesSinJefatura(e)[1]).toMatchObject({ nombre: "Jefe borrado", ruta: "Sin jefe" });
  });
});

describe("puestosVacantes", () => {
  const e = con({
    unidades,
    puestos: [
      { ...p("nuevo", "gg"), created_at: "2026-03-01T10:00:00.000Z" },
      p("p2", "finanzas"),
      { ...p("viejo", "gg"), cargo_id: "c-jefe" },
      { ...p("borrado", "gg"), deleted_at: BORRADO },
      p("ocupado", "gg"),
    ],
    asignaciones: [
      a("a1", "p2", "t2", "titular", "2026-02-01"),
      a("a2", "p2", "t3", "titular", "2025-12-01"),
      a("a3", "viejo", "t4", "titular", "2026-03-10"),
      a("a4", "ocupado", "t5"),
      a("a5", "nuevo", "t6", "reemplazo"),
      { ...a("a6", "nuevo", "t7", "titular", "2026-03-10"), deleted_at: BORRADO },
    ],
    catalogos: { ...vacio.catalogos, cargos: [cat("cargo", "Analista"), cat("c-jefe", "Jefe", BORRADO)] },
  });

  it("días desde el cierre de la última titular, o desde la creación si nunca tuvo", () => {
    const f = puestosVacantes(e, HOY);
    expect(f.map((x) => [x.puestoId, x.dias])).toEqual([
      ["p2", 38], // la titular que cerró más tarde: 2026-02-01
      ["nuevo", 10], // nunca tuvo titular (el reemplazo y la titular borrada no cuentan): desde created_at
      ["viejo", 1],
    ]);
    expect(f[0]).toMatchObject({ unidadId: "finanzas", unidad: "Finanzas", cargo: "Analista" });
    // el cargo desactivado se muestra igual
    expect(f[2].cargo).toBe("Jefe");
  });

  it("un puesto sin fecha alguna queda al final, sin días", () => {
    const f = puestosVacantes(con({ unidades, puestos: [p("x", "gg"), { ...p("y", "gg"), created_at: "2026-03-01T00:00:00Z" }] }), HOY);
    expect(f.map((x) => [x.puestoId, x.dias])).toEqual([["y", 10], ["x", null]]);
  });
});

describe("reemplazosVigentes", () => {
  it("lista solo reemplazos vigentes de puestos y personas vivos", () => {
    const e = con({
      unidades,
      trabajadores: [trab("t1", "Ana"), trab("t2", "Beto")],
      puestos: [p("p1", "gg"), { ...p("p2", "gg"), deleted_at: BORRADO }],
      asignaciones: [
        a("a1", "p1", "t1", "reemplazo"),
        a("a2", "p1", "t2", "reemplazo", "2026-02-01"),
        a("a3", "p1", "t2", "titular"),
        a("a4", "p2", "t1", "reemplazo"),
        { ...a("a5", "p1", "t2", "reemplazo"), deleted_at: BORRADO },
      ],
    });
    expect(reemplazosVigentes(e)).toEqual([
      { puestoId: "p1", personaId: "t1", persona: "Ana", cargo: "", unidad: "Gerencia General" },
    ]);
  });
});

describe("personasSinPuesto", () => {
  it("personas vivas sin titular ni reemplazo vigente en un puesto vivo", () => {
    const e = con({
      trabajadores: [
        trab("t1", "Con puesto"),
        trab("t2", "Cerrado"),
        trab("t3", "Reemplazo"),
        trab("t4", "Nunca"),
        trab("t5", "Puesto borrado"),
      ],
      puestos: [p("p1", "gg"), { ...p("p2", "gg"), deleted_at: BORRADO }],
      asignaciones: [
        a("a1", "p1", "t1"),
        a("a2", "p1", "t2", "titular", "2026-02-01"),
        a("a3", "p1", "t3", "reemplazo"),
        a("a4", "p2", "t5"),
      ],
    });
    expect(personasSinPuesto(e).map((f) => f.personaId)).toEqual(["t2", "t4", "t5"]);
  });
});

describe("correosRepetidos", () => {
  it("agrupa correos iguales sin importar mayúsculas ni espacios, solo de personas vivas", () => {
    const e = con({
      trabajadores: [
        trab("t1", "Ana", { correo: "ana@x.cl" }),
        trab("t2", "Ana bis", { correo: "  ANA@x.cl " }),
        trab("t3", "Beto", { correo: "beto@x.cl" }),
        trab("t4", "Carla", { correo: "carla@x.cl" }),
        { ...trab("t5", "Carla borrada", { correo: "carla@x.cl" }), deleted_at: BORRADO },
        trab("t6", "Sin correo"),
        trab("t7", "Vacío", { correo: "   " }),
        trab("t8", "Vacío 2", { correo: "" }),
      ],
    });
    expect(correosRepetidos(e)).toEqual([
      {
        clave: "ana@x.cl",
        personas: [
          { id: "t1", nombre: "Ana", correo: "ana@x.cl" },
          { id: "t2", nombre: "Ana bis", correo: "  ANA@x.cl " },
        ],
      },
    ]);
  });
});

describe("nombresParecidos", () => {
  it("iguales sin tildes ni mayúsculas, o con las mismas palabras en otro orden", () => {
    const e = con({
      trabajadores: [
        trab("t1", "Juan Pérez", { correo: "j@x.cl" }),
        trab("t2", "JUAN  PEREZ"),
        trab("t3", "Pérez, Juan"),
        trab("t4", "Juan Pérez Soto"),
        trab("t5", "María López"),
        trab("t6", "Lopez Maria"),
        trab("t7", "Pedro Solo"),
        { ...trab("t8", "Juan Perez"), deleted_at: BORRADO },
        trab("t9", "   "),
        trab("t10", "  "),
      ],
    });
    const g = nombresParecidos(e);
    expect(g.map((x) => x.personas.map((pp) => pp.id))).toEqual([
      ["t1", "t2", "t3"],
      ["t5", "t6"],
    ]);
    expect(g[0].personas[0]).toEqual({ id: "t1", nombre: "Juan Pérez", correo: "j@x.cl" });
  });
});

describe("unidadesVacias", () => {
  it("sin puestos vivos ni subunidades vivas", () => {
    const e = con({
      unidades: [
        u("raiz", TIPO_GERENCIA, "Raíz", null),
        u("conPuesto", TIPO_AREA, "Con puesto", "raiz"),
        u("conHija", TIPO_AREA, "Con hija", "raiz"),
        u("hoja", TIPO_AREA, "Hoja vacía", "conHija"),
        u("puestoBorrado", TIPO_AREA, "Puesto borrado", "raiz"),
        u("hijaBorrada", TIPO_AREA, "Hija borrada", "raiz"),
        { ...u("x", TIPO_AREA, "Borrada", "hijaBorrada"), deleted_at: BORRADO },
        { ...u("y", TIPO_AREA, "Borrada 2", "raiz"), deleted_at: BORRADO },
      ],
      puestos: [p("p1", "conPuesto"), { ...p("p2", "puestoBorrado"), deleted_at: BORRADO }],
    });
    expect(unidadesVacias(e).map((f) => f.unidadId)).toEqual(["hoja", "puestoBorrado", "hijaBorrada"]);
    expect(unidadesVacias(e)[0].ruta).toBe("Raíz › Con hija");
  });
});

describe("valoresSinUso", () => {
  it("valores activos que nada vivo usa; los desactivados no se reportan", () => {
    const e = con({
      unidades: [u("un", "t-usado", "Una", null), { ...u("bor", "t-borrada-unidad", "B", null), deleted_at: BORRADO }],
      puestos: [
        { ...p("p1", "un"), cargo_id: "c-usado", leyenda_id: "l-usada" },
        { ...p("p2", "un"), cargo_id: "c-solo-borrado", deleted_at: BORRADO },
      ],
      trabajadores: [trab("t1", "Ana", { tipo_contrato_id: "k-usado", sede_id: "s-usada", jornada_id: "j-usada" })],
      leyendas: [ley("l-usada"), ley("l-libre"), ley("l-inactiva", BORRADO)],
      catalogos: {
        cargos: [cat("c-usado", "Usado"), cat("c-libre", "Libre"), cat("c-solo-borrado", "Solo borrado"), cat("c-off", "Off", BORRADO)],
        tipos_contrato: [cat("k-usado", "Indef"), cat("k-libre", "Plazo")],
        sedes: [cat("s-usada", "Norte"), cat("s-libre", "Sur"), cat("s-off", "Este", BORRADO)],
        jornadas: [cat("j-usada", "Completa"), cat("j-libre", "Parcial")],
        tipos_unidad: [cat("t-usado", "Área"), cat("t-libre", "Otra"), cat("t-borrada-unidad", "Sub")],
      },
    });
    expect(valoresSinUso(e).map((f) => `${f.tabla}:${f.id}`)).toEqual([
      "cargos:c-libre",
      "cargos:c-solo-borrado",
      "tipos_contrato:k-libre",
      "sedes:s-libre",
      "jornadas:j-libre",
      "tipos_unidad:t-libre",
      "tipos_unidad:t-borrada-unidad",
      "leyendas:l-libre",
    ]);
  });
});

describe("avisos y contador", () => {
  const e = con({
    unidades,
    puestos: puestosBase,
    asignaciones,
    trabajadores: [
      trab("t1", "Ana Pérez", { correo: "a@x.cl" }),
      trab("t2", "Beatriz Soto", { correo: "A@x.cl" }),
      trab("t3", "Carlos Muñoz"),
      trab("t4", "Diego Rojas"),
      trab("t5", "Elena Díaz"),
      trab("t7", "Fabián Vera"),
      trab("t8", "Gloria Lagos"),
    ],
  });

  it("junta las listas; el contador no suma los reemplazos vigentes", () => {
    const r = avisos(e, HOY);
    expect(r.reemplazos).toHaveLength(1); // p6 con t3
    expect(r.vacantes.map((x) => x.puestoId)).toEqual(["p2", "p6"]);
    expect(r.correos).toHaveLength(1);
    expect(r.sinPuesto.map((x) => x.personaId)).toEqual(["t2"]);
    expect(contarAvisos(r)).toBe(
      r.sinJefatura.length +
        r.vacantes.length +
        r.sinPuesto.length +
        r.correos.length +
        r.nombres.length +
        r.vacias.length +
        r.sinUso.length,
    );
  });

  it("sin nada que avisar, el contador es 0", () => {
    expect(contarAvisos(avisos(vacio, HOY))).toBe(0);
  });

  it("escala: 2.000 unidades, 4.000 puestos y 5.000 personas", () => {
    const grande = con({
      unidades: Array.from({ length: 2000 }, (_, i) => u(`u${i}`, TIPO_AREA, `Unidad ${i}`, i ? `u${(i - 1) >> 1}` : null)),
      puestos: Array.from({ length: 4000 }, (_, i) => p(`p${i}`, `u${i % 2000}`)),
      trabajadores: Array.from({ length: 5000 }, (_, i) =>
        trab(`t${i}`, `Nombre${i % 3000} Apellido${i % 7}`, { correo: `c${i % 4000}@x.cl` }),
      ),
      asignaciones: Array.from({ length: 3000 }, (_, i) => a(`a${i}`, `p${i}`, `t${i}`)),
    });
    const t0 = performance.now();
    const r = avisos(grande, HOY);
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(r.vacantes).toHaveLength(1000);
    expect(r.sinPuesto).toHaveLength(2000);
  });
});
