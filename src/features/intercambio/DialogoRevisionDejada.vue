<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { intercambioCancelar } from "@/db/cliente";
import { RUTA_INTERCAMBIO, revisionConDecisiones, revisionDejada } from "./intercambio";

// Se salió de una revisión con decisiones: la navegación no se retiene (las pestañas no la esperan), y esto pregunta qué hacer.
const { t } = useI18n();
const router = useRouter();
const abierto = computed(() => revisionDejada.value !== null && !revisionDejada.value.volviendo);

async function volver() {
  if (revisionDejada.value) revisionDejada.value.volviendo = true;
  await router.push({ path: RUTA_INTERCAMBIO, query: { accion: "importar" } });
}
async function descartar() {
  const dejada = revisionDejada.value;
  revisionDejada.value = null;
  revisionConDecisiones(false);
  if (dejada) await intercambioCancelar(dejada.trabajo);
}
</script>

<template>
  <AlertDialog :open="abierto">
    <AlertDialogContent @escape-key-down.prevent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("intercambio.revisar.dejadaTitulo") }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ t("intercambio.revisar.dejadaTexto", revisionDejada?.decisiones ?? 0) }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button type="button" variant="outline" @click="descartar">{{ t("intercambio.revisar.descartar") }}</Button>
        <Button type="button" @click="volver">{{ t("intercambio.revisar.volverARevision") }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
