<script setup lang="ts">
import { ICONOS } from "./iconos";
import { enlace } from "./imagenes";
import type { Enlace } from "./tipos";

// Franja de garantías: un icono de trazo (de ICONOS), una frase y, si hay, el enlace para comprobarla.
defineProps<{ items: { icono: string; titulo: string; texto: string; enlace?: Enlace }[] }>();
</script>

<template>
  <div class="franja">
    <ul class="pieza-contenedor garantias" role="list">
      <li v-for="g in items" :key="g.icono">
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
  padding: 56px 0;
  background: var(--producto-franja);
}
.garantias {
  display: grid;
  gap: 32px;
  margin: 0 auto;
  list-style: none;
}
@media (min-width: 640px) {
  .garantias {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (min-width: 960px) {
  .garantias {
    gap: 40px 64px;
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
  border-radius: 12px;
  background: rgba(200, 116, 63, 0.18);
  color: var(--producto-franja-enlace);
  font-size: 22px;
}
.titulo {
  margin: 0;
  color: var(--producto-franja-titulo);
  font-weight: 650;
  line-height: 1.35;
}
.texto {
  margin: 6px 0 0;
  color: var(--producto-franja-texto);
  font-size: 0.9375rem;
  line-height: 1.6;
}
.pieza-mas {
  margin-top: 8px;
  color: var(--producto-franja-enlace);
  font-size: 0.9375rem;
}
.pieza-mas:focus-visible {
  outline-color: var(--producto-franja-enlace);
}
</style>
