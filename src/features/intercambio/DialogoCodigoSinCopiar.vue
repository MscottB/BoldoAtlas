<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Copy } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { codigoSinCopiar, copiarCodigo } from "./intercambio";

// Se saltó de la pantalla del código sin copiarlo: aquí sigue visible, sobre cualquier vista o pestaña.
const { t } = useI18n();
const abierto = computed({
  get: () => codigoSinCopiar.value !== null,
  set: (v) => {
    if (!v) codigoSinCopiar.value = null;
  },
});
async function copiar() {
  if (codigoSinCopiar.value && (await copiarCodigo(codigoSinCopiar.value))) codigoSinCopiar.value = null;
}
</script>

<template>
  <AlertDialog v-model:open="abierto">
    <AlertDialogContent data-codigo-sin-copiar>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("intercambio.exportar.sinCopiarTitulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("intercambio.exportar.sinCopiarTexto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <div class="flex flex-wrap items-center gap-3">
        <output class="font-mono text-lg font-semibold tracking-wider select-all">{{ codigoSinCopiar }}</output>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("intercambio.exportar.salirSinCopiar") }}</AlertDialogCancel>
        <Button type="button" @click="copiar">
          <Copy aria-hidden="true" />
          {{ t("intercambio.exportar.copiar") }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
