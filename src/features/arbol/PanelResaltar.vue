<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronDown, Highlighter } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import BloquePlegable from "@/components/BloquePlegable.vue";
import { useVista } from "./useVista";
import { VISTA_POR_DEFECTO } from "./vista";
import { claseSelect, cn } from "@/lib/utils";

// Resalta las unidades con cierta etiqueta, con vacantes o con puestos/personas de cierta sede, contrato, jornada o
// cargo. Se suma al texto de «Buscar en el diagrama»: las que no coinciden se atenúan, no se ocultan.
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
  return [r.etiqueta, r.vacantes, r.sede, r.contrato, r.jornada, r.cargo].filter(Boolean).length;
});
// El texto de «Buscar en el diagrama» queda: es de la barra, no de este panel.
const quitar = () =>
  (config.value.resaltar = { ...VISTA_POR_DEFECTO.resaltar, texto: config.value.resaltar.texto });
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <Highlighter aria-hidden="true" />
        {{ t("arbol.resaltar.titulo") }}
        <ChevronDown class="-ml-0.5 hidden size-3 opacity-60 @min-[62rem]:block" aria-hidden="true" />
        <span v-if="activos" class="rounded-full bg-marca px-1.5 text-xs text-marca-foreground">
          {{ activos }}
          <span class="sr-only">{{ t("arbol.resaltar.activos", activos) }}</span>
        </span>
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72 gap-3 text-sm">
      <label class="grid gap-1">
        <span class="font-medium">{{ t("arbol.resaltar.etiqueta") }}</span>
        <select v-model="config.resaltar.etiqueta" :class="cn(claseSelect, 'h-7 w-full')">
          <option :value="null">{{ t("arbol.resaltar.cualquiera") }}</option>
          <option v-for="e in org.etiquetas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
        </select>
      </label>
      <label class="flex items-center gap-2">
        <input v-model="config.resaltar.vacantes" type="checkbox" class="size-4 accent-primary" />
        {{ t("arbol.resaltar.vacantes") }}
      </label>
      <!-- Con alguno de estos elegido, el bloque se abre solo: lo que resalta queda a la vista. -->
      <BloquePlegable
        clave="resaltar.masFiltros"
        :titulo="t('arbol.resaltar.masFiltros')"
        :abrir="campos.some((c) => config.resaltar[c.clave])"
        class="border-t pt-2"
      >
        <div class="grid gap-3 pt-2 pl-5">
          <label v-for="c in campos" :key="c.clave" class="grid gap-1">
            <span class="font-medium">{{ t(`arbol.resaltar.${c.clave}`) }}</span>
            <select v-model="config.resaltar[c.clave]" :class="cn(claseSelect, 'h-7 w-full')">
              <option :value="null">{{ t("arbol.resaltar.cualquiera") }}</option>
              <option v-for="v in org.activos(c.tabla)" :key="v.id" :value="v.id">{{ v.nombre }}</option>
            </select>
          </label>
        </div>
      </BloquePlegable>
      <p class="text-xs text-muted-foreground">{{ t("arbol.resaltar.ayuda") }}</p>
      <Button variant="outline" size="sm" class="self-start" @click="quitar">
        {{ t("arbol.resaltar.quitar") }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
