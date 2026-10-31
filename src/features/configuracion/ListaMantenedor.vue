<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ArrowDown, ArrowUp, Pencil, Plus } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TablaOrdenable } from "@/db/repos/catalogos";
import type { ValorCatalogo } from "@/db/tipos";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { moverEn } from "./orden";

// Un mantenedor: lista los valores (también los desactivados) con cuánto se usan y permite agregar, renombrar,
// ordenar, desactivar y reactivar. Las leyendas suman color y descripción.
const props = defineProps<{ tabla: TablaOrdenable }>();
const { t } = useI18n();
const org = useOrganizacion();

type Fila = ValorCatalogo & { color?: string; descripcion?: string | null };
const filas = computed<Fila[]>(() =>
  props.tabla === "leyendas" ? org.leyendas : org.catalogos[props.tabla],
);
const esLeyenda = computed(() => props.tabla === "leyendas");

const avisar = (r: Resultado) => {
  if (!r.ok) toast.error(r.mensaje);
};

const nombreNuevo = ref("");
const colorNuevo = ref("#1e2a38");
const descripcionNueva = ref("");
const existente = ref<string | null>(null); // fila que ya tenía el nombre que se quiso agregar
async function agregar() {
  const r =
    props.tabla === "leyendas"
      ? await org.crearLeyenda({
          nombre: nombreNuevo.value,
          color: colorNuevo.value,
          descripcion: descripcionNueva.value,
        })
      : await org.crearValor(props.tabla, nombreNuevo.value);
  existente.value = r.ok ? null : (r.existente ?? null);
  if (r.ok) {
    nombreNuevo.value = "";
    descripcionNueva.value = "";
  } else if (r.existente) toast.info(r.mensaje);
  else toast.error(r.mensaje);
}

const editando = ref<string | null>(null);
const texto = ref("");
async function empezarRenombrar(f: Fila) {
  editando.value = f.id;
  texto.value = f.nombre;
  await nextTick();
  document.getElementById(`renombrar-${f.id}`)?.focus();
}
async function renombrar(f: Fila) {
  if (editando.value !== f.id) return; // Enter y blur pueden llegar juntos
  editando.value = null;
  if (texto.value.trim() === f.nombre) return;
  avisar(
    await (props.tabla === "leyendas"
      ? org.renombrarLeyenda(f.id, texto.value)
      : org.renombrarValor(props.tabla, f.id, texto.value)),
  );
}

const mover = (f: Fila, delta: -1 | 1) =>
  org
    .ordenar(
      props.tabla,
      moverEn(
        filas.value.map((x) => x.id),
        f.id,
        delta,
      ),
    )
    .then(avisar);
const alternar = (f: Fila) =>
  (f.deleted_at
    ? props.tabla === "leyendas"
      ? org.reactivarLeyenda(f.id)
      : org.reactivarValor(props.tabla, f.id)
    : props.tabla === "leyendas"
      ? org.desactivarLeyenda(f.id)
      : org.desactivarValor(props.tabla, f.id)
  ).then(avisar);

const valorDe = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<template>
  <div class="space-y-4">
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="agregar">
      <Input
        v-model="nombreNuevo"
        class="h-8 w-64"
        :aria-label="t('mantenedores.nuevo')"
        :placeholder="t('mantenedores.nuevo')"
        autocomplete="off"
      />
      <template v-if="esLeyenda">
        <input
          v-model="colorNuevo"
          type="color"
          class="h-8 w-14 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
          :aria-label="t('mantenedores.columnas.color')"
        />
        <Input
          v-model="descripcionNueva"
          class="h-8 w-64"
          :aria-label="t('mantenedores.columnas.descripcion')"
          :placeholder="t('mantenedores.columnas.descripcion')"
          autocomplete="off"
        />
      </template>
      <Button type="submit" size="sm" :disabled="!nombreNuevo.trim()">
        <Plus aria-hidden="true" />
        {{ t("mantenedores.agregar") }}
      </Button>
    </form>

    <p v-if="!filas.length" class="text-sm text-muted-foreground">{{ t("mantenedores.vacio") }}</p>
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b text-left text-xs text-muted-foreground">
            <th scope="col" class="py-2 pr-2 font-medium">{{ t("mantenedores.columnas.nombre") }}</th>
            <th v-if="esLeyenda" scope="col" class="px-2 font-medium">
              {{ t("mantenedores.columnas.color") }}
            </th>
            <th v-if="esLeyenda" scope="col" class="px-2 font-medium">
              {{ t("mantenedores.columnas.descripcion") }}
            </th>
            <th scope="col" class="px-2 text-right font-medium">{{ t(`mantenedores.usos.${tabla}`) }}</th>
            <th scope="col" class="px-2 font-medium">{{ t("mantenedores.columnas.estado") }}</th>
            <th scope="col" class="py-2 pl-2 font-medium">
              <span class="sr-only">{{ t("mantenedores.columnas.acciones") }}</span>
            </th>
          </tr>
        </thead>
        <tbody class="divide-y">
          <tr
            v-for="(f, i) in filas"
            :key="f.id"
            class="group/fila"
            :class="{ 'bg-accent': existente === f.id }"
          >
            <td class="py-2 pr-2" :class="{ 'text-muted-foreground': f.deleted_at }">
              <Input
                v-if="editando === f.id"
                :id="`renombrar-${f.id}`"
                v-model="texto"
                class="h-7 w-56"
                :aria-label="t('mantenedores.renombrar', { nombre: f.nombre })"
                @keydown.enter.prevent="renombrar(f)"
                @keydown.esc="editando = null"
                @blur="renombrar(f)"
              />
              <span v-else>{{ f.nombre }}</span>
            </td>
            <td v-if="esLeyenda" class="px-2">
              <input
                :value="f.color"
                type="color"
                class="h-7 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
                :aria-label="t('mantenedores.colorDe', { nombre: f.nombre })"
                @change="org.editarLeyenda(f.id, { color: valorDe($event) }).then(avisar)"
              />
            </td>
            <td v-if="esLeyenda" class="px-2">
              <Input
                :model-value="f.descripcion ?? ''"
                class="h-7 w-full min-w-44"
                :aria-label="t('mantenedores.descripcionDe', { nombre: f.nombre })"
                @change="org.editarLeyenda(f.id, { descripcion: valorDe($event) }).then(avisar)"
              />
            </td>
            <td class="px-2 text-right tabular-nums">{{ org.usos(tabla, f.id) }}</td>
            <td class="px-2">{{ f.deleted_at ? t("mantenedores.inactivo") : t("mantenedores.activo") }}</td>
            <td class="py-2 pl-2">
              <div class="flex justify-end gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  :aria-label="t('mantenedores.renombrar', { nombre: f.nombre })"
                  :title="t('mantenedores.renombrar', { nombre: f.nombre })"
                  @click="empezarRenombrar(f)"
                >
                  <Pencil aria-hidden="true" />
                </Button>
                <!-- Las flechas aparecen al pasar el mouse por la fila o con el foco en ella (siguen en el orden de Tab). Sin
                     mouse (pantalla táctil) se ven siempre. -->
                <span
                  class="flex gap-1 group-focus-within/fila:opacity-100 group-hover/fila:opacity-100 [@media(hover:hover)]:opacity-0"
                >
                  <Button
                    variant="outline"
                    size="icon-sm"
                    :disabled="i === 0"
                    :aria-label="t('mantenedores.subir', { nombre: f.nombre })"
                    :title="t('mantenedores.subir', { nombre: f.nombre })"
                    @click="mover(f, -1)"
                  >
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    :disabled="i === filas.length - 1"
                    :aria-label="t('mantenedores.bajar', { nombre: f.nombre })"
                    :title="t('mantenedores.bajar', { nombre: f.nombre })"
                    @click="mover(f, 1)"
                  >
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  :aria-label="
                    t(f.deleted_at ? 'mantenedores.reactivarA' : 'mantenedores.desactivarA', {
                      nombre: f.nombre,
                    })
                  "
                  @click="alternar(f)"
                >
                  {{ t(f.deleted_at ? "mantenedores.reactivar" : "mantenedores.desactivar") }}
                </Button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
