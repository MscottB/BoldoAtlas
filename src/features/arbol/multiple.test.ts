import { describe, expect, it } from "vitest";
import { TIPO_AREA } from "@/db/tipos";
import { p, u, unidades } from "./fixture";
import { planEliminar, soloCimas, sumar } from "./multiple";

describe("soloCimas", () => {
  it("quita las que cuelgan de otra seleccionada, en cualquier profundidad", () => {
    expect(soloCimas(unidades, ["mecanica", "mantencion", "finanzas"])).toEqual(["mantencion", "finanzas"]);
    expect(soloCimas(unidades, ["electrica", "gg"])).toEqual(["gg"]);
  });

  it("deja todas si ninguna cuelga de otra, y respeta el orden dado", () => {
    expect(soloCimas(unidades, ["mecanica", "electrica", "finanzas"])).toEqual([
      "mecanica",
      "electrica",
      "finanzas",
    ]);
  });

  it("una hermana de la seleccionada no cuenta como su superior", () => {
    expect(soloCimas(unidades, new Set(["mecanica", "mantencion"]))).toEqual(["mantencion"]);
    expect(soloCimas(unidades, ["operaciones", "finanzas"])).toEqual(["operaciones", "finanzas"]);
  });
});

describe("sumar", () => {
  it("Shift+clic agrega y deja el foco en la nueva; repetirla no la quita", () => {
    const a = sumar(new Set(["a"]), "b", false);
    expect([...a.ids]).toEqual(["a", "b"]);
    expect(a.foco).toBe("b");
    const b = sumar(a.ids, "a", false);
    expect([...b.ids].sort()).toEqual(["a", "b"]);
    expect(b.foco).toBe("a");
  });

  it("Ctrl+clic alterna: la que ya está sale y el foco pasa a la última que queda", () => {
    const sale = sumar(new Set(["a", "b", "c"]), "c", true);
    expect([...sale.ids]).toEqual(["a", "b"]);
    expect(sale.foco).toBe("b");
    expect(sumar(new Set(["a"]), "a", true)).toEqual({ ids: new Set(), foco: null });
    expect(sumar(new Set(), "a", true)).toEqual({ ids: new Set(["a"]), foco: "a" });
  });

  it("no modifica el conjunto recibido", () => {
    const antes = new Set(["a"]);
    sumar(antes, "b", false);
    expect([...antes]).toEqual(["a"]);
  });
});

describe("planEliminar", () => {
  const todos = [...unidades.filter((x) => !x.deleted_at)];
  const bajaDe = (r: ReturnType<typeof planEliminar>, id: string) => r.bajas.find((b) => b.id === id);

  it("el contenido de cada una pasa a su superior", () => {
    const r = planEliminar(todos, [p("p4", "mecanica"), p("p3", "mantencion")], ["mecanica", "finanzas"]);
    expect(r.omitidas).toEqual([]);
    expect(bajaDe(r, "mecanica")).toEqual({
      id: "mecanica",
      destino: "mantencion",
      contenido: { hijos: [], puestos: ["p4"] },
    });
    expect(bajaDe(r, "finanzas")?.destino).toBe("gg");
  });

  it("si cuelga de otra que también se elimina, su contenido sube hasta el primer superior que queda", () => {
    const r = planEliminar(todos, [p("p4", "mecanica")], ["mantencion", "mecanica"]);
    expect(r.omitidas).toEqual([]);
    expect(bajaDe(r, "mecanica")).toMatchObject({ destino: "operaciones", contenido: { puestos: ["p4"] } });
    // Mecánica es una de las que se eliminan: no se mueve a Operaciones como «hija» de Mantención.
    expect(bajaDe(r, "mantencion")).toMatchObject({
      destino: "operaciones",
      contenido: { hijos: ["electrica"], puestos: [] },
    });
  });

  it("una raíz con contenido se omite; una raíz vacía se elimina", () => {
    expect(planEliminar(todos, [], ["gg", "finanzas"]).omitidas).toEqual(["gg"]);
    expect(planEliminar(todos, [], ["gg", "finanzas"]).bajas.map((b) => b.id)).toEqual(["finanzas"]);
    const sola = [u("r", TIPO_AREA, "Sola", null)];
    expect(planEliminar(sola, [], ["r"])).toEqual({
      bajas: [{ id: "r", destino: null, contenido: { hijos: [], puestos: [] } }],
      omitidas: [],
    });
    expect(planEliminar(sola, [p("px", "r")], ["r"]).omitidas).toEqual(["r"]); // solo puestos: tampoco
  });

  it("raíz y toda su rama a la vez: lo que no tiene a dónde ir se omite en cascada", () => {
    // Todo GG › Finanzas: Finanzas está vacía y GG tiene a Finanzas, pero ambas se eliminan. GG no tiene puestos aquí.
    const r = planEliminar(
      [u("gg", TIPO_AREA, "GG", null), u("fin", TIPO_AREA, "Fin", "gg")],
      [],
      ["gg", "fin"],
    );
    expect(r.omitidas).toEqual([]);
    expect(r.bajas.map((b) => b.id).sort()).toEqual(["fin", "gg"]);
    // Con un puesto en Fin no hay a dónde llevarlo: Fin se omite y, como GG queda con una hija viva, GG también.
    const con = planEliminar(
      [u("gg", TIPO_AREA, "GG", null), u("fin", TIPO_AREA, "Fin", "gg")],
      [p("px", "fin")],
      ["gg", "fin"],
    );
    expect(con.bajas).toEqual([]);
    expect(con.omitidas.sort()).toEqual(["fin", "gg"]);
  });

  it("ignora unidades que ya no existen y puestos eliminados", () => {
    const r = planEliminar(todos, [{ ...p("p4", "mecanica"), deleted_at: "x" }], ["mecanica", "fantasma"]);
    expect(r.bajas).toEqual([
      { id: "mecanica", destino: "mantencion", contenido: { hijos: [], puestos: [] } },
    ]);
    expect(r.omitidas).toEqual([]);
  });
});
