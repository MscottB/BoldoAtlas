<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import type { Unidad } from "@/db/tipos";
import { useLienzo } from "./useLienzo";

// Niveles rápidos, en la esquina opuesta al zoom. Pasan por lo mismo que «Más › Ramas»: si abren de más, primero el aviso.
defineProps<{ unidades: Unidad[] }>();
const emit = defineEmits<{ encuadrar: [] }>();
const { t } = useI18n();
const { avisoExpansion, contraerHasta, expandirTodo } = useLienzo();
// Otro nivel cambia la forma del árbol: se encuadra tras el layout (si queda el aviso, aún no cambió nada).
function aplicar(plegar: () => unknown) {
  plegar();
  if (!avisoExpansion.value) emit("encuadrar");
}
</script>

<template>
  <div
    role="group"
    :aria-label="t('arbol.niveles.titulo')"
    class="absolute bottom-[15px] left-[15px] z-10 flex gap-1"
  >
    <Button
      v-for="n in [1, 2, 3]"
      :key="n"
      variant="outline"
      size="icon-sm"
      :aria-label="t('arbol.niveles.ver', { n }, n)"
      :title="t('arbol.niveles.ver', { n }, n)"
      @click="aplicar(() => contraerHasta(unidades, n))"
    >
      {{ n }}
    </Button>
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
