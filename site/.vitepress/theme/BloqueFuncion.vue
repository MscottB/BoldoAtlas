<script setup lang="ts">
import { computed } from "vue";
import { ICONOS } from "./iconos";
import { enlace, fuenteImagen } from "./imagenes";
import { textos } from "./textos";
import type { Funcion, Lang } from "./tipos";

// Una función con su captura, alternando el lado con `inverso`. Completa (página Funciones): con id, h2, puntos
// y enlace al manual. Con `resumen` (Inicio): sin id, h3, sin puntos y «Ver más» a su bloque en Funciones.
const props = defineProps<{ lang: Lang; funcion: Funcion; inverso?: boolean; resumen?: boolean }>();

const MAS = { es: "Ver más", en: "Learn more" };
const TEMAS = ["claro", "oscuro"] as const;
const rutas = computed(() => textos(props.lang).comunes.rutas);
</script>

<template>
  <article :id="resumen ? undefined : funcion.id" class="bloque" :class="{ inverso, resumen }">
    <div class="texto">
      <p class="pieza-etiqueta">{{ funcion.etiqueta }}</p>
      <component :is="resumen ? 'h3' : 'h2'" class="titulo">{{ funcion.titulo }}</component>
      <p class="descripcion">{{ funcion.texto }}</p>
      <ul v-if="!resumen" class="puntos" role="list">
        <li v-for="p in funcion.puntos" :key="p">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ p }}
        </li>
      </ul>
      <a
        v-if="resumen"
        class="pieza-mas"
        :href="enlace(`${rutas.funciones}#${funcion.id}`)"
        :aria-label="`${MAS[lang]}: ${funcion.titulo}`"
        >{{ MAS[lang] }} →</a
      >
      <a v-else-if="funcion.enlace" class="pieza-mas" :href="enlace(funcion.enlace.href)"
        >{{ funcion.enlace.texto }} →</a
      >
    </div>
    <figure class="pantalla">
      <template v-if="funcion.imagen.temas">
        <img
          v-for="tema in TEMAS"
          :key="tema"
          :class="`solo-${tema}`"
          :src="fuenteImagen(lang, funcion.imagen, tema)"
          :alt="funcion.imagen.alt"
          :width="funcion.imagen.ancho"
          :height="funcion.imagen.alto"
          loading="lazy"
          decoding="async"
        />
      </template>
      <img
        v-else
        :src="fuenteImagen(lang, funcion.imagen, 'oscuro')"
        :alt="funcion.imagen.alt"
        :width="funcion.imagen.ancho"
        :height="funcion.imagen.alto"
        loading="lazy"
        decoding="async"
      />
      <figcaption v-if="funcion.imagen.leyenda">{{ funcion.imagen.leyenda }}</figcaption>
    </figure>
  </article>
</template>

<style scoped>
.bloque {
  display: grid;
  gap: 24px;
  align-items: center;
}
@media (min-width: 960px) {
  .bloque {
    grid-template-columns: 5fr 7fr;
    gap: 56px;
  }
  .bloque.inverso {
    grid-template-columns: 7fr 5fr;
  }
  .bloque.inverso .texto {
    order: 2;
  }
}
.titulo {
  margin: 0 0 12px;
  padding: 0;
  border: 0;
  color: var(--producto-titulo);
  font-size: clamp(1.375rem, 1.1rem + 1vw, 1.875rem);
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: -0.015em;
}
.descripcion {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 1.0625rem;
  line-height: 1.6;
}
.puntos {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}
.puntos li {
  display: flex;
  gap: 10px;
  margin-top: 8px;
  line-height: 1.5;
  color: var(--vp-c-text-1);
}
.puntos .trazo {
  margin-top: 0.25em;
  color: var(--vp-c-brand-1);
}
.pieza-mas {
  margin-top: 16px;
}
.pantalla {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow:
    0 1px 2px rgba(17, 24, 39, 0.06),
    0 12px 32px -12px rgba(17, 24, 39, 0.22);
}
.dark .pantalla {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 12px 32px -12px rgba(0, 0, 0, 0.7);
}
.pantalla img {
  display: block;
  width: 100%;
  height: auto;
}
.pantalla figcaption {
  padding: 8px 16px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 0.8125rem;
}
</style>
