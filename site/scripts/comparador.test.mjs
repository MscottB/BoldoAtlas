import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// site/comparador.json: cada dato de otro producto sale de una fuente oficial o dice «No indicado». Sin precios.
const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const { revisado, productos, fuentes, filas } = JSON.parse(leer("comparador.json"));
const DOMINIOS = {
  boldo: ["mscottb.github.io", "github.com"],
  visio: ["www.microsoft.com"],
  lucid: ["help.lucid.co"],
  drawio: ["www.drawio.com", "github.com"],
  orgchart: ["theorgchart.com"],
  buk: ["www.buk.cl", "supportcenter.buk.cl"],
  talana: ["web.talana.com", "ayuda.talana.com"],
};

test("muestra la fecha de revisión en los dos idiomas", () => {
  assert.ok(revisado.es && revisado.en);
});

test("cada fila cubre todos los productos: un dato en dos idiomas con fuente, o «No indicado»", () => {
  const ids = new Set(fuentes.map((f) => f.id));
  for (const fila of filas) {
    assert.ok(fila.es && fila.en, fila.id);
    assert.deepEqual(Object.keys(fila.celdas), productos.map((p) => p.id), fila.id);
    for (const [producto, celda] of Object.entries(fila.celdas)) {
      if (celda.ni) continue;
      assert.ok(celda.es && celda.en, `${fila.id}/${producto}: falta el texto`);
      assert.ok(celda.f?.length, `${fila.id}/${producto}: falta la fuente`);
      for (const f of celda.f) {
        assert.ok(ids.has(f), `${fila.id}/${producto}: la fuente ${f} no existe`);
        assert.equal(fuentes.find((x) => x.id === f).producto, producto, `${fila.id}/${producto}: ${f} es de otro producto`);
      }
    }
  }
});

test("las fuentes son de los sitios oficiales de cada producto, y todas se usan", () => {
  const usadas = new Set(filas.flatMap((fila) => Object.values(fila.celdas).flatMap((c) => c.f ?? [])));
  for (const f of fuentes) {
    const url = new URL(f.url);
    assert.equal(url.protocol, "https:", f.id);
    assert.ok(DOMINIOS[f.producto].includes(url.hostname), `${f.id}: ${url.hostname} no es oficial`);
    if (url.hostname === "github.com") assert.match(url.pathname, /^\/(MscottB\/BoldoAtlas|jgraph\/drawio-desktop)(\/|$)/, f.id);
    assert.ok(usadas.has(f.id), `${f.id}: no la usa ningún dato`);
    if (f.url_en) assert.ok(f.url_en.startsWith("https://mscottb.github.io/BoldoAtlas/en/"), `${f.id}: url_en`);
  }
});

test("en inglés, las fuentes de BoldoAtlas en español traen título y enlace propios", () => {
  for (const id of ["boldo-inicio", "boldo-fecha", "boldo-fichas"]) {
    const f = fuentes.find((x) => x.id === id);
    assert.ok(f.titulo_en && f.url_en, id);
  }
  for (const id of ["boldo-medicion", "drawio-repo"]) assert.ok(fuentes.find((x) => x.id === id).titulo_en, id);
  const vue = leer(".vitepress/theme/Comparador.vue");
  assert.match(vue, /\(lang === 'en' && f\.url_en\) \|\| f\.url/);
  assert.match(vue, /\(lang === "en" && f\.titulo_en\) \|\| f\.titulo/);
});

const celdas = filas.flatMap((fila) => Object.entries(fila.celdas).map(([producto, c]) => ({ fila, producto, c })));

test("todo «nivel» es válido: si, parcial, no, ni, o null si la celda solo describe", () => {
  for (const { fila, producto, c } of celdas) {
    assert.ok("nivel" in c, `${fila.id}/${producto}: falta el nivel`);
    assert.ok(["si", "parcial", "no", "ni", null].includes(c.nivel), `${fila.id}/${producto}: nivel «${c.nivel}»`);
  }
});

test("«No indicado» / «Not stated» es siempre «ni», nunca «no»", () => {
  for (const { fila, producto, c } of celdas) {
    const dice = c.ni || /^(No indicado|Not stated)\.?$/.test(c.es ?? "") || /^(No indicado|Not stated)\.?$/.test(c.en ?? "");
    if (dice) assert.equal(c.nivel, "ni", `${fila.id}/${producto}`);
    else assert.notEqual(c.nivel, undefined, `${fila.id}/${producto}`);
  }
});

test("«No aplica» / «Not applicable» es «no»", () => {
  for (const { fila, producto, c } of celdas)
    if (/^(No aplica|Not applicable)\b/.test(c.es ?? "")) assert.equal(c.nivel, "no", `${fila.id}/${producto}`);
});

test("una fila o es descriptiva (sin marcas, salvo «No indicado») o lleva marca en todas sus celdas", () => {
  for (const fila of filas) {
    const propias = Object.values(fila.celdas).filter((c) => !c.ni);
    const sinMarca = propias.filter((c) => c.nivel === null).length;
    assert.ok(sinMarca === 0 || sinMarca === propias.length, `${fila.id}: mezcla celdas con y sin marca`);
  }
});

test("español e inglés coinciden: mismas filas, mismos textos con fuente y mismas claves en la página", () => {
  for (const fila of filas) {
    assert.ok(fila.es && fila.en, fila.id);
    for (const [producto, c] of Object.entries(fila.celdas)) {
      assert.equal(Boolean(c.es), Boolean(c.en), `${fila.id}/${producto}: texto en un solo idioma`);
      // las cifras no cambian de un idioma al otro (10.000 / 10,000 cuentan igual)
      const cifras = (t) => t?.match(/\d+(?:[.,]\d+)*/g)?.map((n) => n.replace(/[.,]/g, ""));
      assert.deepEqual(cifras(c.es), cifras(c.en), `${fila.id}/${producto}: cifras distintas`);
    }
  }
  const vue = leer(".vitepress/theme/Comparador.vue");
  const claves = (bloque) => [...bloque.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
  const [es, en] = vue.split(/\n {2}en: \{/).map((parte, i) => (i === 0 ? parte.split(/\n {2}es: \{/)[1] : parte));
  assert.deepEqual(claves(es), claves(en.split("\n};")[0]));
  assert.match(vue, /Lo ofrece/);
  assert.match(vue, /Offers it/);
});

test("sin precios", () => {
  for (const fila of filas)
    for (const c of Object.values(fila.celdas))
      assert.doesNotMatch(`${c.es ?? ""} ${c.en ?? ""}`, /[$€£]|\b(USD|CLP|UF)\b/, fila.id);
});

test("la página existe en los dos idiomas, sin logos ajenos, con aviso legal y modo de avisar errores", () => {
  assert.match(leer("comparar.md"), /<Comparador lang="es" \/>/);
  assert.match(leer("en/comparar.md"), /<Comparador lang="en" \/>/);
  const vue = leer(".vitepress/theme/Comparador.vue");
  assert.doesNotMatch(vue, /<img/);
  assert.match(vue, /issues\/new/);
  assert.match(vue, /marcas de sus respectivos dueños/);
  assert.match(vue, /trademarks of their respective owners/);
  // sin todas las funciones de cada producto, la tabla engañaría por omisión si no lo dice
  assert.match(vue, /Compara una selección de criterios; no es una lista completa de funciones\./);
  assert.match(vue, /Compares a selection of criteria; it isn't a complete feature list\./);
  assert.equal(JSON.parse(leer("textos/es/comunes.json")).rutas.comparar, "/comparar");
  assert.equal(JSON.parse(leer("textos/en/comunes.json")).rutas.comparar, "/en/comparar");
});
