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
// Los textos salen de site/textos/<idioma>/; las anclas #por-que, #funciones y #lo-nuevo siguen en esta página.
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang));
const destacadas = computed(() =>
  t.value.inicio.destacadas.ids.map((id) => t.value.funciones.items.find((f) => f.id === id)!),
);
const hayMas = novedades.length > PORTADA;
</script>

<template>
  <div class="inicio">
    <Portada :lang="lang" />

    <section class="seccion alterna" aria-labelledby="por-que">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ t.inicio.beneficios.etiqueta }}</p>
        <h2 id="por-que">{{ t.inicio.beneficios.titulo }}</h2>
        <ul class="beneficios" role="list">
          <li v-for="b in t.inicio.beneficios.items" :key="b.titulo">
            <h3>{{ b.titulo }}</h3>
            <p>{{ b.texto }}</p>
            <a class="pieza-mas" :href="enlace(b.enlace.href)">{{ b.enlace.texto }} →</a>
          </li>
        </ul>
      </div>
    </section>

    <section class="seccion" aria-labelledby="funciones">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ t.inicio.destacadas.etiqueta }}</p>
        <h2 id="funciones">{{ t.inicio.destacadas.titulo }}</h2>
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

    <section class="seccion alterna" aria-labelledby="lo-nuevo">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ t.inicio.nuevo.etiqueta }}</p>
        <h2 id="lo-nuevo">{{ t.inicio.nuevo.titulo }}</h2>
        <Novedades :lang="lang" ultimas />
        <a v-if="hayMas" class="pieza-mas todas" :href="enlace(t.comunes.rutas.novedades)"
          >{{ t.inicio.nuevo.todas }} ({{ novedades.length }}) →</a
        >
      </div>
    </section>

    <Garantias :items="t.inicio.garantias.items" />

    <LlamadaDescarga :lang="lang" />
  </div>
</template>

<style scoped>
.inicio {
  background: var(--producto-fondo);
  font-size: 17px;
}
.seccion {
  padding: 64px 0;
}
.seccion.alterna {
  background: var(--producto-fondo-alt);
}
@media (min-width: 960px) {
  .seccion {
    padding: 96px 0;
  }
}
h2 {
  margin: 0;
  max-width: 28ch;
  padding: 0;
  border: 0;
  color: var(--producto-titulo);
  font-size: clamp(1.75rem, 1.2rem + 2.2vw, 2.5rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.beneficios {
  display: grid;
  gap: 16px;
  margin: 40px 0 0;
  padding: 0;
  list-style: none;
}
@media (min-width: 768px) {
  .beneficios {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
}
.beneficios li {
  display: flex;
  flex-direction: column;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-top: 3px solid var(--vp-c-brand-3);
  border-radius: 12px;
  background: var(--producto-fondo);
}
.beneficios h3 {
  margin: 0;
  color: var(--producto-titulo);
  font-size: 1.1875rem;
  line-height: 1.3;
  font-weight: 650;
  letter-spacing: -0.01em;
}
.beneficios p {
  flex: 1;
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.beneficios .pieza-mas {
  margin-top: 12px;
}
.destacadas {
  display: grid;
  gap: 64px;
  margin-top: 48px;
}
@media (min-width: 960px) {
  .destacadas {
    gap: 96px;
  }
}
.pieza-mas.todas {
  margin-top: 40px;
}
</style>
