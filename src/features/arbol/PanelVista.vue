<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { ChevronRight, SlidersHorizontal } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion } from "@/stores/organizacion";
import { tiposEnUso } from "./jerarquia";
import { useVista } from "./useVista";
import { CRITERIO_LEYENDA, criterioMarca, leerVista, tipoDeMarca } from "./vista";
import { claseSelect, cn } from "@/lib/utils";

// «Personalizar»: 4 opciones a la vista (dirección, densidad, colorear por, ver puestos) y el resto en dos bloques
// plegados que recuerdan, por PC, si quedaron abiertos.
const { t } = useI18n();
const org = useOrganizacion();
const { config, panelAbierto } = useVista();

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

const botones = [
  { clave: "direccion", opciones: ["vertical", "horizontal"] },
  { clave: "densidad", opciones: ["normal", "compacta"] },
] as const;
// Cada botón trae su clave y una de sus opciones (el `as const` de arriba lo asegura).
const elegir = (clave: "direccion" | "densidad", o: string) => Object.assign(config.value, { [clave]: o });
const camposTarjeta = [
  "personasEnTarjetas",
  "mostrarTipo",
  "mostrarJefe",
  "mostrarFoto",
  "mostrarDotacion",
  "mostrarVacantes",
  "mostrarEtiquetas",
] as const;
const camposActivos = computed(() => camposTarjeta.filter((c) => config.value[c]).length);

// El criterio por leyenda solo se ve en los puestos: se avisa si siguen ocultos.
const pidePuestos = computed(() => config.value.colorearPor === CRITERIO_LEYENDA && !config.value.verPuestos);

function alternarTipo(id: string, marcado: boolean) {
  const sin = config.value.rutaTipos.filter((x) => x !== id);
  config.value.rutaTipos = marcado ? [...sin, id] : sin;
}

// Lo resaltado es de la sesión (y está en «Resaltar»): restablecer no lo toca.
const restablecer = () => (config.value = { ...leerVista(null), resaltar: config.value.resaltar });

// Bloques plegados: solo un true guardado los deja abiertos.
const guardado = leerPreferencia<Partial<Record<string, unknown>> | null>("personalizar", null);
const abiertos = ref({ tarjeta: guardado?.tarjeta === true, avanzado: guardado?.avanzado === true });
watch(abiertos, (a) => guardarPreferencia("personalizar", a), { deep: true });
const alPlegar = (bloque: "tarjeta" | "avanzado", e: Event) =>
  (abiertos.value[bloque] = (e.target as HTMLDetailsElement).open);
</script>

<template>
  <Popover v-model:open="panelAbierto">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <SlidersHorizontal aria-hidden="true" />
        {{ t("arbol.vista.titulo") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="max-h-[80vh] w-80 gap-3 overflow-x-hidden overflow-y-auto text-sm">
      <div
        v-for="b in botones"
        :key="b.clave"
        role="group"
        :aria-labelledby="`personalizar-${b.clave}`"
        class="grid gap-1"
      >
        <span :id="`personalizar-${b.clave}`" class="font-medium">{{ t(`arbol.vista.${b.clave}`) }}</span>
        <div class="grid grid-cols-2 gap-1">
          <Button
            v-for="o in b.opciones"
            :key="o"
            type="button"
            size="sm"
            :variant="config[b.clave] === o ? 'default' : 'outline'"
            :aria-pressed="config[b.clave] === o"
            :title="t(`arbol.vista.opciones.${o}`)"
            @click="elegir(b.clave, o)"
          >
            {{ t(`arbol.vista.cortas.${o}`) }}
          </Button>
        </div>
      </div>
      <p v-if="config.densidad === 'compacta'" class="text-xs text-muted-foreground">
        {{ t("arbol.vista.compactaAviso") }}
      </p>
      <label class="grid gap-1">
        <span class="font-medium">{{ t("arbol.vista.colorearPor") }}</span>
        <select
          v-model="criterio"
          :class="cn(claseSelect, 'h-7 w-full')"
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
      <label class="flex items-center gap-2">
        <input v-model="config.verPuestos" type="checkbox" class="size-4 accent-primary" />
        {{ t("arbol.vista.verPuestos") }}
      </label>

      <details
        class="group/bloque border-t pt-2"
        :open="abiertos.tarjeta"
        @toggle="alPlegar('tarjeta', $event)"
      >
        <summary
          class="flex cursor-pointer list-none items-center gap-1 rounded-md py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight class="size-4 transition-transform group-open/bloque:rotate-90" aria-hidden="true" />
          {{ t("arbol.vista.tarjeta", { n: camposActivos, total: camposTarjeta.length }) }}
        </summary>
        <div class="grid gap-1.5 pt-2 pl-5">
          <label v-for="campo in camposTarjeta" :key="campo" class="flex items-center gap-2">
            <input
              v-model="config[campo]"
              type="checkbox"
              class="size-4 accent-primary"
              :disabled="campo === 'mostrarFoto' && !config.mostrarJefe"
            />
            {{ t(`arbol.vista.campos.${campo}`) }}
          </label>
        </div>
      </details>

      <details
        class="group/bloque border-t pt-2"
        :open="abiertos.avanzado"
        @toggle="alPlegar('avanzado', $event)"
      >
        <summary
          class="flex cursor-pointer list-none items-center gap-1 rounded-md py-1 font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
        >
          <ChevronRight class="size-4 transition-transform group-open/bloque:rotate-90" aria-hidden="true" />
          {{ t("arbol.vista.avanzado") }}
        </summary>
        <div class="grid gap-3 pt-2 pl-5">
          <label class="grid gap-1">
            <span class="font-medium">{{ t("arbol.vista.lineas") }}</span>
            <select v-model="config.lineas" :class="cn(claseSelect, 'h-7 w-full')">
              <option v-for="o in ['smoothstep', 'bezier'] as const" :key="o" :value="o">
                {{ t(`arbol.vista.opciones.${o}`) }}
              </option>
            </select>
          </label>
          <label class="flex items-center gap-2">
            <input v-model="config.alinearPorTipo" type="checkbox" class="size-4 accent-primary" />
            {{ t("arbol.vista.alinearPorTipo") }}
          </label>
          <fieldset
            class="grid gap-1.5"
            :disabled="!config.verPuestos"
            :class="!config.verPuestos && 'opacity-50'"
          >
            <legend class="mb-1 font-medium">{{ t("arbol.vista.enPuestos") }}</legend>
            <label class="flex items-center gap-2">
              <input v-model="config.mostrarCargo" type="checkbox" class="size-4 accent-primary" />
              {{ t("arbol.vista.mostrarCargo") }}
            </label>
            <label class="flex items-center gap-2">
              <input v-model="config.mostrarPersona" type="checkbox" class="size-4 accent-primary" />
              {{ t("arbol.vista.mostrarPersona") }}
            </label>
          </fieldset>
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
        </div>
      </details>

      <Button variant="outline" size="sm" class="self-start" @click="restablecer">
        {{ t("arbol.vista.restablecer") }}
      </Button>
    </PopoverContent>
  </Popover>
</template>
