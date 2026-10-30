<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { SlidersHorizontal } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useOrganizacion } from "@/stores/organizacion";
import { tiposEnUso } from "./jerarquia";
import { useVista } from "./useVista";
import { CRITERIO_LEYENDA, criterioMarca, tipoDeMarca } from "./vista";

const { t } = useI18n();
const org = useOrganizacion();
const { config } = useVista();

const tipos = computed(() => tiposEnUso(org.unidades, org.catalogos.tipos_unidad));
// Una preferencia guardada con un tipo que ya nadie usa se ve como «ninguno», sin pisar lo guardado.
const criterio = computed({
  get: () => {
    if (config.value.colorearPor === CRITERIO_LEYENDA) return CRITERIO_LEYENDA;
    const id = tipoDeMarca(config.value.colorearPor, tipos.value);
    return id ? criterioMarca(id) : "ninguno";
  },
  set: (v: string) => (config.value.colorearPor = v),
});

const selectores = [
  { clave: "direccion", opciones: ["vertical", "horizontal"] },
  { clave: "densidad", opciones: ["normal", "compacta"] },
  { clave: "lineas", opciones: ["smoothstep", "bezier"] },
] as const;
const camposTarjeta = [
  "mostrarTipo",
  "mostrarJefe",
  "mostrarFoto",
  "mostrarDotacion",
  "mostrarVacantes",
  "mostrarEtiquetas",
] as const;

// El criterio por leyenda solo se ve en los puestos: se avisa si siguen ocultos.
const pidePuestos = computed(() => config.value.colorearPor === CRITERIO_LEYENDA && !config.value.verPuestos);

function alternarTipo(id: string, marcado: boolean) {
  const sin = config.value.rutaTipos.filter((x) => x !== id);
  config.value.rutaTipos = marcado ? [...sin, id] : sin;
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <SlidersHorizontal aria-hidden="true" />
        {{ t("arbol.vista.titulo") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="max-h-[80vh] w-72 gap-3 overflow-y-auto text-sm">
      <label v-for="sel in selectores" :key="sel.clave" class="grid gap-1">
        <span class="font-medium">{{ t(`arbol.vista.${sel.clave}`) }}</span>
        <select v-model="config[sel.clave]" class="h-7 rounded-md border bg-background px-2 text-sm">
          <option v-for="o in sel.opciones" :key="o" :value="o">{{ t(`arbol.vista.opciones.${o}`) }}</option>
        </select>
      </label>
      <p v-if="config.densidad === 'compacta'" class="text-xs text-muted-foreground">
        {{ t("arbol.vista.compactaAviso") }}
      </p>
      <fieldset class="grid gap-1.5">
        <legend class="mb-1 font-medium">{{ t("arbol.vista.tarjeta") }}</legend>
        <label v-for="campo in camposTarjeta" :key="campo" class="flex items-center gap-2">
          <input
            v-model="config[campo]"
            type="checkbox"
            class="size-4 accent-primary"
            :disabled="campo === 'mostrarFoto' && !config.mostrarJefe"
          />
          {{ t(`arbol.vista.campos.${campo}`) }}
        </label>
      </fieldset>
      <label class="flex items-center gap-2">
        <input v-model="config.verPuestos" type="checkbox" class="size-4 accent-primary" />
        {{ t("arbol.vista.verPuestos") }}
      </label>
      <div class="grid gap-1.5 pl-6" :class="!config.verPuestos && 'opacity-50'">
        <label class="flex items-center gap-2">
          <input
            v-model="config.mostrarCargo"
            type="checkbox"
            class="size-4 accent-primary"
            :disabled="!config.verPuestos"
          />
          {{ t("arbol.vista.mostrarCargo") }}
        </label>
        <label class="flex items-center gap-2">
          <input
            v-model="config.mostrarPersona"
            type="checkbox"
            class="size-4 accent-primary"
            :disabled="!config.verPuestos"
          />
          {{ t("arbol.vista.mostrarPersona") }}
        </label>
      </div>
      <fieldset class="grid gap-1.5">
        <legend class="mb-1 font-medium">{{ t("arbol.vista.rutaPorTipo") }}</legend>
        <label v-for="tipo in tipos" :key="tipo.id" class="flex items-center gap-2">
          <input
            type="checkbox"
            class="size-4 accent-primary"
            :checked="config.rutaTipos.includes(tipo.id)"
            @change="alternarTipo(tipo.id, ($event.target as HTMLInputElement).checked)"
          />
          {{ tipo.nombre }}
        </label>
      </fieldset>
      <label class="grid gap-1">
        <span class="font-medium">{{ t("arbol.vista.colorearPor") }}</span>
        <select
          v-model="criterio"
          class="h-7 rounded-md border bg-background px-2 text-sm"
          :aria-describedby="pidePuestos ? 'vista-pide-puestos' : undefined"
        >
          <option value="ninguno">{{ t("arbol.vista.ninguno") }}</option>
          <option :value="CRITERIO_LEYENDA">{{ t("arbol.vista.leyendaPuesto") }}</option>
          <option v-for="tipo in tipos" :key="tipo.id" :value="criterioMarca(tipo.id)">
            {{ t("arbol.vista.marcaDe", { tipo: tipo.nombre }) }}
          </option>
        </select>
        <span v-if="pidePuestos" id="vista-pide-puestos" class="text-xs text-muted-foreground">
          {{ t("arbol.vista.activaVerPuestos") }}
        </span>
      </label>
    </PopoverContent>
  </Popover>
</template>
