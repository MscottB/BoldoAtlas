<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BloquePlegable from "@/components/BloquePlegable.vue";
import type { InformeImportacion } from "@/db/cliente";

defineProps<{ informe: InformeImportacion }>();
const { t } = useI18n();
</script>

<template>
  <BloquePlegable
    v-if="informe.totalDetalle"
    clave="intercambio.detalle"
    :titulo="t('intercambio.importar.detalle', informe.totalDetalle)"
    class="text-sm"
  >
    <ul class="grid max-h-72 gap-1 overflow-auto pt-1 pl-5">
      <li v-for="(d, i) in informe.detalle" :key="i">
        <span class="font-medium">{{ d.nombre }}</span>
        <span class="text-muted-foreground">
          · {{ t(`intercambio.tablas.${d.tabla}`) }} · {{ t(`intercambio.motivo.${d.motivo}`) }}
        </span>
      </li>
      <li v-if="informe.totalDetalle > informe.detalle.length" class="text-muted-foreground">
        {{ t("intercambio.importar.detalleMas", informe.totalDetalle - informe.detalle.length) }}
      </li>
    </ul>
  </BloquePlegable>
</template>
