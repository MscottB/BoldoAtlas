<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Copy, FolderOpen } from "@lucide/vue";
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
import { abrirCarpetaDatos, infoProyecto, type InfoProyecto } from "@/db/cliente";
import { tamano } from "@/lib/formato";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { useOrganizacion } from "@/stores/organizacion";
import { datosProyectoAbierto } from "./menuApp";

// Dónde están los datos del proyecto abierto. La ruta la entrega Rust: la interfaz solo la muestra y la copia.
const { t, locale } = useI18n();
const org = useOrganizacion();
const info = ref<InfoProyecto | null>(null);
const error = ref("");

watch(datosProyectoAbierto, async (abierto) => {
  if (!abierto) return;
  info.value = null;
  error.value = "";
  try {
    info.value = await infoProyecto();
  } catch (e) {
    error.value = mensajeFallo(e);
  }
});

const modificado = (ms: number | null) =>
  ms === null
    ? "—"
    : new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));

async function copiar() {
  if (!info.value) return;
  try {
    await navigator.clipboard.writeText(info.value.rutaBd);
    toast.success(t("proyecto.copiada"));
  } catch (e) {
    toast.error(String(e));
  }
}
const abrirCarpeta = () => abrirCarpetaDatos().catch((e: unknown) => toast.error(mensajeFallo(e)));
</script>

<template>
  <Dialog v-model:open="datosProyectoAbierto">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t("proyecto.titulo") }}</DialogTitle>
        <DialogDescription>
          {{ org.org.nombre || t("barra.sinNombre") }} · {{ t("proyecto.principal") }}
        </DialogDescription>
      </DialogHeader>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
      <dl v-else-if="info" class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
        <dt class="text-muted-foreground">{{ t("acerca.modo") }}</dt>
        <dd>{{ info.portable ? t("acerca.portable") : t("acerca.instalado") }}</dd>
        <dt class="text-muted-foreground">{{ t("proyecto.archivo") }}</dt>
        <dd class="select-all break-all text-xs leading-5">{{ info.rutaBd }}</dd>
        <dt class="text-muted-foreground">{{ t("proyecto.tamano") }}</dt>
        <dd>{{ tamano(info.bytes, locale) }}</dd>
        <dt class="text-muted-foreground">{{ t("proyecto.modificado") }}</dt>
        <dd>{{ modificado(info.modificado) }}</dd>
      </dl>
      <DialogFooter>
        <Button type="button" variant="outline" :disabled="!info" @click="copiar">
          <Copy aria-hidden="true" />
          {{ t("proyecto.copiar") }}
        </Button>
        <Button type="button" variant="outline" :disabled="!info" @click="abrirCarpeta">
          <FolderOpen aria-hidden="true" />
          {{ t("proyecto.abrirCarpeta") }}
        </Button>
        <DialogClose as-child>
          <Button type="button">{{ t("vista.cerrar") }}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
