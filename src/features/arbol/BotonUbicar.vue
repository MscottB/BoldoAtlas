<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ChevronDown, LocateFixed } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatearFecha } from "@/features/puestos/puestos";
import { useOrganizacion } from "@/stores/organizacion";
import { useUbicar } from "./useUbicar";

// «Ver en el organigrama»: con un puesto, va a él; con varios, un menú «Cargo · Unidad» para elegir; sin ninguno vigente
// (en lo que muestra el lienzo: hoy o la fecha que se ve), deshabilitado con el motivo. Ctrl+clic o clic central: en
// una pestaña nueva.
const props = defineProps<{
  personaId: string | null;
  /** Un puesto ya conocido (la fila del directorio): va directo a él. */
  puestoId?: string | null;
  /** Solo el ícono (filas). */
  icono?: boolean;
  /** Antes de ir (la ficha se cierra); false cancela. */
  antes?: () => boolean | Promise<boolean>;
}>();
const { t, locale } = useI18n();
const org = useOrganizacion();
const { ubicar, ubicaciones, textoDe } = useUbicar();

// La fila del directorio es de hoy: si el lienzo muestra otra fecha, mandan los puestos de la persona ese día.
const opciones = computed(() =>
  props.puestoId && !(org.fechaVista && props.personaId)
    ? [{ puestoId: props.puestoId, texto: "" }]
    : ubicaciones(props.personaId).map((u) => ({ puestoId: u.puestoId, texto: textoDe(u) })),
);

// A una fecha, la ficha lista los puestos de hoy: el motivo dice de qué día habla.
const sinPuesto = computed(() =>
  org.fechaVista
    ? t("ubicar.sinPuestoAl", { fecha: formatearFecha(org.fechaVista, locale.value) })
    : t("ubicar.sinPuesto"),
);

async function ir(puestoId: string, nueva = false) {
  if (props.antes && !(await props.antes())) return;
  const r = ubicar(puestoId, nueva);
  if (!r.ok) toast.error(r.mensaje);
}
const menu = ref(false);
// El evento `select` del menú no trae el clic que lo causó: el Ctrl se toma del clic real, antes de que el menú lo atienda.
let conCtrl = false;
const anotarCtrl = (e: MouseEvent) => (conCtrl = e.ctrlKey || e.metaKey);
// Clic central: llega como auxclick y el menú no lo atiende (hay que cerrarlo).
function alPulsarAux(e: MouseEvent, puestoId: string) {
  if (e.button !== 1) return;
  menu.value = false;
  void ir(puestoId, true);
}
</script>

<template>
  <Tooltip v-if="!opciones.length">
    <TooltipTrigger as-child>
      <Button
        type="button"
        :variant="icono ? 'ghost' : 'outline'"
        :size="icono ? 'icon-xs' : 'sm'"
        aria-disabled="true"
        class="cursor-not-allowed text-muted-foreground"
        :aria-label="t('ubicar.verSinPuesto', { motivo: sinPuesto })"
        @click.stop.prevent
        @auxclick.stop
      >
        <LocateFixed aria-hidden="true" />
        <template v-if="!icono">{{ t("ubicar.ver") }}</template>
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ sinPuesto }}</TooltipContent>
  </Tooltip>
  <Button
    v-else-if="opciones.length === 1"
    type="button"
    :variant="icono ? 'ghost' : 'outline'"
    :size="icono ? 'icon-xs' : 'sm'"
    :aria-label="icono ? t('ubicar.ver') : undefined"
    :title="t('ubicar.verAyuda')"
    @click.stop="ir(opciones[0]!.puestoId, $event.ctrlKey || $event.metaKey)"
    @auxclick.stop="alPulsarAux($event, opciones[0]!.puestoId)"
    @mousedown.middle.prevent
  >
    <LocateFixed aria-hidden="true" />
    <template v-if="!icono">{{ t("ubicar.ver") }}</template>
  </Button>
  <DropdownMenu v-else v-model:open="menu">
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        :variant="icono ? 'ghost' : 'outline'"
        :size="icono ? 'icon-xs' : 'sm'"
        :aria-label="icono ? t('ubicar.ver') : undefined"
        :title="t('ubicar.verAyuda')"
        @click.stop
        @auxclick.stop
      >
        <LocateFixed aria-hidden="true" />
        <template v-if="!icono">{{ t("ubicar.ver") }}</template>
        <ChevronDown v-if="!icono" class="-ml-0.5 size-3 opacity-60" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>{{ t("ubicar.cual") }}</DropdownMenuLabel>
      <DropdownMenuItem
        v-for="o in opciones"
        :key="o.puestoId"
        @click.capture="anotarCtrl"
        @select="ir(o.puestoId, conCtrl)"
        @auxclick="alPulsarAux($event, o.puestoId)"
        @mousedown.middle.prevent
      >
        <LocateFixed aria-hidden="true" />
        <span class="truncate">{{ o.texto }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
