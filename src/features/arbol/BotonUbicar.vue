<script setup lang="ts">
import { computed } from "vue";
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
const { t } = useI18n();
const org = useOrganizacion();
const { ubicar, ubicaciones, textoDe } = useUbicar();

// La fila del directorio es de hoy: si el lienzo muestra otra fecha, mandan los puestos de la persona ese día.
const opciones = computed(() =>
  props.puestoId && !(org.fechaVista && props.personaId)
    ? [{ puestoId: props.puestoId, texto: "" }]
    : ubicaciones(props.personaId).map((u) => ({ puestoId: u.puestoId, texto: textoDe(u) })),
);

async function ir(puestoId: string, e?: Event) {
  const nueva = e instanceof MouseEvent && (e.ctrlKey || e.metaKey || e.button === 1);
  if (props.antes && !(await props.antes())) return;
  const r = ubicar(puestoId, nueva);
  if (!r.ok) toast.error(r.mensaje);
}
// El clic central llega como auxclick; el clic del menú trae el evento original en el detalle.
const auxiliar = (e: MouseEvent) => e.button === 1 && opciones.value.length === 1 && void ir(opciones.value[0]!.puestoId, e);
const original = (e: Event) => (e as CustomEvent<{ originalEvent?: Event }>).detail?.originalEvent;
</script>

<template>
  <Tooltip v-if="!opciones.length">
    <TooltipTrigger as-child>
      <Button
        type="button"
        variant="outline"
        :size="icono ? 'icon-xs' : 'sm'"
        aria-disabled="true"
        class="cursor-not-allowed text-muted-foreground"
        :aria-label="t('ubicar.verSinPuesto')"
        @click.stop.prevent
      >
        <LocateFixed aria-hidden="true" />
        <template v-if="!icono">{{ t("ubicar.ver") }}</template>
      </Button>
    </TooltipTrigger>
    <TooltipContent>{{ t("ubicar.sinPuesto") }}</TooltipContent>
  </Tooltip>
  <Button
    v-else-if="opciones.length === 1"
    type="button"
    :variant="icono ? 'ghost' : 'outline'"
    :size="icono ? 'icon-xs' : 'sm'"
    :aria-label="icono ? t('ubicar.ver') : undefined"
    :title="t('ubicar.verAyuda')"
    @click.stop="ir(opciones[0]!.puestoId, $event)"
    @auxclick.stop="auxiliar"
    @mousedown.middle.prevent
  >
    <LocateFixed aria-hidden="true" />
    <template v-if="!icono">{{ t("ubicar.ver") }}</template>
  </Button>
  <DropdownMenu v-else>
    <DropdownMenuTrigger as-child>
      <Button
        type="button"
        :variant="icono ? 'ghost' : 'outline'"
        :size="icono ? 'icon-xs' : 'sm'"
        :aria-label="icono ? t('ubicar.ver') : undefined"
        :title="t('ubicar.verAyuda')"
        @click.stop
      >
        <LocateFixed aria-hidden="true" />
        <template v-if="!icono">{{ t("ubicar.ver") }}</template>
        <ChevronDown v-if="!icono" class="-ml-0.5 size-3 opacity-60" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuLabel>{{ t("ubicar.cual") }}</DropdownMenuLabel>
      <DropdownMenuItem v-for="o in opciones" :key="o.puestoId" @select="ir(o.puestoId, original($event))">
        <LocateFixed aria-hidden="true" />
        <span class="truncate">{{ o.texto }}</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
