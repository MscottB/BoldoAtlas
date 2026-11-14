<script setup lang="ts">
import { ICONOS } from "./iconos";
import { enlace } from "./imagenes";
import type { Enlace } from "./tipos";

// Garantías, cada una en su tarjeta: un icono de trazo (de ICONOS), una frase y, si hay, el enlace para comprobarla.
defineProps<{ items: { icono: string; titulo: string; texto: string; enlace?: Enlace }[] }>();
</script>

<template>
  <div class="franja">
    <ul class="pieza-contenedor garantias" role="list">
      <li v-for="g in items" :key="g.icono" class="pieza-tarjeta">
        <span class="icono"
          ><svg class="trazo" viewBox="0 0 24 24" aria-hidden="true" v-html="ICONOS[g.icono]"
        /></span>
        <div>
          <p class="titulo">{{ g.titulo }}</p>
          <p class="texto">{{ g.texto }}</p>
          <a v-if="g.enlace" class="pieza-mas" :href="enlace(g.enlace.href)">{{ g.enlace.texto }} →</a>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.franja {
  padding: 0 0 56px;
}
@media (min-width: 960px) {
  .franja {
    padding-bottom: 80px;
  }
}
.garantias {
  display: grid;
  gap: 12px;
  margin: 0 auto;
  list-style: none;
}
@media (min-width: 640px) {
  .garantias {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.garantias li {
  display: flex;
  gap: 14px;
}
.icono {
  display: inline-grid;
  flex: none;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--acento-suave);
  color: var(--vp-c-brand-1);
  font-size: 22px;
}
.titulo {
  margin: 0;
  color: var(--vp-c-text-1);
  font-weight: 600;
  line-height: 1.35;
}
.texto {
  margin: 6px 0 0;
  color: var(--vp-c-text-2);
  font-size: 0.95rem;
  line-height: 1.6;
}
.pieza-mas {
  margin-top: 8px;
  font-size: 0.95rem;
}
</style>
