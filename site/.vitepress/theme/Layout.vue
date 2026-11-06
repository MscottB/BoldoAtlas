<script setup lang="ts">
import { useData, useRoute, useRouter, withBase } from "vitepress";
import DefaultTheme from "vitepress/theme";
import { computed, onMounted, watch } from "vue";
import { destinoAncla } from "./anclasViejas";
import { textos } from "./textos";

// El manual lleva su propia cabecera (título, «Volver al sitio» y buscador, sin el menú de producto); el resto del
// sitio es de producto (fondo cálido y cuerpo de 17 px, en custom.css). Además, las anclas de la portada vieja
// llevan a su página nueva.
const { lang, site } = useData();
const route = useRoute();
const router = useRouter();

const ruta = computed(() => "/" + route.path.slice(site.value.base.length));
const manual = computed(() => /^\/(en\/)?manual\//.test(ruta.value));
const comunes = computed(() => textos(lang.value === "en" ? "en" : "es").comunes);

function anclaVieja() {
  const destino = destinoAncla(ruta.value, location.hash);
  if (!destino) return;
  // se reemplaza la entrada del historial: «Atrás» no debe volver al ancla vieja y redirigir otra vez
  history.replaceState(history.state, "", withBase(destino));
  router.go(withBase(destino));
}
onMounted(anclaVieja);
watch(() => route.path, anclaVieja);
</script>

<template>
  <DefaultTheme.Layout :class="manual ? 'es-manual' : 'es-producto'">
    <template #nav-bar-title-after>
      <span v-if="manual" class="titulo-manual">{{ comunes.manual.titulo }}</span>
    </template>
    <template #nav-bar-content-before>
      <a v-if="manual" class="volver-sitio" :href="withBase(comunes.rutas.inicio)">{{
        comunes.manual.volver
      }}</a>
    </template>
    <template #nav-screen-content-before>
      <a v-if="manual" class="volver-sitio" :href="withBase(comunes.rutas.inicio)">{{
        comunes.manual.volver
      }}</a>
    </template>
  </DefaultTheme.Layout>
</template>
