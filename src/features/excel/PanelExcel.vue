<script setup lang="ts">
import { computed, ref, toRaw, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { consultar } from "@/db/cliente";
import { SQL_NOTAS_EXCEL } from "@/db/repos/trabajadores";
import { formatearFecha } from "@/features/puestos/puestos";
import SelectorUnidad from "@/features/unidades/SelectorUnidad.vue";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion } from "@/stores/organizacion";
import BotonExcel from "./BotonExcel.vue";
import { armarCompleta } from "./completa";
import type { Lista } from "./exportar";
import type { Hoja } from "./libro";
import { claveColumna, HOJAS, ID_HOJAS, leerSeleccion } from "./seleccion";

// La exportación completa (spec §11): alcance, hojas y columnas. Lo marcado se recuerda por PC; el alcance, no (es de
// cada exportación). Sigue a «Organigrama a una fecha», como el lienzo.
const emit = defineEmits<{ terminar: [] }>();
const { t, locale } = useI18n();
const org = useOrganizacion();

const PREFERENCIA = "excel:completa";
const sel = ref(leerSeleccion(leerPreferencia<unknown>(PREFERENCIA, null)));
watch(sel, (s) => guardarPreferencia(PREFERENCIA, s), { deep: true });

const NINGUNA = new Set<string>();
const alcance = ref<string | null>(null);
const textoAlcance = computed(() => {
  const u = alcance.value && (org.enFecha.porId.get(alcance.value) ?? org.porId.get(alcance.value));
  if (!u) return t("excel.completa.toda");
  const tipo = org.catalogos.tipos_unidad.find((x) => x.id === u.tipo_id)?.nombre ?? "";
  return t("excel.completa.rama", { unidad: u.nombre, tipo });
});

async function lista(): Promise<Lista> {
  const s = leerSeleccion(sel.value); // una copia: lo que se marque mientras se arma no se mezcla
  // Las notas no están en el store: se piden solo si van.
  const notas =
    s.trabajadores.incluida && s.trabajadores.columnas.notas
      ? new Map((await consultar<{ id: string; notas: string }>(SQL_NOTAS_EXCEL)).map((f) => [f.id, f.notas]))
      : undefined;
  // Sin el proxy reactivo del store: con una organización grande, leer a través de él tarda el doble.
  const e = org.enFecha;
  const datos = {
    unidades: toRaw(e.unidades),
    puestos: toRaw(e.puestos),
    asignaciones: toRaw(e.asignaciones),
    trabajadores: toRaw(e.trabajadores),
    catalogos: toRaw(org.catalogos),
    leyendas: toRaw(org.leyendas),
    etiquetas: toRaw(org.etiquetas),
    unidadEtiquetas: toRaw(org.unidadEtiquetas),
    zonas: toRaw(org.zonas),
    zonaUnidades: toRaw(org.zonaUnidades),
    conexiones: toRaw(org.conexiones),
    notas,
    fechaVista: org.fechaVista,
    hoy: new Date(),
  };
  const completa = {
    nombre: t("excel.completa.lista"),
    hojas: [] as Hoja[],
    alcance: textoAlcance.value,
    fecha: org.fechaVista,
  };
  // Con una organización grande cada hoja toma de 10 a 40 ms: entre una y otra, la ventana atiende lo que llegue.
  for (const h of armarCompleta(datos, alcance.value, s, t)) {
    completa.hojas.push(h);
    await new Promise((r) => setTimeout(r));
  }
  return completa;
}
</script>

<template>
  <div class="grid gap-4">
    <h2 class="font-medium">{{ t("excel.completa.titulo") }}</h2>

    <div class="grid gap-1.5">
      <Label for="excel-alcance">{{ t("excel.completa.alcance") }}</Label>
      <div class="w-80 max-w-full">
        <SelectorUnidad
          id="excel-alcance"
          aria-describedby="excel-alcance-ayuda"
          :excluidas="NINGUNA"
          :texto="textoAlcance"
          :ninguna="t('excel.completa.toda')"
          @elegir="alcance = $event"
        />
      </div>
      <p id="excel-alcance-ayuda" class="text-sm text-muted-foreground">
        {{ t("excel.completa.alcanceAyuda") }}
      </p>
    </div>

    <p v-if="org.fechaVista" class="text-sm">
      {{ t("excel.completa.fecha", { fecha: formatearFecha(org.fechaVista, locale) }) }}
    </p>

    <fieldset class="grid gap-3">
      <legend class="mb-1 text-sm font-medium">{{ t("excel.completa.hojasTitulo") }}</legend>
      <label class="flex items-center gap-2 text-sm text-muted-foreground">
        <input type="checkbox" checked disabled class="size-4 accent-primary" />
        {{ t("excel.completa.informacion") }}
      </label>
      <div v-for="h in ID_HOJAS" :key="h" class="grid gap-1">
        <label class="flex items-center gap-2 text-sm font-medium">
          <input v-model="sel[h].incluida" type="checkbox" class="size-4 accent-primary" />
          {{ t(`excel.completa.hojas.${h}`) }}
        </label>
        <fieldset v-if="sel[h].incluida" class="flex flex-wrap gap-x-4 gap-y-1 pl-6">
          <legend class="sr-only">
            {{ t("excel.completa.columnasDe", { hoja: t(`excel.completa.hojas.${h}`) }) }}
          </legend>
          <label v-for="c in HOJAS[h]" :key="c" class="flex items-center gap-1.5 text-sm">
            <input v-model="sel[h].columnas[c]" type="checkbox" class="size-4 accent-primary" />
            {{ t(claveColumna(h, c)) }}
          </label>
        </fieldset>
      </div>
    </fieldset>

    <div class="flex gap-2">
      <BotonExcel variant="default" size="default" :lista="lista" :texto="t('excel.completa.boton')" />
      <Button type="button" variant="outline" @click="emit('terminar')">{{
        t("intercambio.cancelar")
      }}</Button>
    </div>
  </div>
</template>
