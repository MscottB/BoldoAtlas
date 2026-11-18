<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Label } from "@/components/ui/label";
import { useOrganizacion } from "@/stores/organizacion";
import { claseSelect, cn } from "@/lib/utils";

// Configuración › Historial de cambios: cuántos días se guarda; "0" es sin límite (historial::podar).
const { t } = useI18n();
const org = useOrganizacion();
const PLAZOS = ["30", "90", "365", "0"];
// Un plazo guardado de otra forma (a mano, otra versión) también se ve.
const plazos = computed(() =>
  PLAZOS.includes(org.plazoHistorial) ? PLAZOS : [...PLAZOS, org.plazoHistorial],
);
const texto = (d: string) =>
  PLAZOS.includes(d) ? t(`config.historial.opciones.${d}`) : t("config.historial.dias", { n: d }, Number(d));
async function guardar(dias: string) {
  const r = await org.guardarPlazoHistorial(dias);
  if (!r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <section class="grid gap-1.5" aria-labelledby="cfg-historial">
    <h2 id="cfg-historial" class="font-medium">{{ t("config.historial.titulo") }}</h2>
    <Label for="cfg-plazo">{{ t("config.historial.plazo") }}</Label>
    <select
      id="cfg-plazo"
      :class="cn(claseSelect, 'w-fit')"
      aria-describedby="cfg-plazo-ayuda"
      @change="guardar(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="d in plazos" :key="d" :value="d" :selected="d === org.plazoHistorial">
        {{ texto(d) }}
      </option>
    </select>
    <p id="cfg-plazo-ayuda" class="text-sm text-muted-foreground">{{ t("config.historial.ayuda") }}</p>
  </section>
</template>
