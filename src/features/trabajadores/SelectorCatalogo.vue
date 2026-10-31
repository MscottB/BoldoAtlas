<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ChevronsUpDown, Plus, Search } from "@lucide/vue";
import { ListboxFilter } from "reka-ui";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { TablaCatalogo } from "@/db/tipos";
import { useOrganizacion } from "@/stores/organizacion";
import { normalizarTexto } from "@/lib/texto";
import { hayCoincidenciaExacta } from "./validar";

// Combobox sobre un mantenedor: elige un valor activo o agrega uno nuevo sin duplicar. Los atributos (id, aria-*) van al botón.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ tabla: TablaCatalogo; modelValue: string | null; requerido?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [id: string | null] }>();

const { t } = useI18n();
const org = useOrganizacion();

const abierto = ref(false);
const busqueda = ref("");
watch(abierto, () => (busqueda.value = ""));

const activos = computed(() => org.activos(props.tabla));
// El valor actual se muestra aunque lo hayan desactivado, marcado como inactivo.
const actual = computed(() => org.catalogos[props.tabla].find((v) => v.id === props.modelValue));
const inactivoActual = computed(
  () => !!actual.value && !activos.value.some((v) => v.id === actual.value!.id),
);
const etiqueta = (nombre: string, inactivo = false) =>
  inactivo ? `${nombre} ${t("ficha.selector.inactivo")}` : nombre;

const texto = computed(() => busqueda.value.trim());
const coincidentes = computed(() =>
  activos.value.filter((v) => normalizarTexto(v.nombre).includes(normalizarTexto(texto.value))),
);
const puedeAgregar = computed(() => !!texto.value && !hayCoincidenciaExacta(activos.value, texto.value));

function elegir(id: string | null) {
  emit("update:modelValue", id);
  abierto.value = false;
}

async function agregar() {
  const r = await org.crearValor(props.tabla, texto.value);
  if (r.ok) return elegir(r.id);
  if (r.existente) {
    const nombre = org.catalogos[props.tabla].find((v) => v.id === r.existente)?.nombre ?? texto.value;
    toast.info(t("ficha.selector.yaExistia", { nombre }));
    return elegir(r.existente);
  }
  toast.error(r.mensaje);
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
        class="w-full justify-between font-normal"
      >
        <span class="truncate" :class="{ 'text-muted-foreground': !actual }">
          {{ actual ? etiqueta(actual.nombre, inactivoActual) : t("ficha.selector.elegir") }}
        </span>
        <ChevronsUpDown class="opacity-50" aria-hidden="true" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-(--reka-popover-trigger-width) min-w-56 p-0">
      <Command :model-value="modelValue ?? ''">
        <!-- Filtro propio (no CommandInput): así el grupo no se oculta y "Agregar" sigue lo escrito. -->
        <div class="flex items-center gap-2 border-b px-2">
          <Search class="size-4 shrink-0 opacity-50" aria-hidden="true" />
          <ListboxFilter
            v-model="busqueda"
            auto-focus
            :placeholder="t('ficha.selector.buscar')"
            :aria-label="t('ficha.selector.buscar')"
            class="h-8 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <CommandList>
          <CommandGroup>
            <CommandItem v-if="modelValue && !texto && !requerido" value="sin-valor" @select="elegir(null)">
              {{ t("ficha.selector.sinValor") }}
            </CommandItem>
            <CommandItem
              v-if="inactivoActual && actual && !texto"
              :value="actual.id"
              @select="elegir(actual.id)"
            >
              {{ etiqueta(actual.nombre, true) }}
            </CommandItem>
            <CommandItem v-for="v in coincidentes" :key="v.id" :value="v.id" @select="elegir(v.id)">
              {{ v.nombre }}
            </CommandItem>
            <CommandItem v-if="puedeAgregar" value="agregar-nuevo" @select="agregar">
              <Plus aria-hidden="true" />
              {{ t("ficha.selector.agregar", { texto }) }}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>
</template>
