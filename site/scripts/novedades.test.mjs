import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

// «Lo nuevo» de la portada sale de site/novedades.json: la misma lista en español e inglés, sin versiones ni promesas.
const sitio = new URL("..", import.meta.url);
const repo = new URL("../..", import.meta.url);
const leer = (ruta, base = sitio) => readFileSync(new URL(ruta, base), "utf8");
const novedades = JSON.parse(leer("novedades.json"));

// Lo que la portada no puede decir: versiones, fechas de versión, «Próximamente», fases ni «cumple».
const PROHIBIDO =
  /\b(alpha|alfa|beta)\b|\bv\d+\.\d+|\bversi[oó]n\s+\d|\bversion\s+\d|\d{4}-\d{2}-\d{2}|pr[oó]ximamente|coming soon|\bfase\s+\d|\bphase\s+\d|cumpl[ea]|compl(y|ies)\b/i;

const textos = (nodo) => (typeof nodo === "string" ? [nodo] : Object.values(nodo ?? {}).flatMap(textos));

test("hay entre 1 y 6 novedades, con id único", () => {
  assert.ok(Array.isArray(novedades) && novedades.length >= 1 && novedades.length <= 6);
  const ids = novedades.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("cada novedad trae título y texto en es y en, y una página de la ayuda", () => {
  for (const n of novedades) {
    for (const idioma of ["es", "en"]) {
      for (const campo of ["titulo", "texto"]) {
        assert.ok(n[idioma]?.[campo]?.trim(), `${n.id}: falta ${idioma}.${campo}`);
      }
      assert.ok(existsSync(new URL(`ayuda/${idioma}/${n.pagina}.md`, repo)), `${n.id}: no hay ayuda/${idioma}/${n.pagina}.md`);
      if (n.es.ancla || n.en.ancla) {
        const titulos = [...leer(`ayuda/${idioma}/${n.pagina}.md`, repo).matchAll(/^#{2,3} +(.+)$/gm)].map((m) =>
          m[1].normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        );
        assert.ok(titulos.includes(n[idioma].ancla), `${n.id}: ${idioma}.ancla «${n[idioma].ancla}» no es un título de la ayuda`);
      }
    }
  }
});

test("la imagen, si hay, existe en la ayuda de los dos idiomas y lleva texto alternativo", () => {
  for (const n of novedades.filter((x) => x.imagen)) {
    for (const idioma of ["es", "en"]) {
      assert.ok(existsSync(new URL(`ayuda/img/${idioma}/${n.imagen}.webp`, repo)), `${n.id}: falta ayuda/img/${idioma}/${n.imagen}.webp`);
      assert.ok(n[idioma].alt?.trim(), `${n.id}: falta ${idioma}.alt`);
    }
  }
});

test("ningún texto de la portada tiene versiones, «Próximamente», fases ni «cumple»", () => {
  const fuentes = {
    "novedades.json": textos(novedades),
    "Presentacion.vue": [leer(".vitepress/theme/Presentacion.vue")],
    "index.md": [leer("index.md")],
    "en/index.md": [leer("en/index.md")],
  };
  for (const [archivo, lista] of Object.entries(fuentes)) {
    for (const t of lista) assert.doesNotMatch(t, PROHIBIDO, `${archivo}: «${t.match(PROHIBIDO)?.[0]}»`);
  }
});
