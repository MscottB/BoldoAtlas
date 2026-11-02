import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// site/comparador.json: cada dato de otro producto sale de una fuente oficial o dice «No indicado». Sin precios.
const leer = (ruta) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");
const { revisado, productos, fuentes, grupos } = JSON.parse(leer("comparador.json"));
const filas = grupos.flatMap((g) => g.filas);
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
  for (const id of ["boldo-inicio", "boldo-fecha", "boldo-fichas", "boldo-importar"]) {
    const f = fuentes.find((x) => x.id === id);
    assert.ok(f.titulo_en && f.url_en, id);
  }
  for (const id of ["boldo-medicion", "drawio-repo"]) assert.ok(fuentes.find((x) => x.id === id).titulo_en, id);
  const vue = leer(".vitepress/theme/Comparador.vue");
  assert.match(vue, /\(lang === 'en' && f\.url_en\) \|\| f\.url/);
  assert.match(vue, /\(lang === "en" && f\.titulo_en\) \|\| f\.titulo/);
});

test("muestra lo que BoldoAtlas no tiene, sin precios", () => {
  const falta = grupos.find((g) => g.id === "falta").filas.map((f) => f.id);
  for (const id of ["colaboracion", "integracion", "firma", "soporte"]) assert.ok(falta.includes(id), id);
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
  assert.match(leer(".vitepress/theme/Presentacion.vue"), /comparar: "\/comparar"/);
  assert.match(leer(".vitepress/theme/Presentacion.vue"), /comparar: "\/en\/comparar"/);
});
