<script setup lang="ts">
import { computed } from "vue";
import BloqueFuncion from "./BloqueFuncion.vue";
import { enlace } from "./imagenes";
import LlamadaDescarga from "./LlamadaDescarga.vue";
import { textos } from "./textos";
import type { Lang } from "./tipos";

// Página Funciones: cabecera, cifras medidas, las diez funciones con su captura y la caja de la comparación.
// Cada función lleva como ancla su id (los enlaces de Inicio y de las redirecciones apuntan a ellos).
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang));
const f = computed(() => t.value.funciones);
</script>

<template>
  <main class="funciones">
    <header class="cabecera pieza-arranque">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ f.etiqueta }}</p>
        <h1 class="pieza-titulo">{{ f.titulo }}</h1>
        <p class="pieza-bajada">{{ f.bajada }}</p>
        <dl class="cifras">
          <div v-for="c in f.cifras" :key="c.valor">
            <dt>{{ c.valor }}</dt>
            <dd>{{ c.texto }}</dd>
          </div>
        </dl>
        <p class="nota">{{ f.nota }}</p>
      </div>
    </header>

    <section class="lista">
      <div class="pieza-contenedor">
        <BloqueFuncion
          v-for="(fn, i) in f.items"
          :key="fn.id"
          :lang="lang"
          :funcion="fn"
          :inverso="i % 2 === 1"
        />
      </div>
    </section>

    <section class="comparar" aria-labelledby="comparar">
      <div class="pieza-contenedor">
        <div class="pieza-tarjeta caja">
          <h2 id="comparar">{{ f.comparar.titulo }}</h2>
          <p>{{ f.comparar.texto }}</p>
          <a class="pieza-mas" :href="enlace(t.comunes.rutas.comparar)">{{ f.comparar.enlace }} →</a>
        </div>
      </div>
    </section>

    <LlamadaDescarga :lang="lang" />
  </main>
</template>

<style scoped>
.cabecera {
  padding: 64px 0 48px;
}
@media (min-width: 960px) {
  .cabecera {
    padding: 88px 0 64px;
  }
}
/* las cifras medidas en una franja de borde discontinuo, como las de Tramtai */
.cifras {
  display: grid;
  margin: 40px 0 0;
  border: 1px dashed var(--borde-discontinuo);
  border-radius: var(--radio);
  background: var(--superficie);
}
.cifras div {
  padding: 20px 24px;
}
.cifras div + div {
  border-top: 1px dashed var(--borde-discontinuo);
}
@media (min-width: 640px) {
  .cifras {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .cifras div + div {
    border-top: 0;
    border-left: 1px dashed var(--borde-discontinuo);
  }
}
.cifras dt {
  color: var(--vp-c-text-1);
  font-size: 2.5rem;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.cifras dd {
  margin: 6px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.4;
}
.nota {
  max-width: 70ch;
  margin: 16px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
  line-height: 1.5;
}
.lista {
  padding: 32px 0 64px;
}
.lista .pieza-contenedor {
  display: grid;
  gap: 72px;
}
@media (min-width: 960px) {
  .lista .pieza-contenedor {
    gap: 112px;
  }
}
/* el menú fijo no tapa el título de la función a la que lleva un ancla */
.lista :deep(.bloque) {
  scroll-margin-top: 88px;
}
.comparar {
  padding: 0 0 64px;
}
.caja h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--vp-c-text-1);
  font-size: 1.5rem;
}
.caja p {
  max-width: 62ch;
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
.caja .pieza-mas {
  margin-top: 12px;
}
</style>
