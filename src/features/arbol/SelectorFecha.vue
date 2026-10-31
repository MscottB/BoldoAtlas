<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { CalendarDays } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FECHA_MINIMA, fechaElegible, formatearFecha, hoyISO } from "@/features/puestos/puestos";
import { useOrganizacion } from "@/stores/organizacion";

// «Ver en otra fecha»: el botón muestra la fecha vista (si hay una) y abre el selector. Lo de adentro del popover es
// solo el campo de fecha: se puede reemplazar sin tocar el botón (p. ej. por un calendario).
const { t, locale } = useI18n();
const org = useOrganizacion();

// Fecha elegida: vacía = hoy. Solo se aplica una fecha completa y en rango: al teclear el año el campo pasa por 0002-…,
// 0020-…, que no se aplican. Al salir del campo (o con Enter) el vacío vuelve a hoy y lo que quedó a medias se descarta.
async function verFecha(v: string | null) {
  if (v === org.fechaVista) return;
  const r = await org.verAFecha(v);
  if (!r.ok) toast.error(r.mensaje);
}
function cambiarFecha(e: Event) {
  const v = (e.target as HTMLInputElement).value;
  if (fechaElegible(v, hoyISO())) void verFecha(v);
}
function terminarFecha(e: Event) {
  const campo = e.target as HTMLInputElement;
  const v = campo.value;
  if (fechaElegible(v, hoyISO())) return; // ya se aplicó al cambiar
  campo.value = v ? (org.fechaVista ?? "") : ""; // borra también los segmentos a medias
  if (!v) void verFecha(null);
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <!-- data-fecha-vista: «Volver a hoy» de la franja deja el foco aquí. -->
      <Button
        data-fecha-vista
        variant="outline"
        size="sm"
        :aria-label="
          org.fechaVista
            ? t('arbol.fecha.cambiar', { fecha: formatearFecha(org.fechaVista, locale) })
            : undefined
        "
      >
        <CalendarDays aria-hidden="true" />
        {{ org.fechaVista ? formatearFecha(org.fechaVista, locale) : t("arbol.fecha.verOtra") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72 gap-2 text-sm">
      <label class="grid gap-1">
        <span class="font-medium">{{ t("arbol.fecha.titulo") }}</span>
        <Input
          type="date"
          class="h-8"
          :min="FECHA_MINIMA"
          :max="hoyISO()"
          :model-value="org.fechaVista ?? ''"
          @change="cambiarFecha"
          @blur="terminarFecha"
          @keydown.enter="terminarFecha"
        />
      </label>
      <p class="text-xs text-muted-foreground">{{ t("arbol.fecha.ayuda") }}</p>
    </PopoverContent>
  </Popover>
</template>
