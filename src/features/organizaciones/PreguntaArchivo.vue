<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
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
import type { ArchivoAgregado } from "@/db/cliente";

// Lo que pregunta Rust al abrir o buscar un archivo (`agregarArchivo`): quien lo usa pasa `preguntar` como `confirmar`.
defineProps<{ titulo: string }>();
const { t } = useI18n();

type Pregunta = NonNullable<ArchivoAgregado["pide"]>;
const PREGUNTAS: Record<Pregunta, { texto: string; si: string }> = {
  red: { texto: "organizaciones.pideRed", si: "organizaciones.copiarYAbrir" },
  otro_id: { texto: "organizaciones.pideOtroId", si: "organizaciones.usarEste" },
  tope: { texto: "organizaciones.pideTope", si: "organizaciones.abrirIgual" },
  journal: { texto: "organizaciones.pideJournal", si: "organizaciones.recuperarYAbrir" },
};
const pregunta = ref<Pregunta>("red"); // no se limpia al cerrar: el texto sigue ahí mientras el diálogo se va
const preguntando = ref(false);
let responder: ((si: boolean) => void) | null = null;
let desmontado = false;
function preguntar(p: Pregunta) {
  if (desmontado) return Promise.resolve(false); // la siguiente pregunta de Rust, ya sin nadie que la responda
  pregunta.value = p;
  preguntando.value = true;
  return new Promise<boolean>((r) => (responder = r));
}
function responderCon(si: boolean) {
  responder?.(si);
  responder = null;
}
// Cancelar, Esc: no se sigue. El sí ya respondió: su clic corre antes que este watcher.
watch(preguntando, (abierto) => abierto || responderCon(false));
onBeforeUnmount(() => {
  desmontado = true;
  responderCon(false); // Ctrl+Tab con la pregunta abierta: Rust espera la respuesta
});

defineExpose({ preguntar });
</script>

<template>
  <AlertDialog v-model:open="preguntando">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ titulo }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t(PREGUNTAS[pregunta].texto) }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("organizaciones.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction @click="responderCon(true)">{{ t(PREGUNTAS[pregunta].si) }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
