<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import { Briefcase } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useEstilo } from "@/features/puestos/useEstilo";
import { usePuesto } from "@/features/puestos/usePuesto";

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
</script>

<template>
  <!-- Nodo liviano; 200×68 igual que TAM_PUESTO. Lo oculto por «Vista» queda solo para lectores de pantalla. -->
  <Handle type="target" :position="Position.Top" class="opacity-0" />
  <button
    type="button"
    class="nodrag flex h-[68px] w-[200px] items-center gap-2 rounded-md border bg-card px-2 text-left text-xs text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    :class="data.leyenda && 'border-l-[6px]'"
    :style="data.leyenda ? { borderColor: data.leyenda.color } : undefined"
    :title="data.leyenda?.nombre"
    @click.stop="abrir(id)"
    @keydown.ctrl.c.exact="copiar(id)"
    @keydown.ctrl.v.exact="pegar(id)"
  >
    <Briefcase class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span v-if="data.leyenda" class="sr-only">{{
      t("leyenda.deLeyenda", { nombre: data.leyenda.nombre })
    }}</span>
    <span class="grid min-w-0">
      <span :class="data.mostrarCargo ? 'truncate font-medium' : 'sr-only'">{{ data.cargo }}</span>
      <span :class="data.mostrarPersona ? 'grid' : 'sr-only'">
        <span class="truncate" :class="!data.titular && 'text-amber-700 dark:text-amber-400'">
          {{ data.titular || t("puesto.vacante") }}
        </span>
        <span v-if="data.reemplazo" class="truncate text-muted-foreground">
          {{ t("puesto.reemplazoDe", { nombre: data.reemplazo }) }}
        </span>
      </span>
    </span>
  </button>
</template>
