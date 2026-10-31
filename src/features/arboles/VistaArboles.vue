<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ArrowDown, ArrowUp, FolderTree, Pencil, Plus, Trash2, Users } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Unidad } from "@/db/tipos";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { dotacionPorUnidad, ruta, rutaTexto, tipoHijo } from "@/features/arbol/jerarquia";

const { t } = useI18n();
const router = useRouter();
const org = useOrganizacion();

const dotaciones = computed(() => dotacionPorUnidad(org.unidades, org.puestos, org.asignaciones));
const total = (id: string) => dotaciones.value.get(id)?.total ?? 0;

interface Rama {
  id: string;
  orden: number;
  nombre: string | null;
  unidad: Unidad;
}
// Cada subárbol cuelga del bloque de la raíz de su unidad; `org.subarboles` ya viene ordenado.
const porRaiz = computed(() => {
  const m = new Map<string, Rama[]>();
  for (const s of org.subarboles) {
    const unidad = org.porId.get(s.unidad_id);
    const raiz = unidad && ruta(org.unidades, unidad.id)[0]?.id;
    if (unidad && raiz) m.set(raiz, [...(m.get(raiz) ?? []), { ...s, unidad }]);
  }
  return m;
});
const titulo = (s: Rama) => s.nombre ?? s.unidad.nombre;

const abrir = (id: string) => router.push({ path: "/", query: { raiz: id } });
const avisar = (r: Resultado) => {
  if (!r.ok) toast.error(r.mensaje);
};

const creando = ref(false);
const nombreNuevo = ref("");
const tipoNuevo = ref("");
const nombreTipo = (id: string) => org.catalogos.tipos_unidad.find((x) => x.id === id)?.nombre;
function empezarCrear() {
  tipoNuevo.value = tipoHijo(org.catalogos.tipos_unidad, null) ?? "";
  creando.value = true;
}
async function crear() {
  const r = await org.crearArbol(nombreNuevo.value.trim(), tipoNuevo.value);
  avisar(r);
  if (r.ok) {
    creando.value = false;
    nombreNuevo.value = "";
  }
}

const editando = ref<string | null>(null);
const texto = ref("");
async function empezarRenombrar(s: Rama) {
  editando.value = s.id;
  texto.value = s.nombre ?? "";
  await nextTick();
  document.getElementById(`renombrar-${s.id}`)?.focus();
}
async function renombrar(id: string) {
  if (editando.value !== id) return; // Enter y blur pueden llegar juntos
  editando.value = null;
  avisar(await org.renombrarSubarbol(id, texto.value));
}
</script>

<template>
  <section class="mx-auto flex max-w-4xl flex-col gap-6 p-6">
    <header class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">{{ t("arboles.titulo") }}</h1>
      <Button class="ml-auto" size="sm" @click="empezarCrear">
        <Plus aria-hidden="true" />
        {{ t("arboles.nuevoArbol") }}
      </Button>
    </header>

    <form
      v-if="creando"
      class="flex flex-wrap items-center gap-2 rounded-lg border p-3"
      @submit.prevent="crear"
      @keydown.esc="creando = false"
    >
      <Input
        v-model="nombreNuevo"
        class="h-7 w-64"
        :aria-label="t('arboles.nombreArbol')"
        :placeholder="t('arboles.nombreArbol')"
        autofocus
      />
      <select
        v-model="tipoNuevo"
        class="h-7 rounded-md border bg-background px-2 text-sm"
        :aria-label="t('arboles.tipoArbol')"
      >
        <option v-for="tipo in org.activos('tipos_unidad')" :key="tipo.id" :value="tipo.id">
          {{ tipo.nombre }}
        </option>
      </select>
      <Button type="submit" size="sm" :disabled="!nombreNuevo.trim() || !tipoNuevo">{{
        t("arboles.crear")
      }}</Button>
      <Button type="button" variant="outline" size="sm" @click="creando = false">
        {{ t("arbol.cancelar") }}
      </Button>
    </form>

    <article v-for="r in org.raices" :key="r.id" class="rounded-lg border">
      <div class="flex flex-wrap items-center gap-3 p-3">
        <FolderTree class="size-5 text-muted-foreground" aria-hidden="true" />
        <div class="min-w-0">
          <h2 class="truncate font-medium">{{ r.nombre }}</h2>
          <p class="text-xs text-muted-foreground">{{ nombreTipo(r.tipo_id) }}</p>
        </div>
        <span class="flex items-center gap-1 text-sm" :title="t('arbol.dotacion')">
          <Users class="size-3.5" aria-hidden="true" />
          <span class="sr-only">{{ t("arbol.dotacion") }}:</span>{{ total(r.id) }}
        </span>
        <Button
          class="ml-auto"
          variant="outline"
          size="sm"
          :aria-label="t('arboles.abrirNombre', { nombre: r.nombre })"
          @click="abrir(r.id)"
        >
          {{ t("arboles.abrir") }}
        </Button>
      </div>
      <div class="border-t bg-muted/30 px-3 py-2">
        <h3 class="text-xs font-medium uppercase text-muted-foreground">{{ t("arboles.subarboles") }}</h3>
        <p v-if="!porRaiz.get(r.id)" class="py-1 text-sm text-muted-foreground">
          {{ t("arboles.sinSubarboles") }}
        </p>
        <ul v-else class="divide-y">
          <li v-for="(s, i) in porRaiz.get(r.id)" :key="s.id" class="flex flex-wrap items-center gap-2 py-2">
            <div class="min-w-0 flex-1">
              <Input
                v-if="editando === s.id"
                :id="`renombrar-${s.id}`"
                v-model="texto"
                class="h-7 w-64"
                :aria-label="t('arboles.renombrar')"
                :placeholder="s.unidad.nombre"
                @keydown.enter.prevent="renombrar(s.id)"
                @keydown.esc="editando = null"
                @blur="renombrar(s.id)"
              />
              <p v-else class="truncate text-sm font-medium">{{ titulo(s) }}</p>
              <p class="truncate text-xs text-muted-foreground">{{ rutaTexto(org.unidades, s.unidad.id) }}</p>
            </div>
            <span class="flex items-center gap-1 text-sm" :title="t('arbol.dotacion')">
              <Users class="size-3.5" aria-hidden="true" />
              <span class="sr-only">{{ t("arbol.dotacion") }}:</span>{{ total(s.unidad.id) }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :aria-label="t('arboles.abrirNombre', { nombre: titulo(s) })"
              @click="abrir(s.unidad.id)"
            >
              {{ t("arboles.abrir") }}
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              :aria-label="t('arboles.renombrar')"
              :title="t('arboles.renombrar')"
              @click="empezarRenombrar(s)"
            >
              <Pencil aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              :disabled="i === 0"
              :aria-label="t('arboles.subir')"
              :title="t('arboles.subir')"
              @click="org.moverSubarbol(s.id, porRaiz.get(r.id)![i - 1].orden).then(avisar)"
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              :disabled="i === porRaiz.get(r.id)!.length - 1"
              :aria-label="t('arboles.bajar')"
              :title="t('arboles.bajar')"
              @click="org.moverSubarbol(s.id, porRaiz.get(r.id)![i + 1].orden).then(avisar)"
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              :aria-label="t('arboles.quitar')"
              :title="t('arboles.quitar')"
              @click="org.quitarSubarbol(s.id).then(avisar)"
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </li>
        </ul>
      </div>
    </article>
  </section>
</template>
