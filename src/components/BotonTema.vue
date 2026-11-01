<script setup lang="ts">
import { computed } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { useI18n } from "vue-i18n";
import { Moon, Sun } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useTema } from "@/features/tema/useTema";

// El botón de claro/oscuro de la barra superior y de Inicio.
const { t } = useI18n();
const { tema } = useTema();

// "sistema" no es un modo visible: el botón alterna hacia el opuesto del que se ve ahora.
const sistemaOscuro = useMediaQuery("(prefers-color-scheme: dark)");
const oscuro = computed(() => tema.value === "oscuro" || (tema.value === "sistema" && sistemaOscuro.value));
const etiquetaTema = computed(() => (oscuro.value ? t("barra.temaClaro") : t("barra.temaOscuro")));
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="etiquetaTema"
    :title="etiquetaTema"
    @click="tema = oscuro ? 'claro' : 'oscuro'"
  >
    <Sun v-if="oscuro" aria-hidden="true" />
    <Moon v-else aria-hidden="true" />
  </Button>
</template>
