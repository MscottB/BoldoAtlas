<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronsUpDown, Plus, Search } from "@lucide/vue";
import { ListboxFilter } from "reka-ui";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import { filtrarPersonas, puedeCrearPersona, type EleccionPersona } from "./puestos";

// Combobox de personas existentes; si no está, "Crear persona «texto»" deja elegido su nombre y la crea el formulario al confirmar.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ modelValue: EleccionPersona | null }>();
const emit = defineEmits<{ "update:modelValue": [e: EleccionPersona] }>();

const { t } = useI18n();
const org = useOrganizacion();

const abierto = ref(false);
const busqueda = ref("");
watch(abierto, () => (busqueda.value = ""));

const texto = computed(() => busqueda.value.trim());
const coincidentes = computed(() => filtrarPersonas(org.trabajadores, texto.value));
const puedeCrear = computed(() => puedeCrearPersona(org.trabajadores, texto.value));
const actual = computed(() => {
  const v = props.modelValue;
  if (!v) return "";
  return "id" in v
    ? (org.trabajadores.find((w) => w.id === v.id)?.nombre ?? "")
    : t("puesto.personaNueva", { nombre: v.nombre });
});

function elegir(e: EleccionPersona) {
  emit("update:modelValue", e);
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
        <span class="truncate" :class="{ 'text-muted-foreground': !actual }">
          {{ actual || t("puesto.elegirPersona") }}
        </span>
        <ChevronsUpDown class="opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-(--reka-popover-trigger-width) min-w-64 p-0">
      <Command>
        <!-- Filtro propio (como SelectorCatalogo): así "Crear persona" sigue lo escrito. -->
        <div
          class="flex items-center gap-2 border-b px-2 focus-within:border-b-ring focus-within:shadow-[inset_0_-1px_0_var(--ring)]"
        >
          <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
          <ListboxFilter
            v-model="busqueda"
            auto-focus
            :placeholder="t('puesto.buscarPersona')"
            :aria-label="t('puesto.buscarPersona')"
            class="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <CommandList>
          <CommandGroup>
            <CommandItem v-for="w in coincidentes" :key="w.id" :value="w.id" @select="elegir({ id: w.id })">
              {{ w.nombre }}
            </CommandItem>
            <CommandItem v-if="puedeCrear" value="crear-persona" @select="elegir({ nombre: texto })">
              <Plus aria-hidden="true" />
              {{ t("puesto.crearPersona", { texto }) }}
            </CommandItem>
          </CommandGroup>
          <p v-if="!coincidentes.length && !puedeCrear" class="px-2 py-3 text-sm text-muted-foreground">
            {{ t("puesto.sinPersonas") }}
          </p>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
