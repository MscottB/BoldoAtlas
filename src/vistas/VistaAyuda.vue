<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import MarkdownIt from "markdown-it";
import {
  Briefcase,
  ClipboardCheck,
  DatabaseBackup,
  FileText,
  House,
  IdCard,
  Keyboard,
  LayoutGrid,
  ListChecks,
  ListTree,
  Network,
  PanelTop,
  Palette,
  RefreshCw,
  Search,
  Users,
  X,
} from "@lucide/vue";
import BotonCerrarVista from "@/components/BotonCerrarVista.vue";
import { Input } from "@/components/ui/input";
import { abrirEnlacesFuera } from "@/lib/enlaces";
import { buscarEnAyuda, resumenDe, seccionesDe } from "@/lib/buscarAyuda";
import { reglasAyuda } from "@/lib/markdownAyuda";
import orden from "../../ayuda/orden.json";

// Las páginas viven en /ayuda/<idioma>/<tema>.md y sus imágenes en /ayuda/img/<idioma>/ (fuente única, también para el
// sitio web). Las imágenes van dentro del paquete de la app: nada se pide a internet.
const paginas = import.meta.glob("/ayuda/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const imagenes = import.meta.glob("/ayuda/img/*/*.webp", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;
const md = new MarkdownIt({ html: false });
reglasAyuda(md, {
  avisos: true,
  anclas: true,
  resolverImagen: (src) => imagenes[new URL(src, "http://ayuda/ayuda/es/").pathname] ?? src,
  rutaPagina: (slug, ancla) => `#/ayuda/${slug}${ancla}`,
});

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();

// Un ícono por tema (el nombre del archivo no cambia con el idioma).
const ICONOS: Record<string, Component> = {
  inicio: House,
  arbol: Network,
  arboles: ListTree,
  directorio: Users,
  fichas: IdCard,
  puestos: Briefcase,
  leyendas: Palette,
  mantenedores: ListChecks,
  pestanas: PanelTop,
  atajos: Keyboard,
  respaldos: DatabaseBackup,
  actualizaciones: RefreshCw,
  revision: ClipboardCheck,
};

const titulo = (texto: string) => /^#\s+(.+)$/m.exec(texto)?.[1] ?? "";
// El orden de los temas es el de ayuda/orden.json (el mismo que usa el sitio); los que falten, al final por nombre.
const posicion = (slug: string) => {
  const i = orden.indexOf(slug);
  return i < 0 ? orden.length : i;
};
const lista = computed(() =>
  Object.entries(paginas)
    .flatMap(([ruta, texto]) => {
      const [, idioma, slug] = /^\/ayuda\/(\w+)\/(.+)\.md$/.exec(ruta) ?? [];
      return idioma === locale.value
        ? [{ slug: slug!, titulo: titulo(texto), texto, resumen: resumenDe(texto), icono: ICONOS[slug!] ?? FileText }]
        : [];
    })
    .sort((a, b) => posicion(a.slug) - posicion(b.slug) || a.slug.localeCompare(b.slug)),
);
// /ayuda sin tema es el índice; con un tema que no existe, el aviso.
const enIndice = computed(() => !route.params.pagina);
const actual = computed(() => lista.value.find((p) => p.slug === route.params.pagina));
// Seguro: markdown-it con html desactivado escapa cualquier etiqueta del texto.
const html = computed(() => (actual.value ? md.render(actual.value.texto) : ""));

const consulta = ref("");
const campo = ref<InstanceType<typeof Input> | null>(null);
const secciones = computed(() => seccionesDe(lista.value));
const resultados = computed(() => buscarEnAyuda(secciones.value, consulta.value));
const buscando = computed(() => consulta.value.trim().length > 0);

function limpiarBusqueda() {
  consulta.value = "";
  void nextTick(() => (campo.value?.$el as HTMLElement | undefined)?.focus());
}

// Los enlaces a otras páginas de la ayuda navegan dentro de la app; los externos se abren en el navegador.
function alPulsar(e: MouseEvent) {
  const href = (e.target as Element | null)?.closest?.("a[href]")?.getAttribute("href");
  if (href?.startsWith("#/ayuda/")) {
    e.preventDefault();
    void router.push(href.slice(1));
  } else abrirEnlacesFuera(e);
}

// Al cambiar de tema o de sección el contenido parte desde arriba (o desde la sección pedida) y el foco no se pierde
// en <body>: si el enlace que se pulsó desaparece, pasa al contenido o al encabezado de destino.
const contenido = ref<HTMLElement | null>(null);
// Los resultados de una búsqueda aparecen arriba aunque estuvieras leyendo más abajo.
watch(buscando, (b) => b && void nextTick(() => contenido.value?.scrollIntoView({ block: "start" })));
watch(
  () => [route.params.pagina, route.hash, locale.value],
  async () => {
    await nextTick();
    const raiz = contenido.value;
    if (!raiz) return;
    const id = decodeURIComponent(route.hash.slice(1));
    const destino = id ? [...raiz.querySelectorAll<HTMLElement>("[id]")].find((e) => e.id === id) : undefined;
    if (destino) {
      destino.tabIndex = -1;
      destino.scrollIntoView({ block: "start" });
      destino.focus({ preventScroll: true });
      return;
    }
    raiz.scrollIntoView({ block: "start" });
    const foco = document.activeElement;
    if (!foco || foco === document.body || !foco.isConnected) raiz.focus({ preventScroll: true });
  },
  { flush: "post" },
);
</script>

<template>
  <section class="mx-auto max-w-5xl p-8">
    <div class="mb-2 flex justify-end"><BotonCerrarVista /></div>
    <div class="flex gap-8">
      <nav
        :aria-label="t('ayuda.paginas')"
        class="sticky top-4 -m-1 max-h-[calc(100vh-7rem)] w-54 shrink-0 self-start overflow-y-auto p-1"
      >
        <h1 class="px-2 pb-2 text-lg font-semibold">{{ t("ayuda.titulo") }}</h1>
        <div class="relative mb-3 px-2">
          <Search class="pointer-events-none absolute left-4.5 top-2 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            ref="campo"
            v-model="consulta"
            type="search"
            class="pl-8"
            :aria-label="t('ayuda.buscar')"
            :placeholder="t('ayuda.buscarPlaceholder')"
            @keydown.esc.prevent="limpiarBusqueda"
          />
        </div>
        <ul class="space-y-1">
          <li>
            <RouterLink
              to="/ayuda"
              replace
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              :class="{ 'bg-accent font-medium': enIndice && !buscando }"
              :aria-current="enIndice && !buscando ? 'page' : undefined"
            >
              <LayoutGrid class="size-4 shrink-0" aria-hidden="true" />
              {{ t("ayuda.indice") }}
            </RouterLink>
          </li>
          <li v-for="p in lista" :key="p.slug">
            <RouterLink
              :to="`/ayuda/${p.slug}`"
              replace
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              :class="{ 'bg-accent font-medium': p.slug === actual?.slug && !buscando }"
              :aria-current="p.slug === actual?.slug && !buscando ? 'page' : undefined"
            >
              <component :is="p.icono" class="size-4 shrink-0" aria-hidden="true" />
              {{ p.titulo }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <div ref="contenido" tabindex="-1" class="min-w-0 flex-1 outline-none">
        <!-- búsqueda: reemplaza al contenido mientras haya texto en el campo -->
        <div v-if="buscando">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h2 class="text-lg font-semibold" aria-live="polite">
              {{ t("ayuda.resultados", resultados.length, { named: { n: resultados.length } }) }}
            </h2>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              @click="limpiarBusqueda"
            >
              <X class="size-4" aria-hidden="true" />
              {{ t("ayuda.limpiar") }}
            </button>
          </div>
          <p v-if="resultados.length === 0" class="text-sm text-muted-foreground">
            {{ t("ayuda.sinResultados", { texto: consulta.trim() }) }}
          </p>
          <ul v-else class="space-y-2">
            <li v-for="r in resultados" :key="`${r.slug}#${r.id}`">
              <RouterLink
                :to="{ path: `/ayuda/${r.slug}`, hash: r.id ? `#${r.id}` : '' }"
                class="block rounded-lg border bg-card p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                @click="consulta = ''"
              >
                <span class="block text-xs text-muted-foreground">{{ r.pagina }}</span>
                <span class="block text-sm font-medium">{{ r.encabezado }}</span>
                <span class="block text-sm text-muted-foreground">
                  {{ r.extracto[0] }}<mark class="rounded bg-marca/30 px-0.5 text-foreground">{{ r.extracto[1] }}</mark
                  >{{ r.extracto[2] }}
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- índice de temas -->
        <div v-else-if="enIndice">
          <h2 class="text-2xl font-semibold">{{ t("ayuda.temas") }}</h2>
          <p class="mb-4 mt-1 text-sm text-muted-foreground">{{ t("ayuda.bienvenida") }}</p>
          <ul class="grid gap-3 sm:grid-cols-2">
            <li v-for="p in lista" :key="p.slug">
              <RouterLink
                :to="`/ayuda/${p.slug}`"
                class="flex h-full gap-3 rounded-lg border bg-card p-3 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted" aria-hidden="true">
                  <component :is="p.icono" class="size-5" />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold">{{ p.titulo }}</span>
                  <span class="line-clamp-3 block text-sm text-muted-foreground">{{ p.resumen }}</span>
                </span>
              </RouterLink>
            </li>
          </ul>
        </div>

        <!-- los enlaces internos navegan en la app y los externos se abren en el navegador del sistema -->
        <!-- eslint-disable-next-line vue/no-v-html -- html: false en markdown-it -->
        <article v-else-if="actual" class="ayuda" @click="alPulsar" v-html="html" />
        <p v-else class="text-sm text-muted-foreground">{{ t("ayuda.noExiste") }}</p>
      </div>
    </div>
  </section>
</template>
