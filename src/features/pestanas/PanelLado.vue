<script setup lang="ts">
import { provide, shallowReactive } from "vue";
import {
  RouterView,
  START_LOCATION,
  routeLocationKey,
  routerKey,
  routerViewLocationKey,
  type RouteLocationNormalizedLoaded,
} from "vue-router";
import { PANEL } from "./panel";
import { RUTA_INICIO } from "./pestanas";
import { crearRouterLado } from "./routerLado";
import { usePestanas } from "./usePestanas";

// El panel de al lado: con su propio router, sus vistas (useRoute, useRouter, RouterLink) navegan solo aquí. Se monta
// con la key de su pestaña, así que cada pestaña que llega al lado tiene un router nuevo, y se suelta al desmontarse.
const props = defineProps<{ id: string }>();
const r = crearRouterLado(usePestanas().lista.find((p) => p.id === props.id)?.ruta ?? RUTA_INICIO);
// Como hace vue-router al instalarse: cada clave lee la de la ruta actual.
const ruta = {} as RouteLocationNormalizedLoaded;
for (const k of Object.keys(START_LOCATION) as (keyof RouteLocationNormalizedLoaded)[])
  Object.defineProperty(ruta, k, { get: () => r.currentRoute.value[k], enumerable: true });
provide(routerKey, r);
provide(routeLocationKey, shallowReactive(ruta));
// El RouterView muestra esta; si no, la del router principal, que la app provee.
provide(routerViewLocationKey, r.currentRoute);
provide(PANEL, { panel: "lado", pestana: () => props.id });
</script>

<template>
  <RouterView :key="id" />
</template>
