<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRetornoFoco } from "@/lib/foco";
import { useActualizaciones, VERSION_ACTUAL } from "@/stores/actualizaciones";
import ListaNovedades from "./ListaNovedades.vue";

// «Novedades de la versión X»: al primer arranque de una versión nueva (lo nuevo desde la última usada en este PC,
// también varias versiones) y a pedido en Acerca de. Las notas viajan dentro de la app: se ven sin conexión.
const { t } = useI18n();
const a = useActualizaciones();
const retorno = useRetornoFoco();
const version = computed(() => a.novedades[0]?.version ?? VERSION_ACTUAL);
</script>

<template>
  <Dialog v-model:open="a.novedadesAbiertas">
    <DialogContent class="sm:max-w-xl" @open-auto-focus="retorno.alAbrir" @close-auto-focus="retorno.alCerrar">
      <DialogHeader>
        <DialogTitle>{{ t("novedades.titulo", { version }) }}</DialogTitle>
        <DialogDescription>{{
          t(a.novedadesTrasActualizar ? "novedades.descripcion" : "novedades.historial")
        }}</DialogDescription>
      </DialogHeader>
      <div class="max-h-96 overflow-y-auto pr-1">
        <ListaNovedades v-if="a.novedades.length" :lista="a.novedades" />
        <p v-else class="text-sm text-muted-foreground">{{ t("novedades.vacio") }}</p>
      </div>
      <DialogFooter>
        <DialogClose as-child>
          <Button type="button">{{ t("vista.cerrar") }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
