<script setup lang="ts">
import { computed } from "vue";
import { withBase } from "vitepress";
import { ICONOS } from "./iconos";
import { enlace } from "./imagenes";
import { textos } from "./textos";
import type { Lang } from "./tipos";

// Llamada a descargar: la portable (recomendada) y el manual, con un acceso por sistema a la misma descarga.
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang).comunes);
const portable = computed(() => enlace(`${t.value.rutas.descargas}#portable`));
const SISTEMAS = ["Windows", "Linux", "macOS"];
</script>

<template>
  <section class="llamada" aria-labelledby="descargar">
    <div class="pieza-contenedor">
      <img class="logo" :src="withBase('/icono.png')" alt="" width="72" height="72" loading="lazy" />
      <h2 id="descargar">{{ t.llamada.titulo }}</h2>
      <p class="bajada">{{ t.llamada.texto }}</p>
      <div class="acciones">
        <a class="pieza-boton marca" :href="portable">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.descargar" />
          {{ t.llamada.descargar }} <small>({{ t.llamada.recomendada }})</small>
        </a>
        <a class="pieza-boton alt" :href="enlace(t.rutas.manual)">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.manual" />{{
            t.llamada.manual
          }}
        </a>
      </div>
      <ul class="sistemas" role="list">
        <li v-for="s in SISTEMAS" :key="s">
          <a :href="portable" :aria-label="`${s}: ${t.llamada.para}`">{{ s }}</a>
        </li>
      </ul>
      <p class="nota">{{ t.llamada.nota }}</p>
    </div>
  </section>
</template>

<style scoped>
.llamada {
  padding: 72px 0;
  text-align: center;
  background:
    radial-gradient(60% 80% at 50% 0%, rgba(200, 116, 63, 0.18), transparent 70%), var(--producto-fondo);
}
@media (min-width: 960px) {
  .llamada {
    padding: 96px 0;
  }
}
.logo {
  display: block;
  margin: 0 auto 20px;
  border-radius: 16px;
}
.dark .logo {
  padding: 8px;
  background: #e6ebf1; /* el azul del logo no se ve sobre fondo oscuro */
}
h2 {
  margin: 0 auto;
  max-width: 24ch;
  padding: 0;
  border: 0;
  color: var(--producto-titulo);
  font-size: clamp(1.75rem, 1.2rem + 2.2vw, 2.5rem);
  line-height: 1.15;
  font-weight: 700;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.bajada {
  margin: 16px auto 0;
  max-width: 60ch;
  color: var(--vp-c-text-2);
  font-size: 1.125rem;
  line-height: 1.6;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 32px;
}
.acciones small {
  font-weight: 500;
}
.sistemas {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin: 20px 0 0;
  padding: 0;
  list-style: none;
}
.sistemas a {
  display: inline-block;
  padding: 6px 14px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}
.sistemas a:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.sistemas a:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.nota {
  margin: 16px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
</style>
