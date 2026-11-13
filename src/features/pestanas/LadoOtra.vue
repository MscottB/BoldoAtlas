<script setup lang="ts">
import { useTemplateRef } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
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
import { Button } from "@/components/ui/button";
import { useLadoOtra } from "./useLadoOtra";

// El panel de al lado con otra organización: una copia de solo lectura, en un iframe con la app en modo lado (decisión 2).
// Lo que se ve es una foto tomada al abrir.
const props = defineProps<{ id: string }>();
const { t } = useI18n();
const marco = useTemplateRef<HTMLIFrameElement>("marco");
const { nombre, estado, error, src, clave, abrirIgual, alCerrarPregunta, cerrar } = useLadoOtra(
  props.id,
  () => marco.value?.contentWindow,
);
</script>

<template>
  <div v-if="estado === 'error'" role="alert" class="flex flex-col items-start gap-3 p-6 text-sm leading-relaxed">
    <p class="flex items-start gap-2">
      <TriangleAlert class="size-5 shrink-0 text-destructive" aria-hidden="true" />
      {{ error }}
    </p>
    <Button variant="outline" size="sm" @click="cerrar()">
      {{ t("pestanas.cerrarDivision") }}
    </Button>
  </div>
  <iframe v-else-if="src" ref="marco" :key="clave" :src="src" :title="nombre" class="block size-full border-0" />
  <p v-else role="status" class="p-6 text-sm text-muted-foreground">{{ t("pestanas.copiando") }}</p>
  <AlertDialog :open="estado === 'preguntando'" @update:open="(abierto: boolean) => abierto || alCerrarPregunta()">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("pestanas.verAlLado") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("pestanas.sinMemoria") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("comun.no") }}</AlertDialogCancel>
        <AlertDialogAction @click="abrirIgual">{{ t("pestanas.abrirIgual") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
