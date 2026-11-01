<script setup lang="ts">
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

const { t } = useI18n();
</script>

<template>
  <!-- Con v-if, se monta al abrirse y queda sobre cualquier otro diálogo, también los montados después de este. -->
  <AlertDialog v-if="salidaAbierta" v-model:open="salidaAbierta">
    <AlertDialogContent>
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
