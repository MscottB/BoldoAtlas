<script setup lang="ts">
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { onKeyStroke } from "@vueuse/core";
import {
  Bookmark,
  BookmarkCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  Ellipsis,
  LayoutGrid,
  ListCollapse,
  MapIcon,
  Plus,
  Search,
} from "@lucide/vue";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { CONTEXTO_LIENZO } from "./contexto";
import PanelVista from "./PanelVista.vue";
import PanelResaltar from "./PanelResaltar.vue";
import MenuVistas from "./MenuVistas.vue";
import SelectorFecha from "./SelectorFecha.vue";

// Una fila de 7 controles: lo frecuente a la vista y lo ocasional en «Más». El zoom está en la esquina del lienzo.
// `unidades`: las que se dibujan (el árbol completo o la rama enfocada).
const props = defineProps<{ raiz: string | null; unidades: Unidad[] }>();
const emit = defineEmits<{ reordenar: [] }>();
const { t } = useI18n();
const org = useOrganizacion();
const { seleccion, nuevaHija, expandirTodo, contraerHasta } = useLienzo();
const NIVELES = [1, 2, 3, 4, 5, 6];
const { config, minimapa } = useVista();
const { encuadrar } = inject(CONTEXTO_LIENZO)!;

onKeyStroke("0", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault(); // en WebView2, Ctrl+0 restablecería el zoom de la página
  void encuadrar();
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
  <!-- @container: bajo 62rem de ancho, la búsqueda, «Ver en otra fecha» y «Más» se acortan (la fila cabe en la ventana mínima). -->
  <div class="@container border-b">
    <div class="flex flex-wrap items-center gap-2 p-2">
      <Button size="sm" :disabled="!!org.fechaVista" @click="nueva">
        <Plus aria-hidden="true" />
        {{ t("arbol.nuevaUnidad") }}
      </Button>
      <span class="relative">
        <Search
          class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          v-model="config.resaltar.texto"
          data-buscar-lienzo
          type="search"
          class="h-7 w-48 pr-1.5 pl-7 text-ellipsis @min-[62rem]:w-52"
          :placeholder="t('arbol.buscarDiagrama')"
          :aria-label="t('arbol.buscarDiagrama')"
          :title="t('arbol.buscarAtajo')"
        />
      </span>
      <PanelResaltar />
      <PanelVista />
      <MenuVistas :raiz="raiz" :unidades="unidades" />
      <SelectorFecha />
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <!-- Con poco ancho, solo el ícono: el nombre sigue en aria-label y title. -->
          <Button
            variant="outline"
            size="sm"
            class="ml-auto"
            :aria-label="t('arbol.mas.titulo')"
            :title="t('arbol.mas.titulo')"
          >
            <Ellipsis aria-hidden="true" />
            <span class="hidden @min-[62rem]:inline">{{ t("arbol.mas.titulo") }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-60">
          <template v-if="aGuardar">
            <DropdownMenuItem :disabled="guardada || !!org.fechaVista" @select="guardarEnArboles">
              <component :is="guardada ? BookmarkCheck : Bookmark" aria-hidden="true" />
              {{ t(guardada ? "arboles.guardado" : "arboles.guardarEnArboles") }}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </template>
          <DropdownMenuGroup>
            <DropdownMenuLabel>{{ t("arbol.ramas.titulo") }}</DropdownMenuLabel>
            <DropdownMenuItem @select="expandirTodo(unidades)">
              <ChevronsUpDown aria-hidden="true" />
              {{ t("arbol.ramas.expandirTodo") }}
            </DropdownMenuItem>
            <DropdownMenuItem @select="contraerHasta(unidades, 1)">
              <ChevronsDownUp aria-hidden="true" />
              {{ t("arbol.ramas.contraerTodo") }}
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListCollapse aria-hidden="true" />
                {{ t("arbol.ramas.contraerHasta") }}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem v-for="n in NIVELES" :key="n" @select="contraerHasta(unidades, n)">
                  {{ t("arbol.ramas.nivel", { n }) }}
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem :title="t('arbol.reordenarAyuda')" @select="emit('reordenar')">
            <LayoutGrid aria-hidden="true" />
            {{ t("arbol.reordenar") }}
          </DropdownMenuItem>
          <DropdownMenuCheckboxItem v-model="minimapa">
            <MapIcon aria-hidden="true" />
            {{ t("arbol.vista.minimapa") }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>
