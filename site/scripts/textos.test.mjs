import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PROHIBIDO, anclasAyuda, recorrer, slugTitulo } from "./reglas.mjs";

// Los textos de las páginas viven en site/textos/<idioma>/*.json: la misma forma en español e inglés.
const sitio = new URL("..", import.meta.url);
const repo = new URL("../..", import.meta.url);
const IDIOMAS = ["es", "en"];
const archivos = (idioma) =>
  readdirSync(new URL(`textos/${idioma}/`, sitio)).filter((f) => f.endsWith(".json"));
const json = (idioma, archivo) =>
  JSON.parse(readFileSync(new URL(`textos/${idioma}/${archivo}`, sitio), "utf8"));
const todos = IDIOMAS.flatMap((idioma) =>
  archivos(idioma).map((archivo) => ({ idioma, archivo, datos: json(idioma, archivo) })),
);

// string para las hojas; arreglo de formas; objeto clave→forma.
const forma = (nodo) =>
  Array.isArray(nodo)
    ? nodo.map(forma)
    : nodo && typeof nodo === "object"
      ? Object.fromEntries(Object.entries(nodo).map(([k, v]) => [k, forma(v)]))
      : typeof nodo;

const objetos = (datos, esDeLaForma) => {
  const lista = [];
  recorrer(datos, (v) => {
    if (v && typeof v === "object" && !Array.isArray(v) && esDeLaForma(v)) lista.push(v);
  });
  return lista;
};
const enlaces = (datos) => objetos(datos, (o) => "texto" in o && "href" in o);
const imagenes = (datos) =>
  objetos(datos, (o) => "nombre" in o && "ancho" in o && "alto" in o && "temas" in o);

const REGLA_MANUAL = /^(\/en)?\/manual\/([a-z-]+)(?:#([a-z0-9-]+))?$/;
const esEn = (href) => /^\/en(\/|#|$)/.test(href);
const internos = (datos) => enlaces(datos).filter((e) => e.href.startsWith("/"));

// Cada función devuelve la lista de problemas que encuentra (vacía si todo está bien).
const erroresIdioma = (idioma, hrefs) =>
  hrefs
    .filter((h) => esEn(h) !== (idioma === "en"))
    .map((h) => `${idioma}: «${h}» está en el idioma equivocado`);

const erroresManual = (idioma, hrefs) =>
  hrefs.flatMap((href) => {
    const m = REGLA_MANUAL.exec(href);
    if (!m) return [];
    const [, , pagina, ancla] = m;
    if (!existsSync(new URL(`ayuda/${idioma}/${pagina}.md`, repo)))
      return [`${href}: no hay ayuda/${idioma}/${pagina}.md`];
    if (ancla && !anclasAyuda(idioma, pagina).includes(ancla))
      return [`${href}: «${ancla}» no es un título de la ayuda`];
    return [];
  });

// Los id="x" escritos tal cual en los componentes del tema que la página usa (<Descargas …/> → Descargas.vue).
const anclasComponentes = (texto) =>
  [...texto.matchAll(/<([A-Z]\w*)/g)].flatMap(([, nombre]) => {
    const vue = new URL(`.vitepress/theme/${nombre}.vue`, sitio);
    return existsSync(vue)
      ? [...readFileSync(vue, "utf8").matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1])
      : [];
  });

// Las anclas de /funciones y /seguridad son los "id" de su JSON; las de las demás páginas, sus títulos, sus {#id}
// y los id de sus componentes.
const anclasPagina = (idioma, pagina, md) => {
  if (["funciones", "seguridad"].includes(pagina)) {
    const archivo = new URL(`textos/${idioma}/${pagina}.json`, sitio);
    if (!existsSync(archivo)) return [];
    const ids = [];
    recorrer(
      JSON.parse(readFileSync(archivo, "utf8")),
      (v, k) => k === "id" && typeof v === "string" && ids.push(v),
    );
    return ids;
  }
  const texto = readFileSync(md, "utf8");
  return [
    ...[...texto.matchAll(/^#{1,6} +(.+?)(?: +\{#([\w-]+)\})?\s*$/gm)].flatMap((m) => [
      slugTitulo(m[1]),
      m[2],
    ]),
    ...[...texto.matchAll(/\{#([\w-]+)\}/g)].map((m) => m[1]),
    ...anclasComponentes(texto),
  ].filter(Boolean);
};

const erroresPagina = (idioma, hrefs) =>
  hrefs.flatMap((href) => {
    if (REGLA_MANUAL.test(href)) return [];
    const [ruta, ancla] = href.split("#");
    const pagina = ruta.replace(/^\/en(?=\/|$)/, "").replace(/^\/|\/$/g, "") || "index";
    const md = new URL(idioma === "en" ? `en/${pagina}.md` : `${pagina}.md`, sitio);
    if (!existsSync(md)) return [`${href}: no existe ${idioma === "en" ? "en/" : ""}${pagina}.md`];
    if (ancla && !anclasPagina(idioma, pagina, md).includes(ancla))
      return [`${href}: «${ancla}» no existe en la página`];
    return [];
  });

const erroresCaptura = (idioma, imgs) =>
  imgs.flatMap((i) => {
    const rutas = i.ayuda
      ? [`ayuda/img/${idioma}/${i.nombre}.webp`]
      : i.temas
        ? ["claro", "oscuro"].map((t) => `docs/capturas/sitio/${i.nombre}-${idioma}-${t}.webp`)
        : [`docs/capturas/sitio/${i.nombre}.webp`];
    return [
      ...rutas.filter((r) => !existsSync(new URL(r, repo))).map((r) => `falta ${r}`),
      ...(typeof i.alt === "string" && i.alt.trim() ? [] : [`${i.nombre}: falta alt`]),
    ];
  });

test("cada archivo de textos tiene su par en inglés, con las mismas claves y el mismo largo en cada lista", () => {
  assert.ok(archivos("es").length > 0);
  assert.deepEqual(archivos("es"), archivos("en"));
  for (const archivo of archivos("es"))
    assert.deepEqual(forma(json("es", archivo)), forma(json("en", archivo)), archivo);
});

test("la comparación de formas detecta una clave que falta, una lista más corta y un tipo distinto", () => {
  const base = { a: "x", b: ["y", "z"], c: { d: "w" } };
  assert.deepEqual(forma(base), forma({ a: "1", b: ["2", "3"], c: { d: "4" } }));
  assert.notDeepEqual(forma(base), forma({ a: "x", b: ["y", "z"], c: {} }));
  assert.notDeepEqual(forma(base), forma({ a: "x", b: ["y"], c: { d: "w" } }));
  assert.notDeepEqual(forma(base), forma({ a: ["x"], b: ["y", "z"], c: { d: "w" } }));
});

test("ningún texto tiene versiones, «Próximamente», fases ni «cumple»", () => {
  for (const { idioma, archivo, datos } of todos)
    recorrer(datos, (v, k) => {
      if (typeof v === "string" && k !== "href")
        assert.doesNotMatch(v, PROHIBIDO, `${idioma}/${archivo}: «${v}»`);
    });
});

test("los enlaces internos en inglés empiezan con /en/ y los de español no", () => {
  for (const { idioma, archivo, datos } of todos)
    assert.deepEqual(
      erroresIdioma(
        idioma,
        internos(datos).map((e) => e.href),
      ),
      [],
      `${idioma}/${archivo}`,
    );
  assert.equal(erroresIdioma("en", ["/funciones"]).length, 1);
  assert.equal(erroresIdioma("es", ["/en/funciones"]).length, 1);
  assert.deepEqual(erroresIdioma("en", ["/en/", "/en/funciones#x"]), []);
});

test("cada enlace al manual va a una página y a un ancla que existen", () => {
  for (const { idioma, archivo, datos } of todos)
    assert.deepEqual(
      erroresManual(
        idioma,
        internos(datos).map((e) => e.href),
      ),
      [],
      `${idioma}/${archivo}`,
    );
  assert.deepEqual(erroresManual("es", ["/manual/inicio", "/en/manual/inicio"]), []);
  assert.equal(erroresManual("es", ["/manual/no-existe"]).length, 1);
  assert.equal(erroresManual("es", ["/manual/inicio#no-existe"]).length, 1);
});

test("cada enlace a otra página del sitio va a una página que existe", () => {
  for (const { idioma, archivo, datos } of todos)
    assert.deepEqual(
      erroresPagina(
        idioma,
        internos(datos).map((e) => e.href),
      ),
      [],
      `${idioma}/${archivo}`,
    );
  assert.deepEqual(erroresPagina("es", ["/", "/descargas"]), []);
  assert.deepEqual(erroresPagina("en", ["/en/", "/en/descargas"]), []);
  assert.equal(erroresPagina("es", ["/no-existe"]).length, 1);
  assert.equal(erroresPagina("es", ["/descargas#no-existe"]).length, 1);
  // el id de un componente cuenta solo en la página que lo usa
  assert.deepEqual(erroresPagina("es", ["/descargas#portable"]), []);
  assert.deepEqual(erroresPagina("en", ["/en/descargas#instaladores"]), []);
  assert.equal(erroresPagina("es", ["/descargas#lo-bueno"]).length, 1);
  assert.equal(erroresPagina("en", ["/en/no-existe"]).length, 1);
});

test("cada captura existe y lleva texto alternativo", () => {
  for (const { idioma, archivo, datos } of todos)
    assert.deepEqual(erroresCaptura(idioma, imagenes(datos)), [], `${idioma}/${archivo}`);
  const ok = { nombre: "arbol", ancho: 1, alto: 1, alt: "Un árbol", temas: true };
  assert.deepEqual(erroresCaptura("es", [ok]), []);
  assert.equal(erroresCaptura("es", [{ ...ok, alt: " " }]).length, 1);
  assert.equal(erroresCaptura("es", [{ ...ok, nombre: "nada" }]).length, 2);
  assert.equal(erroresCaptura("es", [{ ...ok, temas: false }]).length, 1);
  assert.deepEqual(erroresCaptura("es", [{ ...ok, nombre: "arbol-barra", temas: false, ayuda: true }]), []);
  assert.equal(erroresCaptura("es", [{ ...ok, nombre: "nada", temas: false, ayuda: true }]).length, 1);
});

// Inicio busca cada función destacada en funciones.json (Inicio.vue hace find(...)!): ninguna puede faltar.
const destacadasFaltantes = (inicio, funciones) =>
  inicio.destacadas.ids.filter((id) => !funciones.items.some((f) => f.id === id));

test("cada función destacada en Inicio existe en funciones.json", () => {
  for (const idioma of IDIOMAS)
    assert.deepEqual(
      destacadasFaltantes(json(idioma, "inicio.json"), json(idioma, "funciones.json")),
      [],
      idioma,
    );
  assert.deepEqual(destacadasFaltantes({ destacadas: { ids: ["a", "b"] } }, { items: [{ id: "a" }] }), ["b"]);
});

test("cada página del sitio tiene su par en inglés", () => {
  const paginas = readdirSync(sitio).filter((f) => f.endsWith(".md") && f !== "README.md");
  assert.ok(paginas.length > 0);
  for (const p of paginas) assert.ok(existsSync(new URL(`en/${p}`, sitio)), `falta site/en/${p}`);
});

test("funciones.json trae las 10 funciones, en orden y con estos id", () => {
  for (const idioma of IDIOMAS)
    assert.deepEqual(
      json(idioma, "funciones.json").items.map((f) => f.id),
      [
        "arboles",
        "conexiones",
        "organizaciones",
        "personas",
        "fechas",
        "revision",
        "directorio",
        "compartir",
        "portable",
        "sistemas",
      ],
      idioma,
    );
});

test("seguridad.json trae sus 7 secciones, en orden y con estos id", () => {
  for (const idioma of IDIOMAS)
    assert.deepEqual(
      json(idioma, "seguridad.json").secciones.map((s) => s.id),
      ["donde-quedan", "conexion", "cifrado", "archivos-externos", "verificar", "reportar", "cumplir"],
      idioma,
    );
});

// Los ### que están dentro de la sección `titulo`, hasta el siguiente ## (0 si la sección no está).
const preguntasEn = (texto, titulo) => {
  const lineas = texto.split(/\r?\n/);
  const inicio = lineas.indexOf(titulo);
  if (inicio < 0) return 0;
  const fin = lineas.findIndex((l, i) => i > inicio && l.startsWith("## "));
  return lineas.slice(inicio + 1, fin < 0 ? undefined : fin).filter((l) => l.startsWith("### ")).length;
};

test("Acerca de trae las preguntas frecuentes en los dos idiomas", () => {
  for (const [md, titulo] of [
    ["acerca.md", "## Preguntas frecuentes {#preguntas}"],
    ["en/acerca.md", "## Frequently asked questions {#preguntas}"],
  ])
    assert.ok(
      preguntasEn(readFileSync(new URL(md, sitio), "utf8"), titulo) >= 6,
      `${md}: falta «${titulo}» o tiene menos de 6 preguntas`,
    );
  const t = "## P {#preguntas}";
  // los ### de otra sección no cuentan, ni antes ni después
  assert.equal(preguntasEn(`## A\n### x\n### y\n${t}\n### p1\n### p2\n## B\n### z`, t), 2);
  assert.equal(preguntasEn("## A\n### x", t), 0);
});

test("las garantías de Inicio enlazan a Seguridad", () => {
  for (const idioma of IDIOMAS) {
    const { seguridad } = json(idioma, "comunes.json").rutas;
    for (const g of json(idioma, "inicio.json").garantias.items)
      assert.ok(g.enlace?.href.startsWith(`${seguridad}#`), `${idioma}: «${g.titulo}» → ${g.enlace?.href}`);
  }
});

test("cada función de funciones.json lleva su enlace al manual", () => {
  for (const idioma of IDIOMAS)
    for (const f of json(idioma, "funciones.json").items)
      assert.ok(f.enlace?.texto && f.enlace?.href, `${idioma}: «${f.id}» no tiene enlace`);
});

// Enlaces que no están como {texto, href}: las rutas de comunes.json y los [..](/..) de las preguntas de Acerca de.
const enlacesMarkdown = (texto) => [...texto.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
const hrefsSueltos = (idioma) => [
  ...Object.values(json(idioma, "comunes.json").rutas),
  ...enlacesMarkdown(readFileSync(new URL(idioma === "en" ? "en/acerca.md" : "acerca.md", sitio), "utf8")),
];

test("las rutas de comunes.json y los enlaces de Acerca de van a páginas, anclas y manual que existen", () => {
  for (const idioma of IDIOMAS) {
    const hrefs = hrefsSueltos(idioma);
    assert.ok(hrefs.length > 8, idioma);
    assert.deepEqual(
      [...erroresIdioma(idioma, hrefs), ...erroresManual(idioma, hrefs), ...erroresPagina(idioma, hrefs)],
      [],
      idioma,
    );
  }
  assert.deepEqual(enlacesMarkdown("a [x](/a#b) y [y](https://z.com) [w](/c)"), ["/a#b", "/c"]);
  // una ruta en español dentro de en/, una página que falta y un ancla del manual que no existe se detectan
  assert.equal(erroresIdioma("en", ["/funciones"]).length, 1);
  assert.equal(erroresPagina("es", ["/no-existe"]).length, 1);
  assert.equal(erroresManual("es", ["/manual/exportar-importar#no-existe"]).length, 1);
});
