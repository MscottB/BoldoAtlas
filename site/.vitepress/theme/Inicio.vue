<script setup lang="ts">
import { computed } from "vue";
import novedades from "../../novedades.json";
import BloqueFuncion from "./BloqueFuncion.vue";
import Garantias from "./Garantias.vue";
import { enlace } from "./imagenes";
import LlamadaDescarga from "./LlamadaDescarga.vue";
import Novedades from "./Novedades.vue";
import Portada from "./Portada.vue";
import { PORTADA } from "./portadaNovedades";
import { textos } from "./textos";
import type { Lang } from "./tipos";

// Inicio: portada, por qué, tres funciones destacadas, lo nuevo, garantías y llamada a descargar.
// Los textos salen de site/textos/<idioma>/; las anclas #por-que y #lo-nuevo siguen en esta página; #funciones solo nombra la sección (anclasViejas lo lleva a /funciones).
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang));
const destacadas = computed(() =>
  t.value.inicio.destacadas.ids.map((id) => t.value.funciones.items.find((f) => f.id === id)!),
);
const hayMas = novedades.length > PORTADA;
</script>

<template>
  <main class="inicio">
    <Portada :lang="lang" />

    <section class="seccion" aria-labelledby="por-que">
      <div class="pieza-contenedor">
        <header class="pieza-cabeza">
          <p class="pieza-etiqueta">{{ t.inicio.beneficios.etiqueta }}</p>
          <h2 id="por-que" class="pieza-h2">{{ t.inicio.beneficios.titulo }}</h2>
        </header>
        <ul class="beneficios" role="list">
          <li v-for="b in t.inicio.beneficios.items" :key="b.titulo" class="pieza-tarjeta">
            <h3>{{ b.titulo }}</h3>
            <p>{{ b.texto }}</p>
            <a class="pieza-mas" :href="enlace(b.enlace.href)">{{ b.enlace.texto }} →</a>
          </li>
        </ul>
      </div>
    </section>

    <section class="seccion" aria-labelledby="funciones">
      <div class="pieza-contenedor">
        <header class="pieza-cabeza">
          <p class="pieza-etiqueta">{{ t.inicio.destacadas.etiqueta }}</p>
          <h2 id="funciones" class="pieza-h2">{{ t.inicio.destacadas.titulo }}</h2>
        </header>
        <div class="destacadas">
          <BloqueFuncion
            v-for="(f, i) in destacadas"
            :key="f.id"
            :lang="lang"
            :funcion="f"
            :inverso="i % 2 === 1"
            resumen
          />
        </div>
        <a class="pieza-mas todas" :href="enlace(t.comunes.rutas.funciones)"
          >{{ t.inicio.destacadas.todas }} →</a
        >
      </div>
    </section>

    <section class="seccion lo-nuevo" aria-labelledby="lo-nuevo">
      <div class="pieza-contenedor">
        <header class="pieza-cabeza">
          <p class="pieza-etiqueta">{{ t.inicio.nuevo.etiqueta }}</p>
          <h2 id="lo-nuevo" class="pieza-h2">{{ t.inicio.nuevo.titulo }}</h2>
        </header>
        <Novedades :lang="lang" ultimas />
        <a v-if="hayMas" class="pieza-mas todas" :href="enlace(t.comunes.rutas.novedades)"
          >{{ t.inicio.nuevo.todas }} ({{ novedades.length }}) →</a
        >
      </div>
    </section>

    <Garantias :items="t.inicio.garantias.items" />

    <LlamadaDescarga :lang="lang" />
  </main>
</template>

<style scoped>
.seccion {
  padding: 56px 0;
}
@media (min-width: 960px) {
  .seccion {
    padding: 80px 0;
  }
}
.beneficios {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 768px) {
  .beneficios {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.beneficios li {
  display: flex;
  flex-direction: column;
}
.beneficios h3 {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: 1.25rem;
  letter-spacing: -0.01em;
}
.beneficios p {
  flex: 1;
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.6;
}
.beneficios .pieza-mas {
  margin-top: 12px;
}
.destacadas {
  display: grid;
  gap: 64px;
}
@media (min-width: 960px) {
  .destacadas {
    gap: 96px;
  }
}
/* en Inicio cada novedad va en su fila: la que tiene captura, sola en la suya, la mostraría enorme */
.lo-nuevo :deep(.con-imagen) {
  flex-basis: 100%;
}
@media (min-width: 768px) {
  .lo-nuevo :deep(.con-imagen) {
    flex-direction: row;
  }
  .lo-nuevo :deep(.con-imagen img) {
    flex: none;
    width: 40%;
    border-bottom: 0;
    border-right: 1px solid var(--vp-c-divider);
  }
}
.pieza-mas.todas {
  margin-top: 40px;
}
</style>
