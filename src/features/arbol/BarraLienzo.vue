<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useVueFlow } from "@vue-flow/core";
import { onKeyStroke } from "@vueuse/core";
import {
  Bookmark,
  BookmarkCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  LayoutGrid,
  Maximize,
  Plus,
  ZoomIn,
  ZoomOut,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { Unidad } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";
import PanelVista from "./PanelVista.vue";
import PanelResaltar from "./PanelResaltar.vue";
import MenuVistas from "./MenuVistas.vue";
import SelectorFecha from "./SelectorFecha.vue";

// `unidades`: las que se dibujan (el árbol completo o la rama enfocada).
const props = defineProps<{ raiz: string | null; unidades: Unidad[] }>();
defineEmits<{ reordenar: [] }>();
const { t } = useI18n();
const org = useOrganizacion();
const { seleccion, nuevaHija, expandirTodo, contraerHasta } = useLienzo();
const NIVELES = [1, 2, 3, 4, 5, 6];
const { config } = useVista();
const { zoomIn, zoomOut, fitView } = useVueFlow(); // el store de Vue Flow lo provee VistaArbol

onKeyStroke("0", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault(); // en WebView2, Ctrl+0 restablecería el zoom de la página
  void fitView();
});

const nueva = () => void nuevaHija(props.raiz);

// La unidad seleccionada, o la raíz enfocada. Una raíz ya es un árbol en Árboles: solo se guardan ramas.
const aGuardar = computed(() => {
  const u = org.porId.get(seleccion.value ?? props.raiz ?? "");
  return u?.parent_id ? u : null;
});
const guardada = computed(() => org.subarboles.some((s) => s.unidad_id === aGuardar.value?.id));
async function guardarEnArboles() {
  const r = aGuardar.value && (await org.guardarSubarbol(aGuardar.value.id));
  if (r && !r.ok) toast.error(r.mensaje);
}
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 border-b p-2">
    <Button size="sm" :disabled="!!org.fechaVista" @click="nueva">
      <Plus aria-hidden="true" />
      {{ t("arbol.nuevaUnidad") }}
    </Button>
    <Button
      v-if="aGuardar"
      variant="outline"
      size="sm"
      :disabled="guardada || !!org.fechaVista"
      @click="guardarEnArboles"
    >
      <component :is="guardada ? BookmarkCheck : Bookmark" aria-hidden="true" />
      {{ t(guardada ? "arboles.guardado" : "arboles.guardarEnArboles") }}
    </Button>
    <PanelVista />
    <MenuVistas :raiz="raiz" :unidades="unidades" />
    <select
      v-model="config.resaltar.etiqueta"
      class="h-7 rounded-md border bg-background px-2 text-sm"
      :aria-label="t('arbol.resaltarEtiqueta')"
    >
      <option :value="null">{{ t("arbol.todasEtiquetas") }}</option>
      <option v-for="e in org.etiquetas" :key="e.id" :value="e.id">{{ e.nombre }}</option>
    </select>
    <Input
      v-model="config.resaltar.texto"
      data-buscar-lienzo
      type="search"
      class="h-7 w-48"
      :placeholder="t('arbol.resaltarTexto')"
      :aria-label="t('arbol.resaltarTexto')"
    />
    <PanelResaltar />
    <SelectorFecha />
    <span class="ml-auto flex gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <ChevronsUpDown aria-hidden="true" />
            {{ t("arbol.ramas.titulo") }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuItem @select="expandirTodo(unidades)">
            <ChevronsUpDown aria-hidden="true" />
            {{ t("arbol.ramas.expandirTodo") }}
          </DropdownMenuItem>
          <DropdownMenuItem @select="contraerHasta(unidades, 1)">
            <ChevronsDownUp aria-hidden="true" />
            {{ t("arbol.ramas.contraerTodo") }}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{{ t("arbol.ramas.contraerHasta") }}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem v-for="n in NIVELES" :key="n" @select="contraerHasta(unidades, n)">
                {{ t("arbol.ramas.nivel", { n }) }}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="sm" :title="t('arbol.reordenarAyuda')" @click="$emit('reordenar')">
        <LayoutGrid aria-hidden="true" />
        {{ t("arbol.reordenar") }}
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.alejar')"
        :title="t('arbol.alejar')"
        @click="zoomOut()"
      >
        <ZoomOut aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.acercar')"
        :title="t('arbol.acercar')"
        @click="zoomIn()"
      >
        <ZoomIn aria-hidden="true" />
      </Button>
      <Button variant="outline" size="sm" :title="t('arbol.encuadrarAtajo')" @click="fitView()">
        <Maximize aria-hidden="true" />
        {{ t("arbol.encuadrar") }}
      </Button>
    </span>
  </div>
</template>
