<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { X } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { useCerrarVista } from "@/app/useCerrarVista";

// Cerrar vuelve a la vista anterior; Esc y un segundo clic en la entrada del menú hacen lo mismo.
const { t } = useI18n();
const cerrar = useCerrarVista();
</script>

<template>
  <Button type="button" variant="outline" size="sm" aria-keyshortcuts="Escape" @click="cerrar">
    <X aria-hidden="true" />
    {{ t("vista.cerrar") }}
  </Button>
</template>
