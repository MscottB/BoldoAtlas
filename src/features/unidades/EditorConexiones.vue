<script setup lang="ts">
import { computed, ref, useId, useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { Pencil, Waypoints, X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { ventanaConexion } from "@/features/arbol/useLienzo";
import { useVista } from "@/features/arbol/useVista";
import { useOrganizacion } from "@/stores/organizacion";
import { filasDeConexiones } from "./panel";
import EliminarConexion from "./EliminarConexion.vue";
import FilasConexion from "./FilasConexion.vue";

// Conexiones de la unidad con otras unidades (no cambian la jerarquía). Conectar y editar pasan por la misma ventanita de la
// tarjeta y de la línea (ConexionLienzo).
const props = defineProps<{ unidadId: string }>();
const { t } = useI18n();
const org = useOrganizacion();
const { config } = useVista();
const uid = useId();

const filas = computed(() => filasDeConexiones(org.conexiones, org.porId, props.unidadId));
const raiz = useTemplateRef<HTMLElement>("raiz");

const editar = (id: string, e: Event) => {
  const boton = e.currentTarget as HTMLElement;
  ventanaConexion.value = {
    id,
    fija: props.unidadId,
    ancla: boton.getBoundingClientRect(),
    foco: boton,
  };
};
const conectar = (e: Event) => {
  const boton = e.currentTarget as HTMLElement;
  ventanaConexion.value = {
    origen: props.unidadId,
    ancla: boton.getBoundingClientRect(),
    foco: boton,
  };
};

const quitando = ref<string | null>(null);
// Su fila ya no está: el foco no se pierde.
const alEliminar = () => raiz.value?.closest<HTMLElement>("[data-panel-unidad]")?.focus();
</script>

<template>
  <section ref="raiz" class="grid gap-1.5" :aria-labelledby="`${uid}-titulo`">
    <h3 :id="`${uid}-titulo`" class="text-sm font-medium">
      {{ t("unidad.conexiones") }}
      <span class="font-normal text-muted-foreground">({{ filas.length }})</span>
    </h3>
    <p class="text-xs text-muted-foreground">{{ t("unidad.conexionesAyuda") }}</p>
    <FilasConexion v-if="filas.length" :filas="filas" :aria-labelledby="`${uid}-titulo`">
      <template #acciones="{ fila: f }">
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          :aria-label="t('unidad.editarConexion', { nombre: f.otro.nombre })"
          :title="t('unidad.editarConexion', { nombre: f.otro.nombre })"
          aria-haspopup="dialog"
          @click="editar(f.id, $event)"
        >
          <Pencil class="size-3.5" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="grid size-6 shrink-0 place-items-center rounded hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"
          :aria-label="t('unidad.quitarConexion', { nombre: f.otro.nombre })"
          :title="t('unidad.quitarConexion', { nombre: f.otro.nombre })"
          aria-haspopup="dialog"
          @click="quitando = f.id"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </template>
    </FilasConexion>
    <p v-else class="text-sm text-muted-foreground">{{ t("unidad.sinConexiones") }}</p>
    <p v-if="filas.length && !config.relacionesLaterales" class="text-xs text-muted-foreground">
      {{ t("unidad.relacionesApagadas") }}
    </p>
    <Button
      type="button"
      variant="outline"
      size="sm"
      class="justify-self-start"
      aria-haspopup="dialog"
      @click="conectar"
    >
      <Waypoints aria-hidden="true" />
      {{ t("unidad.conectarCon") }}
    </Button>
    <EliminarConexion :id="quitando" @cerrar="quitando = null" @eliminada="alEliminar" />
  </section>
</template>
