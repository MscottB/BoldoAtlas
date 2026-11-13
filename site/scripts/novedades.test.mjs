import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PORTADA, portada } from "../.vitepress/theme/portadaNovedades.ts";
import { PROHIBIDO, slugTitulo } from "./reglas.mjs";

// site/novedades.json es la lista completa (la más nueva primero, sin máximo; nada se quita): la misma lista en español
// e inglés, sin versiones ni promesas. La portada muestra las 3 primeras y la página «Todas las novedades», todas.
const sitio = new URL("..", import.meta.url);
const repo = new URL("../..", import.meta.url);
const leer = (ruta, base = sitio) => readFileSync(new URL(ruta, base), "utf8");
const novedades = JSON.parse(leer("novedades.json"));
const comparador = JSON.parse(leer("comparador.json"));

test("la prueba de palabras prohibidas detecta cada una", () => {
  for (const p of [
    "alpha",
    "beta",
    "v0.1",
    "versión 0",
    "Próximamente",
    "Coming soon",
    "Por ahora",
    "for now",
    "Fase 3",
    "cumple",
    "comply",
  ])
    assert.match(p, PROHIBIDO, p);
  assert.doesNotMatch("te ayuda a cumplir", PROHIBIDO);
});

test("ninguna novedad se quita: novedades.json acumula", () => {
  const ids = novedades.map((n) => n.id);
  for (const id of [
    "ver-al-lado",
    "vista-dividida",
    "varias-organizaciones",
    "zonas",
    "version-a-la-vista",
    "fotos-livianas",
    "lineas-e-interaccion",
    "revisar-y-decidir",
    "inicio-con-resumen",
    "exportar-importar",
    "bandeja",
    "actualizaciones",
    "ayuda-visual",
  ])
    assert.ok(ids.includes(id), `falta ${id}`);
});

const textos = (nodo) => (typeof nodo === "string" ? [nodo] : Object.values(nodo ?? {}).flatMap(textos));

test("hay al menos una novedad, y ninguna con id repetido", () => {
  assert.ok(Array.isArray(novedades) && novedades.length >= 1);
  const ids = novedades.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("la portada toma solo las 3 primeras, en orden, y la página nueva las muestra todas", () => {
  assert.equal(PORTADA, 3);
  const lista = Array.from({ length: 9 }, (_, i) => ({ id: `n${i}` }));
  assert.deepEqual(
    portada(lista).map((n) => n.id),
    ["n0", "n1", "n2"],
  );
  assert.deepEqual(portada(lista.slice(0, 2)), lista.slice(0, 2));
  assert.deepEqual(portada([]), []);
  // los componentes usan esa función y no cortan la lista por su cuenta
  assert.match(leer(".vitepress/theme/Novedades.vue"), /ultimas \? portada\(novedades\) : novedades/);
  assert.match(leer(".vitepress/theme/Inicio.vue"), /<Novedades :lang="lang" ultimas \/>/);
  for (const [md, idioma] of [
    ["novedades.md", "es"],
    ["en/novedades.md", "en"],
  ]) {
    assert.match(
      leer(md),
      new RegExp(`<Novedades lang="${idioma}" />`),
      `${md}: debe mostrar la lista completa`,
    );
  }
});

test("la portada enlaza a todas las novedades solo si hay más de 3", () => {
  const vue = leer(".vitepress/theme/Inicio.vue");
  assert.match(vue, /v-if="hayMas"[^>]*:href="enlace\(t\.comunes\.rutas\.novedades\)"/);
  assert.match(vue, /const hayMas = novedades\.length > PORTADA/);
  assert.equal(JSON.parse(leer("textos/es/comunes.json")).rutas.novedades, "/novedades");
  assert.equal(JSON.parse(leer("textos/en/comunes.json")).rutas.novedades, "/en/novedades");
});

test("cada novedad trae título y texto en es y en, y una página de la ayuda", () => {
  for (const n of novedades) {
    for (const idioma of ["es", "en"]) {
      for (const campo of ["titulo", "texto"]) {
        assert.ok(n[idioma]?.[campo]?.trim(), `${n.id}: falta ${idioma}.${campo}`);
      }
      assert.ok(
        existsSync(new URL(`ayuda/${idioma}/${n.pagina}.md`, repo)),
        `${n.id}: no hay ayuda/${idioma}/${n.pagina}.md`,
      );
      if (n.es.ancla || n.en.ancla) {
        const titulos = [...leer(`ayuda/${idioma}/${n.pagina}.md`, repo).matchAll(/^#{2,3} +(.+)$/gm)].map(
          (m) => slugTitulo(m[1]),
        );
        assert.ok(
          titulos.includes(n[idioma].ancla),
          `${n.id}: ${idioma}.ancla «${n[idioma].ancla}» no es un título de la ayuda`,
        );
      }
    }
  }
});

test("la vista dividida: «Dividir» abre al lado la misma vista, y la otra se elige en ese panel", () => {
  const n = novedades.find((x) => x.id === "vista-dividida");
  assert.match(n.es.texto, /la misma vista/);
  assert.match(n.en.texto, /the same view/);
  assert.doesNotMatch(n.es.texto, /al lado del Directorio/);
  assert.doesNotMatch(n.en.texto, /beside the Directory/);
});

test("otra organización al lado: se ve sin modificarla, en la sección de Organizaciones", () => {
  const n = novedades.find((x) => x.id === "ver-al-lado");
  assert.equal(n.pagina, "organizaciones");
  assert.equal(n.es.titulo, "Otra organización al lado");
  assert.equal(n.en.titulo, "Another organization side by side");
  assert.equal(n.es.ancla, "ver-al-lado");
  assert.equal(n.en.ancla, "view-side-by-side");
  assert.match(n.es.texto, /sin modificarla/);
  assert.match(n.en.texto, /without changing it/);
});

test("la imagen, si hay, existe en la ayuda de los dos idiomas y lleva texto alternativo", () => {
  for (const n of novedades.filter((x) => x.imagen)) {
    for (const idioma of ["es", "en"]) {
      assert.ok(
        existsSync(new URL(`ayuda/img/${idioma}/${n.imagen}.webp`, repo)),
        `${n.id}: falta ayuda/img/${idioma}/${n.imagen}.webp`,
      );
      assert.ok(n[idioma].alt?.trim(), `${n.id}: falta ${idioma}.alt`);
    }
  }
});

test("ningún texto de la portada tiene versiones, «Próximamente», fases ni «cumple»", () => {
  const fuentes = {
    "novedades.json": textos(novedades),
    "Novedades.vue": [leer(".vitepress/theme/Novedades.vue")],
    ...Object.fromEntries(
      ["Inicio", "Funciones", "Seguridad", "Portada", "BloqueFuncion", "Garantias", "LlamadaDescarga"].map(
        (c) => [`${c}.vue`, [leer(`.vitepress/theme/${c}.vue`)]],
      ),
    ),
    "index.md": [leer("index.md")],
    "en/index.md": [leer("en/index.md")],
    "funciones.md": [leer("funciones.md")],
    "en/funciones.md": [leer("en/funciones.md")],
    "seguridad.md": [leer("seguridad.md")],
    "en/seguridad.md": [leer("en/seguridad.md")],
    "novedades.md": [leer("novedades.md")],
    "en/novedades.md": [leer("en/novedades.md")],
    "descargas.md": [leer("descargas.md")],
    "en/descargas.md": [leer("en/descargas.md")],
    "acerca.md": [leer("acerca.md")],
    "en/acerca.md": [leer("en/acerca.md")],
    // sin las URL de las fuentes: una puede traer una fecha en su nombre
    "comparador.json": textos({
      ...comparador,
      fuentes: comparador.fuentes.map((f) => [f.titulo, f.titulo_en]),
    }),
    "Comparador.vue": [leer(".vitepress/theme/Comparador.vue")],
  };
  for (const [archivo, lista] of Object.entries(fuentes)) {
    for (const t of lista) assert.doesNotMatch(t, PROHIBIDO, `${archivo}: «${t.match(PROHIBIDO)?.[0]}»`);
  }
});
