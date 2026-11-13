<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { Minus, Plus } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import type { Unidad } from "@/db/tipos";
import { MAX_BOTONES_NIVEL, nivelVecino, profundidad } from "./niveles";
import { useLienzo } from "./useLienzo";

// Niveles rápidos, en la esquina opuesta al zoom. Pasan por lo mismo que «Más › Ramas»: si abren de más, primero el aviso.
// Solo los niveles que existen: hasta MAX_BOTONES_NIVEL, un botón por nivel; con más, «−», el nivel actual y «+».
// El nivel actual es el que se ve (se calcula de lo plegado), así que «Todo», el menú y las vistas guardadas lo mantienen al día.
const props = defineProps<{ unidades: Unidad[]; total: number }>();
const emit = defineEmits<{ encuadrar: [] }>();
const { t } = useI18n();
const { avisoExpansion, colapsados, contraerHasta, expandirTodo } = useLienzo();
const actual = computed(() => profundidad(props.unidades, colapsados.value));
// Otro nivel cambia la forma del árbol: se encuadra tras el layout (si queda el aviso, aún no cambió nada).
function aplicar(plegar: () => unknown) {
  plegar();
  if (!avisoExpansion.value) emit("encuadrar");
}
</script>

<template>
  <!-- Con un solo nivel no hay nada que elegir. -->
  <div
    v-if="total > 1"
    role="group"
    :aria-label="t('arbol.niveles.titulo')"
    class="absolute bottom-[15px] left-[15px] z-10 flex items-center gap-1"
  >
    <template v-if="total <= MAX_BOTONES_NIVEL">
      <Button
        v-for="n in total"
        :key="n"
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.niveles.ver', { n }, n)"
        :title="t('arbol.niveles.ver', { n }, n)"
        :aria-pressed="n === actual"
        :class="n === actual && 'bg-accent'"
        @click="aplicar(() => contraerHasta(unidades, n))"
      >
        {{ n }}
      </Button>
    </template>
    <template v-else>
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.niveles.menos')"
        :title="t('arbol.niveles.menos')"
        :disabled="actual <= 1"
        @click="aplicar(() => contraerHasta(unidades, nivelVecino(actual, total, -1)))"
      >
        <Minus aria-hidden="true" />
      </Button>
      <span
        class="min-w-6 text-center text-sm tabular-nums"
        role="status"
        :aria-label="t('arbol.niveles.actual', { n: actual })"
        >{{ actual }}</span
      >
      <Button
        variant="outline"
        size="icon-sm"
        :aria-label="t('arbol.niveles.mas')"
        :title="t('arbol.niveles.mas')"
        :disabled="actual >= total"
        @click="aplicar(() => contraerHasta(unidades, nivelVecino(actual, total, 1)))"
      >
        <Plus aria-hidden="true" />
      </Button>
    </template>
    <Button
      variant="outline"
      size="sm"
      :aria-label="t('arbol.niveles.verTodo')"
      :title="t('arbol.niveles.verTodo')"
      @click="aplicar(() => expandirTodo(unidades))"
    >
      {{ t("arbol.niveles.todo") }}
    </Button>
  </div>
</template>
