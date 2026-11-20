<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import BarraAvance from "@/features/intercambio/BarraAvance.vue";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { useOrganizacion } from "@/stores/organizacion";
import { aviso, masTarde, quitando, quitarAhora } from "./aviso";

// Botones simples, no AlertDialogAction: ese cierra el diálogo antes de que corra su clic.
const { t } = useI18n();
const org = useOrganizacion();
const avance = computed(() =>
  quitando.value ? { etapa: "", hecho: quitando.value.hechos, total: quitando.value.total } : null,
);

async function quitar() {
  try {
    const hecho = await quitarAhora();
    if (!hecho) return;
    // como al importar: lo que se ve sale de la base ya limpia
    const r = await org.cargar();
    if (!r.ok) return void toast.error(r.mensaje);
    if (hecho.fallos) toast.warning(t("fotos.listoConFallos", { n: hecho.fallos }, hecho.fallos));
    else toast.success(t("fotos.listo"));
  } catch (e) {
    toast.error(mensajeFallo(e));
  }
}
</script>

<template>
  <AlertDialog :open="!!aviso" @update:open="(v) => !v && masTarde()">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("fotos.aviso.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ aviso?.texto }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <Button type="button" variant="outline" @click="masTarde">{{ t("fotos.aviso.masTarde") }}</Button>
        <Button type="button" data-accion="quitar-fotos" @click="quitar">{{
          t("fotos.aviso.quitar")
        }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
  <!-- Sin bloquear la ventana: el avance queda en una esquina mientras se trabaja. -->
  <BarraAvance
    v-if="avance"
    class="fixed right-4 bottom-4 z-50 w-80 bg-background shadow-lg"
    :avance="avance"
    :cancelable="false"
    :texto="t('fotos.avance')"
  />
</template>
