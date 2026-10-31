import { describe, expect, it } from "vitest";
import {
  MAX_PESTANAS,
  abrir,
  cambiar,
  cerrar,
  estadoDe,
  leerEstadoArbol,
  leerPestanas,
  mover,
  rutaValida,
  unaPestana,
  vecina,
  type Pestanas,
} from "./pestanas";

const tres = (activa = "b"): Pestanas => ({
  lista: [
    { id: "a", ruta: "/" },
    { id: "b", ruta: "/directorio" },
    { id: "c", ruta: "/?raiz=u1" },
  ],
  activa,
});
const ids = (m: Pestanas) => m.lista.map((p) => p.id).join("");

describe("abrir", () => {
  it("inserta a la derecha de la activa y la activa", () => {
    const m = abrir(tres("a"), "n", "/revision")!;
    expect(ids(m)).toBe("anbc");
    expect(m.activa).toBe("n");
    expect(m.lista[1]!.ruta).toBe("/revision");
  });

  it("con el máximo no abre", () => {
    let m: Pestanas = unaPestana("0");
    for (let i = 1; i < MAX_PESTANAS; i++) m = abrir(m, String(i), "/")!;
    expect(m.lista).toHaveLength(MAX_PESTANAS);
    expect(abrir(m, "x", "/")).toBeNull();
  });
});

describe("cerrar", () => {
  it("cerrar la activa activa la de su derecha; si es la última, la de su izquierda", () => {
    expect(cerrar(tres("b"), "b")).toMatchObject({ activa: "c" });
    expect(ids(cerrar(tres("b"), "b"))).toBe("ac");
    expect(cerrar(tres("c"), "c").activa).toBe("b");
  });

  it("cerrar otra conserva la activa", () => {
    const m = cerrar(tres("b"), "a");
    expect(ids(m)).toBe("bc");
    expect(m.activa).toBe("b");
  });

  it("la única pestaña no se cierra, y un id desconocido no cambia nada", () => {
    const una = unaPestana("a");
    expect(cerrar(una, "a")).toBe(una);
    const m = tres();
    expect(cerrar(m, "zz")).toBe(m);
  });
});

describe("vecina", () => {
  it("avanza y retrocede dando la vuelta", () => {
    expect(vecina(tres("b"), 1)).toBe("c");
    expect(vecina(tres("c"), 1)).toBe("a");
    expect(vecina(tres("a"), -1)).toBe("c");
    expect(vecina(unaPestana("a"), 1)).toBe("a");
  });
});

describe("mover", () => {
  it("lleva la pestaña a la posición pedida, acotada", () => {
    expect(ids(mover(tres(), "a", 2))).toBe("bca");
    expect(ids(mover(tres(), "c", 0))).toBe("cab");
    expect(ids(mover(tres(), "a", 99))).toBe("bca");
    expect(ids(mover(tres(), "b", -5))).toBe("bac");
    expect(mover(tres(), "b", 1).activa).toBe("b");
  });
});

describe("cambiar y estadoDe", () => {
  it("guarda el estado de una ruta y solo lo devuelve para esa ruta", () => {
    const m = cambiar(tres(), "a", { estado: { ruta: "/", datos: { x: 1 } } });
    expect(estadoDe(m, "a", "/")).toEqual({ x: 1 });
    expect(estadoDe(m, "a", "/?raiz=u1")).toBeUndefined();
    expect(estadoDe(m, "b", "/")).toBeUndefined();
    expect(cambiar(m, "zz", { ruta: "/x" })).toBe(m);
  });
});

describe("leerPestanas", () => {
  let n = 0;
  const nuevoId = () => `nuevo${++n}`;
  const todas = () => true;

  it("JSON roto o vacío deja una pestaña en el inicio", () => {
    for (const crudo of [null, "x", 3, {}, { lista: "no" }, { lista: [] }]) {
      const m = leerPestanas(crudo, todas, nuevoId);
      expect(m.lista).toHaveLength(1);
      expect(m.lista[0]!.ruta).toBe("/");
      expect(m.activa).toBe(m.lista[0]!.id);
    }
  });

  it("descarta las mal formadas, las repetidas y las que la validación rechaza", () => {
    const m = leerPestanas(
      {
        lista: [
          { id: "a", ruta: "/" },
          { id: "a", ruta: "/directorio" },
          { id: "b" },
          { ruta: "/" },
          { id: "c", ruta: "/?raiz=borrada" },
          { id: "d", ruta: "/revision", estado: { ruta: "/revision", datos: [1] } },
          { id: "e", ruta: "/arboles", estado: "roto", volver: "/?raiz=borrada" },
          { id: "f", ruta: "/ayuda", volver: "/directorio" },
        ],
        activa: "c",
      },
      (r) => !r.includes("borrada"),
      nuevoId,
    );
    expect(ids(m)).toBe("adef");
    expect(m.activa).toBe("a"); // la activa guardada ya no existe
    expect(m.lista[1]!.estado).toEqual({ ruta: "/revision", datos: [1] });
    expect(m.lista[2]!.estado).toBeUndefined();
    expect(m.lista[2]!.volver).toBeUndefined(); // la vuelta tampoco puede llevar a lo que ya no existe
    expect(m.lista[3]!.volver).toBe("/directorio");
  });

  it("conserva la activa válida y no pasa del máximo", () => {
    const lista = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, ruta: "/" }));
    const m = leerPestanas({ lista, activa: "p3" }, todas, nuevoId);
    expect(m.lista).toHaveLength(MAX_PESTANAS);
    expect(m.activa).toBe("p3");
  });

  it("si todas son inválidas queda una en el inicio", () => {
    const m = leerPestanas({ lista: [{ id: "a", ruta: "/x" }], activa: "a" }, () => false, nuevoId);
    expect(m.lista).toHaveLength(1);
    expect(m.lista[0]!.ruta).toBe("/");
  });
});

describe("rutaValida", () => {
  const existe = {
    unidad: (id: string) => id === "u1",
    persona: (id: string) => id === "p1",
  };
  it("acepta las vistas del proyecto con unidades y personas que existen", () => {
    expect(rutaValida({ nombre: "arbol", query: {} }, existe)).toBe(true);
    expect(rutaValida({ nombre: "arbol", query: { raiz: "u1" } }, existe)).toBe(true);
    expect(rutaValida({ nombre: "arbol", query: { ver: "u1" } }, existe)).toBe(true);
    expect(rutaValida({ nombre: "directorio", query: { unidad: "u1" } }, existe)).toBe(true);
    expect(rutaValida({ nombre: "directorio", query: { persona: "p1" } }, existe)).toBe(true);
    expect(rutaValida({ nombre: "ayuda", query: {} }, existe)).toBe(true);
  });

  it("rechaza la Bienvenida, rutas desconocidas y lo que ya no existe", () => {
    expect(rutaValida({ nombre: "bienvenida", query: {} }, existe)).toBe(false);
    expect(rutaValida({ nombre: undefined, query: {} }, existe)).toBe(false);
    expect(rutaValida({ nombre: "arbol", query: { raiz: "u9" } }, existe)).toBe(false);
    expect(rutaValida({ nombre: "arbol", query: { raiz: ["u1"] } }, existe)).toBe(false);
    expect(rutaValida({ nombre: "directorio", query: { persona: "p9" } }, existe)).toBe(false);
  });
});

describe("leerEstadoArbol", () => {
  it("lee ramas, selección, encuadre y resaltado", () => {
    const e = leerEstadoArbol({
      colapsados: ["a", 3, "b"],
      seleccion: "a",
      encuadre: { x: 1, y: -2, zoom: 0.5 },
      resaltar: { texto: "x" },
    });
    expect([...e!.colapsados]).toEqual(["a", "b"]);
    expect(e!.seleccion).toBe("a");
    expect(e!.encuadre).toEqual({ x: 1, y: -2, zoom: 0.5 });
    expect(e!.resaltar).toEqual({ texto: "x" });
  });

  it("sin forma válida devuelve null; un encuadre roto se ignora", () => {
    expect(leerEstadoArbol(undefined)).toBeNull();
    expect(leerEstadoArbol({ colapsados: "a" })).toBeNull();
    const e = leerEstadoArbol({ colapsados: [], seleccion: 5, encuadre: { x: 1, y: 2, zoom: 0 } });
    expect(e!.seleccion).toBeNull();
    expect(e!.encuadre).toBeNull();
    expect(leerEstadoArbol({ colapsados: [], encuadre: { x: NaN, y: 0, zoom: 1 } })!.encuadre).toBeNull();
  });
});
