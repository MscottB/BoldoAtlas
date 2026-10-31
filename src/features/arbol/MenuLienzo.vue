<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { useVueFlow } from "@vue-flow/core";
import { toast } from "vue-sonner";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { Unidad } from "@/db/tipos";
import { useEstilo } from "@/features/puestos/useEstilo";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useOrganizacion } from "@/stores/organizacion";
import { descendientes, indiceHijos } from "./jerarquia";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";

// Menú contextual del lienzo (clic derecho, Mayús+F10 o la tecla Menú) según lo apuntado: una unidad, un puesto o el
// fondo. `unidades`: las que se dibujan; `visibles`: las que están en pantalla; `raiz`: la rama enfocada, si hay.
const props = defineProps<{ unidades: Unidad[]; visibles: ReadonlySet<string>; raiz: string | null }>();
const emit = defineEmits<{ reordenar: [] }>();

const { t } = useI18n();
const router = useRouter();
const org = useOrganizacion();
const lienzo = useLienzo();
const puesto = usePuesto();
const estilo = useEstilo();
const { panelAbierto } = useVista();
const { fitView } = useVueFlow(); // el store de Vue Flow lo provee VistaArbol

// Lo apuntado: el id de la tarjeta (unidad o puesto); "" = el fondo del lienzo.
const id = ref("");
const unidad = computed(() => org.enFecha.porId.get(id.value));
const delPuesto = computed(() =>
  unidad.value ? undefined : org.enFecha.puestos.find((p) => p.id === id.value),
);
const soloLectura = computed(() => !!org.fechaVista);
const conHijos = computed(() => !!indiceHijos(props.unidades).get(id.value)?.length);
// Una raíz ya es un árbol en Árboles: solo se guardan ramas (el superior real, no el de la rama enfocada).
const guardable = computed(
  () => !!org.porId.get(id.value)?.parent_id && !org.subarboles.some((s) => s.unidad_id === id.value),
);
const titulo = computed(
  () =>
    unidad.value?.nombre ??
    (delPuesto.value
      ? (org.catalogos.cargos.find((c) => c.id === delPuesto.value!.cargo_id)?.nombre ?? "")
      : t("arbol.menu.lienzo")),
);

// La acción corre al cerrarse el menú: antes el foco vuelve a la tarjeta apuntada, y la acción puede llevarlo a otro
// lado (panel, renombrar, diálogo) sin que el menú se lo quite.
let foco: HTMLElement | null = null;
let accion: (() => unknown) | null = null;
const pedir = (f: () => unknown) => (accion = f);

function apuntar(e: MouseEvent) {
  const el = e.target as Element;
  if (el.closest("input, textarea")) return void e.stopPropagation(); // el campo conserva su menú (copiar, pegar)
  const nodo = el.closest<HTMLElement>(".vue-flow__node");
  id.value = nodo?.dataset.id ?? "";
  foco = nodo?.querySelector<HTMLElement>("button, [role=button]") ?? null; // la tarjeta ligera es [role=button]
  accion = null;
}

function alCerrar(e: Event) {
  e.preventDefault(); // Reka devolvería el foco al envoltorio del lienzo
  // Un clic fuera del menú pudo dejar el foco en otro lado: entonces no se toca.
  const activo = document.activeElement;
  if (!activo || activo === document.body || activo.closest("[role='menu']")) foco?.focus();
  const f = accion;
  accion = null;
  void f?.();
}

function nuevaSubunidad() {
  const padre = org.porId.get(id.value);
  if (padre) void lienzo.nuevaUnidad(padre);
}
async function eliminar(id: string) {
  lienzo.seleccionar(id);
  await nextTick(); // el panel de la unidad atiende el pedido con su flujo de eliminar
  lienzo.pedidoEliminar.value++;
}
function seleccionarRama(id: string) {
  const rama = [...descendientes(props.unidades, id)].filter((x) => props.visibles.has(x));
  lienzo.seleccionar(null);
  lienzo.sumarVarias([...rama, id]); // la última queda como foco
}
function renombrar(id: string) {
  lienzo.seleccionar(id);
  lienzo.editando.value = id;
}
async function guardar(id: string) {
  const r = await org.guardarSubarbol(id);
  if (!r.ok) toast.error(r.mensaje);
}
const abrirVista = () => (panelAbierto.value = true);
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <div class="size-full" @contextmenu.capture="apuntar">
        <slot />
      </div>
    </ContextMenuTrigger>
    <ContextMenuContent class="w-56" :aria-label="titulo" @close-auto-focus="alCerrar">
      <template v-if="unidad">
        <ContextMenuItem @select="pedir(() => lienzo.seleccionar(id))">
          {{ t("arbol.menu.abrirPanel") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura" @select="pedir(nuevaSubunidad)">
          {{ t("arbol.nuevaSubunidad") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura" @select="pedir(() => renombrar(id))">
          {{ t("arbol.menu.renombrar") }}
          <ContextMenuShortcut>F2</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem @select="pedir(() => lienzo.verPersonas(id))">
          {{ t("arbol.menu.verPersonas") }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem :disabled="!conHijos" @select="pedir(() => lienzo.expandirRama(unidades, id))">
          {{ t("arbol.menu.expandirRama") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="!conHijos" @select="pedir(() => lienzo.contraerRama(unidades, id))">
          {{ t("arbol.menu.contraerRama") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura" @select="pedir(() => seleccionarRama(id))">
          {{ t("arbol.menu.seleccionarRama") }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem :disabled="soloLectura" @select="pedir(() => lienzo.duplicar(id))">
          {{ t("unidad.duplicar") }}
          <ContextMenuShortcut>Ctrl+D</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem @select="pedir(() => router.push({ query: { raiz: id } }))">
          {{ t("arbol.abrirComoArbol") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura || !guardable" @select="pedir(() => guardar(id))">
          {{ t("arboles.guardarEnArboles") }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" :disabled="soloLectura" @select="pedir(() => eliminar(id))">
          {{ t("arbol.menu.eliminar") }}
          <ContextMenuShortcut>Supr</ContextMenuShortcut>
        </ContextMenuItem>
      </template>
      <template v-else-if="delPuesto">
        <ContextMenuItem @select="pedir(() => puesto.abrir(id))">
          {{ t("arbol.menu.abrirPuesto") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura" @select="pedir(() => puesto.abrir(id, 'titular'))">
          {{ t("puesto.accion.titular") }}
        </ContextMenuItem>
        <ContextMenuItem :disabled="soloLectura" @select="pedir(() => puesto.abrir(id, 'reemplazo'))">
          {{ t("puesto.accion.reemplazo") }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="pedir(() => estilo.copiar(id))">
          {{ t("leyenda.copiar") }}
          <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          :disabled="soloLectura || !org.puedePegarEstilo"
          @select="pedir(() => estilo.pegar(id))"
        >
          {{ t("leyenda.pegar") }}
          <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem
          :disabled="soloLectura || !delPuesto.leyenda_id"
          @select="pedir(() => estilo.quitar(id))"
        >
          {{ t("leyenda.quitar") }}
        </ContextMenuItem>
      </template>
      <template v-else>
        <ContextMenuItem :disabled="soloLectura || !!raiz" @select="pedir(() => lienzo.nuevaUnidad(null))">
          {{ t("arbol.menu.nuevaRaiz") }}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="pedir(() => lienzo.expandirTodo(unidades))">
          {{ t("arbol.ramas.expandirTodo") }}
        </ContextMenuItem>
        <ContextMenuItem @select="pedir(() => lienzo.contraerHasta(unidades, 1))">
          {{ t("arbol.ramas.contraerTodo") }}
        </ContextMenuItem>
        <ContextMenuItem @select="pedir(() => emit('reordenar'))">{{ t("arbol.reordenar") }}</ContextMenuItem>
        <ContextMenuItem @select="pedir(() => fitView())">
          {{ t("arbol.encuadrar") }}
          <ContextMenuShortcut>Ctrl+0</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem @select="pedir(abrirVista)">{{ t("arbol.menu.vista") }}</ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
