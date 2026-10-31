<script setup lang="ts">
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { Briefcase } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useEstilo } from "@/features/puestos/useEstilo";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useTema } from "@/features/tema/useTema";
import { useVista } from "./useVista";
import { tamPuesto } from "./vista";

export interface DatosPuesto {
  cargo: string;
  titular: string | null;
  reemplazo: string | null;
  mostrarCargo: boolean;
  mostrarPersona: boolean;
  /** Entrada de leyenda cuando «Colorear por» es la leyenda del puesto; null = sin color. */
  leyenda: { nombre: string; color: string } | null;
}

defineProps<{ id: string; data: DatosPuesto }>();
const { t } = useI18n();
const { abrir } = usePuesto();
const { copiar, pegar } = useEstilo();
const { config } = useVista();
const { escala } = useTema();
const compacta = computed(() => config.value.densidad === "compacta");
const horizontal = computed(() => config.value.direccion === "horizontal");
// Misma función que usa el layout.
const tam = computed(() => {
  const { ancho, alto } = tamPuesto(config.value, escala.value);
  return { width: `${ancho}px`, height: `${alto}px` };
});
</script>

<template>
  <!-- Nodo liviano; su tamaño sale de tamPuesto, igual que en el layout. Lo oculto por «Vista» queda solo para lectores de pantalla. -->
  <Handle type="target" :position="horizontal ? Position.Left : Position.Top" class="opacity-0" />
  <button
    type="button"
    class="nodrag flex items-center gap-2 rounded-md border bg-card px-2 text-left text-xs text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    :class="data.leyenda && 'border-l-[6px]'"
    :style="[tam, data.leyenda ? { borderColor: data.leyenda.color } : {}]"
    :title="data.leyenda?.nombre"
    @click.stop="abrir(id)"
    @keydown.ctrl.c.exact="copiar(id)"
    @keydown.ctrl.v.exact="pegar(id)"
  >
    <Briefcase class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span v-if="data.leyenda" class="sr-only">{{
      t("leyenda.deLeyenda", { nombre: data.leyenda.nombre })
    }}</span>
    <span class="min-w-0" :class="compacta ? 'flex gap-1.5' : 'grid'">
      <span :class="data.mostrarCargo ? 'truncate font-medium' : 'sr-only'">{{ data.cargo }}</span>
      <span :class="data.mostrarPersona ? (compacta ? 'flex min-w-0' : 'grid') : 'sr-only'">
        <span class="truncate" :class="!data.titular && 'text-amber-700 dark:text-amber-400'">
          {{ data.titular || t("puesto.vacante") }}
        </span>
        <span v-if="data.reemplazo && !compacta" class="truncate text-muted-foreground">
          {{ t("puesto.reemplazoDe", { nombre: data.reemplazo }) }}
        </span>
      </span>
    </span>
  </button>
</template>
