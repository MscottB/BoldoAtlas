<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useVueFlow } from "@vue-flow/core";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import EditorConexion from "@/features/unidades/EditorConexion.vue";
import ListaUnidades from "@/features/unidades/ListaUnidades.vue";
import { excluidasParaConexion } from "@/features/unidades/panel";
import { ventanaConexion as ventana } from "./useLienzo";

// La ventanita de las conexiones: una sola para todas, aquí y no dentro de cada línea. La abren la línea, «Conectar con…» de
// la tarjeta y el lápiz del panel. Fuera de Vue Flow: nada de lo que pase en ella toca el lienzo.
const { t } = useI18n();
const org = useOrganizacion();
const { viewport } = useVueFlow();

const editar = computed(() => (ventana.value && "id" in ventana.value ? ventana.value : null));
const conectar = computed(() => (ventana.value && "origen" in ventana.value ? ventana.value : null));
const referencia = computed(() => {
  const a = ventana.value?.ancla;
  return a && !(a instanceof Element)
    ? { getBoundingClientRect: () => new DOMRect(a.x, a.y, 0, 0) }
    : (a ?? undefined);
});

const cerrar = () => (ventana.value = null);
// La ventana queda en un punto de la pantalla: al mover o acercar el lienzo ya no estaría junto a la línea. Lo escrito se guarda.
watch(viewport, cerrar);
onBeforeUnmount(cerrar);

async function elegir(destino: string | null) {
  const v = conectar.value;
  if (!v || !destino) return;
  const r = await org.crearConexion(v.origen, destino);
  if (!r.ok) return void toast.error(r.mensaje);
  if (ventana.value === v) ventana.value = { id: r.id!, ancla: v.ancla, foco: v.foco };
}

// El foco vuelve a quien abrió; si ya no está (la barra de la tarjeta, una conexión eliminada), a su línea, al panel o a la
// tarjeta de una de sus unidades. Al cerrarse `ventana` ya está vacía: se decide con lo último que hubo.
let ultima: { foco: HTMLElement | null; id?: string; unidad?: string } = { foco: null };
watch(
  ventana,
  (v) => {
    if (!v) return;
    const id = "id" in v ? v.id : undefined;
    const unidad = "origen" in v ? v.origen : org.conexiones.find((c) => c.id === id)?.origen_id;
    ultima = { foco: v.foco, id, unidad };
  },
  { flush: "sync" },
);
function alCerrar(e: Event) {
  e.preventDefault();
  const activo = document.activeElement;
  if (activo && activo !== document.body && !activo.closest("[role='dialog']")) return; // un clic afuera ya lo llevó a otro lado
  const { foco, id, unidad } = ultima;
  const buscar = (s: string) => document.querySelector<HTMLElement>(s);
  const destino =
    (foco !== document.body && foco?.isConnected && foco) ||
    (id && buscar(`[data-conexion="${CSS.escape(id)}"]`)) ||
    buscar("[data-panel-unidad]") ||
    (unidad && buscar(`.vue-flow__node[data-id="${CSS.escape(unidad)}"] button`));
  if (destino) destino.focus();
}
</script>

<template>
  <Popover :open="!!ventana" @update:open="(abierta) => abierta || cerrar()">
    <PopoverAnchor :reference="referencia" class="hidden" />
    <PopoverContent
      side="bottom"
      align="center"
      :collision-padding="8"
      class="max-h-(--reka-popover-content-available-height)"
      :class="conectar ? 'overflow-hidden p-0' : 'overflow-y-auto p-3'"
      :aria-label="t(conectar ? 'unidad.conectarCon' : 'conexion.ventana')"
      @close-auto-focus="alCerrar"
    >
      <EditorConexion v-if="editar" :id="editar.id" :key="editar.id" :fija="editar.fija" @cerrar="cerrar" />
      <template v-else-if="conectar">
        <h2 class="px-2.5 pt-2.5 pb-1 text-sm font-semibold">
          {{ t("conexion.conectarTitulo", { nombre: org.porId.get(conectar.origen)?.nombre }) }}
        </h2>
        <ListaUnidades :excluidas="excluidasParaConexion(org.conexiones, conectar.origen)" @elegir="elegir" />
      </template>
    </PopoverContent>
  </Popover>
</template>
