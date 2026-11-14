<script setup lang="ts">
import { computed, inject, nextTick, useTemplateRef, watch } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { Briefcase } from "@lucide/vue";
import { useI18n } from "vue-i18n";
import { useEstilo } from "@/features/puestos/useEstilo";
import { usePuesto } from "@/features/puestos/usePuesto";
import { marcaTenue, textoSobre } from "@/features/tema/tema";
import { useTema } from "@/features/tema/useTema";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";
import { tamPuesto } from "./vista";
import { CONTEXTO_LIENZO } from "./contexto";
import { claseDe, colorDeClase, esCriterioEscala, textoEscala } from "./escala";

export interface DatosPuesto {
  cargo: string;
  titular: string | null;
  reemplazo: string | null;
  leyendaId: string | null;
}

const props = defineProps<{ id: string; data: DatosPuesto }>();
const { t } = useI18n();
const { abrir } = usePuesto();
const { copiar, pegar } = useEstilo();
const { config } = useVista();
const { escala, oscuro } = useTema();
const contexto = inject(CONTEXTO_LIENZO)!;
// Entrada de leyenda cuando «Colorear por» es la leyenda del puesto; null = sin color.
const leyenda = computed(
  () => (props.data.leyendaId && contexto.leyendas.value?.get(props.data.leyendaId)) || null,
);
// Con «Colorear por» antigüedad o a cargo: el color de su rango y el valor escrito al lado (el color nunca va solo).
const etiquetaEscala = computed(() => {
  const v = contexto.escala.value?.get(props.id);
  const c = config.value.colorearPor;
  if (!v || !esCriterioEscala(c)) return null;
  const { clave, n } = textoEscala(c, v);
  return { color: colorDeClase(claseDe(v)), texto: t(clave, { n }, n), criterio: t(`arbol.vista.${c}`) };
});
const color = computed(() => leyenda.value?.color ?? etiquetaEscala.value?.color ?? null);
// Si la tarjeta tenía el foco al cambiar de detalle, lo recibe su nuevo elemento (si no, caería en <body>).
const raiz = useTemplateRef<HTMLElement>("raiz");
watch(contexto.ligera, async () => {
  if (raiz.value !== document.activeElement) return;
  await nextTick();
  raiz.value?.focus();
});
// El puesto de una persona que se buscó con «Ver en el organigrama»: marcado como la unidad seleccionada.
const { puestoUbicado } = useLienzo();
const ubicado = computed(() => puestoUbicado.value === props.id);
const compacta = computed(() => config.value.densidad === "compacta");
const horizontal = computed(() => config.value.direccion === "horizontal");
// Misma función que usa el layout.
const tam = computed(() => {
  const { ancho, alto } = tamPuesto(config.value, escala.value);
  return `width: ${ancho}px; height: ${alto}px`; // texto: si no cambia, la tarjeta no se vuelve a pintar
});
</script>

<template>
  <!-- Nodo liviano; su tamaño sale de tamPuesto, igual que en el layout. Lo oculto por «Vista» queda solo para lectores de pantalla. -->
  <Handle type="target" :position="horizontal ? Position.Left : Position.Top" class="opacity-0" />
  <!-- Del puesto sale la línea al siguiente puesto de su unidad o, si es el último, a las unidades hijas. -->
  <Handle type="source" :position="horizontal ? Position.Right : Position.Bottom" class="opacity-0" />
  <!-- Ligera (rendimiento.ts): un solo elemento con el cargo y el color de la leyenda. -->
  <div
    v-if="contexto.ligera.value"
    ref="raiz"
    role="button"
    tabindex="0"
    class="nodrag content-center truncate rounded-md border bg-card px-2 text-xl leading-tight font-medium text-card-foreground focus-visible:outline-4 focus-visible:outline-ring"
    :class="[color && 'border-l-[12px]', ubicado && 'border-marca ring-2 ring-marca']"
    :aria-current="ubicado || undefined"
    :style="[tam, color ? { borderColor: color } : {}]"
    @click.stop="abrir(id)"
    @keydown.enter.prevent="abrir(id)"
    @keydown.space.prevent="abrir(id)"
    @keydown.ctrl.c.exact="copiar(id)"
    @keydown.ctrl.v.exact="pegar(id)"
  >
    {{ data.cargo }}
  </div>
  <button
    v-else
    ref="raiz"
    type="button"
    class="nodrag flex items-center gap-2 rounded-md border bg-card px-2 text-left text-xs text-card-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
    :class="[color && 'border-l-[6px]', ubicado && 'border-marca ring-2 ring-marca']"
    :aria-current="ubicado || undefined"
    :style="[tam, color ? { borderColor: color } : {}]"
    :title="leyenda?.nombre"
    @click.stop="abrir(id)"
    @keydown.ctrl.c.exact="copiar(id)"
    @keydown.ctrl.v.exact="pegar(id)"
  >
    <Briefcase class="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span v-if="leyenda" class="sr-only">{{ t("leyenda.deLeyenda", { nombre: leyenda.nombre }) }}</span>
    <span class="min-w-0" :class="compacta ? 'flex gap-1.5' : 'grid'">
      <span :class="config.mostrarCargo ? 'truncate font-medium' : 'sr-only'">{{ data.cargo }}</span>
      <span :class="config.mostrarPersona ? (compacta ? 'flex min-w-0' : 'grid') : 'sr-only'">
        <span class="truncate" :class="!data.titular && 'text-amber-800 dark:text-amber-400'">
          {{ data.titular || t("puesto.vacante") }}
        </span>
        <span v-if="data.reemplazo && !compacta" class="truncate text-muted-foreground">
          {{ t("puesto.reemplazoDe", { nombre: data.reemplazo }) }}
        </span>
      </span>
    </span>
    <span
      v-if="etiquetaEscala"
      class="ml-auto shrink-0 rounded px-1 text-[10px] font-semibold whitespace-nowrap"
      :class="marcaTenue(etiquetaEscala.color, oscuro) && 'outline-1 outline-muted-foreground'"
      :style="{ background: etiquetaEscala.color, color: textoSobre(etiquetaEscala.color) }"
      :title="etiquetaEscala.criterio"
    >
      <span class="sr-only">{{ etiquetaEscala.criterio }}: </span>{{ etiquetaEscala.texto }}
    </span>
  </button>
</template>
