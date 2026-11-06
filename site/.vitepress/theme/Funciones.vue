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
  <div class="funciones">
    <header class="cabecera">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ f.etiqueta }}</p>
        <h1>{{ f.titulo }}</h1>
        <p class="bajada">{{ f.bajada }}</p>
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
      <div class="pieza-contenedor caja">
        <h2 id="comparar">{{ f.comparar.titulo }}</h2>
        <p>{{ f.comparar.texto }}</p>
        <a class="pieza-mas" :href="enlace(t.comunes.rutas.comparar)">{{ f.comparar.enlace }} →</a>
      </div>
    </section>

    <LlamadaDescarga :lang="lang" />
  </div>
</template>

<style scoped>
.funciones {
  background: var(--producto-fondo);
  font-size: 17px;
}
.cabecera {
  padding: 64px 0 48px;
}
@media (min-width: 960px) {
  .cabecera {
    padding: 96px 0 64px;
  }
}
h1 {
  margin: 0;
  max-width: 20ch;
  color: var(--producto-titulo);
  font-size: clamp(2.5rem, 1.6rem + 3.4vw, 3.5rem);
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.bajada {
  max-width: 62ch;
  margin: 20px 0 0;
  color: var(--vp-c-text-2);
  font-size: 1.1875rem;
  line-height: 1.6;
}
.cifras {
  display: grid;
  gap: 16px;
  margin: 40px 0 0;
}
@media (min-width: 640px) {
  .cifras {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}
.cifras div {
  padding: 20px 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--producto-fondo-alt);
}
.cifras dt {
  color: var(--producto-titulo);
  font-size: 2rem;
  line-height: 1.1;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.cifras dd {
  margin: 4px 0 0;
  color: var(--vp-c-text-2);
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
.caja {
  padding-top: 32px;
  padding-bottom: 32px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--producto-fondo-alt);
}
.caja h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--producto-titulo);
  font-size: 1.5rem;
  line-height: 1.25;
  font-weight: 700;
}
.caja p {
  max-width: 62ch;
  margin: 8px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.6;
}
</style>
