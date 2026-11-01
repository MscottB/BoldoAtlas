import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { TIPO_GERENCIA, type Trabajador } from "@/db/tipos";
import { a, asignaciones, p, puestos, u, unidades } from "./fixture";
import { vigentesPorPuesto } from "./jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import {
  coincideFiltro,
  destinoAlSoltar,
  estadoMover,
  puestoUbicado,
  unidadesQueCumplen,
  useLienzo,
} from "./useLienzo";
import { useVista } from "./useVista";
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

  it("estadoMover: lo que la vista previa anuncia es lo que pasará al soltar", () => {
    expect(estadoMover(unidades, mantencion, "finanzas")).toBe("valido");
    expect(estadoMover(unidades, mantencion, mantencion.parent_id!)).toBe("igual");
    expect(estadoMover(unidades, mantencion, "mecanica")).toBe("ciclo"); // su propia rama
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

  it("coincideFiltro por texto también acepta las unidades de una persona que coincide (unidadesConPersona)", () => {
    const conPersona = new Set(["mantencion"]);
    expect(coincideFiltro(mantencion, "beatriz", null, null, conPersona)).toBe(true);
    expect(coincideFiltro(mantencion, "beatriz", null, null, new Set())).toBe(false);
    expect(coincideFiltro(mantencion, "mante", null, null, new Set())).toBe(true); // el nombre de la unidad sigue
    expect(coincideFiltro(mantencion, "beatriz", new Set(["finanzas"]), null, conPersona)).toBe(false); // y la etiqueta manda
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

describe("expandir y contraer devuelven cuántas unidades quedan a la vista", () => {
  it("expandirTodo, contraerHasta, contraerRama y expandirRama", () => {
    setActivePinia(createPinia());
    const l = useLienzo();
    l.colapsados.value = new Set();
    // fixture: 6 unidades vivas (GG › Operaciones › Mantención › Mecánica/Eléctrica; GG › Finanzas)
    expect(l.contraerHasta(unidades, 1)).toBe(1);
    expect(l.contraerHasta(unidades, 2)).toBe(3);
    expect(l.expandirTodo(unidades)).toBe(6);
    expect(l.contraerRama(unidades, "operaciones")).toBe(3);
    expect(l.expandirRama(unidades, "operaciones")).toBe(6);
    expect(l.colapsados.value).toEqual(new Set());
  });

  it("si la expansión deja más de LIMITE_TARJETAS, no se aplica: queda un aviso con la cifra y el nivel que cabe", () => {
    setActivePinia(createPinia());
    const l = useLienzo();
    // GG › A › 1.100 hojas: con A plegada se ven 2; abierta, 1.102.
    const grande = [u("gg", TIPO_GERENCIA, "GG", null), u("a", TIPO_GERENCIA, "A", "gg")];
    for (let i = 0; i < 1100; i++) grande.push(u(`h${i}`, TIPO_GERENCIA, `H${i}`, "a", i));
    l.colapsados.value = new Set(["a"]);
    expect(l.expandirTodo(grande)).toBe(1102);
    expect(l.colapsados.value).toEqual(new Set(["a"])); // sin cambios hasta que se elija
    // «Hasta el nivel 2» dejaría todo como está: no se ofrece.
    expect(l.avisoExpansion.value).toEqual({ tarjetas: 1102, nivel: 2, todo: new Set(), hasta: null });
    l.avisoExpansion.value = null;
    // Aplicar una vista avisa igual; cancelar deshace lo que la vista ya cambió (su configuración).
    let revertida = 0;
    expect(l.aplicarPlegado(grande, new Set(), () => revertida++)).toBe(1102);
    expect(l.avisoExpansion.value).toMatchObject({ tarjetas: 1102 });
    l.cancelarExpansion();
    expect(revertida).toBe(1);
    expect(l.avisoExpansion.value).toBeNull();
    expect(l.colapsados.value).toEqual(new Set(["a"]));
    l.cancelarExpansion(); // sin aviso pendiente no hace nada
    expect(revertida).toBe(1);
    l.colapsados.value = new Set();
    expect(l.contraerHasta(grande, 1)).toBe(1); // contraer nunca avisa
    expect(l.avisoExpansion.value).toBeNull();
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

  it("en la vista a una fecha: extender no hace nada y limpiarMultiple deshace la selección múltiple", () => {
    const l = nuevo();
    l.seleccionar("a");
    l.sumarASeleccion("b", false);
    const org = useOrganizacion();
    org.fechaVista = "2026-01-01";
    l.extender("c");
    expect([...l.seleccionadas.value]).toEqual(["a", "b"]);
    l.limpiarMultiple();
    expect(l.seleccionadas.value.size).toBe(0);
    l.seleccionar("a");
    l.extender("c"); // tampoco desde una sola
    expect([...l.seleccionadas.value]).toEqual(["a"]);
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

describe("ver personas", () => {
  it("verPersonas pide la pestaña Personas con la rama (dotación, menú) o solo la unidad (caras de la tarjeta)", () => {
    setActivePinia(createPinia());
    const l = useLienzo();
    l.verPersonas("mantencion");
    expect([l.pestanaPanel.value, l.seleccion.value, l.ramaPersonas.value]).toEqual(["personas", "mantencion", true]);
    l.verPersonas("mecanica", false);
    expect([l.pestanaPanel.value, l.seleccion.value, l.ramaPersonas.value]).toEqual(["personas", "mecanica", false]);
  });
});

describe("ver a una persona en el organigrama", () => {
  const nuevo = (verPuestos: boolean) => {
    setActivePinia(createPinia());
    const org = useOrganizacion();
    org.$patch({
      unidades: unidades.filter((x) => !x.deleted_at),
      puestos,
      asignaciones,
      trabajadores: [{ id: "t4", nombre: "Beatriz Rojas", correo: "brojas@empresa.cl" } as Trabajador],
    });
    useVista().config.value = { ...VISTA_POR_DEFECTO, verPuestos };
    const l = useLienzo();
    l.seleccion.value = null;
    l.colapsados.value = new Set(["gg", "operaciones", "mantencion"]); // Mecánica escondida
    return l;
  };

  it("sin «Ver puestos»: abre las ramas, selecciona la unidad y la centra y enfoca", () => {
    const l = nuevo(false);
    expect(l.revelarPuesto("p4")).toEqual({ ok: true });
    expect(l.colapsados.value).toEqual(new Set());
    expect([l.seleccion.value, l.centrarEn.value, l.enfocar.value]).toEqual(["mecanica", "mecanica", "mecanica"]);
    expect(puestoUbicado.value).toBeNull();
  });

  it("con «Ver puestos»: selecciona la unidad y centra, marca y enfoca la tarjeta del puesto", () => {
    const l = nuevo(true);
    expect(l.revelarPuesto("p4").ok).toBe(true);
    expect([l.seleccion.value, l.centrarEn.value, l.enfocar.value]).toEqual(["mecanica", "p4", "p4"]);
    expect(puestoUbicado.value).toBe("p4");
    l.seleccionar("finanzas"); // otra selección quita la marca
    expect(puestoUbicado.value).toBeNull();
  });

  it("un puesto que no está en lo que se ve no se revela y lo dice", () => {
    const l = nuevo(true);
    const r = l.revelarPuesto("no-existe");
    expect(r.ok).toBe(false);
    expect(l.seleccion.value).toBeNull();
  });

});
