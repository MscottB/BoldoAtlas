<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { Download, Upload } from "@lucide/vue";
import PanelExportar from "./PanelExportar.vue";
import PanelImportar from "./PanelImportar.vue";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

// El menú de la app, la paleta y la Bienvenida llegan aquí con ?accion=exportar|importar.
const accion = computed(() =>
  route.query.accion === "exportar" || route.query.accion === "importar" ? route.query.accion : null,
);
const ir = (a: "exportar" | "importar" | null) =>
  router.replace({ path: route.path, query: a ? { accion: a } : {} });
const caminos = [
  { id: "exportar", icono: Download },
  { id: "importar", icono: Upload },
] as const;
</script>

<template>
  <section class="mx-auto flex max-w-3xl flex-col gap-6 p-6">
    <header>
      <h1 class="text-lg font-semibold">{{ t("nav.importarExportar") }}</h1>
      <p class="text-sm text-muted-foreground">{{ t("intercambio.ayuda") }}</p>
    </header>

    <ul v-if="!accion" class="grid gap-3 sm:grid-cols-2">
      <li v-for="c in caminos" :key="c.id">
        <button
          type="button"
          class="flex h-full w-full flex-col gap-1 rounded-lg border p-4 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
          @click="ir(c.id)"
        >
          <span class="flex items-center gap-2 font-medium">
            <component :is="c.icono" class="size-4 shrink-0" aria-hidden="true" />
            {{ t(`intercambio.${c.id}.titulo`) }}
          </span>
          <span class="text-sm text-muted-foreground">{{ t(`intercambio.${c.id}.texto`) }}</span>
        </button>
      </li>
    </ul>

    <PanelExportar v-else-if="accion === 'exportar'" @terminar="ir(null)" />
    <PanelImportar v-else @terminar="ir(null)" />
  </section>
</template>
