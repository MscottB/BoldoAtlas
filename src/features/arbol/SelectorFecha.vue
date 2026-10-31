<script setup lang="ts">
import { computed, shallowRef } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { getLocalTimeZone, parseDate, type CalendarDate, type DateValue } from "@internationalized/date";
import {
  CalendarCell,
  CalendarCellTrigger,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHead,
  CalendarGridRow,
  CalendarHeadCell,
  CalendarHeader,
  CalendarNext,
  CalendarPrev,
  CalendarRoot,
} from "reka-ui";
import { CalendarDays, ChevronLeft, ChevronRight } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FECHA_MINIMA, fechaElegible, formatearFecha, hoyISO } from "@/features/puestos/puestos";
import { useOrganizacion } from "@/stores/organizacion";
import { diaConCambios, type Cambio } from "./cambios";
import { unidadesDeRama } from "./layout";
import { useLienzo } from "./useLienzo";
import { claseSelect, cn } from "@/lib/utils";

// «Ver en otra fecha»: el botón muestra la fecha vista (si hay una) y abre la fecha escrita y un calendario donde se
// destacan los días con cambios; al elegir un día se ve el organigrama de ese día y, debajo, sus cambios.
const { t, locale } = useI18n();
const org = useOrganizacion();
const route = useRoute();
const router = useRouter();
const { revelar } = useLienzo();

/** Cambios que se listan como máximo (un alta masiva deja miles en un día). */
const MAX_LISTA = 100;

async function verFecha(v: string | null) {
  if (v === org.fechaVista) return;
  const r = await org.verAFecha(v);
  if (!r.ok) toast.error(r.mensaje);
}
// Fecha escrita (la de 18d): vacía = hoy. Solo se aplica una fecha completa y en rango: al teclear el año el campo pasa
// por 0002-…, 0020-…, que no se aplican. Al salir del campo (o con Enter) el vacío vuelve a hoy y lo a medias se descarta.
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

const minimo = parseDate(FECHA_MINIMA);
/** Mes que muestra el calendario (Reka lo mueve solo al cambiar la fecha elegida). */
const mesVisible = shallowRef<DateValue>(parseDate(hoyISO()));
const nombreMes = computed(() => new Intl.DateTimeFormat(locale.value, { month: "long" }));
const meses = computed(() => Array.from({ length: 12 }, (_, i) => nombreMes.value.format(new Date(2000, i, 1))));
const anios = computed(() =>
  Array.from({ length: Number(hoyISO().slice(0, 4)) - minimo.year + 1 }, (_, i) => minimo.year + i).reverse(),
);
// Saltar de mes o de año con los selectores sin salir del rango (un mes futuro de este año queda en hoy).
function irAMes(cambio: { year?: number; month?: number }) {
  const hoy = parseDate(hoyISO());
  const m = (mesVisible.value as CalendarDate).set(cambio);
  mesVisible.value = m.compare(hoy) > 0 ? hoy : m.compare(minimo) < 0 ? minimo : m;
}
const valorDe = (e: Event) => Number((e.target as HTMLSelectElement).value);

// Los cambios se calculan al abrir (una vez, hasta la próxima carga del store).
async function alAbrir(abierto: boolean) {
  if (!abierto) return;
  mesVisible.value = elegida.value ?? parseDate(hoyISO());
  const r = await org.leerCambios();
  if (!r.ok) toast.error(r.mensaje);
}

const elegida = computed(() => (org.fechaVista ? parseDate(org.fechaVista) : undefined));
const cuantos = (d: DateValue) => org.cambios?.get(d.toString())?.length ?? 0;
const formatoLargo = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: "full" }));
// Reka pone su propia etiqueta al día; se reemplaza para sumarle cuántos cambios tuvo.
function etiqueta(d: DateValue) {
  const n = cuantos(d);
  const fecha = formatoLargo.value.format(d.toDate(getLocalTimeZone()));
  return n ? `${fecha}, ${t("arbol.fecha.nCambios", n)}` : fecha;
}

const delDia = computed<Cambio[]>(() => (org.fechaVista && org.cambios?.get(org.fechaVista)) || []);
const dias = computed(() => [...(org.cambios?.keys() ?? [])]);
const saltar = (sentido: 1 | -1) =>
  diaConCambios(dias.value, org.fechaVista ?? hoyISO(), sentido, FECHA_MINIMA, hoyISO());
const anterior = computed(() => saltar(-1));
const siguiente = computed(() => saltar(1));

// Como la paleta: dentro de la rama enfocada (o sin enfocar) basta revelarla; si no, el árbol completo con ella.
function irA(id: string) {
  const raiz = route.query.raiz;
  const dentro = typeof raiz !== "string" || unidadesDeRama(org.enFecha.unidades, raiz).some((u) => u.id === id);
  if (dentro) revelar(id);
  else void router.push({ name: "arbol", query: { ver: id } });
}
</script>

<template>
  <Popover @update:open="alAbrir">
    <PopoverTrigger as-child>
      <!-- data-fecha-vista: «Volver a hoy» de la franja deja el foco aquí. -->
      <Button
        data-fecha-vista
        variant="outline"
        size="sm"
        :aria-label="
          org.fechaVista
            ? t('arbol.fecha.cambiar', { fecha: formatearFecha(org.fechaVista, locale) })
            : t('arbol.fecha.verOtra')
        "
      >
        <CalendarDays aria-hidden="true" />
        <template v-if="org.fechaVista">{{ formatearFecha(org.fechaVista, locale) }}</template>
        <!-- Con poco ancho en la barra (BarraLienzo es @container), solo «Fecha». -->
        <template v-else>
          <span class="hidden @min-[62rem]:inline">{{ t("arbol.fecha.verOtra") }}</span>
          <span class="@min-[62rem]:hidden">{{ t("arbol.fecha.corta") }}</span>
        </template>
      </Button>
    </PopoverTrigger>
    <!-- El foco entra al día elegido (o a hoy), no al botón del mes anterior. -->
    <PopoverContent align="start" class="w-80 gap-2 text-sm" @open-auto-focus.prevent>
      <label class="grid gap-1">
        <span id="titulo-fecha-vista" class="font-medium">{{ t("arbol.fecha.titulo") }}</span>
        <Input
          type="date"
          class="h-8"
          :min="FECHA_MINIMA"
          :max="hoyISO()"
          :model-value="org.fechaVista ?? ''"
          aria-describedby="ayuda-fecha-vista"
          @change="cambiarFecha"
          @blur="terminarFecha"
          @keydown.enter="terminarFecha"
        />
      </label>
      <CalendarRoot
        v-slot="{ grid, weekDays }"
        v-model:placeholder="mesVisible"
        :model-value="elegida"
        :min-value="minimo"
        :max-value="parseDate(hoyISO())"
        :locale="locale"
        prevent-deselect
        initial-focus
        fixed-weeks
        weekday-format="short"
        aria-labelledby="titulo-fecha-vista"
        aria-describedby="ayuda-fecha-vista"
        @update:model-value="(d: DateValue | undefined) => d && verFecha(d.toString())"
      >
        <CalendarHeader class="flex items-center justify-between">
          <CalendarPrev as-child>
            <Button variant="ghost" size="icon-sm" :aria-label="t('arbol.fecha.mesAnterior')">
              <ChevronLeft aria-hidden="true" />
            </Button>
          </CalendarPrev>
          <div class="flex gap-1">
            <select
              :value="mesVisible.month"
              :aria-label="t('arbol.fecha.mes')"
              :class="cn(claseSelect, 'h-7 px-1')"
              @change="irAMes({ month: valorDe($event) })"
            >
              <option v-for="(m, i) in meses" :key="i" :value="i + 1">{{ m }}</option>
            </select>
            <select
              :value="mesVisible.year"
              :aria-label="t('arbol.fecha.anio')"
              :class="cn(claseSelect, 'h-7 px-1')"
              @change="irAMes({ year: valorDe($event) })"
            >
              <option v-for="a in anios" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
          <CalendarNext as-child>
            <Button variant="ghost" size="icon-sm" :aria-label="t('arbol.fecha.mesSiguiente')">
              <ChevronRight aria-hidden="true" />
            </Button>
          </CalendarNext>
        </CalendarHeader>
        <CalendarGrid v-for="mes in grid" :key="mes.value.toString()" class="mt-1 w-full border-collapse">
          <CalendarGridHead>
            <CalendarGridRow class="grid grid-cols-7">
              <CalendarHeadCell
                v-for="d in weekDays"
                :key="d"
                class="py-1 text-xs font-normal text-muted-foreground"
              >
                {{ d }}
              </CalendarHeadCell>
            </CalendarGridRow>
          </CalendarGridHead>
          <CalendarGridBody>
            <CalendarGridRow v-for="(semana, i) in mes.rows" :key="i" class="grid grid-cols-7">
              <CalendarCell v-for="d in semana" :key="d.toString()" :date="d" class="p-0.5">
                <CalendarCellTrigger
                  :day="d"
                  :month="mes.value"
                  :aria-label="etiqueta(d)"
                  :data-cambios="cuantos(d) ? '' : undefined"
                  class="group relative mx-auto flex size-8 cursor-default flex-col items-center justify-center rounded-md outline-none select-none hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-solid focus-visible:outline-foreground data-cambios:bg-marca/15 data-cambios:font-semibold data-cambios:hover:bg-marca/30 data-disabled:pointer-events-none data-disabled:opacity-40 data-outside-view:text-muted-foreground data-today:ring-1 data-today:ring-muted-foreground data-selected:bg-primary! data-selected:text-primary-foreground"
                >
                  {{ d.day }}
                  <span
                    v-if="cuantos(d)"
                    aria-hidden="true"
                    class="absolute bottom-0.5 size-1 rounded-full bg-foreground group-data-selected:bg-primary-foreground"
                  />
                </CalendarCellTrigger>
              </CalendarCell>
            </CalendarGridRow>
          </CalendarGridBody>
        </CalendarGrid>
      </CalendarRoot>
      <div class="flex justify-between gap-2">
        <Button variant="outline" size="sm" :disabled="!anterior" @click="anterior && verFecha(anterior)">
          <ChevronLeft aria-hidden="true" />
          {{ t("arbol.fecha.cambioAnterior") }}
        </Button>
        <Button variant="outline" size="sm" :disabled="!siguiente" @click="siguiente && verFecha(siguiente)">
          {{ t("arbol.fecha.cambioSiguiente") }}
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <p id="ayuda-fecha-vista" class="text-xs text-muted-foreground">{{ t("arbol.fecha.ayuda") }}</p>
      <!-- La lista aparece al elegir un día. -->
      <section v-if="org.fechaVista" class="grid gap-1 border-t pt-2" aria-labelledby="cambios-fecha-vista">
        <p id="cambios-fecha-vista" class="font-medium" aria-live="polite">
          {{ t("arbol.fecha.cambiosDelDia") }}
          <span class="font-normal text-muted-foreground">· {{ t("arbol.fecha.nCambios", delDia.length) }}</span>
        </p>
        <p v-if="!delDia.length" class="text-xs text-muted-foreground">{{ t("arbol.fecha.sinCambios") }}</p>
        <ul v-else class="-mx-1 grid max-h-56 gap-0.5 overflow-y-auto">
          <li v-for="(c, i) in delDia.slice(0, MAX_LISTA)" :key="i">
            <button
              v-if="org.enFecha.porId.has(c.unidadId)"
              type="button"
              class="w-full rounded-md px-1 py-0.5 text-left underline decoration-muted-foreground decoration-dotted underline-offset-4 outline-none hover:bg-accent hover:decoration-solid focus-visible:ring-2 focus-visible:ring-ring"
              @click="irA(c.unidadId)"
            >
              {{ t(`arbol.fecha.cambio.${c.tipo}`, { ...c }) }}
            </button>
            <span v-else class="block px-1 py-0.5">{{ t(`arbol.fecha.cambio.${c.tipo}`, { ...c }) }}</span>
          </li>
          <li v-if="delDia.length > MAX_LISTA" class="px-1 text-xs text-muted-foreground">
            {{ t("arbol.fecha.masCambios", delDia.length - MAX_LISTA) }}
          </li>
        </ul>
      </section>
    </PopoverContent>
  </Popover>
</template>
