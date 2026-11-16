<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ArchiveRestore, Eraser } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { Eliminado } from "./eliminados";

defineProps<{ filas: Eliminado[]; soloLectura: boolean }>();
defineEmits<{ restaurar: [e: Eliminado]; suprimir: [e: Eliminado] }>();
const { t, locale } = useI18n();
const fecha = (f: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(new Date(f));
</script>

<template>
  <p v-if="filas.length === 0" class="text-sm text-muted-foreground">{{ t("eliminados.vacio") }}</p>
  <ul v-else class="grid gap-2">
    <li
      v-for="e in filas"
      :key="e.id"
      class="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
    >
      <div class="grid min-w-0 gap-0.5">
        <span class="truncate font-medium">{{ e.nombre }}</span>
        <span class="text-sm text-muted-foreground">{{
          t("eliminados.eliminadoEl", { fecha: fecha(e.fecha) })
        }}</span>
        <span v-if="e.tipo === 'unidad'" class="text-sm text-muted-foreground">
          {{ t("eliminados.vuelveVacia") }}
        </span>
        <span v-if="e.bloqueo" class="text-sm text-muted-foreground">
          {{ t("eliminados.primeroUnidad", { unidad: e.bloqueo }) }}
        </span>
      </div>
      <div v-if="!soloLectura" class="flex shrink-0 flex-wrap justify-end gap-2">
        <Button variant="outline" :disabled="!!e.bloqueo" @click="$emit('restaurar', e)">
          <ArchiveRestore aria-hidden="true" />
          {{ t("eliminados.restaurar") }}
        </Button>
        <Button v-if="e.tipo === 'persona'" variant="outline" @click="$emit('suprimir', e)">
          <Eraser aria-hidden="true" />
          {{ t("suprimir.boton") }}
        </Button>
      </div>
    </li>
  </ul>
</template>
