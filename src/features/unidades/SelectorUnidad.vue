<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronsUpDown, Search } from "@lucide/vue";
import { ListboxFilter } from "reka-ui";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import { buscarUnidades } from "./panel";

// Combobox con buscador de unidades (superior y destino de una conexión). Los atributos (id, aria-*) van al botón.
defineOptions({ inheritAttrs: false });
const props = defineProps<{
  excluidas: Set<string>;
  /** Texto del botón (lo elegido o el aviso de «elegir»). */
  texto: string;
  /** Ofrece esta opción (devuelve null), por ejemplo «Sin superior (raíz)». */
  ninguna?: string;
}>();
const emit = defineEmits<{ elegir: [id: string | null] }>();

const { t } = useI18n();
const org = useOrganizacion();

const abierto = ref(false);
const busqueda = ref("");
watch(abierto, () => (busqueda.value = ""));

const opciones = computed(() => buscarUnidades(org.unidades, props.excluidas, busqueda.value));

function elegir(id: string | null) {
  emit("elegir", id);
  abierto.value = false;
}
</script>

<template>
  <Popover v-model:open="abierto">
    <PopoverTrigger as-child>
      <Button
        v-bind="$attrs"
        type="button"
        variant="outline"
        role="combobox"
        class="w-full justify-between border-campo-borde font-normal dark:border-campo-borde"
      >
        <span class="truncate">{{ texto }}</span>
        <ChevronsUpDown class="opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-(--reka-popover-trigger-width) min-w-64 p-0">
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
            <CommandItem v-if="ninguna && !busqueda.trim()" value="ninguna" @select="elegir(null)">
              {{ ninguna }}
            </CommandItem>
            <CommandItem
              v-for="o in opciones"
              :key="o.unidad.id"
              :value="o.unidad.id"
              @select="elegir(o.unidad.id)"
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
    </PopoverContent>
  </Popover>
</template>
