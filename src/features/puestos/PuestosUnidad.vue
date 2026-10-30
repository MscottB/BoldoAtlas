<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Briefcase, Plus } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { useOrganizacion } from "@/stores/organizacion";
import { usePuesto } from "./usePuesto";

// Botón "Puestos (n)" de la tarjeta seleccionada y la lista de puestos de su unidad. Solo existe en la tarjeta
// seleccionada: así el filtrado por unidad no se repite en cada tarjeta del lienzo.
const props = defineProps<{ unidadId: string }>();
const { t } = useI18n();
const org = useOrganizacion();
const ctl = usePuesto();

const abierto = ref(false);
const filas = computed(() => {
  const vigentes = vigentesPorPuesto(org.asignaciones);
  const nombre = (id?: string) => org.trabajadores.find((w) => w.id === id)?.nombre ?? "";
  return org.puestos
    .filter((p) => p.unidad_id === props.unidadId)
    .map((p) => ({
      id: p.id,
      cargo: org.catalogos.cargos.find((c) => c.id === p.cargo_id)?.nombre ?? "",
      titular: vigentes.get(p.id)?.titular && nombre(vigentes.get(p.id)!.titular!.trabajador_id),
      reemplazo: vigentes.get(p.id)?.reemplazo && nombre(vigentes.get(p.id)!.reemplazo!.trabajador_id),
    }));
});

function abrir(id: string | null) {
  abierto.value = false;
  if (id) ctl.abrir(id);
  else ctl.nuevo(props.unidadId);
}
</script>

<template>
  <Popover v-model:open="abierto">
    <PopoverTrigger as-child>
      <button
        type="button"
        class="nodrag flex h-5 min-w-5 items-center justify-center gap-0.5 rounded border px-1 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        :aria-label="t('puesto.puestos', { n: filas.length })"
        :title="t('puesto.puestos', { n: filas.length })"
        @click.stop
      >
        <Briefcase class="size-3" aria-hidden="true" />
        {{ filas.length }}
      </button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-72">
      <p v-if="!filas.length" class="text-sm text-muted-foreground">{{ t("puesto.sinPuestos") }}</p>
      <ul v-else class="grid gap-1">
        <li v-for="f in filas" :key="f.id">
          <button
            type="button"
            class="w-full rounded px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            @click="abrir(f.id)"
          >
            <span class="block truncate font-medium">{{ f.cargo }}</span>
            <span
              class="block truncate text-xs"
              :class="f.titular ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'"
            >
              {{ f.titular || t("puesto.vacante") }}
              <template v-if="f.reemplazo">
                · {{ t("puesto.reemplazoDe", { nombre: f.reemplazo }) }}</template
              >
            </span>
          </button>
        </li>
      </ul>
      <Button type="button" size="sm" variant="outline" @click="abrir(null)">
        <Plus aria-hidden="true" />
        {{ t("puesto.nuevoPuesto") }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
