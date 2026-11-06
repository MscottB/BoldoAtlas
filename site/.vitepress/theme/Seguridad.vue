<script setup lang="ts">
import { computed } from "vue";
import { ICONOS } from "./iconos";
import { enlace } from "./imagenes";
import LlamadaDescarga from "./LlamadaDescarga.vue";
import { textos } from "./textos";
import type { Enlace, Lang } from "./tipos";

// Página Seguridad y privacidad: cabecera y una sección por tema. Su id es el ancla (las garantías de Inicio
// apuntan a ellas). Cada frase sale de SECURITY.md (solo «Qué protege hoy la app» y «Cómo reportar»), del
// manual (ayuda/<idioma>/*.md), de site/descargas.md o de los textos de confianza ya aprobados del sitio.
const props = defineProps<{ lang: Lang }>();

const s = computed(() => textos(props.lang).seguridad);
const enlaces = (e?: Enlace | Enlace[]) => (e ? [e].flat() : []);
</script>

<template>
  <div class="seguridad">
    <header class="cabecera">
      <div class="pieza-contenedor">
        <p class="pieza-etiqueta">{{ s.etiqueta }}</p>
        <h1>{{ s.titulo }}</h1>
        <p class="bajada">{{ s.bajada }}</p>
      </div>
    </header>

    <div class="pieza-contenedor lista">
      <section v-for="sec in s.secciones" :key="sec.id" class="seccion" :aria-labelledby="sec.id">
        <h2 :id="sec.id">{{ sec.titulo }}</h2>
        <div class="cuerpo">
          <p v-for="p in sec.parrafos" :key="p">{{ p }}</p>
          <ul v-if="sec.puntos" class="puntos" role="list">
            <li v-for="p in sec.puntos" :key="p">
              <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ p }}
            </li>
          </ul>
          <p v-if="sec.enlace" class="enlaces">
            <a v-for="e in enlaces(sec.enlace)" :key="e.href" class="pieza-mas" :href="enlace(e.href)"
              >{{ e.texto }} →</a
            >
          </p>
        </div>
      </section>
    </div>

    <LlamadaDescarga :lang="lang" />
  </div>
</template>

<style scoped>
.cabecera {
  padding: 64px 0 32px;
}
@media (min-width: 960px) {
  .cabecera {
    padding: 96px 0 48px;
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
.lista {
  padding-bottom: 72px;
}
.seccion {
  display: grid;
  gap: 12px;
  padding: 32px 0;
  border-top: 1px solid var(--vp-c-divider);
}
@media (min-width: 960px) {
  .seccion {
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    gap: 48px;
  }
}
h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: var(--producto-titulo);
  font-size: 1.5rem;
  line-height: 1.25;
  font-weight: 700;
  text-wrap: balance;
  scroll-margin-top: 88px; /* el menú fijo no tapa el título al llegar por un ancla */
}
.cuerpo {
  max-width: 68ch;
}
.cuerpo p {
  margin: 0 0 12px;
  color: var(--vp-c-text-1);
  line-height: 1.65;
}
.puntos {
  margin: 4px 0 12px;
  padding: 0;
  list-style: none;
}
.puntos li {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  line-height: 1.55;
  color: var(--vp-c-text-1);
}
.puntos .trazo {
  flex: none;
  margin-top: 0.25em;
  color: var(--vp-c-brand-1);
}
.cuerpo .enlaces {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  margin: 4px 0 0;
}
</style>
