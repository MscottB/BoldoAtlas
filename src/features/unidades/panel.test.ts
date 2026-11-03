import { describe, expect, it } from "vitest";
import type { Conexion, Leyenda, Trabajador } from "@/db/tipos";
import { a, asignaciones, p, puestos, tipos, unidades } from "@/features/arbol/fixture";
import { creaCiclo, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import {
  buscarUnidades,
  conexionOculta,
  decisionEliminar,
  excluidasComoSuperior,
  excluidasParaConexion,
  filasDeConexiones,
  filasDePuestos,
  migas,
  porQueNoSeVe,
  ultimoEnviado,
  validarMarca,
} from "./panel";

const viva = unidades.filter((x) => !(x as { deleted_at?: string }).deleted_at);

describe("ultimoEnviado", () => {
  it("solo deja pasar un valor distinto del último, aunque el anterior siga en camino", () => {
    const e = ultimoEnviado<string | null>("a");
    expect(e.cambia("a")).toBe(false);
    expect(e.cambia("b")).toBe(true);
    expect(e.cambia("b")).toBe(false);
    expect(e.cambia(null)).toBe(true);
  });

  it("si el envío falló, ese valor se puede volver a enviar", () => {
    const e = ultimoEnviado("a");
    e.cambia("b");
    e.fallo();
    expect(e.cambia("b")).toBe(true);
    expect(e.cambia("b")).toBe(false);
  });
});

describe("conexionOculta", () => {
  it("se ve: null", () => {
    expect(conexionOculta(viva, new Set(), ["mecanica", "gg"])).toBeNull();
  });

  it("dice la unidad plegada, cualquiera sea el extremo", () => {
    expect(conexionOculta(viva, new Set(["operaciones"]), ["gg", "mecanica"])).toEqual({
      id: "mecanica",
      motivo: "plegada",
    });
  });

  it("«fuera» manda sobre «plegada»: abrir la rama no la dejaría a la vista", () => {
    const rama = viva.filter((u) => u.id !== "gg");
    expect(conexionOculta(rama, new Set(["operaciones"]), ["mecanica", "gg"])).toEqual({
      id: "gg",
      motivo: "fuera",
    });
  });
});

describe("porQueNoSeVe", () => {
  it("nada la esconde: se ve", () => {
    expect(porQueNoSeVe(viva, new Set(), "mecanica")).toBeNull();
  });

  it("un superior plegado la esconde; plegar la propia unidad no", () => {
    expect(porQueNoSeVe(viva, new Set(["operaciones"]), "mecanica")).toBe("plegada");
    expect(porQueNoSeVe(viva, new Set(["mecanica"]), "mecanica")).toBeNull();
  });

  it("fuera de lo que se muestra (otra rama enfocada, otra fecha)", () => {
    const rama = viva.filter((u) => u.id !== "mecanica");
    expect(porQueNoSeVe(rama, new Set(["mantencion"]), "mecanica")).toBe("fuera");
  });
});

describe("migas", () => {
  it("da los superiores desde la raíz, sin la propia unidad, con el nombre del tipo de cada uno", () => {
    expect(migas(unidades, tipos, "mecanica")).toEqual([
      { id: "gg", nombre: "Gerencia General", tipo: "Otra" },
      { id: "operaciones", nombre: "Operaciones", tipo: "Gerencia" },
      { id: "mantencion", nombre: "Mantención", tipo: "Área" },
    ]);
  });

  it("una raíz no tiene migas", () => {
    expect(migas(unidades, tipos, "gg")).toEqual([]);
  });

  it("muestra el tipo aunque esté desactivado, y vacío si ya no existe", () => {
    const desactivado = tipos.map((t) => (t.nombre === "Área" ? { ...t, deleted_at: "x" } : t));
    expect(migas(unidades, desactivado, "mecanica")[2].tipo).toBe("Área");
    expect(migas(unidades, [], "operaciones")).toEqual([{ id: "gg", nombre: "Gerencia General", tipo: "" }]);
  });
});

describe("superior elegible", () => {
  it("excluye la unidad y sus descendientes: exactamente lo que rechaza creaCiclo", () => {
    const excluidas = excluidasComoSuperior(unidades, "mantencion");
    expect([...excluidas].sort()).toEqual(["electrica", "mantencion", "mecanica"]);
    for (const x of viva) expect(excluidas.has(x.id)).toBe(creaCiclo(unidades, "mantencion", x.id));
  });

  it("busca por nombre sin tildes ni mayúsculas, con la ruta del superior, y omite las excluidas y las borradas", () => {
    const r = buscarUnidades(unidades, new Set(["mecanica"]), "MECA");
    expect(r).toEqual([]); // Mecánica está excluida
    const r2 = buscarUnidades(unidades, new Set(), "mecan");
    expect(r2.map((o) => o.unidad.id)).toEqual(["mecanica"]);
    expect(r2[0].ruta).toBe("Gerencia General › Operaciones › Mantención");
    expect(buscarUnidades(unidades, new Set(), "borrada")).toEqual([]);
  });

  it("sin texto lista todas por nombre y respeta el límite; una raíz no tiene ruta", () => {
    const todas = buscarUnidades(unidades, new Set(), "");
    expect(todas).toHaveLength(6);
    expect(todas.map((o) => o.unidad.nombre)).toEqual(
      [...todas.map((o) => o.unidad.nombre)].sort((x, y) => x.localeCompare(y, "es")),
    );
    expect(buscarUnidades(unidades, new Set(), "", 2)).toHaveLength(2);
    expect(todas.find((o) => o.unidad.id === "gg")?.ruta).toBe("");
  });
});

describe("conexiones", () => {
  const cx = (id: string, origen_id: string, destino_id: string): Conexion => ({
    id,
    origen_id,
    destino_id,
    etiqueta: null,
  });

  it("no ofrece la propia unidad ni las ya conectadas, en cualquier sentido", () => {
    const excl = excluidasParaConexion(
      [cx("c1", "mantencion", "finanzas"), cx("c2", "gg", "mantencion"), cx("c3", "gg", "finanzas")],
      "mantencion",
    );
    expect([...excl].sort()).toEqual(["finanzas", "gg", "mantencion"]);
  });

  describe("filasDeConexiones", () => {
    const porId = new Map(viva.map((u) => [u.id, u]));
    const filas = (...c: Conexion[]) => filasDeConexiones(c, porId, "mantencion");

    it("el sentido sale de quién es el origen: hacia la otra si es ella, desde la otra si no", () => {
      expect(
        filas(cx("c1", "mantencion", "finanzas"), cx("c2", "gg", "mantencion")).map((f) => [
          f.id,
          f.sentido,
          f.otro.id,
        ]),
      ).toEqual([
        ["c1", "hacia", "finanzas"],
        ["c2", "desde", "gg"],
      ]);
    });

    it("trae la descripción tal cual", () => {
      const c = { ...cx("c1", "mantencion", "finanzas"), etiqueta: "Compras" };
      expect(filas(c)[0]!.etiqueta).toBe("Compras");
      expect(filas(cx("c2", "gg", "mantencion"))[0]!.etiqueta).toBeNull();
    });

    it("omite las de otras unidades y las hacia una unidad que ya no está", () => {
      expect(filas(cx("c1", "gg", "finanzas"), cx("c2", "mantencion", "borrada"))).toEqual([]);
    });
  });
});

describe("decisionEliminar", () => {
  it("sin hijos ni puestos se elimina directo", () => {
    expect(decisionEliminar(unidades, [], "electrica")).toMatchObject({
      accion: "directo",
      hijos: 0,
      puestos: 0,
    });
  });

  it("con contenido pide confirmar y nombra al superior que lo recibe", () => {
    const d = decisionEliminar(unidades, puestos, "mantencion");
    expect(d).toMatchObject({ accion: "mover", hijos: 2, puestos: 1 });
    expect(d.superior?.id).toBe("operaciones");
  });

  it("solo puestos también cuenta como contenido", () => {
    expect(decisionEliminar(unidades, [p("x", "electrica")], "electrica").accion).toBe("mover");
  });

  it("una raíz con contenido no se puede eliminar; una raíz vacía sí", () => {
    expect(decisionEliminar(unidades, puestos, "gg").accion).toBe("bloqueada");
    expect(decisionEliminar([unidades[0]], [], "gg").accion).toBe("directo");
  });

  it("no cuenta las unidades borradas ni los puestos borrados", () => {
    const borrado = { ...p("b", "electrica"), deleted_at: "x" };
    expect(decisionEliminar(unidades, [borrado], "electrica").accion).toBe("directo");
    expect(decisionEliminar(unidades, [], "mantencion").hijos).toBe(2); // «Borrada» no cuenta
  });
});

describe("validarMarca", () => {
  it("normaliza el color y vacía el código en blanco", () => {
    expect(validarMarca("#BE123C", "  ")).toEqual({ ok: true, color: "#be123c", codigo: null });
    expect(validarMarca(null, " MAN ")).toEqual({ ok: true, color: null, codigo: "MAN" });
  });

  it("rechaza un color mal formado o un código de más de 4 caracteres", () => {
    expect(validarMarca("rojo", "")).toEqual({ ok: false, error: "color" });
    expect(validarMarca(null, "ABCDE")).toEqual({ ok: false, error: "codigo" });
    expect(validarMarca(null, "ABCD").ok).toBe(true);
  });
});

describe("filasDePuestos", () => {
  const trabajadores = [
    { id: "t1", nombre: "Ana" },
    { id: "t3", nombre: "Luis" },
  ] as Trabajador[];
  const cargos = [{ id: "cargo", nombre: "Analista", orden: 0, deleted_at: null }];
  const leyendas = [{ id: "l1", nombre: "Crítico", color: "#be123c" }] as Leyenda[];

  it("da cargo, titular o vacante, reemplazo, leyenda y si es la jefatura", () => {
    const ps = [{ ...p("p6", "mecanica"), leyenda_id: "l1" }, { ...p("p4", "mecanica") }];
    const jefe = { ...unidades.find((x) => x.id === "mecanica")!, jefe_puesto_id: "p6" };
    const filas = filasDePuestos(jefe, ps, vigentesPorPuesto(asignaciones), trabajadores, cargos, leyendas);
    expect(filas).toEqual([
      {
        id: "p6",
        cargo: "Analista",
        titular: null,
        reemplazo: "Luis",
        leyenda: { nombre: "Crítico", color: "#be123c" },
        jefatura: true,
      },
      { id: "p4", cargo: "Analista", titular: null, reemplazo: null, leyenda: null, jefatura: false },
    ]);
  });

  it("solo toma los puestos de la unidad", () => {
    const filas = filasDePuestos(
      unidades[0],
      [p("p1", "gg"), p("p3", "mantencion")],
      vigentesPorPuesto([a("a1", "p1", "t1")]),
      trabajadores,
      cargos,
      leyendas,
    );
    expect(filas.map((f) => [f.id, f.titular])).toEqual([["p1", "Ana"]]);
  });
});
