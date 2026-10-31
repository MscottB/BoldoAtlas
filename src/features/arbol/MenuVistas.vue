<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Eye, Pencil, Trash2 } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Unidad } from "@/db/tipos";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { useLienzo } from "./useLienzo";
import { useVista } from "./useVista";
import { aplicarVista, arbolDeVista, configDeVista } from "./vista";

// Vistas nombradas del árbol que se ve: dirección, densidad, tarjeta, colorear por, resaltado y ramas plegadas.
// `unidades`: las que se dibujan.
const props = defineProps<{ raiz: string | null; unidades: Unidad[] }>();
const { t } = useI18n();
const org = useOrganizacion();
const { colapsados, aplicarPlegado } = useLienzo();
const { config } = useVista();

const abierto = ref(false);
// null = árbol completo; undefined = una rama enfocada que no está guardada en Árboles (no tiene vistas).
const arbol = computed(() => arbolDeVista(props.raiz, org.subarboles));
const lista = computed(() => org.vistas.filter((v) => v.arbol_id === arbol.value));

const avisar = (r: Resultado) => {
  if (!r.ok) toast.error(r.mensaje);
  return r.ok;
};

const nombre = ref("");
async function guardar() {
  if (arbol.value === undefined) return;
  if (
    avisar(await org.guardarVista(arbol.value, nombre.value, configDeVista(config.value, colapsados.value)))
  )
    nombre.value = "";
}

function aplicar(texto: string) {
  const r = aplicarVista(texto, new Set(org.unidades.map((u) => u.id)));
  config.value = r.vista;
  if (r.colapsados) aplicarPlegado(props.unidades, r.colapsados);
  abierto.value = false;
}

const editando = ref<string | null>(null);
const texto = ref("");
async function empezarRenombrar(id: string, actual: string) {
  editando.value = id;
  texto.value = actual;
  await nextTick();
  document.getElementById(`renombrar-vista-${id}`)?.focus();
}
async function renombrar(id: string) {
  if (editando.value !== id) return; // Enter y blur pueden llegar juntos
  editando.value = null;
  avisar(await org.renombrarVista(id, texto.value));
}

async function eliminar(id: string) {
  if (!avisar(await org.eliminarVista(id))) return;
  toast(t("arbol.vistas.eliminada"), {
    duration: 8000,
    action: {
      label: t("arbol.vistas.deshacer"),
      onClick: async () => void avisar(await org.deshacer()),
    },
  });
}
</script>

<template>
  <Popover v-model:open="abierto">
    <PopoverTrigger as-child>
      <Button variant="outline" size="sm">
        <Eye aria-hidden="true" />
        {{ t("arbol.vistas.titulo") }}
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" class="w-80 gap-3 text-sm">
      <p v-if="arbol === undefined" class="text-muted-foreground">{{ t("arbol.vistas.sinArbol") }}</p>
      <template v-else>
        <form class="flex items-center gap-2" @submit.prevent="guardar">
          <Input
            v-model="nombre"
            class="h-7"
            :aria-label="t('arbol.vistas.nombre')"
            :placeholder="t('arbol.vistas.nombre')"
          />
          <Button type="submit" size="sm" :disabled="!nombre.trim()">{{ t("arbol.vistas.guardar") }}</Button>
        </form>
        <p v-if="!lista.length" class="text-muted-foreground">{{ t("arbol.vistas.sinVistas") }}</p>
        <ul v-else class="grid gap-1" :aria-label="t('arbol.vistas.lista')">
          <li v-for="v in lista" :key="v.id" class="flex items-center gap-1">
            <Input
              v-if="editando === v.id"
              :id="`renombrar-vista-${v.id}`"
              v-model="texto"
              class="h-7"
              :aria-label="t('arbol.vistas.renombrar', { nombre: v.nombre })"
              @keydown.enter.prevent="renombrar(v.id)"
              @keydown.esc.stop="editando = null"
              @blur="renombrar(v.id)"
            />
            <template v-else>
              <button
                type="button"
                class="min-w-0 flex-1 truncate rounded px-2 py-1 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                :title="t('arbol.vistas.aplicar', { nombre: v.nombre })"
                @click="aplicar(v.config)"
              >
                {{ v.nombre }}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="t('arbol.vistas.renombrar', { nombre: v.nombre })"
                :title="t('arbol.vistas.renombrar', { nombre: v.nombre })"
                @click="empezarRenombrar(v.id, v.nombre)"
              >
                <Pencil aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                :aria-label="t('arbol.vistas.eliminar', { nombre: v.nombre })"
                :title="t('arbol.vistas.eliminar', { nombre: v.nombre })"
                @click="eliminar(v.id)"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </template>
          </li>
        </ul>
      </template>
    </PopoverContent>
  </Popover>
</template>
