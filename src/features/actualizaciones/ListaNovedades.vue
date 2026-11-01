<script setup lang="ts">
import { useI18n } from "vue-i18n";
import MarkdownIt from "markdown-it";
import { abrirEnlacesFuera } from "@/lib/enlaces";
import type { Novedad } from "./novedades";

// Notas de varias versiones, de la más nueva a la más antigua. Las notas vienen de los PR, en español: con la
// interfaz en inglés se avisa y el bloque lleva lang="es" para los lectores de pantalla.
defineProps<{ lista: Novedad[] }>();
const { t, locale } = useI18n();
const md = new MarkdownIt({ html: false });
// Los títulos de las notas quedan bajo el de su versión (h3).
// Seguro: markdown-it con html desactivado escapa cualquier etiqueta del texto.
const html = (notas: string) => md.render(notas.replace(/^#{1,3}\s/gm, "#### "));
const fecha = (f: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(f)
    ? new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(new Date(`${f}T12:00`))
    : "";
</script>

<template>
  <div class="grid gap-3">
    <p v-if="locale !== 'es'" class="text-xs text-muted-foreground">{{ t("novedades.enEspanol") }}</p>
    <ol class="grid gap-4">
      <li v-for="n in lista" :key="n.version">
        <h3 class="text-sm font-semibold">
          {{ t("novedades.version", { version: n.version }) }}
          <span v-if="fecha(n.fecha)" class="font-normal text-muted-foreground">· {{ fecha(n.fecha) }}</span>
        </h3>
        <!-- los enlaces de las notas se abren en el navegador del sistema, nunca dentro de la app -->
        <!-- eslint-disable-next-line vue/no-v-html -- html: false en markdown-it -->
        <div v-if="n.notas" class="ayuda novedades" lang="es" @click="abrirEnlacesFuera" v-html="html(n.notas)" />
        <p v-else class="mt-1 text-sm text-muted-foreground">{{ t("novedades.sinNotas") }}</p>
      </li>
    </ol>
  </div>
</template>
