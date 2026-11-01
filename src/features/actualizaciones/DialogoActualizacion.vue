<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink } from "@lucide/vue";
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
import { tamano } from "@/lib/formato";
import { useRetornoFoco } from "@/lib/foco";
import { useActualizaciones, VERSION_ACTUAL } from "@/stores/actualizaciones";
import ListaNovedades from "./ListaNovedades.vue";

// Ventana de actualización (spec §12): versión actual y nueva, novedades de todas las versiones que se salta, qué
// va a pasar según el tipo de instalación, y la descarga con progreso y cancelar. Nunca instala sin este clic.
const { t, locale } = useI18n();
const a = useActualizaciones();
const retorno = useRetornoFoco();
const error = ref("");

watch(
  () => a.ventanaAbierta,
  (abierta) => {
    error.value = "";
    // cerrar la ventana durante la descarga la cancela: nunca se instala algo que ya no se ve
    if (!abierta && a.instalando) void a.cancelar();
  },
);

async function instalar() {
  error.value = "";
  const r = await a.instalar();
  if (!r.ok) error.value = r.mensaje;
}

const porcentaje = computed(() => {
  const p = a.progreso;
  return p?.total ? Math.min(100, Math.round((p.descargado / p.total) * 100)) : null;
});
const textoProgreso = computed(() => {
  const p = a.progreso;
  if (!p) return "";
  const descargado = tamano(p.descargado, locale.value);
  return p.total
    ? t("actualizar.progreso", { descargado, total: tamano(p.total, locale.value) })
    : t("actualizar.progresoSinTotal", { descargado });
});
const abrirPagina = () => a.disponible && openUrl(a.disponible.pagina);
</script>

<template>
  <Dialog v-model:open="a.ventanaAbierta">
    <DialogContent
      v-if="a.disponible"
      class="sm:max-w-xl"
      @open-auto-focus="retorno.alAbrir"
      @close-auto-focus="retorno.alCerrar"
    >
      <DialogHeader>
        <DialogTitle>{{ t("actualizar.titulo") }}</DialogTitle>
        <DialogDescription>
          {{ t("actualizar.versiones", { actual: VERSION_ACTUAL, nueva: a.disponible.version }) }}
        </DialogDescription>
      </DialogHeader>

      <section class="max-h-80 overflow-y-auto pr-1" :aria-label="t('actualizar.queTrae')">
        <ListaNovedades v-if="a.notasDisponible.length" :lista="a.notasDisponible" />
        <p v-else class="text-sm text-muted-foreground">{{ t("actualizar.sinNotas") }}</p>
      </section>

      <p class="text-sm">{{ t(`actualizar.modo.${a.disponible.modo}`) }}</p>

      <div v-if="a.progreso" class="grid gap-1.5">
        <div
          role="progressbar"
          :aria-label="t('actualizar.descargando')"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="porcentaje ?? undefined"
          :aria-valuetext="textoProgreso"
          class="h-2 overflow-hidden rounded-full bg-muted"
        >
          <div
            class="h-full bg-primary transition-[width]"
            :class="porcentaje === null && 'w-1/3 animate-pulse'"
            :style="porcentaje !== null ? { width: `${porcentaje}%` } : undefined"
          />
        </div>
        <p class="text-xs text-muted-foreground" aria-live="polite">{{ textoProgreso }}</p>
      </div>
      <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>

      <DialogFooter>
        <!-- En modo paquete «Descargar el paquete» ya abre la página del release: no se repite «Ver en GitHub». -->
        <Button v-if="a.disponible.modo !== 'paquete'" type="button" variant="ghost" @click="abrirPagina">
          <ExternalLink aria-hidden="true" />
          {{ t("actualizar.verEnGithub") }}
        </Button>
        <Button v-if="a.disponible.modo === 'paquete'" type="button" @click="abrirPagina">
          <Download aria-hidden="true" />
          {{ t("actualizar.descargarPaquete") }}
        </Button>
        <Button v-else-if="a.instalando" type="button" variant="outline" @click="a.cancelar()">
          {{ t("actualizar.cancelar") }}
        </Button>
        <template v-else>
          <DialogClose as-child>
            <Button type="button" variant="outline">{{ t("actualizar.despues") }}</Button>
          </DialogClose>
          <Button type="button" @click="instalar">
            <Download aria-hidden="true" />
            {{ t("actualizar.instalar") }}
          </Button>
        </template>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
