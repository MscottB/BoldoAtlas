<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Highlighter } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import { useVista } from "./useVista";

// Resalta las unidades con vacantes o con puestos/personas de cierta sede, contrato, jornada o cargo.
// Se suma a la etiqueta y al texto de la barra: las que no coinciden se atenúan, no se ocultan.
const { t } = useI18n();
const org = useOrganizacion();
const { config } = useVista();

const campos = [
  { clave: "sede", tabla: "sedes" },
  { clave: "contrato", tabla: "tipos_contrato" },
  { clave: "jornada", tabla: "jornadas" },
  { clave: "cargo", tabla: "cargos" },
] as const;

const activos = computed(() => {
  const r = config.value.resaltar;
  return [r.vacantes, r.sede, r.contrato, r.jornada, r.cargo].filter(Boolean).length;
});
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <Highlighter aria-hidden="true" />
        {{ t("arbol.resaltar.titulo") }}
        <span v-if="activos" class="rounded-full bg-marca px-1.5 text-xs text-marca-foreground">
          {{ activos }}
          <span class="sr-only">{{ t("arbol.resaltar.activos", activos) }}</span>
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72 gap-3 text-sm">
      <label class="flex items-center gap-2">
        <input v-model="config.resaltar.vacantes" type="checkbox" class="size-4 accent-primary" />
        {{ t("arbol.resaltar.vacantes") }}
      </label>
      <label v-for="c in campos" :key="c.clave" class="grid gap-1">
        <span class="font-medium">{{ t(`arbol.resaltar.${c.clave}`) }}</span>
        <select v-model="config.resaltar[c.clave]" class="h-7 rounded-md border bg-background px-2 text-sm">
          <option :value="null">{{ t("arbol.resaltar.cualquiera") }}</option>
          <option v-for="v in org.activos(c.tabla)" :key="v.id" :value="v.id">{{ v.nombre }}</option>
        </select>
      </label>
      <p class="text-xs text-muted-foreground">{{ t("arbol.resaltar.ayuda") }}</p>
    </PopoverContent>
  </Popover>
</template>
