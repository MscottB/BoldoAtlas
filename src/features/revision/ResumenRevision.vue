<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { NIVELES, type Revision, type TipoAviso } from "./revision";

// Un bloque por nivel: por qué importa y qué tipos tienen avisos. Cada tipo lleva a su sección (y la abre).
const props = defineProps<{ secciones: Revision["secciones"] }>();
const emit = defineEmits<{ ir: [tipo: TipoAviso] }>();
const { t } = useI18n();

const niveles = computed(() =>
  NIVELES.map(({ nivel }) => ({
    nivel,
    secciones: props.secciones.filter((s) => s.nivel === nivel && s.avisos.length),
  })),
);
</script>

<template>
  <div class="grid gap-3 sm:grid-cols-3">
    <section
      v-for="n in niveles"
      :key="n.nivel"
      :data-nivel="n.nivel"
      class="flex flex-col gap-1 rounded-lg border bg-card p-3"
    >
      <h2 class="font-medium">{{ t(`revision.niveles.${n.nivel}.titulo`) }}</h2>
      <p class="text-sm text-muted-foreground">{{ t(`revision.niveles.${n.nivel}.ayuda`) }}</p>
      <ul v-if="n.secciones.length" class="mt-1 grid gap-1 text-sm">
        <li v-for="s in n.secciones" :key="s.tipo" class="flex items-center gap-2">
          <!-- El enrutador usa el hash: el salto se hace a mano para no cambiar de ruta. -->
          <a
            :href="`#revision-${s.tipo}`"
            class="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
            @click.prevent="emit('ir', s.tipo)"
            >{{ t(`revision.${s.tipo}.titulo`) }}</a
          >
          <span class="rounded-full bg-muted px-2 text-xs text-foreground">{{ s.avisos.length }}</span>
        </li>
      </ul>
      <p v-else class="mt-1 text-sm">{{ t("revision.todoEnOrden") }}</p>
    </section>
  </div>
</template>
