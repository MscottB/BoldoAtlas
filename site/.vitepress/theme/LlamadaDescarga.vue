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
  <section class="llamada pieza-arranque" aria-labelledby="descargar">
    <div class="pieza-contenedor">
      <img class="logo" :src="withBase('/icono.png')" alt="" width="72" height="72" loading="lazy" />
      <h2 id="descargar" class="pieza-h2">{{ t.llamada.titulo }}</h2>
      <p class="pieza-bajada">{{ t.llamada.texto }}</p>
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
  border-top: 1px solid var(--vp-c-divider);
  text-align: center;
}
/* la llamada no lleva la cuadrícula, solo el brillo, y dentro de su franja */
.llamada::before {
  display: none;
}
.llamada::after {
  top: 0;
  height: 100%;
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
.pieza-h2 {
  margin: 0 auto;
}
.pieza-bajada {
  margin: 16px auto 0;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin-top: 28px;
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
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 16px;
  border: 1px dashed var(--borde-discontinuo);
  border-radius: 8px;
  background: var(--superficie);
  color: var(--vp-c-text-1);
  font-size: 0.875rem;
  font-weight: 500;
  text-decoration: none;
}
.sistemas a:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}
.nota {
  margin: 16px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
</style>
