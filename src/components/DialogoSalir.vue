<script setup lang="ts">
import { watch } from "vue";
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
import { salidaAbierta, salir } from "@/app/ventana";
import { useRetornoFoco } from "@/lib/foco";

const { t } = useI18n();
const foco = useRetornoFoco();
// sync: antes de que el diálogo se monte y se lleve el foco
watch(salidaAbierta, (abierta) => abierta && foco.alAbrir(), { flush: "sync" });
function alCerrar(e: Event) {
  e.preventDefault();
  foco.restaurar(document.querySelector<HTMLElement>("[data-buscar-paleta]"));
}
</script>

<template>
  <!-- Con v-if, se monta al abrirse y queda sobre cualquier otro diálogo, también los montados después de este. -->
  <AlertDialog v-if="salidaAbierta" v-model:open="salidaAbierta">
    <AlertDialogContent data-dialogo-salir @close-auto-focus="alCerrar">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("salida.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("salida.texto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("salida.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction @click="salir">{{ t("bandeja.salir") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
