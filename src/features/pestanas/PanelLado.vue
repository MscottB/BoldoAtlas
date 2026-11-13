<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide, shallowReactive } from "vue";
import {
  RouterView,
  START_LOCATION,
  routeLocationKey,
  routerKey,
  routerViewLocationKey,
  type RouteLocationNormalizedLoaded,
} from "vue-router";
import { useVueFlow } from "@vue-flow/core";
import { idLienzo } from "@/features/arbol/useLienzo";
import { PANEL } from "./panel";
import { RUTA_INICIO } from "./pestanas";
import { registrarRouter } from "./routerConFoco";
import { crearRouterLado } from "./routerLado";
import { MARCA_DIVIDIR, usePestanas } from "./usePestanas";

// El panel de al lado: con su propio router, sus vistas (useRoute, useRouter, RouterLink) navegan solo aquí. Se monta
// con la key de su pestaña, así que cada pestaña que llega al lado tiene un router nuevo, y se suelta al desmontarse.
const props = defineProps<{ id: string }>();
const pestanas = usePestanas();
const pestana = pestanas.lista.find((p) => p.id === props.id);
// De Configuración, Ayuda o Acerca de, que no van al lado, a la vista de trabajo de la pestaña.
const r = crearRouterLado(pestana ? pestanas.rutaDeTrabajo(pestana) : RUTA_INICIO);
// Como hace vue-router al instalarse: cada clave lee la de la ruta actual.
const ruta = {} as RouteLocationNormalizedLoaded;
for (const k of Object.keys(START_LOCATION) as (keyof RouteLocationNormalizedLoaded)[])
  Object.defineProperty(ruta, k, { get: () => r.currentRoute.value[k], enumerable: true });
provide(routerKey, r);
provide(routeLocationKey, shallowReactive(ruta));
// El RouterView muestra esta; si no, la del router principal, que la app provee.
provide(routerViewLocationKey, r.currentRoute);
provide(PANEL, { panel: "lado", pestana: () => props.id });
// Mientras está montado, lo que no es de un panel (menú lateral, paleta, atajos) navega aquí si tiene el foco.
let quitar = () => {};
onMounted(() => (quitar = registrarRouter("lado", r)));
onBeforeUnmount(() => quitar());

// Cuánto tarda en verse lo que abrió «Dividir» (decisión 11; lo lee el arnés): desde su marca hasta que el lienzo midió sus
// tarjetas o, en otra vista, hasta que se montó. Sin la marca (otra forma de llegar al lado) no se mide.
function medir() {
  if (!performance.getEntriesByName(MARCA_DIVIDIR, "mark").length) return;
  performance.measure("abrir-al-lado", MARCA_DIVIDIR);
  performance.clearMarks(MARCA_DIVIDIR);
}
function alMontarVista() {
  if (r.currentRoute.value.name !== "arbol") return medir();
  // El Vue Flow que la vista ya creó: fuera de un setup, useVueFlow lo toma sin crear otro ni soltarlo al irse.
  const lienzo = useVueFlow(idLienzo("lado", props.id));
  if (lienzo.areNodesInitialized.value) medir();
  else lienzo.onNodesInitialized(medir);
}
// Cerrada antes de verse: la marca no queda para otra pestaña que llegue al lado.
onBeforeUnmount(() => performance.clearMarks(MARCA_DIVIDIR));
</script>

<template>
  <RouterView v-slot="{ Component: vista }" :key="id">
    <!-- Hasta que su router llega a la ruta no hay vista. -->
    <component :is="vista" v-if="vista" @vue:mounted="alMontarVista" />
  </RouterView>
</template>
