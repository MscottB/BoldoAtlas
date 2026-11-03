import { describe, expect, it } from "vitest";
import {
  MAX_PESTANAS,
  abrir,
  cambiar,
  cerrar,
  estadoDe,
  hayVariasOrganizaciones,
  leerEstadoArbol,
  leerPestanas,
  mover,
  rutaValida,
  sePuedeBuscar,
  sinOrganizacion,
  unaPestana,
  vecina,
  type Pestanas,
} from "./pestanas";

const tres = (activa = "b"): Pestanas => ({
  lista: [
    { id: "a", org: "A", ruta: "/" },
    { id: "b", org: "A", ruta: "/directorio" },
    { id: "c", org: "A", ruta: "/?raiz=u1" },
  ],
  activa,
});
const ids = (m: Pestanas) => m.lista.map((p) => p.id).join("");

describe("hayVariasOrganizaciones", () => {
  it("con todas de la misma organización no hay etiqueta", () => {
    expect(hayVariasOrganizaciones(tres())).toBe(false);
  });

  it("con dos, sí", () => {
    const m = tres();
    expect(hayVariasOrganizaciones({ ...m, lista: [...m.lista, { id: "d", org: "B", ruta: "/" }] })).toBe(
      true,
    );
  });
});

describe("sePuedeBuscar", () => {
  it.each([
    ["no_encontrado", "x"],
    ["otro_id", "x"],
    ["contenido_invalido", "red"],
    ["contenido_invalido", "journal"],
  ])("%s (%s) ofrece buscar el archivo", (codigo, detalle) => {
    expect(sePuedeBuscar({ codigo, detalle })).toBe(true);
  });

  it.each([
    ["contenido_invalido", "wal"],
    ["contenido_invalido", "otro"],
    ["esquema_nuevo", "x"],
    ["desconocido", "x"],
    ["fallo", "red"],
  ])("%s (%s) no lo ofrece", (codigo, detalle) => {
    expect(sePuedeBuscar({ codigo, detalle })).toBe(false);
  });
});

describe("sinOrganizacion", () => {
  const dos: Pestanas = {
    lista: [
      { id: "a", org: "A", ruta: "/" },
      { id: "b", org: "B", ruta: "/directorio" },
      { id: "c", org: "B", ruta: "/revision" },
    ],
    activa: "a",
  };

  it("quita las suyas y deja la activa", () => {
    expect(sinOrganizacion(dos, "B", () => "n", "A")).toEqual({ lista: [dos.lista[0]], activa: "a" });
  });

  it("si la activa era suya, pasa a una de la abierta", () => {
    const m = sinOrganizacion({ ...dos, activa: "b" }, "B", () => "n", "A");
    expect(m).toEqual({ lista: [dos.lista[0]], activa: "a" });
  });

  it("si no queda ninguna, deja una de la abierta en /", () => {
    const m = sinOrganizacion({ lista: [dos.lista[1]!], activa: "b" }, "B", () => "n", "A");
    expect(m).toEqual({ lista: [{ id: "n", org: "A", ruta: "/" }], activa: "n" });
  });

  it("si solo quedan de otras, también abre una de la abierta", () => {
    const m = sinOrganizacion(dos, "A", () => "n", "Z");
    expect(ids(m)).toBe("bcn");
    expect(m.activa).toBe("n");
  });
});

describe("abrir", () => {
  it("inserta a la derecha de la activa y la activa", () => {
    const m = abrir(tres("a"), "n", "/revision", "B")!;
    expect(ids(m)).toBe("anbc");
    expect(m.activa).toBe("n");
    expect(m.lista[1]).toEqual({ id: "n", org: "B", ruta: "/revision" });
  });

  it("con el máximo no abre", () => {
    let m: Pestanas = unaPestana("0", "A");
    for (let i = 1; i < MAX_PESTANAS; i++) m = abrir(m, String(i), "/", "A")!;
    expect(m.lista).toHaveLength(MAX_PESTANAS);
    expect(abrir(m, "x", "/", "A")).toBeNull();
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
    const una = unaPestana("a", "A");
    expect(cerrar(una, "a")).toBe(una);
    const m = tres();
    expect(cerrar(m, "zz")).toBe(m);
  });

  it("al cerrar la activa se pasa a una vecina de su organización, aunque la de al lado sea de otra", () => {
    const m: Pestanas = {
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "B", ruta: "/" },
        { id: "c", org: "A", ruta: "/" },
        { id: "d", org: "B", ruta: "/" },
      ],
      activa: "a",
    };
    expect(cerrar(m, "a").activa).toBe("c"); // a la derecha, saltando la de B
    expect(cerrar({ ...m, activa: "c" }, "c").activa).toBe("a"); // sin más a la derecha, a la izquierda
    expect(cerrar({ ...m, activa: "b" }, "b").activa).toBe("d");
  });

  it("sin otra de su organización, la de siempre", () => {
    const m: Pestanas = {
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "B", ruta: "/" },
        { id: "c", org: "C", ruta: "/" },
      ],
      activa: "b",
    };
    expect(cerrar(m, "b").activa).toBe("c");
    expect(cerrar({ ...m, activa: "c" }, "c").activa).toBe("b");
  });
});

describe("vecina", () => {
  it("avanza y retrocede dando la vuelta", () => {
    expect(vecina(tres("b"), 1)).toBe("c");
    expect(vecina(tres("c"), 1)).toBe("a");
    expect(vecina(tres("a"), -1)).toBe("c");
    expect(vecina(unaPestana("a", "A"), 1)).toBe("a");
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
      const m = leerPestanas(crudo, todas, nuevoId, "A");
      expect(m.lista).toHaveLength(1);
      expect(m.lista[0]!.ruta).toBe("/");
      expect(m.lista[0]!.org).toBe("A");
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
      "A",
    );
    expect(ids(m)).toBe("adef");
    expect(m.activa).toBe("a"); // la activa guardada ya no existe
    expect(m.lista[1]!.estado).toEqual({ ruta: "/revision", datos: [1] });
    expect(m.lista[2]!.estado).toBeUndefined();
    expect(m.lista[2]!.volver).toBeUndefined(); // la vuelta tampoco puede llevar a lo que ya no existe
    expect(m.lista[3]!.volver).toBe("/directorio");
  });

  it("conserva la activa válida y no pasa del máximo más la de la organización abierta", () => {
    const lista = Array.from({ length: 20 }, (_, i) => ({ id: `p${i}`, ruta: "/" }));
    const m = leerPestanas({ lista, activa: "p3" }, todas, nuevoId, "A");
    expect(m.lista).toHaveLength(MAX_PESTANAS + 1);
    expect(m.activa).toBe("p3");
  });

  it("si todas son inválidas queda una en el inicio", () => {
    const m = leerPestanas({ lista: [{ id: "a", ruta: "/x" }], activa: "a" }, () => false, nuevoId, "A");
    expect(m.lista).toHaveLength(1);
    expect(m.lista[0]!.ruta).toBe("/");
  });

  it("una pestaña guardada sin `org` queda de la organización actual; la que lo trae lo conserva", () => {
    const m = leerPestanas(
      {
        lista: [
          { id: "a", ruta: "/" },
          { id: "b", org: "B", ruta: "/" },
          { id: "c", org: 3, ruta: "/" },
        ],
      },
      todas,
      nuevoId,
      "A",
    );
    expect(m.lista.map((p) => p.org)).toEqual(["A", "B", "A"]);
  });

  it("valida la ruta y la vuelta con la organización de la pestaña", () => {
    const m = leerPestanas(
      {
        lista: [
          { id: "a", org: "A", ruta: "/?raiz=x" },
          { id: "b", org: "B", ruta: "/?raiz=x", volver: "/?raiz=x" },
          { id: "c", ruta: "/", volver: "/?raiz=x" },
        ],
      },
      (r, org) => org === "B" || !r.includes("raiz"),
      nuevoId,
      "A",
    );
    expect(ids(m)).toBe("bc");
    expect(m.lista[0]!.volver).toBe("/?raiz=x");
    expect(m.lista[1]!.volver).toBeUndefined();
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
