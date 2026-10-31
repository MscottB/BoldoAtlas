<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { openUrl } from "@tauri-apps/plugin-opener";
import BotonCerrarVista from "@/components/BotonCerrarVista.vue";
import { infoApp, leerMeta, type InfoApp } from "@/db/cliente";
import { AUTOR, LICENCIA, REPO } from "@/app/about";
import { infoParaCopiar, versionVisible } from "@/app/version";
import logo from "../../assets/brand/logo-horizontal.webp";

const { t } = useI18n();
const info = ref<InfoApp | null>(null);
const meta = ref<Record<string, string>>({});
const copiado = ref(false);
// las constantes de Vite no llegan a la plantilla: se exponen desde el script
const versionCompleta = __APP_VERSION__;

onMounted(async () => {
  info.value = await infoApp();
  meta.value = await leerMeta();
});

async function copiar() {
  if (!info.value) return;
  await navigator.clipboard.writeText(infoParaCopiar(info.value, meta.value));
  copiado.value = true;
}
</script>

<template>
  <section class="mx-auto max-w-2xl space-y-8 p-10">
    <div class="flex items-start justify-between gap-2">
      <img :src="logo" alt="BoldoAtlas" class="h-16 w-auto" />
      <BotonCerrarVista />
    </div>

    <div>
      <p class="text-2xl font-semibold">{{ versionVisible() }}</p>
      <p class="mt-1 select-all font-mono text-xs text-muted-foreground">{{ versionCompleta }}</p>
    </div>

    <dl v-if="info" class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
      <dt class="text-muted-foreground">{{ t("acerca.esquema") }}</dt>
      <dd>{{ info.versionEsquema }}</dd>
      <dt class="text-muted-foreground">{{ t("acerca.idBase") }}</dt>
      <dd class="select-all font-mono text-xs leading-5">{{ meta.db_id }}</dd>
      <dt class="text-muted-foreground">{{ t("acerca.revision") }}</dt>
      <dd>{{ meta.data_revision }}</dd>
      <dt class="text-muted-foreground">{{ t("acerca.baseCreada") }}</dt>
      <dd>{{ meta.db_creada }}</dd>
      <dt class="text-muted-foreground">{{ t("acerca.modo") }}</dt>
      <dd>{{ info.portable ? t("acerca.portable") : t("acerca.instalado") }}</dd>
      <dt class="text-muted-foreground">{{ t("acerca.carpetaDatos") }}</dt>
      <dd class="select-all break-all text-xs leading-5">{{ info.dirDatos }}</dd>
    </dl>

    <button
      type="button"
      class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
      @click="copiar"
    >
      {{ copiado ? t("acerca.copiado") : t("acerca.copiar") }}
    </button>

    <div class="space-y-1 border-t pt-6 text-sm">
      <p>
        {{ t("acerca.creadoPor") }}
        <button
          type="button"
          class="font-medium text-marca underline-offset-4 hover:underline"
          @click="openUrl(AUTOR.enlace)"
        >
          {{ AUTOR.nombre }}
        </button>
      </p>
      <p>
        {{ t("acerca.licencia") }}
        <button type="button" class="underline-offset-4 hover:underline" @click="openUrl(LICENCIA.enlace)">
          {{ LICENCIA.nombre }}
        </button>
        ·
        <button type="button" class="underline-offset-4 hover:underline" @click="openUrl(REPO)">
          {{ t("acerca.repositorio") }}
        </button>
      </p>
    </div>
  </section>
</template>
