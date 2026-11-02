<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { CircleArrowUp } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useActualizaciones } from "@/stores/actualizaciones";

defineProps<{ destacado?: boolean }>();

const { t } = useI18n();
const actualizaciones = useActualizaciones();
</script>

<template>
  <!-- Aviso de versión nueva (spec §12): abre la ventana de actualización; nunca instala solo. -->
  <Button
    v-if="actualizaciones.disponible"
    :variant="destacado ? 'default' : 'outline'"
    size="sm"
    :class="destacado ? '' : 'text-marca-texto'"
    @click="actualizaciones.ventanaAbierta = true"
  >
    <CircleArrowUp aria-hidden="true" />
    {{ t("actualizar.disponible", { version: actualizaciones.disponible.version }) }}
  </Button>
</template>
