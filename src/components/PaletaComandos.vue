<script setup lang="ts">
import { computed, ref, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  CircleHelp,
  ListChecks,
  Network,
  Palette,
  Plus,
  Search,
  Settings,
  User,
  UserRoundX,
  Users,
} from "@lucide/vue";
import { ListboxFilter } from "reka-ui";
import { CommandDialog, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { unidadesDeRama } from "@/features/arbol/layout";
import { useLienzo } from "@/features/arbol/useLienzo";
import { buscarEnPaleta, indexarPaleta, type Accion, type Grupo } from "@/features/atajos/paleta";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useTema } from "@/features/tema/useTema";
import { useFicha } from "@/features/trabajadores/useFicha";
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
  ejecutar: () => unknown;
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
  },
  {
    id: "revision",
    etiqueta: t("paleta.acciones.revision"),
    icono: ListChecks,
    ejecutar: () => router.push("/revision"),
  },
  {
    id: "tema",
    etiqueta: t("paleta.acciones.tema"),
    icono: Palette,
    // `aplicar` deja la clase `dark` según el tema efectivo, también con «sistema».
    ejecutar: () => (tema.value = document.documentElement.classList.contains("dark") ? "claro" : "oscuro"),
  },
  {
    id: "configuracion",
    etiqueta: t("paleta.acciones.configuracion"),
    icono: Settings,
    ejecutar: () => router.push("/configuracion"),
  },
  {
    id: "ayuda",
    etiqueta: t("paleta.acciones.ayuda"),
    icono: CircleHelp,
    ejecutar: () => router.push("/ayuda"),
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

// Se cierra primero: lo elegido (ficha, diálogo del puesto) toma el foco sin pelearlo con la paleta.
function elegir(accion: () => unknown) {
  abierto.value = false;
  accion();
}
</script>

<template>
  <CommandDialog v-model:open="abierto" :title="t('paleta.titulo')" :description="t('paleta.descripcion')">
    <div class="flex items-center gap-2 border-b px-3">
      <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
      <ListboxFilter
        v-model="busqueda"
        auto-focus
        :placeholder="t('paleta.buscar')"
        :aria-label="t('paleta.buscar')"
        class="h-10 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
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
          @select="elegir(() => irAUnidad(u.id))"
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
        <CommandItem
          v-for="p in r.personas.items"
          :key="p.id"
          :value="`persona:${p.id}`"
          @select="elegir(() => ficha.intentarAbrir(p.id))"
        >
          <User aria-hidden="true" />
          <span class="grid min-w-0">
            <span class="truncate">{{ p.nombre }}</span>
            <span class="truncate text-xs text-muted-foreground">
              {{ p.cargos.length ? p.cargos.join(", ") : t("paleta.sinCargo") }}
            </span>
          </span>
        </CommandItem>
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
          @select="elegir(a.ejecutar)"
        >
          <component :is="a.icono" aria-hidden="true" />
          {{ a.etiqueta }}
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </CommandDialog>
</template>
