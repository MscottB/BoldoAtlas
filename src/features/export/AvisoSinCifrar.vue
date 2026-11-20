<script setup lang="ts">
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// El aviso «queda sin cifrar» de las ventanas de exportar: el texto va en el slot. `nombre` pone sus marcas
// (`data-aviso-<nombre>` y `aceptar-aviso-<nombre>`); «Acepto» emite `aceptar`.
const abierto = defineModel<boolean>("open", { required: true });
defineProps<{ nombre: string }>();
defineEmits<{ aceptar: [] }>();
const { t } = useI18n();
</script>

<template>
  <AlertDialog v-model:open="abierto">
    <AlertDialogContent :[`data-aviso-${nombre}`]="''">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("excel.aviso.titulo") }}</AlertDialogTitle>
        <slot />
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("excel.aviso.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction :data-accion="`aceptar-aviso-${nombre}`" @click="$emit('aceptar')">
          {{ t("imagen.aceptar") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
