<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import { TriangleAlert } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { revisionDetalle, type DetalleCaso, type Eleccion, type FilaCaso, type ValorCampo } from "@/db/cliente";
import { tamano } from "@/lib/formato";
import { intentar } from "./intercambio";

const props = defineProps<{ trabajo: string; fila: FilaCaso }>();
const emit = defineEmits<{ decidir: [e: Eleccion] }>();
const { t, te, locale } = useI18n();
const grupo = useId();

const abierto = ref(false);
const detalle = ref<DetalleCaso | null>(null);
const error = ref("");
async function verDetalle() {
  abierto.value = !abierto.value;
  if (!abierto.value || detalle.value) return;
  const r = await intentar(() => revisionDetalle(props.trabajo, props.fila.tabla, props.fila.id));
  if (r.ok) detalle.value = r.valor;
  else error.value = r.mensaje;
}

const nombreColumna = (c: string) =>
  te(`intercambio.columnas.${c}`) ? t(`intercambio.columnas.${c}`) : t("intercambio.columnas.otra");
const nombre = computed(() => props.fila.nombre || t("intercambio.revisar.sinNombre"));

// Diferente: qué columnas se toman del archivo
const delArchivo = computed(() =>
  props.fila.eleccion.que === "campos" ? props.fila.eleccion.archivo : [],
);
const ladoEntero = computed(() => {
  const d = delArchivo.value.length;
  if (d === 0) return "mio";
  return d === props.fila.columnas.length ? "archivo" : "mezcla";
});
function fila_entera(lado: "mio" | "archivo") {
  emit("decidir", { que: "campos", archivo: lado === "archivo" ? [...props.fila.columnas] : [] });
}
function campo(c: string, lado: "mio" | "archivo") {
  const sin = delArchivo.value.filter((x) => x !== c);
  emit("decidir", { que: "campos", archivo: lado === "archivo" ? [...sin, c] : sin });
}

// Duplicado: el correo nuevo se confirma, no se manda con cada tecla
const correo = ref(props.fila.eleccion.que === "editar_correo" ? props.fila.eleccion.correo : "");
const editandoCorreo = ref(props.fila.eleccion.que === "editar_correo");
function unir(que: "unir_mio" | "unir_archivo") {
  editandoCorreo.value = false;
  emit("decidir", { que });
}

function fecha(f: string | null): string {
  if (!f) return t("intercambio.revisar.fechaNoValida");
  const d = new Date(f);
  return Number.isNaN(d.getTime()) ? t("intercambio.revisar.fechaNoValida") : d.toLocaleString(locale.value);
}
function textoValor(v: ValorCampo): string {
  if (v.oculto !== null && v.oculto !== undefined)
    return t("intercambio.revisar.valorOculto", { tamano: tamano(v.oculto, locale.value) });
  return v.texto ?? t("intercambio.revisar.vacio");
}
const explicacion = computed(() => {
  const f = props.fila;
  if (f.tipo === "borrado_vs_editado" || f.tipo === "borrado_sin_conflicto")
    return t(`intercambio.revisar.${f.borradoAqui ? "borradaAqui" : "borradaArchivo"}`);
  if (f.tipo === "diferente" && !f.dudosa && f.masReciente !== "igual")
    return t(`intercambio.revisar.reciente.${f.masReciente}`);
  return "";
});
const verDatos = computed(() => props.fila.tipo !== "union");
</script>

<template>
  <li class="grid gap-2 rounded border p-2 text-sm">
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span class="min-w-0 font-medium break-words">{{ nombre }}</span>
      <span class="text-xs text-muted-foreground">{{ t(`intercambio.tablas.${fila.tabla}`) }}</span>
      <span v-if="fila.dudosa" class="flex items-center gap-1 text-xs text-amber-800 dark:text-amber-400">
        <TriangleAlert class="size-3.5 shrink-0" aria-hidden="true" />
        {{ t("intercambio.revisar.fechaDudosa") }}
      </span>
    </div>
    <p v-if="explicacion" class="text-muted-foreground">{{ explicacion }}</p>

    <fieldset class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <legend class="sr-only">{{ t("intercambio.revisar.queHacerCon", { nombre }) }}</legend>

      <template v-if="fila.tipo === 'nuevo'">
        <label class="flex items-center gap-2">
          <input
            type="checkbox"
            :checked="fila.eleccion.que === 'agregar'"
            @change="emit('decidir', { que: fila.eleccion.que === 'agregar' ? 'omitir' : 'agregar' })"
          />
          {{ t("intercambio.revisar.agregarEsta") }}
        </label>
      </template>

      <template v-else-if="fila.tipo === 'diferente'">
        <label class="flex items-center gap-2">
          <input type="radio" :name="grupo" :checked="ladoEntero === 'mio'" @change="fila_entera('mio')" />
          {{ t("intercambio.revisar.lo_mio") }}
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" :name="grupo" :checked="ladoEntero === 'archivo'" @change="fila_entera('archivo')" />
          {{ t("intercambio.revisar.lo_del_archivo") }}
        </label>
        <span v-if="ladoEntero === 'mezcla'" class="text-muted-foreground">
          {{ t("intercambio.revisar.mezcla") }}
        </span>
      </template>

      <template v-else-if="fila.tipo === 'borrado_vs_editado' || fila.tipo === 'borrado_sin_conflicto'">
        <label class="flex items-center gap-2">
          <input
            type="radio"
            :name="grupo"
            :checked="fila.eleccion.que === 'mantener'"
            @change="emit('decidir', { que: 'mantener' })"
          />
          {{ t(fila.borradoAqui ? "intercambio.revisar.revivir" : "intercambio.revisar.mantener") }}
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            :name="grupo"
            :checked="fila.eleccion.que === 'borrar'"
            @change="emit('decidir', { que: 'borrar' })"
          />
          {{ t(fila.borradoAqui ? "intercambio.revisar.sigueBorrada" : "intercambio.revisar.borrar") }}
        </label>
      </template>

      <template v-else-if="fila.tipo === 'duplicado_persona'">
        <label class="flex items-center gap-2">
          <input
            type="radio"
            :name="grupo"
            :checked="fila.eleccion.que === 'unir_mio'"
            @change="unir('unir_mio')"
          />
          {{ t("intercambio.revisar.unirMio") }}
        </label>
        <label class="flex items-center gap-2">
          <input
            type="radio"
            :name="grupo"
            :checked="fila.eleccion.que === 'unir_archivo'"
            @change="unir('unir_archivo')"
          />
          {{ t("intercambio.revisar.unirArchivo") }}
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" :name="grupo" :checked="editandoCorreo" @change="editandoCorreo = true" />
          {{ t("intercambio.revisar.editarCorreo") }}
        </label>
      </template>

      <p v-else class="text-muted-foreground">{{ t("intercambio.revisar.seUne") }}</p>
    </fieldset>

    <form
      v-if="fila.tipo === 'duplicado_persona' && editandoCorreo"
      class="flex flex-wrap items-center gap-2"
      @submit.prevent="emit('decidir', { que: 'editar_correo', correo })"
    >
      <Input
        v-model="correo"
        type="email"
        class="h-8 max-w-xs"
        autocomplete="off"
        spellcheck="false"
        :aria-label="t('intercambio.revisar.correoNuevo', { nombre })"
      />
      <Button type="submit" size="sm" variant="outline" :disabled="!correo.trim()">
        {{ t("intercambio.revisar.usarCorreo") }}
      </Button>
    </form>

    <div v-if="verDatos">
      <Button type="button" variant="ghost" size="sm" :aria-expanded="abierto" @click="verDetalle">
        {{ t(abierto ? "intercambio.revisar.ocultarDetalle" : "intercambio.revisar.verDetalle") }}
      </Button>
    </div>
    <p v-if="error" role="alert" class="text-destructive">{{ error }}</p>
    <template v-if="abierto && detalle">
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 text-xs text-muted-foreground">
        <template v-if="detalle.rival">
          <dt>{{ t("intercambio.revisar.mismoCorreoQue") }}</dt>
          <dd class="break-words">{{ detalle.rival }}</dd>
        </template>
        <dt>{{ t("intercambio.revisar.editadaMia") }}</dt>
        <dd>{{ fila.tipo === "nuevo" ? "—" : fecha(detalle.actualizadaMia) }}</dd>
        <dt>{{ t("intercambio.revisar.editadaArchivo") }}</dt>
        <dd>{{ fecha(detalle.actualizadaArchivo) }}</dd>
        <template v-if="detalle.borradaMia">
          <dt>{{ t("intercambio.revisar.eliminadaMia") }}</dt>
          <dd>{{ fecha(detalle.borradaMia) }}</dd>
        </template>
        <template v-if="detalle.borradaArchivo">
          <dt>{{ t("intercambio.revisar.eliminadaArchivo") }}</dt>
          <dd>{{ fecha(detalle.borradaArchivo) }}</dd>
        </template>
      </dl>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-sm">
          <caption class="sr-only">{{ t("intercambio.revisar.camposDe", { nombre }) }}</caption>
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th scope="col" class="py-1 pr-3 font-medium">{{ t("intercambio.revisar.campo") }}</th>
              <th v-if="fila.tipo !== 'nuevo'" scope="col" class="py-1 pr-3 font-medium">
                {{ t("intercambio.revisar.lo_mio") }}
              </th>
              <th scope="col" class="py-1 pr-3 font-medium">{{ t("intercambio.revisar.lo_del_archivo") }}</th>
            </tr>
          </thead>
          <tbody class="divide-y">
            <tr v-for="c in detalle.campos" :key="c.columna" class="align-top">
              <th scope="row" class="py-1 pr-3 font-normal">{{ nombreColumna(c.columna) }}</th>
              <td v-if="fila.tipo !== 'nuevo'" class="py-1 pr-3 break-words">
                <label v-if="fila.tipo === 'diferente'" class="flex items-start gap-2">
                  <input
                    type="radio"
                    class="mt-1"
                    :name="`${grupo}-${c.columna}`"
                    :checked="!delArchivo.includes(c.columna)"
                    :aria-label="t('intercambio.revisar.usarMio', { campo: nombreColumna(c.columna) })"
                    @change="campo(c.columna, 'mio')"
                  />
                  <span class="min-w-0 break-words">{{ textoValor(c.mio) }}</span>
                </label>
                <span v-else>{{ textoValor(c.mio) }}</span>
                <span v-if="c.mio.cortado" class="text-xs text-muted-foreground"> {{ t("intercambio.revisar.cortado") }}</span>
              </td>
              <td class="py-1 pr-3 break-words">
                <label v-if="fila.tipo === 'diferente'" class="flex items-start gap-2">
                  <input
                    type="radio"
                    class="mt-1"
                    :name="`${grupo}-${c.columna}`"
                    :checked="delArchivo.includes(c.columna)"
                    :aria-label="t('intercambio.revisar.usarArchivo', { campo: nombreColumna(c.columna) })"
                    @change="campo(c.columna, 'archivo')"
                  />
                  <span class="min-w-0 break-words">{{ textoValor(c.archivo) }}</span>
                </label>
                <span v-else>{{ textoValor(c.archivo) }}</span>
                <span v-if="c.archivo.cortado" class="text-xs text-muted-foreground"> {{ t("intercambio.revisar.cortado") }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </li>
</template>
