<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import datos from "../../comparador.json";

// Comparación con otros productos. Cada dato ajeno sale de comparador.json con su fuente oficial; lo que no se pudo
// confirmar dice «No indicado». Sin precios, sin logos y sin juicios sobre esos productos.
const props = defineProps<{ lang: "es" | "en" }>();

const REPO = "https://github.com/MscottB/BoldoAtlas";

const TEXTOS = {
  es: {
    etiqueta: "Comparación",
    titulo: "BoldoAtlas comparado con otros productos",
    bajada:
      "Para quien lleva el organigrama de una organización: qué ofrece cada producto según su sitio oficial o su documentación.",
    revisado: "Revisado el",
    buenoTitulo: "Lo bueno de BoldoAtlas",
    bueno: [
      "Tus datos quedan en tu computador, sin cuentas ni servidor.",
      "Funciona completa sin internet, y la portable corre desde un pendrive.",
      "Es gratis, sin planes, con el código abierto bajo AGPL-3.0.",
      "El organigrama, los puestos, las fichas y la vista a una fecha están en la misma base.",
      "Medido: 10.000 personas y 1.000 fotos abren en menos de 1 segundo.",
    ],
    tablaTitulo: "Producto por producto",
    leer: "“No indicado” significa que no lo encontramos en las páginas oficiales que revisamos, no que el producto no lo tenga. Muchos datos cambian según el plan y el país. Los números pequeños llevan a la fuente de cada dato.",
    criterio: "Qué comparar",
    noIndicado: "No indicado",
    leyendaTitulo: "Qué significa cada marca",
    niveles: {
      si: { nombre: "Lo ofrece", nota: "" },
      parcial: { nombre: "Con condiciones", nota: "según el plan, solo en la web o en parte" },
      no: { nombre: "No lo ofrece", nota: "o no aplica" },
      ni: { nombre: "No indicado", nota: "no lo encontramos en las fuentes" },
    },
    sinSuma:
      "Las marcas no se suman: cada punto pesa distinto para cada persona. Las filas sin marca solo describen.",
    fuente: "Fuente",
    fuentesTitulo: "Fuentes",
    fuentesTexto: "Sitios oficiales y documentación de cada producto, revisados en la fecha indicada arriba.",
    legalTitulo: "Aviso",
    legal:
      "Visio y Microsoft, Lucidchart, draw.io, OrgChart, Buk y Talana son marcas de sus respectivos dueños, y BoldoAtlas no tiene relación con ellos. Esta comparación es informativa y puede quedar desactualizada. ¿Hay un dato equivocado?",
    seleccion: "Compara una selección de criterios; no es una lista completa de funciones.",
    avisar: "Avísanos en GitHub",
    descargar: "Descargar BoldoAtlas",
    descargas: "/descargas#portable",
    porQue: "Por qué BoldoAtlas",
    inicio: "/#por-que",
  },
  en: {
    etiqueta: "Comparison",
    titulo: "BoldoAtlas compared with other products",
    bajada:
      "For whoever keeps an organization's org chart: what each product offers according to its official site or documentation.",
    revisado: "Reviewed on",
    buenoTitulo: "What's good about BoldoAtlas",
    bueno: [
      "Your data stays on your computer, with no accounts and no server.",
      "It works fully without internet, and the portable version runs from a USB drive.",
      "It's free, with no plans, and its code is open under AGPL-3.0.",
      "The org chart, positions, records and the past-date view are in the same database.",
      "Measured: 10,000 people and 1,000 photos open in under 1 second.",
    ],
    tablaTitulo: "Product by product",
    leer: "“Not stated” means we didn't find it on the official pages we reviewed, not that the product lacks it. Many details change by plan and country. The small numbers lead to the source of each data point.",
    criterio: "What to compare",
    noIndicado: "Not stated",
    leyendaTitulo: "What each mark means",
    niveles: {
      si: { nombre: "Offers it", nota: "" },
      parcial: { nombre: "With conditions", nota: "depends on the plan, web only or in part" },
      no: { nombre: "Doesn't offer it", nota: "or not applicable" },
      ni: { nombre: "Not stated", nota: "we didn't find it in the sources" },
    },
    sinSuma:
      "Marks aren't added up: each point weighs differently for each person. Rows without a mark only describe.",
    fuente: "Source",
    fuentesTitulo: "Sources",
    fuentesTexto: "Official sites and documentation of each product, reviewed on the date shown above.",
    legalTitulo: "Notice",
    legal:
      "Visio and Microsoft, Lucidchart, draw.io, OrgChart, Buk and Talana are trademarks of their respective owners, and BoldoAtlas has no relationship with them. This comparison is informational and may become out of date. Is a detail wrong?",
    seleccion: "Compares a selection of criteria; it isn't a complete feature list.",
    avisar: "Tell us on GitHub",
    descargar: "Download BoldoAtlas",
    descargas: "/en/descargas#portable",
    porQue: "Why BoldoAtlas",
    inicio: "/en/#por-que",
  },
};

const t = computed(() => TEXTOS[props.lang]);
const numero = (id: string) => datos.fuentes.findIndex((f) => f.id === id) + 1;
const nombre = (id: string) => datos.productos.find((p) => p.id === id)?.nombre;
type Nivel = "si" | "parcial" | "no" | "ni";
type Fila = (typeof datos.filas)[number];
const NIVELES: Nivel[] = ["si", "parcial", "no", "ni"];
// Cada marca es favorable para quien usa el producto; la forma cambia además del color.
const ICONOS: Record<Nivel, string> = {
  si: '<circle cx="8" cy="8" r="6.5"/><path d="M5 8.3l2.2 2.2L11 6"/>',
  parcial: '<circle cx="8" cy="8" r="6.5"/><path d="M8 1.5a6.5 6.5 0 0 0 0 13z" fill="currentColor" stroke="none"/>',
  no: '<circle cx="8" cy="8" r="6.5"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  ni: '<circle cx="8" cy="8" r="6.5" stroke-dasharray="2.2 2"/><path d="M5.5 8h5"/>',
};
const RANGO: Record<Nivel, number> = { si: 3, parcial: 2, no: 1, ni: 0 };
const celda = (fila: Fila, producto: string) =>
  (fila.celdas as Record<string, { ni?: boolean; es?: string; en?: string; f?: string[]; nivel: Nivel | null }>)[
    producto
  ];
// Se resalta la celda de BoldoAtlas solo si su marca supera a la de cada uno de los demás en esa fila (sin empates).
const boldoGana = (fila: Fila) => {
  const b = celda(fila, "boldo").nivel;
  return (
    !!b &&
    datos.productos.every((p) => {
      const n = celda(fila, p.id).nivel;
      return p.id === "boldo" || (n !== null && RANGO[n] < RANGO[b]);
    })
  );
};
</script>

<template>
  <article class="comparador">
    <header class="ancho">
      <p class="etiqueta">{{ t.etiqueta }}</p>
      <h1>{{ t.titulo }}</h1>
      <p class="bajada">{{ t.bajada }}</p>
      <p class="revisado">{{ t.revisado }} {{ datos.revisado[lang] }}.</p>
    </header>

    <div class="ancho resumen">
      <section aria-labelledby="lo-bueno">
        <h2 id="lo-bueno">{{ t.buenoTitulo }}</h2>
        <ul>
          <li v-for="b in t.bueno" :key="b">{{ b }}</li>
        </ul>
      </section>
    </div>

    <section class="ancho" aria-labelledby="producto">
      <h2 id="producto">{{ t.tablaTitulo }}</h2>
      <p class="leer">{{ t.leer }}</p>
      <ul class="leyenda" :aria-label="t.leyendaTitulo">
        <li v-for="n in NIVELES" :key="n">
          <span class="sello" :class="`n-${n}`"
            ><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" v-html="ICONOS[n]"
          /></span>
          <span
            ><strong>{{ t.niveles[n].nombre }}</strong
            ><template v-if="t.niveles[n].nota">: {{ t.niveles[n].nota }}</template></span
          >
        </li>
      </ul>
      <p class="leer">{{ t.sinSuma }}</p>
      <div class="marco">
        <table>
          <thead>
            <tr>
              <th scope="col">{{ t.criterio }}</th>
              <th v-for="p in datos.productos" :key="p.id" scope="col" :class="{ nuestra: p.id === 'boldo' }">
                {{ p.nombre }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in datos.filas" :key="fila.id">
              <th scope="row">{{ fila[lang] }}</th>
              <td
                v-for="p in datos.productos"
                :key="p.id"
                :data-col="p.nombre"
                :class="{
                  nuestra: p.id === 'boldo',
                  sin: celda(fila, p.id).ni,
                  mejor: p.id === 'boldo' && boldoGana(fila),
                }"
              >
                <span class="dato">
                  <span v-if="celda(fila, p.id).nivel" class="sello" :class="`n-${celda(fila, p.id).nivel}`">
                    <svg
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                      focusable="false"
                      v-html="ICONOS[celda(fila, p.id).nivel as Nivel]"
                    />
                    <span v-if="!celda(fila, p.id).ni" class="solo-lector"
                      >{{ t.niveles[celda(fila, p.id).nivel as Nivel].nombre }}.
                    </span>
                  </span>
                  <span class="texto">
                    <template v-if="celda(fila, p.id).ni">{{ t.noIndicado }}</template>
                    <template v-else>
                      {{ celda(fila, p.id)[lang]
                      }}<sup v-for="f in celda(fila, p.id).f" :key="f"
                        ><a :href="`#fuente-${f}`" :aria-label="`${t.fuente} ${numero(f)}`">{{ numero(f) }}</a></sup
                      >
                    </template>
                  </span>
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div class="ancho acciones">
      <a class="boton marca" :href="withBase(t.descargas)">{{ t.descargar }} →</a>
      <a class="boton alt" :href="withBase(t.inicio)">{{ t.porQue }}</a>
    </div>

    <section class="ancho fuentes" aria-labelledby="fuentes">
      <h2 id="fuentes">{{ t.fuentesTitulo }}</h2>
      <p class="leer">{{ t.fuentesTexto }}</p>
      <ol>
        <li v-for="f in datos.fuentes" :id="`fuente-${f.id}`" :key="f.id">
          {{ nombre(f.producto) }}:
          <a :href="(lang === 'en' && f.url_en) || f.url" rel="noopener noreferrer" target="_blank">{{
            (lang === "en" && f.titulo_en) || f.titulo
          }}</a>
        </li>
      </ol>
    </section>

    <footer class="ancho legal">
      <h2>{{ t.legalTitulo }}</h2>
      <p>
        {{ t.legal }}
        <a :href="`${REPO}/issues/new`" rel="noopener noreferrer" target="_blank">{{ t.avisar }}</a
        >.
      </p>
      <p>{{ t.seleccion }}</p>
    </footer>
  </article>
</template>

<style scoped>
.comparador {
  padding: 48px 0 72px;
}
.ancho {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
}
@media (min-width: 640px) {
  .ancho {
    padding: 0 48px;
  }
}
.etiqueta {
  margin: 0 0 8px;
  color: var(--vp-c-brand-1);
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h1 {
  margin: 0;
  max-width: 24ch;
  font-size: clamp(2rem, 1.4rem + 2.6vw, 3rem);
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  text-wrap: balance;
}
h2 {
  margin: 0;
  font-size: 1.5rem;
  line-height: 1.25;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--vp-c-text-1);
}
.bajada {
  margin: 16px 0 0;
  max-width: 64ch;
  font-size: 1.125rem;
  line-height: 1.6;
  color: var(--vp-c-text-2);
}
.revisado {
  margin: 12px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
  font-weight: 600;
}
a {
  color: var(--vp-c-brand-1);
}
a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
  border-radius: 4px;
}

.resumen {
  display: grid;
  gap: 16px;
  margin-top: 40px;
  margin-bottom: 48px;
}
.resumen section {
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg-soft);
}
.resumen section {
  border-color: var(--vp-c-brand-3);
  background: var(--vp-c-brand-soft);
}
.resumen h2 {
  font-size: 1.25rem;
}
.resumen ul {
  margin: 12px 0 0;
  padding-left: 20px;
  list-style: disc;
  color: var(--vp-c-text-1);
  line-height: 1.55;
}
.resumen li + li {
  margin-top: 6px;
}
@media (min-width: 960px) {
  .resumen ul {
    columns: 2;
    column-gap: 48px;
  }
  .resumen li {
    break-inside: avoid;
  }
}

.leer {
  margin: 8px 0 0;
  max-width: 80ch;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}

/* tabla ancha: solo ella se desplaza si no cabe, nunca la página */
.marco {
  margin-top: 24px;
  overflow-x: auto;
}
table {
  display: table;
  width: 100%;
  min-width: 1080px;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.45;
}
th,
td {
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--vp-c-divider);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
  color: var(--vp-c-text-1);
}
thead th {
  position: sticky;
  top: 0;
  background: var(--vp-c-bg);
  font-size: 0.875rem;
  font-weight: 650;
}
tbody th {
  font-weight: 600;
}
.nuestra {
  background: var(--vp-c-brand-soft);
  font-weight: 600;
}
thead .nuestra {
  background: var(--vp-c-brand-soft);
  border-radius: 10px 10px 0 0;
  color: var(--vp-c-brand-1);
}
.sin {
  color: var(--vp-c-text-2);
  font-style: italic;
}
/* marcas: la forma (visto, mitad, equis, raya) dice lo mismo que el color; contraste ≥ 4.2:1 sobre el fondo y sobre el tinte de BoldoAtlas */
.comparador {
  --m-si: #1a7f37;
  --m-parcial: #8a5a00;
  --m-no: #b42318;
  --m-ni: #5f6672;
}
:global(.dark) .comparador {
  --m-si: #3fb950;
  --m-parcial: #d4a72c;
  --m-no: #ff8a80;
  --m-ni: #a1a8b3;
}
.sello {
  display: inline-flex;
  flex: none;
  width: 1.125rem;
  height: 1.125rem;
  margin-top: 0.1em;
}
.sello svg {
  width: 100%;
  height: 100%;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.6;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.n-si {
  color: var(--m-si);
}
.n-parcial {
  color: var(--m-parcial);
}
.n-no {
  color: var(--m-no);
}
.n-ni {
  color: var(--m-ni);
}
.dato {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.texto {
  min-width: 0;
}
.solo-lector {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}
/* la celda de BoldoAtlas donde su marca supera a todas las demás */
td.mejor {
  background: var(--vp-c-brand-soft);
  box-shadow: inset 0 0 0 2px var(--vp-c-brand-1);
}
.leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 16px 0 0;
  padding: 12px 16px;
  list-style: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--vp-c-text-1);
}
.leyenda li {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
}
.leyenda + .leer {
  margin-top: 12px;
}
sup {
  margin-left: 2px;
  font-size: 0.7em;
  font-style: normal;
  font-weight: 500;
}
sup + sup {
  margin-left: 4px;
}
sup a {
  padding: 2px;
}

/* en angosto cada criterio es una tarjeta, con el nombre de cada producto al lado de su dato */
@media (max-width: 959px) {
  .marco {
    overflow: visible;
  }
  table,
  tbody,
  tr,
  th,
  td {
    display: block;
  }
  table {
    min-width: 0;
    font-size: 0.875rem;
  }
  thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  tbody tr {
    margin-top: 12px;
    border: 1px solid var(--vp-c-divider);
    border-radius: 12px;
    overflow: hidden;
  }
  tbody th[scope="row"] {
    background: var(--vp-c-bg-soft);
    font-size: 0.9375rem;
  }
  td {
    display: grid;
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 12px;
  }
  td::before {
    content: attr(data-col);
    color: var(--vp-c-text-2);
    font-style: normal;
    font-weight: 500;
  }
  td.nuestra::before {
    color: var(--vp-c-brand-1);
    font-weight: 700;
  }
  tr > :last-child {
    border-bottom: 0;
  }
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 32px;
}
.boton {
  display: inline-flex;
  align-items: center;
  padding: 12px 24px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 600;
  text-decoration: none;
  transition: background-color 0.2s;
}
.boton.marca {
  background: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
}
.boton.marca:hover {
  background: var(--vp-button-brand-hover-bg);
}
.boton.alt {
  background: var(--vp-button-alt-bg);
  color: var(--vp-button-alt-text);
  border-color: var(--vp-button-alt-border);
}
.boton.alt:hover {
  background: var(--vp-button-alt-hover-bg);
}

.fuentes {
  margin-top: 56px;
}
.fuentes ol {
  margin: 16px 0 0;
  padding-left: 28px;
  list-style: decimal;
  font-size: 0.875rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}
.fuentes li {
  margin-top: 4px;
  overflow-wrap: anywhere;
  scroll-margin-top: 88px;
}
.fuentes li:target {
  color: var(--vp-c-text-1);
  font-weight: 600;
}
@media (min-width: 960px) {
  .fuentes ol {
    columns: 2;
    column-gap: 48px;
  }
  .fuentes li {
    break-inside: avoid;
  }
}

.legal {
  margin-top: 48px;
}
.legal h2 {
  font-size: 1rem;
}
.legal p {
  margin: 8px 0 0;
  max-width: 80ch;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
  line-height: 1.6;
}
</style>
