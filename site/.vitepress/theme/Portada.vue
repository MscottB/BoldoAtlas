<script setup lang="ts">
import { computed } from "vue";
import { ICONOS } from "./iconos";
import { enlace, fuenteImagen } from "./imagenes";
import { textos } from "./textos";
import type { Lang } from "./tipos";

// Portada: el mensaje, las garantías y el botón Descargar a la izquierda; la captura del árbol, inclinada, a la derecha.
const props = defineProps<{ lang: Lang }>();

const t = computed(() => textos(props.lang));
const p = computed(() => t.value.inicio.portada);
const TEMAS = ["claro", "oscuro"] as const;
</script>

<template>
  <section class="portada">
    <div class="pieza-contenedor rejilla">
      <div class="mensaje">
        <h1>{{ p.titulo }}</h1>
        <p class="texto">{{ p.texto }}</p>
        <ul class="garantias" role="list">
          <li v-for="g in t.comunes.garantias" :key="g">
            <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.si" />{{ g }}
          </li>
        </ul>
        <a class="pieza-boton marca" :href="enlace(t.comunes.rutas.descargas)">
          <svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS.descargar" />{{
            p.descargar
          }}
        </a>
      </div>
      <div class="captura">
        <template v-if="p.imagen.temas">
          <img
            v-for="tema in TEMAS"
            :key="tema"
            :class="`solo-${tema}`"
            :src="fuenteImagen(lang, p.imagen, tema)"
            :alt="p.imagen.alt"
            :width="p.imagen.ancho"
            :height="p.imagen.alto"
            fetchpriority="high"
          />
        </template>
        <img
          v-else
          :src="fuenteImagen(lang, p.imagen, 'claro')"
          :alt="p.imagen.alt"
          :width="p.imagen.ancho"
          :height="p.imagen.alto"
          fetchpriority="high"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.portada {
  overflow: hidden; /* la captura inclinada no debe abrir un desplazamiento horizontal */
  padding: 48px 0 64px;
  background:
    radial-gradient(50% 60% at 85% 40%, rgba(200, 116, 63, 0.14), transparent 70%), var(--producto-fondo);
}
.rejilla {
  display: grid;
  gap: 48px;
  align-items: center;
}
h1 {
  margin: 0;
  max-width: 16ch;
  color: var(--producto-titulo);
  font-size: clamp(2.5rem, 1.75rem + 2.6vw, 3.5rem);
  line-height: 1.08;
  font-weight: 750;
  letter-spacing: -0.025em;
  text-wrap: balance;
}
.texto {
  margin: 20px 0 0;
  max-width: 38ch;
  color: var(--vp-c-text-2);
  font-size: 1.1875rem;
  line-height: 1.6;
}
.garantias {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin: 24px 0 32px;
  padding: 0;
  list-style: none;
}
.garantias li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--vp-c-text-1);
  font-weight: 500;
}
.garantias .trazo {
  color: var(--vp-c-brand-1);
}
.pieza-boton {
  padding: 14px 28px;
  font-size: 1.0625rem;
}
.captura {
  min-width: 0;
}
.captura img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow:
    0 1px 2px rgba(17, 24, 39, 0.06),
    0 24px 48px -16px rgba(30, 42, 56, 0.35);
}
.dark .captura img {
  box-shadow:
    0 1px 2px rgba(0, 0, 0, 0.4),
    0 24px 48px -16px rgba(0, 0, 0, 0.8);
}
@media (min-width: 768px) {
  .portada {
    padding: 72px 0 96px;
  }
  .rejilla {
    grid-template-columns: 5fr 6fr;
    gap: 40px;
  }
  /* la captura gira hacia el texto; al pasar el puntero se endereza un poco */
  .captura img {
    transform: perspective(1600px) rotateY(-14deg) rotateX(4deg);
    transform-origin: right center;
    transition: transform 0.4s ease;
  }
  .captura:hover img {
    transform: perspective(1600px) rotateY(-6deg) rotateX(2deg);
  }
}
@media (min-width: 1200px) {
  .rejilla {
    gap: 64px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .captura img {
    transition: none;
  }
}
</style>
