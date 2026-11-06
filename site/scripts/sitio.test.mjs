import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { destinoAncla } from "../.vitepress/theme/anclasViejas.ts";

// config.mts importa código de la app sin extensión, que node no carga solo: se revisa como texto.
const config = readFileSync(new URL("../.vitepress/config.mts", import.meta.url), "utf8");

test("las anclas viejas de la portada llevan a su lugar nuevo, en los dos idiomas", () => {
  assert.equal(destinoAncla("/", "#funciones"), "/funciones");
  assert.equal(destinoAncla("/", "#compartir"), "/funciones#compartir");
  assert.equal(destinoAncla("/en/", "#confianza"), "/en/seguridad");
  assert.equal(destinoAncla("/en/", "#preguntas"), "/en/acerca#preguntas");
  assert.equal(destinoAncla("/", "#por-que"), null);
  assert.equal(destinoAncla("/", "#lo-nuevo"), null);
  assert.equal(destinoAncla("/descargas", "#funciones"), null);
  assert.equal(destinoAncla("/", "#otra"), null);
});

test("el menú: Producto ▾ con sus 4 páginas, luego Manual, Acerca de y Descargar, en los dos idiomas", () => {
  const textos = (bloque) => [...bloque.matchAll(/text: "([^"]+)"/g)].map((m) => m[1]);
  const nav = (lang) => {
    const inicio = config.indexOf("nav: [", lang === "es" ? 0 : config.indexOf("en: {"));
    return config.slice(inicio, config.indexOf("\n        ],", inicio));
  };
  assert.deepEqual(textos(nav("es")), [
    "Producto",
    "Funciones",
    "Seguridad y privacidad",
    "Comparar",
    "Novedades",
    "Manual",
    "Acerca de",
    "Descargar",
  ]);
  assert.deepEqual(textos(nav("en")), [
    "Product",
    "Features",
    "Security and privacy",
    "Compare",
    "What's new",
    "Manual",
    "About",
    "Download",
  ]);
  assert.match(nav("es"), /link: "\/descargas"/);
  assert.match(nav("en"), /link: "\/en\/descargas"/);
  for (const enlace of nav("en").matchAll(/link: "([^"]+)"/g)) assert.match(enlace[1], /^\/en\//);
  assert.doesNotMatch(config, /"Por qué"|"Why"/);
});

test("el buscador solo indexa el manual", () => {
  const render =
    /_render\(src, env, md\) \{\s*return (\/.+\/)\.test\(env\.relativePath\) \? md\.render\(src, env\) : "";/.exec(
      config,
    );
  assert.ok(render, 'search.options._render con md.render(src, env) en el manual y "" fuera');
  const manual = eval(render[1]);
  for (const ruta of ["manual/inicio.md", "en/manual/arbol.md"]) assert.ok(manual.test(ruta), ruta);
  for (const ruta of ["index.md", "funciones.md", "en/descargas.md", "en/index.md", "acerca.md"])
    assert.ok(!manual.test(ruta), ruta);
});
