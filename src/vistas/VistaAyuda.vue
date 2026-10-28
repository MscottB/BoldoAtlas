<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import MarkdownIt from "markdown-it";

// Las páginas viven en /ayuda/<idioma>/<tema>.md (fuente única, también para el sitio web).
const paginas = import.meta.glob("/ayuda/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const md = new MarkdownIt({ html: false });

const { t, locale } = useI18n();
const route = useRoute();

const titulo = (texto: string) => /^#\s+(.+)$/m.exec(texto)?.[1] ?? "";
// "inicio" va primero; el resto, por orden alfabético del archivo.
const lista = computed(() =>
  Object.entries(paginas)
    .flatMap(([ruta, texto]) => {
      const [, idioma, slug] = /^\/ayuda\/(\w+)\/(.+)\.md$/.exec(ruta) ?? [];
      return idioma === locale.value ? [{ slug, titulo: titulo(texto), texto }] : [];
    })
    .sort(
      (a, b) => Number(b.slug === "inicio") - Number(a.slug === "inicio") || a.slug.localeCompare(b.slug),
    ),
);
const actual = computed(() => {
  const pedida = route.params.pagina;
  return lista.value.find((p) => p.slug === (pedida || "inicio"));
});
// Seguro: markdown-it con html desactivado escapa cualquier etiqueta del texto.
const html = computed(() => (actual.value ? md.render(actual.value.texto) : ""));
</script>

<template>
  <section class="mx-auto flex max-w-4xl gap-8 p-8">
    <nav :aria-label="t('ayuda.paginas')" class="w-48 shrink-0">
      <h1 class="px-2 pb-2 text-lg font-semibold">{{ t("ayuda.titulo") }}</h1>
      <ul class="space-y-1">
        <li v-for="p in lista" :key="p.slug">
          <RouterLink
            :to="`/ayuda/${p.slug}`"
            class="block rounded-md px-2 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            :class="{ 'bg-accent font-medium': p.slug === actual?.slug }"
            :aria-current="p.slug === actual?.slug ? 'page' : undefined"
          >
            {{ p.titulo }}
          </RouterLink>
        </li>
      </ul>
    </nav>
    <!-- eslint-disable-next-line vue/no-v-html -- html: false en markdown-it -->
    <article v-if="actual" class="ayuda min-w-0 flex-1" v-html="html" />
    <p v-else class="text-sm text-muted-foreground">{{ t("ayuda.noExiste") }}</p>
  </section>
</template>
