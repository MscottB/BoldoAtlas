<script setup lang="ts">
import { computed } from "vue";
import { ICONOS } from "./iconos";
import { enlace, fuenteImagen } from "./imagenes";
import { textos } from "./textos";
import type { Lang } from "./tipos";

// Portada: el titular (con su parte clave en serifa cursiva), el texto, Descargar y las funciones, las garantías y,
// debajo, la captura del árbol en su tarjeta con el rótulo «FIG 1».
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang));
const p = computed(() => t.value.inicio.portada);
const TEMAS = ["claro", "oscuro"] as const;
</script>

<template>
  <section class="portada pieza-arranque">
    <div class="pieza-contenedor">
      <h1 class="titular">
        {{ p.titulo }}<br />
        <em>{{ p.clave }}</em>
      </h1>
      <p class="texto">{{ p.texto }}</p>
      <div class="acciones">
        <a class="pieza-boton marca" :href="enlace(t.comunes.rutas.descargas)">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.descargar" />{{
            p.descargar
          }}
        </a>
        <a class="pieza-boton alt" :href="enlace(t.comunes.rutas.funciones)">{{
          t.inicio.destacadas.todas
        }}</a>
      </div>
      <ul class="garantias" role="list">
        <li v-for="g in t.comunes.garantias" :key="g">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ g }}
        </li>
      </ul>
      <figure class="pieza-tarjeta figura">
        <figcaption class="pieza-etiqueta">{{ p.figura }}</figcaption>
        <template v-if="p.imagen.temas">
          <img
            v-for="tema in TEMAS"
            :key="tema"
            :class="`pieza-captura solo-${tema}`"
            :src="fuenteImagen(lang, p.imagen, tema)"
            :alt="p.imagen.alt"
            :width="p.imagen.ancho"
            :height="p.imagen.alto"
            fetchpriority="high"
          />
        </template>
        <img
          v-else
          class="pieza-captura"
          :src="fuenteImagen(lang, p.imagen, 'claro')"
          :alt="p.imagen.alt"
          :width="p.imagen.ancho"
          :height="p.imagen.alto"
          fetchpriority="high"
        />
      </figure>
    </div>
  </section>
</template>

<style scoped>
.portada {
  padding: 72px 0 64px;
  text-align: center;
}
.titular {
  margin: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(2.4rem, 6vw, 4.2rem);
  line-height: 1.06;
  letter-spacing: -0.03em;
  text-wrap: balance;
}
.texto {
  max-width: 40em;
  margin: 20px auto 0;
  color: var(--vp-c-text-2);
  font-size: 1.1rem;
  line-height: 1.6;
}
.acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  margin: 28px 0 14px;
}
.garantias {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 18px;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--vp-c-text-2);
  font-size: 0.875rem;
}
.garantias li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.garantias .trazo {
  color: var(--vp-c-brand-1);
}
.figura {
  max-width: 1000px;
  margin: 48px auto 0;
  text-align: left;
}
.figura img {
  vertical-align: top;
  width: 100%;
  height: auto;
}
@media (max-width: 639px) {
  .portada {
    padding: 52px 0 48px;
  }
  .figura {
    margin-top: 36px;
    padding: 12px;
  }
}
</style>
