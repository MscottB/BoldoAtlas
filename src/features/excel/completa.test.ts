import { describe, expect, it } from "vitest";
import { TIPO_AREA, TIPO_GERENCIA, TIPO_OTRA, type Trabajador, type ValorCatalogo } from "@/db/tipos";
import { a, p, tipos, u } from "@/features/arbol/fixture";
import { dotacionPorUnidad, instantaneaEn, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { armarCompleta as armar, type DatosCompleta } from "./completa";
import type { Hoja } from "./libro";
import { leerSeleccion, type Seleccion } from "./seleccion";

const armarCompleta = (...args: Parameters<typeof armar>) => [...armar(...args)];

// Los títulos son la última parte de la clave: «nombre», «unidades»…
const t = (clave: string) => clave.split(".").pop()!;

const w = (
  id: string,
  nombre: string,
  extra: Partial<Trabajador & { deleted_at: string; created_at: string }> = {},
) => ({
  id,
  nombre,
  correo: `${id}@x.cl`,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  tiene_foto: 0,
  updated_at: "2026-01-01T00:00:00.000Z",
  ...extra,
});
const v = (id: string, nombre: string, deleted_at: string | null = null): ValorCatalogo => ({
  id,
  nombre,
  orden: 0,
  deleted_at,
});
const conCargo = (id: string, unidad: string, cargo: string) => ({ ...p(id, unidad), cargo_id: cargo });
const desde = (x: ReturnType<typeof a>, d: string) => ({ ...x, desde: d });

// Gerencia General › {Operaciones › Mantención (+ una borrada), Finanzas}. Mantención no tiene jefatura.
const datos = (): DatosCompleta => ({
  unidades: [
    { ...u("gg", TIPO_OTRA, "Gerencia General", null), jefe_puesto_id: "pgg" },
    { ...u("ops", TIPO_GERENCIA, "Operaciones", "gg", 0), jefe_puesto_id: "pops" },
    u("fin", TIPO_GERENCIA, "Finanzas", "gg", 1),
    { ...u("mant", TIPO_AREA, "Mantención", "ops"), descripcion: "Taller" },
    { ...u("borrada", TIPO_AREA, "Borrada", "ops"), deleted_at: "2026-01-01T00:00:00.000Z" },
  ],
  puestos: [
    conCargo("pgg", "gg", "gerente"),
    conCargo("pops", "ops", "jefe"),
    { ...conCargo("pm1", "mant", "tecnico"), orden: 0 },
    { ...conCargo("pm2", "mant", "tecnico"), orden: 1, leyenda_id: "l1" },
    conCargo("pfin", "fin", "analista"),
  ],
  asignaciones: [
    desde(a("a1", "pgg", "w1"), "2020-01-01"),
    desde(a("a2", "pops", "w2"), "2020-01-01"),
    desde(a("a4", "pfin", "w4"), "2020-01-01"),
    desde(a("a6", "pm2", "w7", "titular", "2025-12-01"), "2020-01-01"),
    desde(a("a3", "pm1", "w3"), "2025-06-01"),
    desde(a("a5", "pm2", "w6", "reemplazo"), "2026-01-01"),
  ],
  trabajadores: [
    w("w1", "Ana", { sede_id: "norte" }),
    w("w2", "Beto"),
    w("w3", "Carla"),
    w("w4", "Dani"),
    w("w5", "Eva"),
    w("w6", "Fede"),
    w("w7", "Gabi", { created_at: "2025-06-01T12:00:00.000Z" }), // cargada después, con historial
    w("w8", "Hugo", { deleted_at: "2025-01-15T12:00:00.000Z" }),
    w("w9", "Inés", { created_at: "2025-05-01T12:00:00.000Z" }),
  ],
  catalogos: {
    cargos: [
      v("gerente", "Gerente"),
      v("jefe", "Jefe"),
      v("tecnico", "Técnico"),
      v("analista", "Analista"),
      v("viejo", "Viejo", "2025-01-01"),
    ],
    tipos_unidad: tipos,
    sedes: [v("norte", "Norte")],
    tipos_contrato: [],
    jornadas: [],
  },
  leyendas: [{ id: "l1", nombre: "Clave", color: "#ff0000", descripcion: null, orden: 0, deleted_at: null }],
  etiquetas: [{ id: "e1", nombre: "Crítica", color: "#000000" }],
  unidadEtiquetas: [{ unidad_id: "mant", etiqueta_id: "e1" }],
  zonas: [
    { id: "z1", nombre: "Planta", color: "#00ff00" },
    { id: "z2", nombre: "Vacía", color: "#0000ff" },
  ],
  zonaUnidades: [
    { zona_id: "z1", unidad_id: "mant" },
    { zona_id: "z1", unidad_id: "fin" },
  ],
  conexiones: [
    { id: "c1", origen_id: "mant", destino_id: "fin", etiqueta: "apoya" },
    { id: "c2", origen_id: "gg", destino_id: "fin", etiqueta: null },
  ],
  fechaVista: null,
  hoy: new Date(2026, 0, 11, 9),
});

const todas = leerSeleccion(null);
const hoja = (hojas: Hoja[], nombre: string) => hojas.find((h) => h.nombre === nombre);
/** Cada fila como objeto: título → celda. */
const filas = (hojas: Hoja[], nombre: string) => {
  const h = hoja(hojas, nombre)!;
  return h.filas.map((f) => Object.fromEntries(h.columnas.map((c, i) => [c, f[i]])));
};
const col = (hojas: Hoja[], nombre: string, c: string) => filas(hojas, nombre).map((f) => f[c]);

describe("leerSeleccion", () => {
  it("de fábrica: todas las hojas y columnas, salvo el id y las notas", () => {
    expect(todas.unidades.incluida).toBe(true);
    expect(todas.unidades.columnas).toMatchObject({ id: false, nombre: true, vacantes: true });
    expect(todas.trabajadores.columnas).toMatchObject({ notas: false, jefes: true });
  });

  it("conserva lo elegido y descarta lo que no es un sí o un no", () => {
    const s = leerSeleccion({
      puestos: { incluida: false, columnas: { cargo: false, id: true, raro: true } },
      zonas: { incluida: "no", columnas: [] },
    });
    expect(s.puestos.incluida).toBe(false);
    expect(s.puestos.columnas).toMatchObject({ cargo: false, id: true, unidad: true });
    expect(s.puestos.columnas).not.toHaveProperty("raro");
    expect(s.zonas.incluida).toBe(true);
  });
});

describe("exportación completa", () => {
  it("toda la organización: las hojas en su orden, sin lo eliminado y en el orden del árbol", () => {
    const hojas = armarCompleta(datos(), null, todas, t);
    expect(hojas.map((h) => h.nombre)).toEqual([
      "unidades",
      "puestos",
      "asignaciones",
      "conexiones",
      "trabajadores",
      "mantenedores",
      "zonas",
    ]);
    expect(col(hojas, "unidades", "nombre")).toEqual([
      "Gerencia General",
      "Operaciones",
      "Mantención",
      "Finanzas",
    ]);
    expect(col(hojas, "trabajadores", "nombre")).toEqual([
      "Ana",
      "Beto",
      "Carla",
      "Dani",
      "Eva",
      "Fede",
      "Gabi",
      "Inés",
    ]);
    // también los desactivados, que puestos y personas conservan, dicho en «Activo»; en el orden del mantenedor (aquí
    // todos con el mismo, por nombre)
    expect(
      filas(hojas, "mantenedores")
        .filter((f) => f.catalogo === "cargos")
        .map((f) => [f.nombre, f.activo]),
    ).toEqual([
      ["Analista", "si"],
      ["Gerente", "si"],
      ["Jefe", "si"],
      ["Técnico", "si"],
      ["Viejo", "no"],
    ]);
    expect(filas(hojas, "mantenedores").find((f) => f.catalogo === "etiquetas")).toMatchObject({
      activo: "si",
    });
  });

  it("Unidades: superior, ruta completa, jefe, etiquetas y la dotación que calcula la app", () => {
    const d = datos();
    const hojas = armarCompleta(d, null, todas, t);
    const [gg, ops, mant] = filas(hojas, "unidades");
    expect(mant).toMatchObject({
      tipo: "Área",
      descripcion: "Taller",
      superior: "Operaciones",
      ruta: "Gerencia General › Operaciones › Mantención",
      jefe: null,
      etiquetas: "Crítica",
    });
    expect(ops).toMatchObject({ jefe: "Beto", correoJefe: "w2@x.cl", superior: "Gerencia General" });
    expect(gg!.superior).toBeNull();
    const dot = dotacionPorUnidad(d.unidades, d.puestos, d.asignaciones);
    for (const [fila, id] of [
      [gg, "gg"],
      [ops, "ops"],
      [mant, "mant"],
    ] as const)
      expect([fila!.dotacionDirecta, fila!.dotacionTotal, fila!.vacantes]).toEqual([
        dot.get(id)!.directa,
        dot.get(id)!.total,
        dot.get(id)!.vacantes,
      ]);
  });

  it("Puestos: titular, reemplazo, vacante y días sin titular", () => {
    const pm2 = filas(armarCompleta(datos(), null, todas, t), "puestos").find((f) => f.titular === null)!;
    expect(pm2).toMatchObject({
      unidad: "Mantención",
      cargo: "Técnico",
      leyenda: "Clave",
      reemplazo: "Fede",
      vacante: "si",
      diasVacante: 41, // del 2025-12-01 al 2026-01-11
    });
  });

  it("Trabajadores: puestos vigentes separados por « · », su jefe hacia arriba y sus datos de catálogo", () => {
    const hojas = armarCompleta(datos(), null, todas, t);
    const por = Object.fromEntries(filas(hojas, "trabajadores").map((f) => [f.nombre, f]));
    expect(por.Carla).toMatchObject({
      cargos: "Técnico",
      unidades: "Mantención",
      rutas: "Gerencia General › Operaciones › Mantención",
      jefes: "Beto", // Mantención no tiene jefatura: el de Operaciones
    });
    expect(por.Beto!.jefes).toBe("Ana"); // él encabeza Operaciones: su jefe es el de arriba
    expect(por.Ana).toMatchObject({ sede: "Norte", jefes: null });
    expect(por.Eva).toMatchObject({ cargos: null, unidades: null });
  });

  it("una rama: solo sus unidades, puestos, personas, conexiones y zonas", () => {
    const hojas = armarCompleta(datos(), "ops", todas, t);
    expect(col(hojas, "unidades", "nombre")).toEqual(["Operaciones", "Mantención"]);
    expect(col(hojas, "unidades", "ruta")).toEqual([
      "Gerencia General › Operaciones",
      "Gerencia General › Operaciones › Mantención",
    ]);
    expect(col(hojas, "puestos", "cargo")).toEqual(["Jefe", "Técnico", "Técnico"]);
    expect(col(hojas, "asignaciones", "persona")).toEqual(["Beto", "Gabi", "Carla", "Fede"]);
    expect(col(hojas, "trabajadores", "nombre")).toEqual(["Beto", "Carla", "Fede"]);
    expect(col(hojas, "conexiones", "origen")).toEqual(["Mantención"]); // gg → fin queda fuera
    expect(filas(hojas, "zonas")).toEqual([
      {
        zona: "Planta",
        color: "#00ff00",
        unidad: "Mantención",
        ruta: "Gerencia General › Operaciones › Mantención",
      },
    ]);
    const usos = Object.fromEntries(
      filas(hojas, "mantenedores").map((f) => [`${f.catalogo}:${f.nombre}`, f.usos]),
    );
    expect(usos).toMatchObject({ "cargos:Técnico": 2, "cargos:Analista": 0, "etiquetas:Crítica": 1 });
  });

  it("toda la organización: las zonas sin unidades salen igual, una fila por unidad", () => {
    expect(filas(armarCompleta(datos(), null, todas, t), "zonas").map((f) => [f.zona, f.unidad])).toEqual([
      ["Planta", "Mantención"],
      ["Planta", "Finanzas"],
      ["Vacía", null],
    ]);
  });

  it("a una fecha: lo vigente ese día, sin lo que empezó después ni lo eliminado antes", () => {
    const hojas = armarCompleta({ ...datos(), fechaVista: "2025-03-01" }, null, todas, t);
    const puestos = filas(hojas, "puestos");
    expect(puestos.find((f) => f.titular === "Gabi")).toMatchObject({ vacante: "no", reemplazo: null });
    expect(puestos.filter((f) => f.vacante === "si").map((f) => f.titular)).toEqual([null]); // pm1: Carla llega en junio
    const asig = filas(hojas, "asignaciones");
    expect(asig.map((f) => f.persona)).toEqual(["Ana", "Beto", "Dani", "Gabi"]);
    expect(asig.find((f) => f.persona === "Gabi")!.hasta).toBeNull(); // terminó después: ese día seguía
    expect(col(hojas, "trabajadores", "nombre")).not.toContain("Hugo"); // eliminado antes
    expect(col(hojas, "trabajadores", "nombre")).not.toContain("Inés"); // creada después
    expect(col(hojas, "trabajadores", "nombre")).toContain("Gabi"); // creada después, pero con un puesto ese día
  });

  it("a una fecha: quien se eliminó después sigue en su puesto en todas las hojas, como en el lienzo", () => {
    // Dani y su asignación se eliminaron en agosto (eliminarTrabajador marca también sus asignaciones).
    const d = datos();
    const baja = "2025-08-01T12:00:00.000Z";
    const h = {
      unidades: d.unidades,
      puestos: d.puestos,
      asignaciones: d.asignaciones.map((x) => (x.id === "a4" ? { ...x, deleted_at: baja } : x)),
      trabajadores: d.trabajadores.map((w) => (w.id === "w4" ? { ...w, deleted_at: baja } : w)),
    };
    const fecha = "2025-03-01";
    const foto = instantaneaEn(h, fecha); // lo que da `enFecha` al store
    const hojas = armarCompleta({ ...d, ...foto, fechaVista: fecha }, null, todas, t);

    expect(filas(hojas, "puestos").find((f) => f.cargo === "Analista")).toMatchObject({
      titular: "Dani",
      vacante: "no",
      diasVacante: null,
    });
    const fin = filas(hojas, "unidades").find((f) => f.nombre === "Finanzas")!;
    const delStore = dotacionPorUnidad(foto.unidades, foto.puestos, foto.asignaciones, fecha).get("fin")!;
    expect([fin.dotacionDirecta, fin.dotacionTotal, fin.vacantes]).toEqual([1, 1, 0]);
    expect([delStore.directa, delStore.total, delStore.vacantes]).toEqual([1, 1, 0]);
    expect(vigentesPorPuesto(foto.asignaciones, fecha).get("pfin")?.titular?.trabajador_id).toBe("w4");
    expect(filas(hojas, "trabajadores").find((f) => f.nombre === "Dani")).toMatchObject({
      cargos: "Analista",
    });
    expect(filas(hojas, "asignaciones").find((f) => f.persona === "Dani")).toMatchObject({ hasta: null });
  });

  it("las fechas van como fechas", () => {
    const gabi = filas(armarCompleta(datos(), null, todas, t), "asignaciones").find(
      (f) => f.persona === "Gabi",
    )!;
    expect(gabi.desde).toEqual(new Date("2020-01-01T00:00:00Z"));
    expect(gabi.hasta).toEqual(new Date("2025-12-01T00:00:00Z"));
    expect(gabi.tipo).toBe("titular");
  });

  it("solo las hojas y columnas marcadas, en su orden; el id, si se marca, va primero", () => {
    const s: Seleccion = leerSeleccion({
      unidades: {
        columnas: Object.fromEntries(
          Object.keys(todas.unidades.columnas).map((c) => [c, ["vacantes", "nombre", "id"].includes(c)]),
        ),
      },
      puestos: { incluida: false },
      asignaciones: { incluida: false },
      conexiones: { incluida: false },
      trabajadores: { incluida: false },
      mantenedores: { incluida: false },
      zonas: { incluida: false },
    });
    const hojas = armarCompleta(datos(), "ops", s, t);
    expect(hojas).toHaveLength(1);
    expect(hojas[0]!.columnas).toEqual(["id", "nombre", "vacantes"]);
    expect(hojas[0]!.filas).toEqual([
      ["ops", "Operaciones", 1],
      ["mant", "Mantención", 1],
    ]);
  });

  it("una hoja sin ninguna columna marcada no sale", () => {
    const s = leerSeleccion({ conexiones: { columnas: { origen: false, destino: false, etiqueta: false } } });
    expect(armarCompleta(datos(), null, s, t).map((h) => h.nombre)).not.toContain("conexiones");
  });

  it("las notas salen solo si se marcan", () => {
    const d = { ...datos(), notas: new Map([["w3", "Turno noche"]]) };
    expect(hoja(armarCompleta(d, null, todas, t), "trabajadores")!.columnas).not.toContain("notas");
    const s = leerSeleccion({ trabajadores: { columnas: { notas: true } } });
    const carla = filas(armarCompleta(d, null, s, t), "trabajadores").find((f) => f.nombre === "Carla")!;
    expect(carla.notas).toBe("Turno noche");
  });

  it("una rama que ese día no existía: hojas vacías", () => {
    const hojas = armarCompleta(datos(), "no-existe", todas, t);
    expect(hoja(hojas, "unidades")!.filas).toEqual([]);
    expect(hoja(hojas, "trabajadores")!.filas).toEqual([]);
  });
});
