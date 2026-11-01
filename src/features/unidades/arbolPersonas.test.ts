import { describe, expect, it } from "vitest";
import type { Trabajador, Unidad, ValorCatalogo } from "@/db/tipos";
import { a, asignaciones, p, puestos, u, unidades } from "@/features/arbol/fixture";
import { dotacion, indexar, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { TIPO_AREA } from "@/db/tipos";
import {
  accionFila,
  accionTecla,
  aplanarArbol,
  arbolDePersonas,
  cambiarRaiz,
  claveUnidad,
  contraerTodo,
  estaAbierta,
  expandirTodo,
  idsDelArbol,
  plegarUnidad,
  visiblesDeBusqueda,
  type Pliegue,
} from "./arbolPersonas";
import { filtrarPersonasUnidad, personasDelAlcance, puestosDelAlcance } from "./personas";

const w = (id: string, nombre: string): Trabajador => ({
  id,
  nombre,
  correo: null,
  telefono: null,
  tipo_contrato_id: null,
  sede_id: null,
  jornada_id: null,
  foto_png: null,
  notas: null,
});
const trabajadores = [
  w("t1", "Ana Pérez"),
  w("t2", "Beto Ruiz"),
  w("t3", "Carla Muñoz"),
  w("t4", "Diego Soto"),
  w("t5", "Elena Vidal"),
  w("t7", "Gabriel Lagos"),
  w("t8", "Hugo Tapia"),
];
const cargos: ValorCatalogo[] = [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }];
const vigentes = vigentesPorPuesto(asignaciones);
const porId = indexar(unidades);

function construir(id: string, rama = true, us: Unidad[] = unidades) {
  const alcance = puestosDelAlcance(us, puestos, id, rama);
  const filas = filtrarPersonasUnidad(
    personasDelAlcance(alcance, vigentes, trabajadores, cargos, porId),
    "",
    "nombre",
  );
  const raiz = us.find((x) => x.id === id)!;
  return { arbol: arbolDePersonas(raiz, rama ? us : [], alcance, filas, vigentes, cargos), filas };
}
const todo = () => true;

describe("arbolDePersonas", () => {
  it("cuelga personas y subunidades de cada unidad; la cifra es la dotación de la tarjeta (solo titulares)", () => {
    const { arbol, filas } = construir("mantencion");
    expect(filas).toHaveLength(6); // incluye a una persona de reemplazo
    expect(arbol.total).toBe(dotacion(unidades, puestos, asignaciones, "mantencion").total);
    expect(arbol.total).toBe(5);
    expect(arbol.hijos.map((h) => h.unidad.id)).toEqual(["electrica", "mecanica"]);
    const mecanica = arbol.hijos[1];
    expect(mecanica.personas.map((f) => f.nombre)).toEqual(["Carla Muñoz", "Diego Soto", "Elena Vidal"]);
    expect(mecanica.total).toBe(2);
    expect(construir("gg").arbol.total).toBe(dotacion(unidades, puestos, asignaciones, "gg").total);
  });

  it("sin subunidades queda solo la unidad", () => {
    const { arbol } = construir("mantencion", false);
    expect(arbol.hijos).toEqual([]);
    expect(arbol.total).toBe(arbol.personas.length);
  });

  it("quien encabeza va en la unidad y no se repite debajo; cuenta igual en el total", () => {
    const con = { ...porId.get("mecanica")!, jefe_puesto_id: "p4" };
    const us = unidades.map((x) => (x.id === "mecanica" ? con : x));
    const { arbol } = construir("mecanica", false, us);
    expect(arbol.jefe?.nombre).toBe("Diego Soto");
    expect(arbol.personas.map((f) => f.nombre)).not.toContain("Diego Soto");
    expect(arbol.total).toBe(2);
  });

  it("si quien encabeza tiene otro puesto en la unidad, ese puesto sí va debajo: una fila por puesto", () => {
    const con = { ...u("x", TIPO_AREA, "X", null), jefe_puesto_id: "j1" };
    const alcance = [p("j1", "x"), p("j2", "x")];
    const vig = vigentesPorPuesto([a("b1", "j1", "t1"), a("b2", "j2", "t1")]);
    const filas = personasDelAlcance(alcance, vig, trabajadores, cargos, indexar([con]));
    const arbol = arbolDePersonas(con, [], alcance, filas, vig, cargos);
    expect(arbol.jefe?.clave).toBe("b1");
    expect(arbol.personas.map((f) => f.clave)).toEqual(["b2"]);
    expect(arbol.total).toBe(2);
  });

  it("una jefatura cuyo puesto quedó en otra unidad igual se muestra, sin sumar ni repetirse debajo", () => {
    const con = { ...u("x", TIPO_AREA, "X", null), jefe_puesto_id: "j1" };
    const jefatura = p("j1", "otra");
    const vig = vigentesPorPuesto([a("b1", "j1", "t1")]);
    const deJefatura = personasDelAlcance([jefatura], vig, trabajadores, cargos, indexar([con]));
    const arbol = arbolDePersonas(con, [], [], [], vig, cargos, deJefatura);
    expect(arbol.jefe?.nombre).toBe("Ana Pérez");
    expect(arbol.personas).toEqual([]);
    expect(arbol.total).toBe(0);
  });

  it("marca como vacante el puesto sin nadie; el cubierto por un reemplazo va con su persona", () => {
    const vacio = p("pv", "mecanica");
    const alcance = [...puestosDelAlcance(unidades, puestos, "mecanica", false), vacio];
    const filas = personasDelAlcance(alcance, vigentes, trabajadores, cargos, porId);
    const arbol = arbolDePersonas(porId.get("mecanica")!, [], alcance, filas, vigentes, cargos);
    expect(arbol.vacantes).toEqual([{ clave: "v:pv", cargo: "Analista" }]);
    expect(arbol.personas.find((f) => f.tipo === "reemplazo")?.puestoId).toBe("p6");
  });

  it("a una fecha usa los vigentes de ese día", () => {
    const delDia = vigentesPorPuesto(asignaciones, "2026-01-15");
    const alcance = puestosDelAlcance(unidades, puestos, "finanzas", false);
    const filas = personasDelAlcance(alcance, delDia, trabajadores, cargos, porId);
    const arbol = arbolDePersonas(porId.get("finanzas")!, [], alcance, filas, delDia, cargos);
    expect(arbol.personas.map((f) => f.nombre)).toEqual(["Beto Ruiz"]);
    expect(construir("finanzas", false).arbol.personas).toEqual([]);
  });

  it("no se cuelga con un ciclo en los datos", () => {
    const us = [u("x", TIPO_AREA, "X", "y"), u("y", TIPO_AREA, "Y", "x")];
    const arbol = arbolDePersonas(us[0], us, [], [], new Map(), cargos);
    expect(idsDelArbol(arbol)).toEqual(["x", "y"]);
  });
});

describe("aplanarArbol", () => {
  it("una unidad cerrada no muestra nada debajo; solo el primer nivel, al abrir la raíz", () => {
    const { arbol } = construir("mantencion");
    const filas = aplanarArbol(arbol, (id) => id === "mantencion", null);
    expect(filas[0]).toMatchObject({ clase: "unidad", nivel: 1, posicion: 1, hermanos: 1, abierta: true });
    const mecanica = filas.find((f) => f.clave === claveUnidad("mecanica"));
    expect(mecanica).toMatchObject({ nivel: 2, abierta: false });
    expect(filas.every((f) => f.nivel <= 2)).toBe(true);
  });

  it("primero las personas y después las subunidades, con posición y total entre hermanos", () => {
    const { arbol } = construir("mantencion");
    const filas = aplanarArbol(arbol, todo, null);
    const directas = filas.filter((f) => f.nivel === 2);
    expect(directas.map((f) => f.clase)).toEqual(["persona", "unidad", "unidad"]);
    expect(directas.map((f) => f.posicion)).toEqual([1, 2, 3]);
    expect(directas.every((f) => f.hermanos === 3)).toBe(true);
  });

  it("una unidad sin nada debajo no es desplegable", () => {
    const vacia = { ...u("sola", TIPO_AREA, "Sola", null) };
    const [fila] = aplanarArbol(arbolDePersonas(vacia, [], [], [], new Map(), cargos), todo, null);
    expect(fila).toMatchObject({ clase: "unidad" });
    expect("abierta" in fila && fila.abierta).toBeUndefined();
  });
});

describe("visiblesDeBusqueda", () => {
  const { arbol, filas } = construir("gg");
  const buscar = (texto: string, buscado: string) => {
    const coinciden = new Set(filtrarPersonasUnidad(filas, texto, "nombre").map((f) => f.clave));
    return aplanarArbol(arbol, todo, visiblesDeBusqueda(arbol, coinciden, buscado));
  };

  it("deja a quien coincide con sus ancestros y oculta lo demás", () => {
    const vistas = buscar("gabriel", "gabriel");
    expect(vistas.filter((f) => f.clase === "persona").map((f) => f.clave)).toEqual(["a7"]);
    expect(vistas.filter((f) => f.clase === "unidad").map((f) => f.clave)).toEqual(
      ["gg", "operaciones", "mantencion", "electrica"].map(claveUnidad),
    );
  });

  it("una unidad que coincide muestra a su gente, pero no sus subunidades", () => {
    const vistas = buscar("mantencion", "mantencion");
    expect(vistas.some((f) => f.clave === claveUnidad("mantencion"))).toBe(true);
    expect(vistas.some((f) => f.clave === claveUnidad("electrica"))).toBe(false);
    expect(vistas.filter((f) => f.clase === "persona")).toHaveLength(1);
  });

  it("sin coincidencias no queda nada, ni la raíz", () => {
    expect(buscar("zzz", "zzz")).toEqual([]);
  });
});

describe("accionTecla", () => {
  const { arbol } = construir("mantencion");
  const filas = aplanarArbol(arbol, (id) => id === "mantencion", null);
  const mecanica = filas.findIndex((f) => f.clave === claveUnidad("mecanica"));

  it("arriba y abajo recorren las filas sin salirse; Inicio y Fin van a los extremos", () => {
    expect(accionTecla(filas, 0, "ArrowDown")).toEqual({ tipo: "ir", indice: 1 });
    expect(accionTecla(filas, 0, "ArrowUp")).toEqual({ tipo: "nada" });
    expect(accionTecla(filas, filas.length - 1, "ArrowDown")).toEqual({ tipo: "nada" });
    expect(accionTecla(filas, 2, "Home")).toEqual({ tipo: "ir", indice: 0 });
    expect(accionTecla(filas, 0, "End")).toEqual({ tipo: "ir", indice: filas.length - 1 });
  });

  it("derecha abre una unidad cerrada y entra a una abierta; en una persona no hace nada", () => {
    expect(accionTecla(filas, mecanica, "ArrowRight")).toEqual({
      tipo: "plegar",
      id: "mecanica",
      abrir: true,
    });
    expect(accionTecla(filas, 0, "ArrowRight")).toEqual({ tipo: "ir", indice: 1 });
    expect(accionTecla(filas, 1, "ArrowRight")).toEqual({ tipo: "nada" });
  });

  it("izquierda cierra una unidad abierta y, si no, sube a su superior", () => {
    expect(accionTecla(filas, 0, "ArrowLeft")).toEqual({ tipo: "plegar", id: "mantencion", abrir: false });
    expect(accionTecla(filas, mecanica, "ArrowLeft")).toEqual({ tipo: "ir", indice: 0 });
    expect(accionTecla(filas, 1, "ArrowLeft")).toEqual({ tipo: "ir", indice: 0 });
  });

  it("otra tecla no es del árbol", () => {
    expect(accionTecla(filas, 0, "a")).toBeNull();
  });

  it("Enter y Espacio activan la fila; Mayús+Enter en una unidad abre a su jefatura, si tiene", () => {
    const con = { ...u("x", TIPO_AREA, "X", null), jefe_puesto_id: "j1" };
    const alcance = [p("j1", "x"), p("j2", "x"), p("j3", "x")];
    const vig = vigentesPorPuesto([a("b1", "j1", "t1"), a("b2", "j2", "t2")]);
    const propias = personasDelAlcance(alcance, vig, trabajadores, cargos, indexar([con]));
    const arbolX = arbolDePersonas(con, [], alcance, propias, vig, cargos);
    const [unidad, persona, vacante] = aplanarArbol(arbolX, todo, null);
    const lista = [unidad, persona, vacante];
    expect(persona.clase).toBe("persona");
    expect(vacante.clase).toBe("vacante");

    expect(accionTecla(lista, 0, "Enter")).toEqual({ tipo: "unidad", id: "x" });
    expect(accionTecla(lista, 0, " ")).toEqual({ tipo: "unidad", id: "x" });
    expect(accionTecla(lista, 0, "Enter", true)).toMatchObject({ tipo: "persona", fila: { clave: "b1" } });
    expect(accionTecla(lista, 1, "Enter")).toMatchObject({ tipo: "persona", fila: { clave: "b2" } });
    expect(accionTecla(lista, 2, "Enter")).toEqual({ tipo: "nada" });
    // Sin jefatura, Mayús no cambia nada.
    expect(accionTecla(filas, mecanica, "Enter", true)).toEqual({ tipo: "unidad", id: "mecanica" });
    expect(accionFila(unidad)).toEqual({ tipo: "unidad", id: "x" });
  });
});

describe("pliegue", () => {
  const { arbol } = construir("mantencion");
  const inicial: Pliegue = { abiertas: new Set(["mantencion"]), cerradas: new Set() };

  it("sin búsqueda, abre y cierra en `abiertas`", () => {
    const abierto = plegarUnidad(inicial, false, "mecanica", true);
    expect(estaAbierta(abierto, false, "mecanica")).toBe(true);
    expect(estaAbierta(inicial, false, "mecanica")).toBe(false); // no muta
    expect(estaAbierta(plegarUnidad(abierto, false, "mecanica", false), false, "mecanica")).toBe(false);
  });

  it("con búsqueda todo parte abierto y lo plegado va en `cerradas`, sin tocar lo de antes", () => {
    expect(estaAbierta(inicial, true, "mecanica")).toBe(true);
    const plegado = plegarUnidad(inicial, true, "mecanica", false);
    expect(estaAbierta(plegado, true, "mecanica")).toBe(false);
    expect(plegado.abiertas).toEqual(inicial.abiertas);
    expect(estaAbierta(plegarUnidad(plegado, true, "mecanica", true), true, "mecanica")).toBe(true);
  });

  it("expandir abre todo en cada modo", () => {
    const todas = expandirTodo(inicial, false, arbol);
    expect([...todas.abiertas].sort()).toEqual(["electrica", "mantencion", "mecanica"]);
    const buscando = expandirTodo({ ...inicial, cerradas: new Set(["mecanica"]) }, true, arbol);
    expect(buscando.cerradas.size).toBe(0);
  });

  it("contraer deja solo la raíz abierta en cada modo", () => {
    const abierto = expandirTodo(inicial, false, arbol);
    expect([...contraerTodo(abierto, false, arbol).abiertas]).toEqual(["mantencion"]);
    const buscando = contraerTodo(inicial, true, arbol);
    expect(estaAbierta(buscando, true, "mantencion")).toBe(true);
    expect(estaAbierta(buscando, true, "mecanica")).toBe(false);
  });

  it("al cambiar de raíz conserva lo abierto y abre la nueva, para volver atrás igual", () => {
    const abierto = plegarUnidad(inicial, false, "mecanica", true);
    const bajando = cambiarRaiz({ ...abierto, cerradas: new Set(["x"]) }, "electrica");
    expect([...bajando.abiertas].sort()).toEqual(["electrica", "mantencion", "mecanica"]);
    expect(bajando.cerradas.size).toBe(0);
    expect(estaAbierta(cambiarRaiz(bajando, "mantencion"), false, "mecanica")).toBe(true);
  });
});

describe("rendimiento", () => {
  it("2.000 unidades y 10.000 personas: armar, aplanar todo y buscar sin demora", () => {
    const us = [
      u("r", TIPO_AREA, "Raíz", null),
      ...Array.from({ length: 1999 }, (_, i) =>
        u(`u${i}`, TIPO_AREA, `Unidad ${i}`, i < 40 ? "r" : `u${i % 40}`),
      ),
    ];
    const muchos = Array.from({ length: 10_000 }, (_, i) =>
      p(`q${i}`, i % 2000 === 1999 ? "r" : `u${i % 2000}`),
    );
    const vig = vigentesPorPuesto(muchos.map((x, i) => a(`b${i}`, x.id, `w${i}`)));
    const gente = muchos.map((_, i) => w(`w${i}`, `Persona ${i}`));
    const mapa = indexar(us);
    const filas = filtrarPersonasUnidad(personasDelAlcance(muchos, vig, gente, cargos, mapa), "", "nombre");

    const inicio = performance.now();
    const arbol = arbolDePersonas(us[0], us, muchos, filas, vig, cargos);
    const todas = aplanarArbol(arbol, todo, null);
    const coinciden = new Set(filtrarPersonasUnidad(filas, "persona 99", "nombre").map((f) => f.clave));
    const vistas = aplanarArbol(arbol, todo, visiblesDeBusqueda(arbol, coinciden, "persona 99"));
    expect(performance.now() - inicio).toBeLessThan(500);

    expect(arbol.total).toBe(10_000);
    expect(todas).toHaveLength(12_000);
    expect(vistas.filter((f) => f.clase === "persona").length).toBe(coinciden.size);
  });
});
