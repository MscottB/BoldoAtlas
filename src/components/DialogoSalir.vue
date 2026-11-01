<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { bandejaLista, responderSalida, salidaAbierta } from "@/app/ventana";
import { useRetornoFoco } from "@/lib/foco";
import { trabajos } from "@/lib/trabajos";

const { t } = useI18n();
const foco = useRetornoFoco();
// sync: antes de que el diálogo se monte y se lleve el foco
watch(salidaAbierta, (abierta) => abierta && foco.alAbrir(), { flush: "sync" });
// Sin marcar cada vez: «No volver a preguntar» es una decisión de este cierre.
const recordar = ref(false);
watch(salidaAbierta, () => (recordar.value = false));
const avisoTrabajo = computed(() =>
  trabajos.value.length
    ? t(bandejaLista.value ? "salida.trabajoBandeja" : "salida.trabajo", { trabajos: trabajos.value.join(", ") })
    : "",
);
function alCerrar(e: Event) {
  e.preventDefault();
  foco.restaurar(document.querySelector<HTMLElement>("[data-buscar-paleta]"));
}
</script>

<template>
  <!-- Con v-if, se monta al abrirse y queda sobre cualquier otro diálogo, también los montados después de este. -->
  <AlertDialog v-if="salidaAbierta" v-model:open="salidaAbierta">
    <!-- Más ancho que el diálogo normal: son tres botones; si aun así no caben (escala 125 %), bajan de línea. -->
    <AlertDialogContent
      data-dialogo-salir
      class="data-[size=default]:sm:max-w-md"
      @close-auto-focus="alCerrar"
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("salida.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t("salida.texto") }}
          <span v-if="avisoTrabajo" data-aviso-trabajo class="mt-2 block font-medium text-foreground">
            {{ avisoTrabajo }}
          </span>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="recordar" type="checkbox" class="size-4 accent-primary" />
        {{ t("salida.noPreguntar") }}
      </label>
      <AlertDialogFooter class="sm:flex-wrap">
        <AlertDialogCancel>{{ t("salida.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction v-if="bandejaLista" variant="secondary" @click="responderSalida('bandeja', recordar)">
          {{ t("salida.bandeja") }}
        </AlertDialogAction>
        <AlertDialogAction @click="responderSalida('cerrar', recordar)">{{ t("salida.cerrar") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
