<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { Search } from "@lucide/vue";
import { ListboxFilter } from "reka-ui";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { useOrganizacion } from "@/stores/organizacion";
import { buscarUnidades } from "./panel";

// Buscador y lista de unidades de SelectorUnidad y de «Conectar con…».
const props = defineProps<{
  excluidas: Set<string>;
  /** Ofrece esta opción (devuelve null), por ejemplo «Sin superior (raíz)». */
  ninguna?: string;
}>();
const emit = defineEmits<{ elegir: [id: string | null] }>();

const { t } = useI18n();
const org = useOrganizacion();

const busqueda = ref("");
const opciones = computed(() => buscarUnidades(org.unidades, props.excluidas, busqueda.value));
</script>

<template>
  <Command>
    <div
      class="flex items-center gap-2 border-b px-2 focus-within:border-b-ring focus-within:shadow-[inset_0_-1px_0_var(--ring)]"
    >
      <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
      <ListboxFilter
        v-model="busqueda"
        auto-focus
        :placeholder="t('unidad.buscar')"
        :aria-label="t('unidad.buscar')"
        class="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
      />
    </div>
    <CommandList>
      <CommandGroup>
        <CommandItem v-if="ninguna && !busqueda.trim()" value="ninguna" @select="emit('elegir', null)">
          {{ ninguna }}
        </CommandItem>
        <CommandItem
          v-for="o in opciones"
          :key="o.unidad.id"
          :value="o.unidad.id"
          @select="emit('elegir', o.unidad.id)"
        >
          <span class="grid min-w-0">
            <span class="truncate">{{ o.unidad.nombre }}</span>
            <span v-if="o.ruta" class="truncate text-xs text-muted-foreground">{{ o.ruta }}</span>
          </span>
        </CommandItem>
      </CommandGroup>
      <p v-if="!opciones.length" class="px-2 py-3 text-sm text-muted-foreground">
        {{ t("unidad.sinCoincidencias") }}
      </p>
    </CommandList>
  </Command>
</template>
