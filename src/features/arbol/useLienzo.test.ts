import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { Trabajador } from "@/db/tipos";
import { a, p, unidades } from "./fixture";
import { vigentesPorPuesto } from "./jerarquia";
import { coincideFiltro, destinoAlSoltar, unidadesQueCumplen, useLienzo } from "./useLienzo";
import { VISTA_POR_DEFECTO } from "./vista";

const mantencion = unidades.find((x) => x.id === "mantencion")!;

describe("lógica del lienzo", () => {
  it("coincideFiltro: sin filtros todo coincide", () => {
    expect(coincideFiltro(mantencion, "", null)).toBe(true);
    expect(coincideFiltro(mantencion, "   ", null)).toBe(true);
  });

  it("coincideFiltro por texto ignora tildes y mayúsculas", () => {
    expect(coincideFiltro(mantencion, "MANTENCION", null)).toBe(true);
    expect(coincideFiltro(mantencion, "tenci", null)).toBe(true);
    expect(coincideFiltro(mantencion, "finanzas", null)).toBe(false);
  });

  it("coincideFiltro por etiqueta y, con ambos, exige los dos", () => {
    expect(coincideFiltro(mantencion, "", new Set(["mantencion"]))).toBe(true);
    expect(coincideFiltro(mantencion, "", new Set(["finanzas"]))).toBe(false);
    expect(coincideFiltro(mantencion, "mante", new Set(["mantencion"]))).toBe(true);
    expect(coincideFiltro(mantencion, "otra", new Set(["mantencion"]))).toBe(false);
  });

  it("destinoAlSoltar da la tarjeta bajo el centro de la arrastrada, nunca ella misma", () => {
    const pos = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 300, y: 0 }],
    ]);
    const tam = { ancho: 220, alto: 112 };
    expect(destinoAlSoltar("a", { x: 310, y: 10 }, pos, tam)).toBe("b"); // centro en (420, 66)
    expect(destinoAlSoltar("a", { x: 0, y: 0 }, pos, tam)).toBeNull(); // sobre sí misma
    expect(destinoAlSoltar("a", { x: 0, y: 500 }, pos, tam)).toBeNull(); // en el vacío
  });

  it("coincideFiltro con unidades que cumplen los criterios de puestos: exige también el texto y la etiqueta", () => {
    const cumplen = new Set(["mantencion"]);
    expect(coincideFiltro(mantencion, "", null, cumplen)).toBe(true);
    expect(coincideFiltro(mantencion, "", null, new Set(["finanzas"]))).toBe(false);
    expect(coincideFiltro(mantencion, "otra", null, cumplen)).toBe(false);
    expect(coincideFiltro(mantencion, "", new Set(["finanzas"]), cumplen)).toBe(false);
    expect(coincideFiltro(mantencion, "mante", new Set(["mantencion"]), cumplen)).toBe(true);
    expect(coincideFiltro(mantencion, "", null, null)).toBe(true);
  });
});

describe("unidadesQueCumplen (resaltar por vacantes, sede, contrato, jornada, cargo)", () => {
  const persona = (id: string, sede: string | null, contrato: string | null, jornada: string | null) =>
    ({ id, sede_id: sede, tipo_contrato_id: contrato, jornada_id: jornada }) as Trabajador;
  const trabajadores = [
    persona("ana", "s1", "k1", "j1"),
    persona("beto", "s2", "k1", "j2"),
    persona("cata", null, null, null),
  ];
  // m1: titular Ana (cargo X). m2: vacante (cargo Y). f1: titular Beto + reemplazo Cata (cargo Y). f2: sin puestos.
  const puestos = [
    { ...p("p1", "mecanica"), cargo_id: "X" },
    { ...p("p2", "mecanica"), cargo_id: "Y" },
    { ...p("p3", "finanzas"), cargo_id: "Y" },
    { ...p("p4", "gg"), cargo_id: "X", deleted_at: "2026-01-01" },
  ];
  const vigentes = vigentesPorPuesto([
    a("a1", "p1", "ana"),
    a("a2", "p3", "beto"),
    a("a3", "p3", "cata", "reemplazo"),
    a("a4", "p4", "ana"),
  ]);
  const r = (c: Partial<typeof VISTA_POR_DEFECTO.resaltar>) =>
    unidadesQueCumplen({ ...VISTA_POR_DEFECTO.resaltar, ...c }, puestos, vigentes, trabajadores);

  it("sin criterios devuelve null (todo coincide)", () => expect(r({})).toBeNull());

  it("vacantes: unidades con algún puesto sin titular vigente; un reemplazo no cubre la vacante", () => {
    expect(r({ vacantes: true })).toEqual(new Set(["mecanica"]));
    const solo = unidadesQueCumplen(
      { ...VISTA_POR_DEFECTO.resaltar, vacantes: true },
      puestos,
      vigentesPorPuesto([a("a5", "p3", "cata", "reemplazo")]),
      trabajadores,
    );
    expect(solo).toEqual(new Set(["mecanica", "finanzas"]));
  });

  it("sede, contrato y jornada: la unidad tiene un titular vigente con ese valor (el reemplazo no cuenta)", () => {
    expect(r({ sede: "s1" })).toEqual(new Set(["mecanica"]));
    expect(r({ sede: "s2" })).toEqual(new Set(["finanzas"]));
    expect(r({ contrato: "k1" })).toEqual(new Set(["mecanica", "finanzas"]));
    expect(r({ jornada: "j2" })).toEqual(new Set(["finanzas"]));
    expect(r({ sede: "s9" })).toEqual(new Set());
  });

  it("cargo: la unidad tiene un puesto vivo con ese cargo, esté o no ocupado", () => {
    expect(r({ cargo: "Y" })).toEqual(new Set(["mecanica", "finanzas"]));
    expect(r({ cargo: "X" })).toEqual(new Set(["mecanica"])); // el puesto eliminado no cuenta
  });

  it("con varios criterios deben cumplirse todos", () => {
    expect(r({ vacantes: true, sede: "s1" })).toEqual(new Set(["mecanica"]));
    expect(r({ vacantes: true, sede: "s2" })).toEqual(new Set());
    expect(r({ contrato: "k1", cargo: "Y" })).toEqual(new Set(["mecanica", "finanzas"]));
  });
});

describe("selección múltiple", () => {
  const nuevo = () => {
    setActivePinia(createPinia());
    const l = useLienzo();
    l.seleccion.value = null; // el estado del lienzo es compartido: se parte de cero
    l.colapsados.value = new Set();
    return l;
  };

  it("Mayús+clic suma a la unidad ya seleccionada; la última tocada queda como foco", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    expect([...l.seleccionadas.value]).toEqual(["a", "b"]);
    expect(l.seleccion.value).toBe("b");
    l.sumarASeleccion("c", false);
    expect(l.seleccionadas.value.size).toBe(3);
  });

  it("Ctrl+clic quita; al quedar una sola vuelve a ser la selección simple (con panel)", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", true);
    l.sumarASeleccion("b", true);
    expect([...l.seleccionadas.value]).toEqual(["a"]);
    expect(l.seleccion.value).toBe("a");
    l.sumarASeleccion("a", true);
    expect(l.seleccion.value).toBeNull();
    expect(l.seleccionadas.value.size).toBe(0);
  });

  it("sin selección previa, el primer Ctrl+clic selecciona una sola", () => {
    const l = nuevo();
    l.sumarASeleccion("a", true);
    expect([...l.seleccionadas.value]).toEqual(["a"]);
  });

  it("Esc o un clic en el fondo (seleccion = null) la deshacen por completo", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    l.seleccion.value = null;
    expect(l.seleccionadas.value.size).toBe(0);
  });

  it("elegir una unidad suelta (o revelarla, como hacen las flechas) la deja como única", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    l.seleccionar("z");
    expect([...l.seleccionadas.value]).toEqual(["z"]);

    l.sumarASeleccion("y", false);
    l.revelar("y"); // ya estaba en el conjunto, pero una flecha sola no extiende
    expect([...l.seleccionadas.value]).toEqual(["y"]);
  });

  it("sumarVarias (el recuadro) agrega a lo ya seleccionado y no hace nada con una lista vacía", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarVarias([]);
    expect([...l.seleccionadas.value]).toEqual(["a"]);
    l.sumarVarias(["b", "c"]);
    expect([...l.seleccionadas.value]).toEqual(["a", "b", "c"]);
    expect(l.seleccion.value).toBe("c");
  });

  it("podarSeleccion quita lo que ya no se dibuja y vuelve a selección simple si queda una", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    l.sumarASeleccion("c", false);
    l.podarSeleccion(new Set(["a", "b", "x"]));
    expect([...l.seleccionadas.value]).toEqual(["a", "b"]);
    expect(l.seleccion.value).toBe("b"); // el foco seguía visible
    l.podarSeleccion(new Set(["a"]));
    expect([...l.seleccionadas.value]).toEqual(["a"]);
    expect(l.seleccion.value).toBe("a");
  });

  it("plegarSeleccion pliega todas las seleccionadas y conserva las ya plegadas", () => {
    const l = nuevo();
    l.colapsados.value = new Set(["z"]);
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    l.plegarSeleccion();
    expect([...l.colapsados.value].sort()).toEqual(["a", "b", "z"]);
  });
});
