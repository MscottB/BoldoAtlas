<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RefreshCw } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { claseSelect } from "@/lib/utils";
import { PREFERENCIA, useActualizaciones } from "@/stores/actualizaciones";
import { buscarActualizaciones } from "./acciones";
import { FRECUENCIA_POR_DEFECTO, FRECUENCIAS } from "./programa";

// Configuración › Actualizaciones: cada cuánto buscar (cada día por defecto; «Nunca» apaga la única conexión
// automática de la app) y buscar ahora.
const { t } = useI18n();
const a = useActualizaciones();
const frecuencia = ref(leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO));
watch(frecuencia, (f) => guardarPreferencia(PREFERENCIA, f));
</script>

<template>
  <section class="grid gap-4" aria-labelledby="cfg-actualizaciones">
    <div>
      <h2 id="cfg-actualizaciones" class="font-medium">{{ t("actualizaciones.titulo") }}</h2>
      <p class="text-sm text-muted-foreground">{{ t("actualizaciones.ayuda") }}</p>
    </div>
    <div class="flex flex-wrap items-end gap-3">
      <div class="grid gap-1.5">
        <Label for="cfg-actualizar">{{ t("actualizaciones.frecuencia.etiqueta") }}</Label>
        <select id="cfg-actualizar" v-model="frecuencia" :class="claseSelect">
          <option v-for="f in FRECUENCIAS" :key="f" :value="f">{{ t(`actualizaciones.frecuencia.${f}`) }}</option>
        </select>
      </div>
      <Button type="button" variant="outline" size="sm" :disabled="a.buscando" @click="buscarActualizaciones">
        <RefreshCw aria-hidden="true" :class="a.buscando && 'animate-spin'" />
        {{ a.buscando ? t("actualizar.buscando") : t("actualizar.buscar") }}
      </Button>
    </div>
  </section>
</template>
