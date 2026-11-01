<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useRoute, useRouter, type RouteLocationRaw } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  CircleHelp,
  ListChecks,
  LocateFixed,
  Network,
  Palette,
  Plus,
  Search,
  User,
  UserRoundX,
  Users,
} from "@lucide/vue";
import { toast } from "vue-sonner";
import { ListboxFilter } from "reka-ui";
import { CommandDialog, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { unidadesDeRama } from "@/features/arbol/layout";
import { useLienzo } from "@/features/arbol/useLienzo";
import { rutaPuesto, useUbicar } from "@/features/arbol/useUbicar";
import { buscarEnPaleta, indexarPaleta, type Accion, type Grupo } from "@/features/atajos/paleta";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useTema } from "@/features/tema/useTema";
import { GRUPOS_MENU, irAEntrada } from "@/features/proyecto/menuApp";
import { useFicha } from "@/features/trabajadores/useFicha";
import { abrirEnPestanaNueva } from "@/features/pestanas/usePestanas";
import { useOrganizacion } from "@/stores/organizacion";

// Ctrl+K: unidades, personas, puestos vacantes y acciones. El filtro es propio (sin tildes ni mayúsculas): el de Command
// compara contra `value`, que aquí es un id con prefijo de grupo.
const abierto = defineModel<boolean>("open", { required: true });
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const org = useOrganizacion();
const { revelar, nuevaHija } = useLienzo();
const { tema } = useTema();
const ficha = useFicha();
const puesto = usePuesto();
const { ubicar, ubicaciones, textoDe } = useUbicar();

const busqueda = ref("");
watch(abierto, () => (busqueda.value = ""));

// Se rehace solo cuando cambian los datos que se ven (y la primera vez que se abre la paleta).
const indice = computed(() =>
  indexarPaleta({
    unidades: org.enFecha.unidades,
    trabajadores: org.enFecha.trabajadores,
    puestos: org.enFecha.puestos,
    vigentes: org.enFecha.vigentes,
    cargos: org.catalogos.cargos,
    tipos: org.catalogos.tipos_unidad,
  }),
);

interface AccionPaleta extends Accion {
  icono: Component;
  deshabilitada?: boolean;
  ejecutar: () => unknown;
  /** Si lleva a una vista: la que se abre en una pestaña nueva con Ctrl+Enter, Ctrl+clic o clic central. */
  ruta?: RouteLocationRaw;
}
const enArbol = computed(() => route.name === "arbol");
const acciones = computed<AccionPaleta[]>(() => [
  // Crear solo tiene sentido sobre el árbol y con la fecha de hoy.
  ...(enArbol.value && !org.fechaVista
    ? [
        {
          id: "nueva",
          etiqueta: t("paleta.acciones.nueva"),
          icono: Plus,
          ejecutar: () => nuevaHija(typeof route.query.raiz === "string" ? route.query.raiz : null),
        },
      ]
    : []),
  {
    id: "directorio",
    etiqueta: t("paleta.acciones.directorio"),
    icono: Users,
    ejecutar: () => router.push("/directorio"),
    ruta: "/directorio",
  },
  {
    id: "revision",
    etiqueta: t("paleta.acciones.revision"),
    icono: ListChecks,
    ejecutar: () => router.push("/revision"),
    ruta: "/revision",
  },
  {
    id: "tema",
    etiqueta: t("paleta.acciones.tema"),
    icono: Palette,
    // `aplicar` deja la clase `dark` según el tema efectivo, también con «sistema».
    ejecutar: () => (tema.value = document.documentElement.classList.contains("dark") ? "claro" : "oscuro"),
  },
  // Las mismas del menú de la app (Inicio, organización nueva o de ejemplo, Respaldos, Configuración…).
  ...GRUPOS_MENU.flat().map((e) => ({
    id: e.id,
    etiqueta: e.fase ? `${t(`menu.${e.id}`)} (${t(e.fase)})` : t(`menu.${e.id}`),
    icono: e.icono,
    deshabilitada: !!e.fase,
    ejecutar: () => irAEntrada(e, router),
    ruta: e.destino && !router.resolve(e.destino).meta.sinMarco ? e.destino : undefined,
  })),
  {
    id: "ayuda",
    etiqueta: t("paleta.acciones.ayuda"),
    icono: CircleHelp,
    ejecutar: () => router.push("/ayuda"),
    ruta: "/ayuda",
  },
]);

const r = computed(() => buscarEnPaleta(indice.value, busqueda.value, acciones.value));
const total = computed(
  () => r.value.unidades.total + r.value.personas.total + r.value.vacantes.total + r.value.acciones.total,
);
const faltan = (g: Grupo<unknown>) => g.total - g.items.length;

function irAUnidad(id: string) {
  const raiz = route.query.raiz;
  // En el árbol y dentro de la rama enfocada (o sin enfocar) basta seleccionarla; si no, se abre el árbol completo con ella.
  const dentro =
    typeof raiz !== "string" || unidadesDeRama(org.enFecha.unidades, raiz).some((u) => u.id === id);
  if (enArbol.value && dentro) revelar(id);
  else void router.push({ name: "arbol", query: { ver: id } });
}

const rutaUnidad = (id: string): RouteLocationRaw => ({ name: "arbol", query: { ver: id } });
const rutaPersona = (id: string): RouteLocationRaw => ({ name: "directorio", query: { persona: id } });
// «Ver a X en el organigrama»: una opción bajo la persona por cada puesto vigente (así se elige entre varios).
function verEnOrganigrama(puestoId: string) {
  const r = ubicar(puestoId);
  if (!r.ok) toast.error(r.mensaje);
}

// Ctrl+Enter o Ctrl+clic sobre algo que lleva a una vista: se abre en una pestaña nueva. Reka no elige con Ctrl+Enter:
// aquí se pulsa la opción resaltada recordando que fue con Ctrl (el clic que le llega no lo trae).
let conCtrl = false;
function alTeclear(e: KeyboardEvent) {
  if (e.key !== "Enter" || !(e.ctrlKey || e.metaKey) || e.isComposing) return;
  const resaltada = (e.currentTarget as HTMLElement)
    .closest('[role="dialog"]')
    ?.querySelector<HTMLElement>('[role="option"][data-highlighted]');
  if (!resaltada) return;
  e.preventDefault();
  conCtrl = true;
  resaltada.click(); // elige en el acto (o nada, si está deshabilitada)
  conCtrl = false;
}
// Se cierra primero: lo elegido (ficha, diálogo del puesto) toma el foco sin pelearlo con la paleta.
function elegir(accion: () => unknown, ev?: CustomEvent<{ originalEvent: Event }>, ruta?: RouteLocationRaw) {
  const clic = ev?.detail?.originalEvent;
  const nueva = conCtrl || (clic instanceof MouseEvent && (clic.ctrlKey || clic.metaKey));
  conCtrl = false;
  abierto.value = false;
  if (ruta && nueva) abrirEnPestanaNueva(ruta);
  else accion();
}
// Clic central: también en una pestaña nueva.
function alPulsarAux(e: MouseEvent, ruta?: RouteLocationRaw) {
  if (e.button !== 1 || !ruta) return;
  e.preventDefault();
  abierto.value = false;
  abrirEnPestanaNueva(ruta);
}
</script>

<template>
  <CommandDialog v-model:open="abierto" :title="t('paleta.titulo')" :description="t('paleta.descripcion')">
    <!-- El campo no lleva borde propio: el foco se ve como una línea de 2 px en el color de foco bajo la fila. -->
    <div
      class="flex items-center gap-2 border-b px-3 focus-within:border-b-ring focus-within:shadow-[inset_0_-1px_0_var(--ring)]"
    >
      <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
      <ListboxFilter
        v-model="busqueda"
        auto-focus
        :placeholder="t('paleta.buscar')"
        :aria-label="t('paleta.buscar')"
        class="h-10 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        @keydown="alTeclear"
      />
    </div>
    <p class="sr-only" role="status">{{ busqueda.trim() ? t("paleta.resultados", total) : "" }}</p>
    <CommandList class="max-h-80">
      <p v-if="!busqueda.trim()" class="px-3 pt-3 text-xs text-muted-foreground">
        {{ t("paleta.ayudaVacia") }}
      </p>
      <p v-else-if="!total" class="px-3 py-6 text-center text-sm">{{ t("paleta.sinResultados") }}</p>

      <CommandGroup v-if="r.unidades.items.length" :heading="t('paleta.grupos.unidades')">
        <CommandItem
          v-for="u in r.unidades.items"
          :key="u.id"
          :value="`unidad:${u.id}`"
          @select="elegir(() => irAUnidad(u.id), $event, rutaUnidad(u.id))"
          @auxclick="alPulsarAux($event, rutaUnidad(u.id))"
        >
          <Network aria-hidden="true" />
          <span class="grid min-w-0">
            <span class="truncate">{{ u.nombre }}</span>
            <span v-if="u.ruta" class="truncate text-xs text-muted-foreground">{{ u.ruta }}</span>
          </span>
        </CommandItem>
        <p v-if="faltan(r.unidades)" class="px-2 py-1 text-xs text-muted-foreground">
          {{ t("paleta.mas", { n: faltan(r.unidades) }) }}
        </p>
      </CommandGroup>

      <CommandGroup v-if="r.personas.items.length" :heading="t('paleta.grupos.personas')">
        <template v-for="p in r.personas.items" :key="p.id">
          <CommandItem
            :value="`persona:${p.id}`"
            @select="elegir(() => ficha.intentarAbrir(p.id), $event, rutaPersona(p.id))"
            @auxclick="alPulsarAux($event, rutaPersona(p.id))"
          >
            <User aria-hidden="true" />
            <span class="grid min-w-0">
              <span class="truncate">{{ p.nombre }}</span>
              <span class="truncate text-xs text-muted-foreground">
                {{ p.cargos.length ? p.cargos.join(", ") : t("paleta.sinCargo") }}
              </span>
            </span>
          </CommandItem>
          <CommandItem
            v-for="u in ubicaciones(p.id)"
            :key="`${p.id}:${u.puestoId}`"
            :value="`ubicar:${p.id}:${u.puestoId}`"
            class="pl-8"
            @select="
              elegir(
                () => verEnOrganigrama(u.puestoId),
                $event,
                rutaPuesto({ id: u.puestoId, unidad_id: u.unidadId }),
              )
            "
            @auxclick="alPulsarAux($event, rutaPuesto({ id: u.puestoId, unidad_id: u.unidadId }))"
          >
            <LocateFixed aria-hidden="true" />
            <span class="grid min-w-0">
              <span class="truncate">{{ t("paleta.verEnOrganigrama", { nombre: p.nombre }) }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ textoDe(u) }}</span>
            </span>
          </CommandItem>
        </template>
        <p v-if="faltan(r.personas)" class="px-2 py-1 text-xs text-muted-foreground">
          {{ t("paleta.mas", { n: faltan(r.personas) }) }}
        </p>
      </CommandGroup>

      <CommandGroup v-if="r.vacantes.items.length" :heading="t('paleta.grupos.vacantes')">
        <CommandItem
          v-for="v in r.vacantes.items"
          :key="v.id"
          :value="`vacante:${v.id}`"
          @select="elegir(() => puesto.abrir(v.id))"
        >
          <UserRoundX aria-hidden="true" />
          <span class="grid min-w-0">
            <span class="truncate">{{ v.cargo }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ v.unidad }}</span>
          </span>
        </CommandItem>
        <p v-if="faltan(r.vacantes)" class="px-2 py-1 text-xs text-muted-foreground">
          {{ t("paleta.mas", { n: faltan(r.vacantes) }) }}
        </p>
      </CommandGroup>

      <CommandGroup v-if="r.acciones.items.length" :heading="t('paleta.grupos.acciones')">
        <CommandItem
          v-for="a in r.acciones.items"
          :key="a.id"
          :value="`accion:${a.id}`"
          :disabled="a.deshabilitada"
          @select="elegir(a.ejecutar, $event, a.ruta)"
          @auxclick="alPulsarAux($event, a.ruta)"
        >
          <component :is="a.icono" aria-hidden="true" />
          {{ a.etiqueta }}
        </CommandItem>
      </CommandGroup>
    </CommandList>
    <p class="border-t px-3 py-1.5 text-xs text-muted-foreground">{{ t("paleta.ayudaPestana") }}</p>
  </CommandDialog>
</template>
