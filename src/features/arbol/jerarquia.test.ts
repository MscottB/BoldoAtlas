import { describe, expect, it } from "vitest";
import {
  TIPO_AREA,
  TIPO_GERENCIA,
  TIPO_OTRA,
  TIPO_SUBAREA,
  type Trabajador,
  type ValorCatalogo,
} from "@/db/tipos";
import { a, asignaciones, p, puestos, tipos, u, unidades } from "./fixture";
import {
  creaCiclo,
  descendientes,
  dotacion,
  dotacionPorUnidad,
  existiaEn,
  hijos,
  indexar,
  indiceHijos,
  instantaneaEn,
  jefeVisible,
  leyendaDeMarcas,
  marcaHeredada,
  marcasPorUnidad,
  personasPorUnidad,
  ruta,
  rutaPorTipo,
  rutasPorTipo,
  rutaSuperiores,
  rutaTexto,
  tipoHijo,
  tiposEnUso,
  unidadesDePersona,
  vigentesEn,
  vigentesPorPuesto,
} from "./jerarquia";

const BORRADO = "2026-01-01T00:00:00.000Z";

describe("jerarquía", () => {
  it("indexar indexa por id", () => {
    expect(indexar(unidades).get("mecanica")?.nombre).toBe("Mecánica");
  });

  it("hijos ordena por orden y luego nombre, e ignora borradas", () => {
    expect(hijos(unidades, "gg").map((x) => x.id)).toEqual(["operaciones", "finanzas"]);
    expect(hijos(unidades, "mantencion").map((x) => x.id)).toEqual(["electrica", "mecanica"]);
  });

  it("ruta y rutaTexto van de la raíz a la unidad", () => {
    expect(ruta(unidades, "mecanica").map((x) => x.id)).toEqual([
      "gg",
      "operaciones",
      "mantencion",
      "mecanica",
    ]);
    expect(rutaTexto(unidades, "mecanica")).toBe("Gerencia General › Operaciones › Mantención › Mecánica");
  });

  it("descendientes no incluye la propia unidad ni las borradas", () => {
    expect(descendientes(unidades, "operaciones")).toEqual(new Set(["mantencion", "mecanica", "electrica"]));
  });

  it("creaCiclo detecta mover bajo sí misma o bajo un descendiente", () => {
    expect(creaCiclo(unidades, "operaciones", "mecanica")).toBe(true);
    expect(creaCiclo(unidades, "mecanica", "finanzas")).toBe(false);
    expect(creaCiclo(unidades, "x", "x")).toBe(true);
    expect(creaCiclo(unidades, "gg", null)).toBe(false);
  });

  it("dotacion cuenta puestos con titular vigente (directos y de la rama) y vacantes de la rama", () => {
    // p6 tiene solo un reemplazo vigente y p2 solo un titular cerrado: son vacantes y no suman dotación.
    expect(dotacion(unidades, puestos, asignaciones, "mantencion")).toEqual({
      directa: 1,
      total: 5,
      vacantes: 1,
    });
    expect(dotacion(unidades, puestos, asignaciones, "gg")).toEqual({ directa: 1, total: 6, vacantes: 2 });
  });

  it("dotacionPorUnidad da lo mismo que dotacion para cada unidad viva, en una pasada", () => {
    const ps = [...puestos, { ...p("p9", "mecanica"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    const todas = dotacionPorUnidad(unidades, ps, as);
    const vivas = unidades.filter((x) => !x.deleted_at);
    expect([...todas.keys()].sort()).toEqual(vivas.map((x) => x.id).sort());
    for (const x of vivas) expect(todas.get(x.id)).toEqual(dotacion(unidades, ps, as, x.id));
  });

  it("dotacion ignora puestos y asignaciones borrados", () => {
    const ps = [...puestos, { ...p("p9", "mantencion"), deleted_at: BORRADO }];
    const as = [...asignaciones, a("a9", "p9", "t9"), { ...a("a10", "p6", "t9"), deleted_at: BORRADO }];
    expect(dotacion(unidades, ps, as, "mantencion")).toEqual({ directa: 1, total: 5, vacantes: 1 });
  });
});

// "Superintendencia" entre Gerencia y Área; Mantención pasa a ser una.
const SUPER = "sup";
const conSuper: ValorCatalogo[] = [
  ...tipos,
  { id: SUPER, nombre: "Superintendencia", orden: 15, deleted_at: null },
];
const unidadesConSuper = unidades.map((x) => (x.id === "mantencion" ? { ...x, tipo_id: SUPER } : x));

describe("tipos de unidad", () => {
  const nombres = (r: ReturnType<typeof rutaPorTipo>) => r.map((x) => [x.tipo.nombre, x.unidad.id]);

  it("rutaPorTipo: para cada tipo, la unidad más cercana hacia arriba, en orden del catálogo", () => {
    expect(nombres(rutaPorTipo(unidades, tipos, "mecanica"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Área", "mantencion"],
      ["Subárea", "mecanica"],
      ["Otra", "gg"],
    ]);
    expect(nombres(rutaPorTipo(unidades, tipos, "finanzas"))).toEqual([
      ["Gerencia", "finanzas"],
      ["Otra", "gg"],
    ]);
  });

  it("rutaPorTipo con un tipo agregado entre otros", () => {
    expect(nombres(rutaPorTipo(unidadesConSuper, conSuper, "mecanica"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Superintendencia", "mantencion"],
      ["Subárea", "mecanica"],
      ["Otra", "gg"],
    ]);
  });

  it("rutaPorTipo con un tipo renombrado y uno desactivado (sigue válido en sus unidades)", () => {
    const cambiados = tipos.map((t) =>
      t.id === TIPO_GERENCIA
        ? { ...t, nombre: "Dirección" }
        : t.id === TIPO_AREA
          ? { ...t, deleted_at: BORRADO }
          : t,
    );
    expect(nombres(rutaPorTipo(unidades, cambiados, "mantencion"))).toEqual([
      ["Dirección", "operaciones"],
      ["Área", "mantencion"],
      ["Otra", "gg"],
    ]);
  });

  it("con un tipo repetido en el camino, gana la unidad más cercana", () => {
    // Otra dentro de Otra (GG › … › Mecánica › Interna › Detalle) y Área dentro de Área.
    const repetidas = [
      ...unidades,
      u("interna", TIPO_OTRA, "Interna", "mecanica"),
      u("detalle", TIPO_SUBAREA, "Detalle", "interna"),
      u("areaInterna", TIPO_AREA, "Área interna", "mantencion"),
    ];
    expect(nombres(rutaPorTipo(repetidas, tipos, "detalle"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Área", "mantencion"],
      ["Subárea", "detalle"],
      ["Otra", "interna"],
    ]);
    expect(nombres(rutaPorTipo(repetidas, tipos, "areaInterna"))).toEqual([
      ["Gerencia", "operaciones"],
      ["Área", "areaInterna"],
      ["Otra", "gg"],
    ]);
  });

  it("rutaSuperiores: los superiores por tipo, sin la unidad; un Área dentro de un Área muestra la externa", () => {
    const repetidas = [...unidades, u("areaInterna", TIPO_AREA, "Área interna", "mantencion")];
    const rutas = rutasPorTipo(repetidas, tipos, new Set([TIPO_GERENCIA, TIPO_AREA]));
    const ids = (id: string) =>
      rutaSuperiores(
        rutas,
        repetidas.find((x) => x.id === id)!,
      ).map((x) => x.id);
    expect(ids("areaInterna")).toEqual(["operaciones", "mantencion"]);
    expect(ids("mantencion")).toEqual(["operaciones"]);
    expect(ids("gg")).toEqual([]);
  });

  it("tipoHijo: el siguiente tipo activo en orden; el último se repite; sin superior, el primero", () => {
    expect(tipoHijo(tipos, TIPO_GERENCIA)).toBe(TIPO_AREA);
    expect(tipoHijo(tipos, TIPO_AREA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(tipos, TIPO_SUBAREA)).toBe(TIPO_OTRA);
    expect(tipoHijo(tipos, TIPO_OTRA)).toBe(TIPO_OTRA);
    expect(tipoHijo(tipos, null)).toBe(TIPO_GERENCIA);
  });

  it("tipoHijo con un tipo agregado, uno renombrado y uno reordenado", () => {
    expect(tipoHijo(conSuper, TIPO_GERENCIA)).toBe(SUPER);
    expect(tipoHijo(conSuper, SUPER)).toBe(TIPO_AREA);
    const renombrado = tipos.map((t) => (t.id === TIPO_GERENCIA ? { ...t, nombre: "Dirección" } : t));
    expect(tipoHijo(renombrado, TIPO_GERENCIA)).toBe(TIPO_AREA);
    const otraPrimero = tipos.map((t) => (t.id === TIPO_OTRA ? { ...t, orden: 5 } : t));
    expect(tipoHijo(otraPrimero, null)).toBe(TIPO_OTRA);
    expect(tipoHijo(otraPrimero, TIPO_OTRA)).toBe(TIPO_GERENCIA);
  });

  it("tipoHijo salta los desactivados; sin activos, undefined", () => {
    const sinArea = tipos.map((t) =>
      t.id === TIPO_AREA || t.id === TIPO_OTRA ? { ...t, deleted_at: BORRADO } : t,
    );
    expect(tipoHijo(sinArea, TIPO_GERENCIA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(sinArea, TIPO_SUBAREA)).toBe(TIPO_SUBAREA);
    expect(tipoHijo(sinArea, TIPO_OTRA)).toBe(TIPO_SUBAREA);
    expect(
      tipoHijo(
        tipos.map((t) => ({ ...t, deleted_at: BORRADO })),
        null,
      ),
    ).toBeUndefined();
  });
});

describe("puestos y asignaciones", () => {
  const conJefe = (jefe_puesto_id: string | null) => ({ ...u("x", TIPO_AREA, "X", null), jefe_puesto_id });

  it("vigentesPorPuesto ignora las cerradas y las borradas", () => {
    const v = vigentesPorPuesto([...asignaciones, { ...a("a9", "p2", "t9"), deleted_at: BORRADO }]);
    expect(v.get("p2")).toBeUndefined();
    expect(v.get("p6")).toEqual({ reemplazo: asignaciones[5] });
    expect(v.get("p1")).toEqual({ titular: asignaciones[0] });
  });

  it("jefeVisible: el titular vigente del puesto de jefatura o, si no hay, su reemplazo vigente", () => {
    const v = vigentesPorPuesto([...asignaciones, a("a9", "p1", "t9", "reemplazo")]);
    expect(jefeVisible(conJefe("p1"), v)?.trabajador_id).toBe("t1");
    expect(jefeVisible(conJefe("p6"), v)).toMatchObject({ trabajador_id: "t3", tipo: "reemplazo" });
    expect(jefeVisible(conJefe("p2"), v)).toBeNull();
    expect(jefeVisible(conJefe(null), v)).toBeNull();
  });

  it("unidadesDePersona: unidades de sus asignaciones vigentes, sin repetir ni contar las cerradas", () => {
    expect(unidadesDePersona(puestos, asignaciones, "t3")).toEqual(["mantencion", "mecanica"]);
    expect(unidadesDePersona(puestos, asignaciones, "t2")).toEqual([]);
    const otroEnMecanica = [...asignaciones, a("a9", "p5", "t4", "reemplazo")];
    expect(unidadesDePersona(puestos, otroEnMecanica, "t4")).toEqual(["mecanica"]);
    const borrado = [...puestos.slice(0, 2), { ...p("p3", "mantencion"), deleted_at: BORRADO }];
    expect(unidadesDePersona(borrado, asignaciones, "t3")).toEqual([]);
  });
});

describe("personasPorUnidad (jefatura y caras de la tarjeta)", () => {
  const persona = (id: string): Trabajador => ({
    id,
    nombre: id.toUpperCase(),
    correo: null,
    telefono: null,
    tipo_contrato_id: null,
    sede_id: null,
    jornada_id: null,
    tiene_foto: 0,
    updated_at: "",
  });
  const gente = (...ids: string[]) => new Map(ids.map((id) => [id, persona(id)]));
  const cargos = new Map([["cargo", "Técnico"]]);
  const caras = (r: { equipo: Trabajador[] } | undefined) => r?.equipo.map((w) => w.id);

  it("solo la propia unidad: quien encabeza aparte, el equipo por orden de puesto y cada persona una vez", () => {
    const us = unidades.map((x) => (x.id === "mecanica" ? { ...x, jefe_puesto_id: "p5" } : x));
    const ps = puestos.map((x) => (x.id === "p4" ? { ...x, orden: 9 } : x));
    // Mecánica: p4 (t4, orden 9), p5 (t5, jefatura), p6 (t3 de reemplazo); t3 también es titular en Mantención.
    const r = personasPorUnidad(us, ps, vigentesPorPuesto(asignaciones), gente("t1", "t3", "t4", "t5"), cargos);
    expect(r.get("mecanica")).toEqual({
      cargoJefe: "Técnico",
      equipo: [persona("t3"), persona("t4")],
      personas: 3,
      resto: 0,
    });
    expect(caras(r.get("mantencion"))).toEqual(["t3"]); // sin las subunidades
    expect(r.get("mantencion")).toMatchObject({ personas: 1, cargoJefe: "" }); // sin puesto de jefatura
    expect(r.get("operaciones")).toEqual({ cargoJefe: "", equipo: [], personas: 0, resto: 0 });
    expect(r.get("electrica")?.personas).toBe(0); // t7 y t8 no están entre las personas: no se cuentan
  });

  it("hasta 4 caras y el resto en «+N»; una persona con dos puestos cuenta una vez", () => {
    const x = { ...u("x", TIPO_AREA, "X", null), jefe_puesto_id: "q0" };
    const ps = Array.from({ length: 8 }, (_, i) => ({ ...p(`q${i}`, "x"), orden: i }));
    const as = ps.map((q, i) => a(`b${i}`, q.id, i === 7 ? "w1" : `w${i}`));
    const r = personasPorUnidad([x], ps, vigentesPorPuesto(as), gente(...as.map((y) => y.trabajador_id)), cargos);
    // w0 encabeza; w1…w6 (w1 dos veces) son el equipo: 4 caras y +2.
    expect(r.get("x")).toMatchObject({ personas: 7, resto: 2 });
    expect(caras(r.get("x"))).toEqual(["w1", "w2", "w3", "w4"]);
  });

  it("respeta la fecha que se ve y omite los puestos borrados", () => {
    const x = { ...u("x", TIPO_AREA, "X", null), jefe_puesto_id: "j" };
    const ps = [p("j", "x"), p("e", "x"), { ...p("b", "x"), deleted_at: BORRADO }];
    const as = [
      { ...a("1", "j", "ana", "titular", "2024-06-01"), desde: "2020-01-01" },
      { ...a("2", "j", "beto"), desde: "2024-06-01" },
      { ...a("3", "e", "carla"), desde: "2023-01-01" },
      a("4", "b", "dani"),
    ];
    const ws = gente("ana", "beto", "carla", "dani");
    const antes = personasPorUnidad([x], ps, vigentesPorPuesto(as, "2022-01-01"), ws, cargos).get("x");
    expect(antes).toMatchObject({ personas: 1, equipo: [] }); // solo Ana, que encabezaba
    const hoy = personasPorUnidad([x], ps, vigentesPorPuesto(as), ws, cargos).get("x");
    expect(hoy).toMatchObject({ personas: 2, resto: 0 });
    expect(caras(hoy)).toEqual(["carla"]);
  });

  it("2.000 unidades y 10.000 personas en una pasada", () => {
    const us = Array.from({ length: 2000 }, (_, i) => ({
      ...u(`u${i}`, TIPO_AREA, `U${i}`, i ? `u${(i - 1) >> 2}` : null),
      jefe_puesto_id: `p${i}`,
    }));
    const ps = Array.from({ length: 10000 }, (_, i) => ({ ...p(`p${i}`, `u${i % 2000}`), orden: i }));
    const as = ps.map((q, i) => a(`a${i}`, q.id, `t${i}`));
    const ws = gente(...as.map((x) => x.trabajador_id));
    const inicio = performance.now();
    const r = personasPorUnidad(us, ps, vigentesPorPuesto(as), ws, cargos);
    const ms = performance.now() - inicio; // ~11–18 ms medido
    expect(r.get("u0")).toMatchObject({ personas: 5, resto: 0 });
    expect(caras(r.get("u0"))).toEqual(["t2000", "t4000", "t6000", "t8000"]);
    expect(ms).toBeLessThan(500);
  });
});

describe("marcaHeredada", () => {
  const marcadas = unidades.map((x) =>
    x.id === "operaciones"
      ? { ...x, marca_color: "#c2410c", marca_codigo: "OPE" }
      : x.id === "mecanica"
        ? { ...x, marca_color: "#2563eb", marca_codigo: null }
        : x,
  );

  it("toma la unidad más cercana hacia arriba, incluida ella misma, con marca y del nivel pedido", () => {
    expect(marcaHeredada(marcadas, "mecanica", "cualquiera")).toEqual({ color: "#2563eb", codigo: null });
    expect(marcaHeredada(marcadas, "mecanica", TIPO_GERENCIA)).toEqual({ color: "#c2410c", codigo: "OPE" });
    expect(marcaHeredada(marcadas, "operaciones", TIPO_GERENCIA)).toEqual({
      color: "#c2410c",
      codigo: "OPE",
    });
    expect(marcaHeredada(marcadas, "electrica", "cualquiera")).toEqual({ color: "#c2410c", codigo: "OPE" });
  });

  it("funciona con un tipo agregado", () => {
    const conMarca = unidadesConSuper.map((x) => (x.id === "mantencion" ? { ...x, marca_codigo: "MAN" } : x));
    expect(marcaHeredada(conMarca, "electrica", SUPER)).toEqual({ color: null, codigo: "MAN" });
    expect(marcaHeredada(conMarca, "electrica", TIPO_AREA)).toBeNull();
  });

  it("null si ninguna unidad de ese nivel en la ruta tiene marca", () => {
    expect(marcaHeredada(marcadas, "mecanica", TIPO_AREA)).toBeNull();
    expect(marcaHeredada(marcadas, "finanzas", TIPO_GERENCIA)).toBeNull();
    expect(marcaHeredada(marcadas, "gg", "cualquiera")).toBeNull();
  });
});

describe("vista: marcas, rutas y tipos en uso", () => {
  const marcadas = unidades.map((x) =>
    x.id === "gg"
      ? { ...x, marca_color: "#111111", marca_codigo: "GG" }
      : x.id === "operaciones"
        ? { ...x, marca_color: "#c2410c", marca_codigo: "OPE" }
        : x.id === "finanzas"
          ? { ...x, marca_color: null, marca_codigo: "FIN" }
          : x,
  );

  it("marcasPorUnidad coincide con marcaHeredada para cada unidad y nivel", () => {
    for (const nivel of [TIPO_GERENCIA, TIPO_AREA, TIPO_OTRA]) {
      const marcas = marcasPorUnidad(marcadas, nivel);
      for (const x of marcadas.filter((y) => !y.deleted_at)) {
        const esperada = marcaHeredada(marcadas, x.id, nivel);
        const m = marcas.get(x.id) ?? null;
        expect(m && { color: m.color, codigo: m.codigo }).toEqual(esperada);
      }
    }
  });

  it("marcasPorUnidad apunta a la unidad que define la marca y no incluye borradas", () => {
    const marcas = marcasPorUnidad(marcadas, TIPO_GERENCIA);
    expect(marcas.get("mecanica")?.unidad.id).toBe("operaciones");
    expect(marcas.get("gg")).toBeNull(); // GG es de tipo Otra: no tiene marca de Gerencia ni hereda
    expect(marcas.has("borrada")).toBe(false);
  });

  it("leyendaDeMarcas: una entrada por unidad que define marca, solo las que se ven, en orden del árbol", () => {
    const marcas = marcasPorUnidad(marcadas, TIPO_GERENCIA);
    const visibles = ["gg", "finanzas", "operaciones", "mantencion"].map((id) =>
      marcadas.find((x) => x.id === id)!,
    );
    expect(leyendaDeMarcas(marcas, visibles).map((m) => m.unidad.id)).toEqual(["finanzas", "operaciones"]);
    expect(leyendaDeMarcas(marcas, [marcadas.find((x) => x.id === "gg")!])).toEqual([]);
  });

  it("rutasPorTipo coincide con rutaPorTipo restringida a los tipos elegidos", () => {
    const elegidos = new Set([TIPO_GERENCIA, TIPO_SUBAREA]);
    const rutas = rutasPorTipo(unidades, tipos, elegidos);
    for (const x of unidades.filter((y) => !y.deleted_at)) {
      const esperada = rutaPorTipo(unidades, tipos, x.id).filter((r) => elegidos.has(r.tipo.id));
      expect(rutas.get(x.id)!.map((y) => y.id)).toEqual(esperada.map((r) => r.unidad.id));
    }
  });

  it("tiposEnUso: tipos de alguna unidad viva, en el orden del catálogo", () => {
    expect(tiposEnUso(unidades, tipos).map((t) => t.id)).toEqual([
      TIPO_GERENCIA,
      TIPO_AREA,
      TIPO_SUBAREA,
      TIPO_OTRA,
    ]);
    const solo = unidades.filter((x) => x.id === "mantencion" || x.id === "borrada");
    expect(tiposEnUso(solo, tipos).map((t) => t.id)).toEqual([TIPO_AREA]);
  });
});

describe("indiceHijos", () => {
  it("agrupa igual que hijos para cada unidad y para las raíces", () => {
    const indice = indiceHijos(unidades);
    for (const x of unidades) expect(indice.get(x.id) ?? []).toEqual(hijos(unidades, x.id));
    expect(indice.get(null)?.map((x) => x.id)).toEqual(["gg"]);
  });
});

// Instante UTC de una hora local: así el día local es el mismo en cualquier zona horaria.
const local = (anio: number, mes: number, dia: number, hora: number) =>
  new Date(anio, mes - 1, dia, hora, 30).toISOString();

describe("organigrama a una fecha", () => {
  it("existiaEn cuenta el día local de la creación, también a última hora", () => {
    const noche = { created_at: local(2026, 3, 10, 23) };
    expect(existiaEn(noche, "2026-03-10")).toBe(true);
    expect(existiaEn(noche, "2026-03-09")).toBe(false);
    expect(existiaEn({ created_at: local(2026, 3, 10, 0) }, "2026-03-10")).toBe(true);
    expect(existiaEn({}, "2000-01-01")).toBe(true); // sin created_at (datos de prueba) existe siempre
  });

  it("existiaEn: lo eliminado después de la fecha existía; el mismo día o antes, no", () => {
    const fila = { created_at: local(2026, 1, 1, 9), deleted_at: local(2026, 3, 10, 23) };
    expect(existiaEn(fila, "2026-03-09")).toBe(true);
    expect(existiaEn(fila, "2026-03-10")).toBe(false);
    expect(existiaEn(fila, "2026-04-01")).toBe(false);
  });

  const asig = (
    id: string,
    puesto: string,
    persona: string,
    desde: string,
    hasta: string | null,
    tipo: "titular" | "reemplazo" = "titular",
  ) => ({ ...a(id, puesto, persona, tipo, hasta), desde });
  // p3 (Mantención): Ana hasta el 2024-06-01 y desde ahí Beto; p1 (GG): Carla desde 2025.
  const historia = [
    asig("h1", "p3", "ana", "2020-01-01", "2024-06-01"),
    asig("h2", "p3", "beto", "2024-06-01", null),
    asig("h3", "p1", "carla", "2025-01-01", null),
    asig("h4", "p3", "dani", "2022-01-01", "2022-03-01", "reemplazo"),
  ];

  it("vigentesEn: desde <= fecha y (hasta null o hasta > fecha); el día de relevo ya es del nuevo", () => {
    const ids = (f: string) => vigentesEn(historia, f).map((x) => x.id);
    expect(ids("2019-12-31")).toEqual([]);
    expect(ids("2022-02-01")).toEqual(["h1", "h4"]);
    expect(ids("2024-05-31")).toEqual(["h1"]);
    expect(ids("2024-06-01")).toEqual(["h2"]);
    expect(ids("2026-01-01")).toEqual(["h2", "h3"]);
  });

  it("vigentesEn descarta lo eliminado a esa fecha, pero no mira created_at (manda `desde`)", () => {
    const retro = { ...asig("r1", "p3", "ana", "2020-01-01", null), created_at: local(2026, 5, 5, 10) };
    const borrada = { ...asig("r2", "p3", "beto", "2020-01-01", null), deleted_at: local(2023, 2, 1, 10) };
    expect(vigentesEn([retro, borrada], "2022-01-01").map((x) => x.id)).toEqual(["r1", "r2"]);
    expect(vigentesEn([retro, borrada], "2023-02-01").map((x) => x.id)).toEqual(["r1"]);
  });

  it("jefeVisible y dotacion cambian con la fecha cuando cambió el titular", () => {
    const conJefe = { ...u("mantencion", TIPO_AREA, "Mantención", null), jefe_puesto_id: "p3" };
    const hoy = vigentesPorPuesto(historia);
    const antes = vigentesPorPuesto(historia, "2023-01-01");
    expect(jefeVisible(conJefe, antes)?.trabajador_id).toBe("ana");
    expect(jefeVisible(conJefe, hoy)?.trabajador_id).toBe("beto");
    expect(jefeVisible(conJefe, vigentesPorPuesto(historia, "2022-02-01"))?.trabajador_id).toBe("ana");

    const ps = [p("p1", "gg"), p("p3", "mantencion")];
    expect(dotacion(unidades, ps, historia, "gg", "2023-01-01")).toEqual({
      directa: 0,
      total: 1,
      vacantes: 1,
    });
    expect(dotacion(unidades, ps, historia, "gg")).toEqual({ directa: 1, total: 2, vacantes: 0 });
    expect(dotacion(unidades, ps, historia, "gg", "2019-01-01")).toEqual({
      directa: 0,
      total: 0,
      vacantes: 2,
    });
  });

  it("dotacionPorUnidad con fecha da lo mismo que dotacion con fecha", () => {
    const ps = [p("p1", "gg"), p("p3", "mantencion"), p("p4", "mecanica")];
    const todas = dotacionPorUnidad(unidades, ps, historia, "2023-01-01");
    for (const x of unidades.filter((y) => !y.deleted_at))
      expect(todas.get(x.id)).toEqual(dotacion(unidades, ps, historia, x.id, "2023-01-01"));
    expect(todas.get("gg")).toEqual({ directa: 0, total: 1, vacantes: 2 });
  });

  describe("instantaneaEn", () => {
    const vida = (creada: [number, number, number], eliminada?: [number, number, number]) => ({
      created_at: local(...creada, 9),
      deleted_at: eliminada ? local(...eliminada, 9) : null,
    });
    const t = (id: string): Trabajador => ({
      id,
      nombre: id,
      correo: null,
      telefono: null,
      tipo_contrato_id: null,
      sede_id: null,
      jornada_id: null,
      tiene_foto: 0,
      updated_at: "",
    });
    const historico = {
      unidades: [
        { ...u("gg", TIPO_OTRA, "GG", null), ...vida([2020, 1, 1]) },
        { ...u("ops", TIPO_AREA, "Ops", "gg"), ...vida([2020, 1, 1]) },
        { ...u("nueva", TIPO_AREA, "Nueva", "gg"), ...vida([2025, 1, 1]) },
        { ...u("vieja", TIPO_AREA, "Vieja", "ops"), ...vida([2021, 1, 1], [2025, 1, 1]) },
        { ...u("antes", TIPO_AREA, "Antes", "gg"), ...vida([2020, 1, 1], [2022, 1, 1]) },
        { ...u("huerfana", TIPO_AREA, "Huérfana", "antes"), ...vida([2021, 1, 1]) },
        // Cargadas «hoy» (2026) con asignaciones retroactivas: abuela solo se ve por su descendiente.
        { ...u("abuela", TIPO_AREA, "Abuela", "gg"), ...vida([2026, 1, 1]) },
        { ...u("retro", TIPO_AREA, "Retro", "abuela"), ...vida([2026, 1, 1]) },
        { ...u("solo", TIPO_AREA, "Solo", "gg"), ...vida([2026, 1, 1]) },
      ],
      puestos: [
        { ...p("pa", "ops"), ...vida([2021, 1, 1]) },
        { ...p("pb", "ops"), ...vida([2025, 1, 1]) },
        { ...p("pc", "nueva"), ...vida([2025, 1, 1]) },
        { ...p("pd", "ops"), ...vida([2021, 1, 1], [2025, 1, 1]) },
        { ...p("pr", "retro"), ...vida([2026, 1, 1]) },
        { ...p("pe", "antes"), ...vida([2026, 1, 1]) },
      ],
      asignaciones: [
        { ...asig("s1", "pa", "t1", "2021-02-01", null), ...vida([2026, 1, 1]) },
        { ...asig("s2", "pb", "t1", "2021-02-01", null), ...vida([2026, 1, 1]) },
        { ...asig("s3", "pd", "t2", "2021-02-01", null), ...vida([2026, 1, 1], [2026, 2, 1]) },
        { ...asig("s4", "pa", "t3", "2021-02-01", "2021-03-01"), ...vida([2026, 1, 1], [2022, 1, 1]) },
        { ...asig("s5", "pr", "t1", "2015-01-01", null), ...vida([2026, 1, 1]) },
        { ...asig("s6", "pe", "t1", "2015-01-01", null), ...vida([2026, 1, 1]) },
      ],
      trabajadores: [t("t2"), t("t3")],
    };
    const foto = instantaneaEn(historico, "2023-06-01");

    it("oculta lo creado después o eliminado antes, y muestra lo eliminado después", () => {
      expect(foto.unidades.map((x) => x.id)).toEqual(["gg", "ops", "vieja", "huerfana", "abuela", "retro"]);
      expect(foto.puestos.map((x) => x.id)).toEqual(["pa", "pb", "pd", "pr"]);
      expect(foto.asignaciones.map((x) => x.id)).toEqual(["s1", "s2", "s3", "s5"]);
    });

    it("carga retroactiva: un puesto creado después se ve si tiene asignación de ese día; la unidad, si tiene puesto o descendiente que se ve", () => {
      const ids = (xs: { id: string }[]) => xs.map((x) => x.id);
      expect(ids(foto.puestos)).toContain("pb"); // creado en 2025, pero con titular desde 2021
      expect(ids(foto.unidades)).toContain("retro"); // creada en 2026, su puesto tiene titular desde 2015
      expect(ids(foto.unidades)).toContain("abuela"); // creada en 2026, solo por su descendiente
      expect(ids(foto.unidades)).not.toContain("solo"); // creada en 2026 y sin nada retroactivo
      expect(ids(foto.unidades)).not.toContain("nueva"); // su único puesto es de 2025 y sin asignaciones
    });

    it("una unidad eliminada antes de la fecha sigue oculta aunque tenga asignaciones antiguas", () => {
      expect(foto.unidades.map((x) => x.id)).not.toContain("antes");
      expect(foto.puestos.map((x) => x.id)).not.toContain("pe");
    });

    it("una organización cargada hoy con asignaciones antiguas se ve entera en esa fecha", () => {
      const hoy = vida([2026, 5, 5]);
      const org = instantaneaEn(
        {
          unidades: [
            { ...u("r", TIPO_OTRA, "R", null), ...hoy },
            { ...u("h", TIPO_AREA, "H", "r"), ...hoy },
          ],
          puestos: [{ ...p("x", "h"), ...hoy }],
          asignaciones: [{ ...asig("y", "x", "t1", "2015-03-01", null), ...hoy }],
          trabajadores: [],
        },
        "2020-01-01",
      );
      expect(org.unidades.map((x) => x.id)).toEqual(["r", "h"]);
      expect(org.puestos).toHaveLength(1);
      expect(
        instantaneaEn({ ...historico, asignaciones: [] }, "2023-06-01").unidades.map((x) => x.id),
      ).toEqual(["gg", "ops", "vieja", "huerfana"]);
    });

    it("lo eliminado después reaparece como vivo; si su superior no se ve, queda como raíz", () => {
      const eliminada = (x: object) => (x as { deleted_at?: string | null }).deleted_at;
      expect(foto.unidades.some(eliminada)).toBe(false);
      expect(foto.puestos.some(eliminada)).toBe(false);
      expect(foto.unidades.find((x) => x.id === "vieja")?.parent_id).toBe("ops");
      expect(foto.unidades.find((x) => x.id === "huerfana")?.parent_id).toBeNull();
    });

    it("conserva a todas las personas (solo se usan sus nombres)", () => {
      expect(foto.trabajadores.map((x) => x.id)).toEqual(["t2", "t3"]);
    });
  });
});
