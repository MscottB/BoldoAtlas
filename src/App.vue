<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useRoute } from "vue-router";
import { useWindowSize } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import {
  ArrowLeftRight,
  ChartColumn,
  CircleHelp,
  GitBranch,
  FolderTree,
  Info,
  ListChecks,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from "@lucide/vue";
import { Toaster } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import BarraSuperior from "@/components/BarraSuperior.vue";
import PaletaComandos from "@/components/PaletaComandos.vue";
import DialogoSalir from "@/components/DialogoSalir.vue";
import DialogoCodigoSinCopiar from "@/features/intercambio/DialogoCodigoSinCopiar.vue";
import DialogoRevisionDejada from "@/features/intercambio/DialogoRevisionDejada.vue";
import DialogoPuesto from "@/features/puestos/DialogoPuesto.vue";
import { paletaAbierta, useAtajos } from "@/features/atajos/useAtajos";
import { useAvisos } from "@/features/revision/useAvisos";
import DatosProyecto from "@/features/proyecto/DatosProyecto.vue";
import DialogoActualizacion from "@/features/actualizaciones/DialogoActualizacion.vue";
import DialogoNovedades from "@/features/actualizaciones/DialogoNovedades.vue";
import FichaTrabajador from "@/features/trabajadores/FichaTrabajador.vue";
import { useOrganizacion } from "@/stores/organizacion";
import { ANCHO_COLAPSO, barraColapsada } from "@/app/estructura";
import { useBarraFlotante } from "@/app/barraLateral";
import { MOSTRAR_PROXIMAMENTE } from "@/app/proximamente";
import { useCerrarVista } from "@/app/useCerrarVista";
import { ponerTitulo } from "@/app/ventana";
import BarraPestanas from "@/features/pestanas/BarraPestanas.vue";
import { ID_AREA, clicNuevaPestana, idPestana, usePestanas } from "@/features/pestanas/usePestanas";
import icono from "../assets/brand/icono.png";

// Sin `to`, la entrada aún no existe: solo con MOSTRAR_PROXIMAMENTE se muestra, deshabilitada y con el aviso de la fase en que llega.
// `etiqueta` y `aviso` son claves de i18n. `contador`, si da más de 0, se muestra como insignia.
interface Entrada {
  to?: string;
  etiqueta: string;
  icono: Component;
  aviso?: string;
  contador?: () => number;
  /** Nombre de la ruta que esta entrada abre y que se cierra con un segundo clic (Configuración, Ayuda, Acerca de). */
  cierra?: string;
}
const avisos = useAvisos();
useAtajos();
const secciones: Entrada[] = [
  { to: "/", etiqueta: "nav.arbol", icono: Network },
  { to: "/arboles", etiqueta: "nav.arboles", icono: FolderTree },
  { to: "/directorio", etiqueta: "nav.directorio", icono: Users },
  { to: "/revision", etiqueta: "nav.revision", icono: ListChecks, contador: () => avisos.value.total },
  { etiqueta: "nav.indicadores", icono: ChartColumn, aviso: "nav.llegaFase3" },
  { etiqueta: "nav.escenarios", icono: GitBranch, aviso: "nav.llegaFase5" },
  { to: "/importar-exportar", etiqueta: "nav.importarExportar", icono: ArrowLeftRight },
].filter((e) => MOSTRAR_PROXIMAMENTE || e.to);
// Abajo, separadas de las secciones del programa.
const utilidades: Entrada[] = [
  { to: "/configuracion", etiqueta: "nav.configuracion", icono: Settings, cierra: "configuracion" },
  { to: "/ayuda", etiqueta: "nav.ayuda", icono: CircleHelp, cierra: "ayuda" },
  { to: "/acerca", etiqueta: "nav.acerca", icono: Info, cierra: "acerca" },
];

const { t } = useI18n();
// Con avisos pendientes, el nombre accesible de la entrada incluye cuántos son.
const nombre = (item: Entrada) => {
  const n = item.contador?.() ?? 0;
  return n ? `${t(item.etiqueta)}, ${t("revision.avisos", n)}` : t(item.etiqueta);
};
const route = useRoute();
const org = useOrganizacion();
watch(() => org.org.nombre, ponerTitulo, { immediate: true });
const cerrarVista = useCerrarVista();
const pestanas = usePestanas();
// Con una sola pestaña no hay barra (se abre otra con Ctrl+T o «Abrir en pestaña nueva»).
const conPestanas = computed(() => pestanas.lista.length > 1);
// Ctrl+clic: la entrada se abre en una pestaña nueva. Un segundo clic en la entrada de la vista que ya se está viendo la
// cierra (en captura: antes de que el enlace navegue).
function alPulsar(e: MouseEvent, item: Entrada) {
  if (item.to && clicNuevaPestana(e, item.to)) return;
  if (!item.cierra || route.name !== item.cierra) return;
  e.preventDefault();
  cerrarVista();
}
const { width } = useWindowSize();
const manual = ref<boolean | null>(null);
const colapsada = computed(() => barraColapsada(width.value, manual.value));
// Al cruzar los 1100 px vuelve a mandar el ancho.
watch(
  () => width.value < ANCHO_COLAPSO,
  () => (manual.value = null),
);
// Contraída, se despliega sobre el contenido al pasar el mouse o entrar el foco (opción de Configuración); `angosta` es
// lo que se ve: solo íconos.
const navegacion = ref<HTMLElement | null>(null);
// :focus-visible = foco del teclado (un clic con el mouse no lo marca): mientras esté dentro, salir con el mouse no la pliega.
const { flotando, entrar, salir, enfocar, cerrar } = useBarraFlotante(
  colapsada,
  () => !!navegacion.value?.querySelector(":focus-visible"),
);
const angosta = computed(() => colapsada.value && !flotando.value);
const etiquetaBarra = computed(() => (colapsada.value ? t("barra.mostrarBarra") : t("barra.ocultarBarra")));
function alSalirFoco(e: FocusEvent) {
  if (!navegacion.value?.contains(e.relatedTarget as Node | null)) cerrar();
}
// Esc pliega la barra desplegada (y no cierra además la vista abierta).
function escEnBarra(e: KeyboardEvent) {
  if (!flotando.value) return;
  e.stopPropagation();
  cerrar();
}
</script>

<template>
  <TooltipProvider>
    <div v-if="route.meta.sinMarco" class="h-screen overflow-auto bg-background text-foreground">
      <RouterView />
    </div>
    <div v-else class="flex h-screen bg-background text-foreground">
      <!-- El hueco guarda el ancho de la barra fija; desplegada sobre el contenido, la barra lo excede sin correr nada. -->
      <div class="relative shrink-0" :class="colapsada ? 'w-14' : 'w-56'">
        <nav
          ref="navegacion"
          class="absolute inset-y-0 left-0 z-40 flex flex-col gap-1 overflow-y-auto border-r bg-sidebar p-3 text-sidebar-foreground"
          :class="[angosta ? 'w-14' : 'w-56', flotando && 'shadow-lg']"
          :aria-label="t('nav.principal')"
          @mouseenter="entrar"
          @mouseleave="salir"
          @focusin="enfocar"
          @focusout="alSalirFoco"
          @keydown.esc="escEnBarra"
        >
          <!-- En oscuro, el ícono azul marino va sobre una placa clara (si no, no se ve). -->
          <p class="mb-3 flex h-6 shrink-0 items-center gap-2 px-1 text-base font-semibold tracking-tight">
            <img :src="icono" alt="" class="size-6 shrink-0 dark:rounded-md dark:bg-primary dark:p-0.5" />
            <span v-if="!angosta">Boldo<span class="text-marca-texto">Atlas</span></span>
            <span v-else class="sr-only">BoldoAtlas</span>
          </p>
          <template v-for="(grupo, i) in [secciones, utilidades]" :key="i">
            <template v-if="i === 1">
              <div class="mt-auto border-t" role="separator" />
              <!-- El único botón para fijar la barra abierta o contraída. Al pie, sobre Configuración, con la misma forma que
                   las demás entradas: queda en su lugar contraída, desplegada o fija; abrirla solo revela los textos y nada
                   se mueve bajo el puntero. -->
              <button
                type="button"
                class="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
                :aria-label="angosta ? etiquetaBarra : undefined"
                :title="etiquetaBarra"
                :aria-expanded="!colapsada"
                @click="manual = !colapsada"
              >
                <component
                  :is="colapsada ? PanelLeftOpen : PanelLeftClose"
                  class="size-4 shrink-0"
                  aria-hidden="true"
                />
                <span v-if="!angosta">{{ etiquetaBarra }}</span>
              </button>
            </template>
            <Tooltip v-for="item in grupo" :key="item.etiqueta" :disabled="!angosta && !item.aviso">
              <TooltipTrigger as-child>
                <RouterLink
                  v-if="item.to"
                  :to="item.to"
                  :aria-label="angosta ? nombre(item) : undefined"
                  class="relative flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"
                  active-class="bg-sidebar-accent font-medium"
                  @click.capture="alPulsar($event, item)"
                  @auxclick="clicNuevaPestana($event, item.to)"
                  @mousedown.middle.prevent
                >
                  <component :is="item.icono" class="size-4 shrink-0" aria-hidden="true" />
                  <span v-if="!angosta">{{ t(item.etiqueta) }}</span>
                  <template v-if="item.contador?.()">
                    <span
                      class="rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground tabular-nums"
                      :class="angosta ? 'absolute -top-1 -right-1' : 'ml-auto'"
                      aria-hidden="true"
                      >{{ item.contador() }}</span
                    >
                    <span v-if="!angosta" class="sr-only">, {{ t("revision.avisos", item.contador()) }}</span>
                  </template>
                </RouterLink>
                <button
                  v-else
                  type="button"
                  aria-disabled="true"
                  :aria-label="angosta ? t(item.etiqueta) : undefined"
                  class="flex h-8 shrink-0 cursor-not-allowed items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <component :is="item.icono" class="size-4 shrink-0" aria-hidden="true" />
                  <span v-if="!angosta">{{ t(item.etiqueta) }}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">{{ t(item.aviso ?? item.etiqueta) }}</TooltipContent>
            </Tooltip>
          </template>
        </nav>
      </div>
      <div class="flex min-w-0 flex-1 flex-col">
        <BarraSuperior @buscar="paletaAbierta = true" />
        <BarraPestanas v-if="conPestanas" />
        <!-- La key es la pestaña: cambiar de pestaña monta su vista de cero (solo la activa está montada). -->
        <main
          :id="ID_AREA"
          tabindex="-1"
          class="min-h-0 flex-1 overflow-auto outline-none"
          :role="conPestanas ? 'tabpanel' : undefined"
          :aria-labelledby="conPestanas ? idPestana(pestanas.activa) : undefined"
        >
          <RouterView v-slot="{ Component: vista }">
            <component :is="vista" :key="pestanas.activa" />
          </RouterView>
        </main>
      </div>
    </div>
    <PaletaComandos v-if="!route.meta.sinMarco" v-model:open="paletaAbierta" />
    <FichaTrabajador />
    <DialogoPuesto />
    <DatosProyecto v-if="!route.meta.sinMarco" />
    <DialogoActualizacion />
    <DialogoNovedades />
    <DialogoCodigoSinCopiar />
    <DialogoRevisionDejada />
    <DialogoSalir />
    <Toaster :container-aria-label="t('comun.avisos')" />
  </TooltipProvider>
</template>
