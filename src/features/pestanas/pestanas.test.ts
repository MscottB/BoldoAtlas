import { describe, expect, it } from "vitest";
import {
  DIVISION_INICIAL,
  MAX_PESTANAS,
  PROPORCION_MAX,
  PROPORCION_MIN,
  abrir,
  alLado,
  alArbol,
  cambiar,
  cerrar,
  conProporcion,
  detalleUtil,
  enPanel,
  entradaMenu,
  estadoDe,
  hayVariasOrganizaciones,
  leerEstadoArbol,
  leerPestanas,
  mover,
  rutaValida,
  sePuedeBuscar,
  sePuedeReintentar,
  sePuedeCerrar,
  sinLado,
  sinOrganizacion,
  unaPestana,
  vecina,
  type Pestanas,
} from "./pestanas";

const sin = { lado: null, division: DIVISION_INICIAL };
const tres = (activa = "b"): Pestanas => ({
  lista: [
    { id: "a", org: "A", ruta: "/" },
    { id: "b", org: "A", ruta: "/directorio" },
    { id: "c", org: "A", ruta: "/?raiz=u1" },
  ],
  activa,
  ...sin,
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

describe("sePuedeReintentar", () => {
  it.each([
    ["fallo", ""],
    ["abierta_en_otra_copia", "x"],
    ["contenido_invalido", "retenido"],
    ["contenido_invalido", "sin_causa"],
  ])("%s %s: lo que puede pasar solo se reintenta", (codigo, detalle) => {
    expect(sePuedeReintentar({ codigo, detalle })).toBe(true);
  });

  it.each([
    ["danado", "file is not a database"],
    ["contenido_invalido", "no_se_puede"],
    ["contenido_invalido", "no_esta"],
    ["contenido_invalido", ""],
    ["contenido_invalido", "red"],
    ["contenido_invalido", "journal"],
    ["esquema_nuevo", "9"],
  ])("%s %s: lo que es del archivo, no", (codigo, detalle) => {
    expect(sePuedeReintentar({ codigo, detalle })).toBe(false);
  });
});

describe("sePuedeCerrar", () => {
  it("con datos que no cargaron y una sola pestaña no se ofrece: dejaría otra con el mismo motivo", () => {
    expect(sePuedeCerrar("fallo", 1)).toBe(false);
    expect(sePuedeCerrar("fallo", 2)).toBe(true);
    expect(sePuedeCerrar("no_encontrado", 1)).toBe(true);
  });
});

describe("sePuedeBuscar", () => {
  it.each([
    ["no_encontrado", "x"],
    ["otro_id", "x"],
    ["contenido_invalido", "red"],
    ["contenido_invalido", "journal"],
    ["contenido_invalido", "no_esta"],
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

describe("detalleUtil", () => {
  const m = (detalle: string, mensaje = "No se abrió") => ({ detalle, mensaje });

  it.each([
    ["", "vacío"],
    ["red", "un código"],
    ["journal", "un código"],
    ["0b5e7f6a-1234-4000-8000-000000000000", "un id"],
    ["No se abrió", "lo mismo que el mensaje"],
  ])("«%s» no aporta: %s", (detalle) => {
    expect(detalleUtil(m(detalle))).toBe(false);
  });

  it.each(["D:/usb/org.db", "C:\\datos\\org.db", "disk I/O error"])("«%s» sí", (detalle) => {
    expect(detalleUtil(m(detalle))).toBe(true);
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
    ...sin,
  };

  it("quita las suyas y deja la activa", () => {
    expect(sinOrganizacion(dos, "B", () => "n", "A")).toEqual({ lista: [dos.lista[0]], activa: "a", ...sin });
  });

  it("si la activa era suya, pasa a una de la abierta", () => {
    const m = sinOrganizacion({ ...dos, activa: "b" }, "B", () => "n", "A");
    expect(m).toEqual({ lista: [dos.lista[0]], activa: "a", ...sin });
  });

  it("si no queda ninguna, deja una de la abierta en /", () => {
    const m = sinOrganizacion({ lista: [dos.lista[1]!], activa: "b", ...sin }, "B", () => "n", "A");
    expect(m).toEqual({ lista: [{ id: "n", org: "A", ruta: "/" }], activa: "n", ...sin });
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
      ...sin,
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
      ...sin,
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

describe("alArbol: al volver a la organización se empieza en el Árbol", () => {
  const esArbol = (ruta: string) => ruta === "/" || ruta.startsWith("/?");
  const nuevo = () => "n";

  it("activa su primera pestaña del Árbol sin tocar las demás", () => {
    expect(alArbol(tres("b"), "A", esArbol, nuevo)).toEqual(tres("a"));
  });

  it("sin pestaña del Árbol abre una a la derecha de la activa", () => {
    const m: Pestanas = {
      lista: [
        { id: "r", org: "A", ruta: "/revision" },
        { id: "d", org: "A", ruta: "/directorio" },
      ],
      activa: "r",
      ...sin,
    };
    expect(alArbol(m, "A", esArbol, nuevo)).toEqual({
      lista: [m.lista[0], { id: "n", org: "A", ruta: "/" }, m.lista[1]],
      activa: "n",
      ...sin,
    });
  });

  it("no toma la pestaña del Árbol de otra organización", () => {
    const m: Pestanas = {
      lista: [
        { id: "x", org: "B", ruta: "/" },
        { id: "r", org: "A", ruta: "/revision" },
      ],
      activa: "r",
      ...sin,
    };
    expect(alArbol(m, "A", esArbol, nuevo).activa).toBe("n");
  });

  it("si la activa ya es del Árbol (o de una rama) se queda en ella", () => {
    expect(alArbol(tres("c"), "A", esArbol, nuevo)).toEqual(tres("c"));
  });

  it("con el máximo lleno y sin Árbol queda como estaba", () => {
    const lleno: Pestanas = {
      lista: Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `p${i}`, org: "A", ruta: "/revision" })),
      activa: "p0",
      ...sin,
    };
    expect(alArbol(lleno, "A", esArbol, nuevo)).toBe(lleno);
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

describe("vista dividida: la pestaña de al lado", () => {
  // [a, b, c], la activa b y c al lado
  const dividida = (): Pestanas => ({ ...tres("b"), lado: "c" });

  it("alLado_intercambia_si_es_la_activa", () => {
    const m = alLado(dividida(), "b");
    expect(m.activa).toBe("c");
    expect(m.lado).toBe("b");
  });

  it("alLado pone otra pestaña al lado sin tocar la activa", () => {
    const m = alLado(tres("b"), "c");
    expect(m).toMatchObject({ activa: "b", lado: "c" });
  });

  it("alLado sin pestaña al lado manda la activa a la vecina de cerrar", () => {
    expect(alLado(tres("b"), "b")).toMatchObject({ activa: "c", lado: "b" });
    expect(alLado(tres("c"), "c")).toMatchObject({ activa: "b", lado: "c" });
  });

  it("alLado_con_una_sola_pestana_no_cambia", () => {
    const una = unaPestana("a", "A");
    expect(alLado(una, "a")).toBe(una);
  });

  it("enPanel_intercambia_entre_paneles", () => {
    expect(enPanel(dividida(), "principal", "c")).toMatchObject({ activa: "c", lado: "b" });
    expect(enPanel(dividida(), "lado", "b")).toMatchObject({ activa: "c", lado: "b" });
    expect(enPanel(dividida(), "lado", "a")).toMatchObject({ activa: "b", lado: "a" });
    expect(enPanel(dividida(), "principal", "a")).toMatchObject({ activa: "a", lado: "c" });
  });

  it("cerrar_la_activa_no_activa_la_de_al_lado", () => {
    const m = cerrar(dividida(), "b");
    expect(m.activa).toBe("a");
    expect(m.lado).toBe("c");
  });

  it("cerrar_la_de_al_lado_quita_la_division", () => {
    const m = cerrar(dividida(), "c");
    expect(m).toMatchObject({ activa: "b", lado: null });
    expect(ids(m)).toBe("ab");
  });

  it("cerrar la activa cuando la de al lado es la única que queda la activa y quita la división", () => {
    const m = cerrar({ ...tres("a"), lista: tres().lista.slice(0, 2), lado: "b" }, "a");
    expect(m).toMatchObject({ activa: "b", lado: null });
  });

  it("vecina_salta_la_del_otro_panel", () => {
    expect(vecina(dividida(), 1)).toBe("a"); // b → c es la de al lado: salta a a
    expect(vecina({ ...dividida(), activa: "a" }, 1)).toBe("b");
    expect(vecina(dividida(), 1, "lado")).toBe("a"); // c → a
    expect(vecina(dividida(), -1, "lado")).toBe("a"); // c → b es la activa: salta a a
  });

  it("sinLado quita la división", () => {
    expect(sinLado(dividida()).lado).toBeNull();
  });

  it("sinOrganizacion_quita_el_lado", () => {
    const m: Pestanas = {
      ...unaPestana("a", "A"),
      lista: [
        { id: "a", org: "A", ruta: "/" },
        { id: "b", org: "B", ruta: "/" },
      ],
      lado: "b",
    };
    expect(sinOrganizacion(m, "B", () => "n", "A")).toMatchObject({ activa: "a", lado: null });
    expect(sinOrganizacion(m, "Z", () => "n", "A")).toMatchObject({ activa: "a", lado: "b" });
  });

  it("conProporcion_acota", () => {
    expect(conProporcion(tres(), 0.05).division.proporcion).toBe(PROPORCION_MIN);
    expect(conProporcion(tres(), 0.95).division.proporcion).toBe(PROPORCION_MAX);
    expect(conProporcion(tres(), 0.3).division.proporcion).toBe(0.3);
    expect(conProporcion(tres(), NaN)).toEqual(tres());
  });

  it("una pestaña nueva nace sin división", () => {
    expect(unaPestana("a", "A")).toMatchObject({ lado: null, division: DIVISION_INICIAL });
  });
});

describe("leerPestanas con la vista dividida", () => {
  const lista = [
    { id: "a", ruta: "/" },
    { id: "b", ruta: "/" },
  ];
  const leer = (extra: object) =>
    leerPestanas(
      { lista, activa: "a", ...extra },
      () => true,
      () => "n",
      "A",
    );

  it("lee un lado y una división válidos", () => {
    const division = { orientacion: "vertical", proporcion: 0.3 };
    expect(leer({ lado: "b", division })).toMatchObject({ lado: "b", division });
  });

  it("leerPestanas_lado_invalido", () => {
    for (const lado of ["zz", "a", 3, null]) expect(leer({ lado }).lado).toBeNull();
    for (const division of [
      { orientacion: "diagonal", proporcion: NaN },
      "x",
      null,
      { orientacion: "vertical", proporcion: 0.9 },
    ])
      expect(leer({ division }).division).toEqual(DIVISION_INICIAL);
  });

  it("las pestañas guardadas sin estos campos se leen igual que antes", () => {
    expect(leer({})).toMatchObject({ activa: "a", lado: null, division: DIVISION_INICIAL });
  });
});

describe("entradaMenu", () => {
  const todas = () => true;
  it("quitar en la de al lado, abrir en las que pueden ir y nada en las demás", () => {
    const m = { ...tres(), lado: "c" };
    expect(entradaMenu(m, "c", todas)).toBe("quitarDeAlLado");
    expect(entradaMenu(m, "a", todas)).toBe("abrirAlLado");
    expect(entradaMenu(m, "a", (id) => id !== "a")).toBeNull();
  });

  it("la activa: solo si la que el principal mostraría en su lugar también puede ir", () => {
    expect(entradaMenu(tres(), "b", todas)).toBe("abrirAlLado");
    // El principal pasaría a «a» (o a «c»): si ninguna de ellas puede, abrir fallaría.
    expect(entradaMenu(tres(), "b", (id) => id === "b")).toBeNull();
    expect(entradaMenu({ ...tres(), lista: [tres().lista[1]!] }, "b", todas)).toBeNull();
  });
});
