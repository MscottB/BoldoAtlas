<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ArchiveRestore } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { Eliminado } from "./eliminados";

defineProps<{ filas: Eliminado[]; soloLectura: boolean }>();
defineEmits<{ restaurar: [e: Eliminado] }>();
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
      <Button v-if="!soloLectura" variant="outline" :disabled="!!e.bloqueo" @click="$emit('restaurar', e)">
        <ArchiveRestore aria-hidden="true" />
        {{ t("eliminados.restaurar") }}
      </Button>
    </li>
  </ul>
</template>
