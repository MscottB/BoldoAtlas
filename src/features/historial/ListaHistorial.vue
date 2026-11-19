<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight } from "@lucide/vue";
import DetalleAccion from "./DetalleAccion.vue";
import { frase } from "./frases";
import { agruparPorDia, posicionEstasAqui } from "./historial";
import type { AccionBreve, FilaDetalle } from "./tipos";

// Las acciones por día, de la más nueva a la más antigua. La abierta lleva su detalle debajo: lo que no es de la lista
// (pregunta, ocupado, puedeIr, nombreDe y los eventos ir, mover, volver, confirmar, cancelar) pasa tal cual a él.
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  acciones: AccionBreve[];
  soloLectura: boolean;
  abierta: string | null;
  /** El detalle de la abierta; null mientras se lee. */
  filas: FilaDetalle[] | null;
  /** La zona horaria de los días y las horas; sin ella, la del equipo. */
  zona?: string;
}>();
defineEmits<{ abrir: [id: string | null] }>();
const { t, locale } = useI18n();

const zona = computed(() => props.zona ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
const grupos = computed(() => agruparPorDia(props.acciones, zona.value));
// La línea va antes de la primera hecha; si todo lo que se ve está deshecho, al final.
const estasAqui = computed(() => props.acciones[posicionEstasAqui(props.acciones)]?.id ?? null);
const dia = (d: string) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: "full", timeZone: "UTC" }).format(
    new Date(`${d}T00:00:00Z`),
  );
const hora = (f: string) =>
  new Intl.DateTimeFormat(locale.value, { timeStyle: "short", timeZone: zona.value }).format(new Date(f));
const motivoBloqueo = (a: AccionBreve) =>
  t(a.origen === "suprimir" ? "historial.vista.bloqueadaSuprimir" : "historial.vista.bloqueadaPersona");
</script>

<template>
  <div class="grid gap-4">
    <section v-for="g in grupos" :key="g.dia" class="grid gap-1">
      <h3 class="text-sm font-medium text-muted-foreground first-letter:uppercase">{{ dia(g.dia) }}</h3>
      <ul class="divide-y rounded-lg border bg-card">
        <li v-for="a in g.acciones" :key="a.id" :data-accion="a.id" :data-estado="a.estado">
          <p
            v-if="a.id === estasAqui"
            class="flex items-center gap-2 px-3 pt-2 text-xs font-semibold text-primary"
            data-estas-aqui
          >
            <span class="h-px flex-1 bg-primary" aria-hidden="true" />
            {{ t("historial.vista.estasAqui") }}
            <span class="h-px flex-1 bg-primary" aria-hidden="true" />
          </p>
          <button
            type="button"
            class="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
            :aria-expanded="a.id === abierta"
            @click="$emit('abrir', a.id === abierta ? null : a.id)"
          >
            <ChevronRight
              class="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform"
              :class="a.id === abierta && 'rotate-90'"
              aria-hidden="true"
            />
            <span class="w-14 shrink-0 tabular-nums text-muted-foreground">{{ hora(a.fecha) }}</span>
            <span class="grid min-w-0 flex-1 gap-0.5" :class="a.estado === 'deshecha' && 'opacity-60'">
              <span class="break-words">{{ frase(a, t) }}</span>
              <span class="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                {{ t("historial.vista.elementos", a.filas) }}
                <span
                  v-if="a.estado === 'deshecha'"
                  class="rounded bg-muted px-1.5 font-medium text-foreground"
                  >{{ t("historial.estado.deshecha") }}</span
                >
              </span>
              <span v-if="a.bloqueada" class="text-xs text-muted-foreground">{{ motivoBloqueo(a) }}</span>
            </span>
          </button>
          <DetalleAccion
            v-if="a.id === abierta"
            v-bind="$attrs"
            :accion="a"
            :filas="filas"
            :solo-lectura="soloLectura"
          />
        </li>
      </ul>
    </section>
    <p
      v-if="acciones.length && !estasAqui"
      class="flex items-center gap-2 text-xs font-semibold text-primary"
      data-estas-aqui
    >
      <span class="h-px flex-1 bg-primary" aria-hidden="true" />
      {{ t("historial.vista.estasAqui") }}
      <span class="h-px flex-1 bg-primary" aria-hidden="true" />
    </p>
  </div>
</template>
