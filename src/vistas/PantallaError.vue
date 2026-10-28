<script setup lang="ts">
import { ref } from "vue";
import { TriangleAlert } from "lucide-vue-next";
import type { InfoApp } from "@/db/cliente";

const props = defineProps<{ info: InfoApp }>();
const copiado = ref(false);

async function copiar() {
  await navigator.clipboard.writeText(
    `BoldoAtlas ${__APP_VERSION__}\n${props.info.error}\nCarpeta de datos: ${props.info.dirDatos || "—"}`,
  );
  copiado.value = true;
}
</script>

<template>
  <main class="flex h-screen items-center justify-center bg-background p-8 text-foreground">
    <section class="max-w-xl space-y-4" role="alert">
      <div class="flex items-center gap-3">
        <TriangleAlert class="size-7 text-destructive" aria-hidden="true" />
        <h1 class="text-xl font-semibold">BoldoAtlas no pudo abrir sus datos</h1>
      </div>
      <p class="text-sm leading-relaxed">{{ info.error }}</p>
      <p v-if="info.dirDatos" class="text-sm text-muted-foreground">
        Carpeta de datos: <code class="select-all">{{ info.dirDatos }}</code>
      </p>
      <button
        type="button"
        class="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 focus-visible:outline-2 focus-visible:outline-ring"
        @click="copiar"
      >
        {{ copiado ? "Copiado" : "Copiar detalle" }}
      </button>
    </section>
  </main>
</template>
