<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { useInicioSistema } from "@/stores/inicioSistema";

// Configuración › Inicio con el sistema: refleja y cambia lo que el sistema tiene registrado (también lo que marcó
// el instalador). Donde no se ofrece (portable, fuera de Windows) se ve apagado y explica por qué.
const { t } = useI18n();
const inicio = useInicioSistema();
const cargado = ref(false);

onMounted(async () => {
  const r = await inicio.cargar();
  if (!r.ok) toast.error(r.mensaje);
  cargado.value = r.ok;
});

async function cambiar(e: Event) {
  const casilla = e.target as HTMLInputElement;
  const r = await inicio.cambiar(casilla.checked);
  if (!r.ok) toast.error(r.mensaje);
  casilla.checked = inicio.activo; // si falló o el sistema no lo aceptó, vuelve a lo real
}
</script>

<template>
  <section class="grid gap-2" aria-labelledby="cfg-inicio">
    <h2 id="cfg-inicio" class="font-medium">{{ t("config.inicio.titulo") }}</h2>
    <label class="flex items-center gap-2" :class="inicio.noDisponible && 'text-muted-foreground'">
      <input
        type="checkbox"
        class="size-4 accent-primary"
        aria-describedby="cfg-inicio-ayuda"
        :checked="inicio.activo"
        :disabled="!cargado || inicio.noDisponible !== null"
        @change="cambiar"
      />
      {{ t("config.inicio.etiqueta") }}
    </label>
    <p id="cfg-inicio-ayuda" class="text-sm text-muted-foreground">
      {{ inicio.noDisponible ? t(`config.inicio.${inicio.noDisponible}`) : t("config.inicio.ayuda") }}
    </p>
  </section>
</template>
