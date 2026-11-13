<script setup lang="ts">
import { onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DialogoPuesto from "@/features/puestos/DialogoPuesto.vue";
import FichaTrabajador from "@/features/trabajadores/FichaTrabajador.vue";
import { useAtajos } from "@/features/atajos/useAtajos";
import { useRouter } from "vue-router";
import { escucharPadre } from "./mensajes";

/** La app en el iframe del panel de al lado: solo la vista, sin barras ni pestañas (esas son del padre). */
defineProps<{
  /** Por qué no se pudo leer la organización, ya traducido; vacío si se leyó. */
  motivo: string;
}>();
const { t } = useI18n();
const router = useRouter();
// Leer con el teclado (flechas, F, menú, zoom); F6 y los atajos de pestañas y de la paleta van a la ventana. Al montar:
// escucha la ventana del iframe, y lo que la ventana le pide (navegar) y le avisa (el foco entró aquí).
onMounted(() => {
  useAtajos();
  escucharPadre(router);
});
</script>

<template>
  <TooltipProvider>
    <main class="flex h-screen flex-col bg-background text-foreground">
      <p v-if="motivo" role="alert" class="flex items-start gap-2 p-6 text-sm leading-relaxed">
        <TriangleAlert class="size-5 shrink-0 text-destructive" aria-hidden="true" />
        {{ motivo }}
      </p>
      <div v-else class="min-h-0 flex-1 overflow-auto">
        <RouterView />
      </div>
    </main>
    <FichaTrabajador />
    <DialogoPuesto />
    <Toaster :container-aria-label="t('comun.avisos')" />
  </TooltipProvider>
</template>
