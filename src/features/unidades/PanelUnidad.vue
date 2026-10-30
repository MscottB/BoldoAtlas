<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Bookmark, BookmarkCheck, Plus, Trash2, X } from "@lucide/vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { Unidad } from "@/db/tipos";
import { dotacion, jefeVisible, vigentesPorPuesto } from "@/features/arbol/jerarquia";
import { useLienzo } from "@/features/arbol/useLienzo";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import EditorConexiones from "./EditorConexiones.vue";
import EditorEtiquetas from "./EditorEtiquetas.vue";
import SelectorUnidad from "./SelectorUnidad.vue";
import { decisionEliminar, excluidasComoSuperior, filasDePuestos, migas, validarMarca } from "./panel";

// Panel lateral de la unidad seleccionada: junto al lienzo (no lo tapa). Esc lo cierra y guarda lo que se estaba escribiendo.
const props = defineProps<{ unidad: Unidad }>();
const emit = defineEmits<{ cerrar: [] }>();

const { t } = useI18n();
const org = useOrganizacion();
const { editando, seleccionar, expandir } = useLienzo();
const puesto = usePuesto();
const uid = useId();

const raiz = ref<HTMLElement | null>(null);
// Al abrirse, el foco entra al panel, salvo que se esté nombrando una unidad recién creada en su tarjeta.
onMounted(() => {
  if (!editando.value) raiz.value?.focus();
});
function cerrar() {
  (document.activeElement as HTMLElement | null)?.blur(); // el campo en edición guarda su cambio al perder el foco
  emit("cerrar");
}

const pestana = ref("resumen");
const avisar = (r: Resultado) => !r.ok && toast.error(r.mensaje);

// Campos de texto: se guardan al terminar de editar (Enter, Tab o salir), no en cada tecla.
const nombre = ref("");
const descripcion = ref("");
const codigo = ref("");
watch(
  () => props.unidad,
  (u) => {
    nombre.value = u.nombre;
    descripcion.value = u.descripcion ?? "";
    codigo.value = u.marca_codigo ?? "";
  },
  { immediate: true },
);

const migasRuta = computed(() => migas(org.unidades, org.catalogos.tipos_unidad, props.unidad.id));
// El tipo actual se ofrece aunque lo hayan desactivado.
const tipos = computed(() => {
  const activos = org.activos("tipos_unidad");
  const actual = org.catalogos.tipos_unidad.find((x) => x.id === props.unidad.tipo_id);
  return actual && !activos.includes(actual) ? [...activos, actual] : activos;
});
const tipoInactivo = (id: string) => !org.activos("tipos_unidad").some((x) => x.id === id);

async function guardarNombre() {
  const n = nombre.value.trim();
  if (!n) nombre.value = props.unidad.nombre;
  else if (n !== props.unidad.nombre) avisar(await org.editarUnidad(props.unidad.id, { nombre: n }));
}
async function guardarDescripcion() {
  const d = descripcion.value.trim() || null;
  if (d !== props.unidad.descripcion) avisar(await org.editarUnidad(props.unidad.id, { descripcion: d }));
}

// Superior
const excluidas = computed(() => excluidasComoSuperior(org.unidades, props.unidad.id));
const textoSuperior = computed(
  () => org.porId.get(props.unidad.parent_id ?? "")?.nombre ?? t("unidad.sinSuperior"),
);
async function cambiarSuperior(id: string | null) {
  if (id === props.unidad.parent_id) return;
  const r = await org.moverUnidad(props.unidad.id, id); // rechaza los ciclos (creaCiclo)
  if (r.ok && id) expandir(id);
  else avisar(r);
}

// Marca
async function guardarMarca(color: string | null) {
  const m = validarMarca(color, codigo.value);
  if (!m.ok) {
    codigo.value = props.unidad.marca_codigo ?? "";
    return void toast.error(t(m.error === "codigo" ? "unidad.codigoLargo" : "errores.colorInvalido"));
  }
  if (m.color !== props.unidad.marca_color || m.codigo !== props.unidad.marca_codigo)
    avisar(await org.editarUnidad(props.unidad.id, { marca_color: m.color, marca_codigo: m.codigo }));
}
const sinMarca = computed(() => !props.unidad.marca_color && !props.unidad.marca_codigo);
async function quitarMarca() {
  codigo.value = "";
  avisar(await org.editarUnidad(props.unidad.id, { marca_color: null, marca_codigo: null }));
}

// Jefatura, dotación y puestos
const vigentes = computed(() => vigentesPorPuesto(org.asignaciones));
const filas = computed(() =>
  filasDePuestos(
    props.unidad,
    org.puestos,
    vigentes.value,
    org.trabajadores,
    org.catalogos.cargos,
    org.leyendas,
  ),
);
const jefe = computed(() => {
  const a = jefeVisible(props.unidad, vigentes.value);
  const nombre = org.trabajadores.find((w) => w.id === a?.trabajador_id)?.nombre;
  return a && nombre ? (a.tipo === "reemplazo" ? t("arbol.reemplazo", { nombre }) : nombre) : null;
});
const personal = computed(() => dotacion(org.unidades, org.puestos, org.asignaciones, props.unidad.id));
const textoPuesto = (f: (typeof filas.value)[number]) => `${f.cargo} · ${f.titular ?? t("puesto.vacante")}`;

// Guardar en Árboles: una raíz ya es un árbol en Árboles, solo se guardan ramas.
const guardable = computed(() => props.unidad.parent_id !== null);
const guardada = computed(() => org.subarboles.some((s) => s.unidad_id === props.unidad.id));

// Eliminar
const decision = computed(() => decisionEliminar(org.unidades, org.puestos, props.unidad.id));
const confirmando = ref(false);
async function eliminar() {
  const { id, nombre } = props.unidad;
  const r = await org.eliminarUnidad(id);
  if (!r.ok) return void toast.error(r.mensaje);
  emit("cerrar");
  toast(t("unidad.eliminada", { nombre }), {
    duration: 8000,
    action: { label: t("unidad.deshacer"), onClick: async () => avisar(await org.deshacer()) },
  });
}
</script>

<template>
  <aside
    ref="raiz"
    tabindex="-1"
    class="flex w-96 shrink-0 flex-col overflow-y-auto border-l bg-background focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    :aria-label="t('unidad.panel')"
    @keydown.esc="cerrar"
  >
    <header class="grid gap-1 border-b p-3">
      <div class="flex items-start gap-2">
        <nav :aria-label="t('unidad.migas')" class="min-w-0 flex-1">
          <ol class="flex flex-wrap items-center gap-x-1 text-xs">
            <li v-for="(m, i) in migasRuta" :key="m.id" class="flex items-center gap-1">
              <span v-if="i" aria-hidden="true" class="text-muted-foreground">›</span>
              <span v-if="i === migasRuta.length - 1" aria-current="location" class="font-semibold">
                {{ m.nombre }}
              </span>
              <button
                v-else
                type="button"
                class="rounded hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                @click="seleccionar(m.id)"
              >
                {{ m.nombre }}
              </button>
              <span class="text-muted-foreground">({{ m.tipo }})</span>
            </li>
          </ol>
        </nav>
        <Button
          variant="ghost"
          size="icon-sm"
          :aria-label="t('unidad.cerrar')"
          :title="t('unidad.cerrar')"
          @click="cerrar"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <h2 class="truncate text-base font-semibold">{{ unidad.nombre }}</h2>
    </header>

    <Tabs v-model="pestana" class="flex-1 p-3">
      <TabsList class="w-full">
        <TabsTrigger value="resumen">{{ t("unidad.resumen") }}</TabsTrigger>
        <TabsTrigger value="puestos">{{ t("puesto.puestos", { n: filas.length }) }}</TabsTrigger>
        <TabsTrigger value="procesos">{{ t("unidad.procesos") }}</TabsTrigger>
      </TabsList>

      <TabsContent value="resumen">
        <div :key="unidad.id" class="grid gap-4 pt-2">
          <div class="grid gap-1.5">
            <Label :for="`${uid}-tipo`">{{ t("unidad.tipo") }}</Label>
            <select
              :id="`${uid}-tipo`"
              class="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              :value="unidad.tipo_id"
              @change="
                async (e) =>
                  avisar(
                    await org.editarUnidad(unidad.id, { tipo_id: (e.target as HTMLSelectElement).value }),
                  )
              "
            >
              <option v-for="x in tipos" :key="x.id" :value="x.id">
                {{ tipoInactivo(x.id) ? `${x.nombre} ${t("ficha.selector.inactivo")}` : x.nombre }}
              </option>
            </select>
          </div>
          <div class="grid gap-1.5">
            <Label :for="`${uid}-nombre`">{{ t("arbol.nombre") }}</Label>
            <Input :id="`${uid}-nombre`" v-model="nombre" autocomplete="off" @change="guardarNombre" />
          </div>
          <div class="grid gap-1.5">
            <Label :for="`${uid}-descripcion`">{{ t("puesto.descripcion") }}</Label>
            <Textarea :id="`${uid}-descripcion`" v-model="descripcion" @change="guardarDescripcion" />
          </div>
          <div class="grid gap-1.5">
            <Label :for="`${uid}-superior`">{{ t("unidad.superior") }}</Label>
            <SelectorUnidad
              :id="`${uid}-superior`"
              :excluidas="excluidas"
              :texto="textoSuperior"
              :ninguna="t('unidad.sinSuperior')"
              @elegir="cambiarSuperior"
            />
          </div>

          <fieldset class="grid gap-1.5">
            <legend class="mb-1.5 text-sm font-medium">{{ t("unidad.marca") }}</legend>
            <div class="flex flex-wrap items-center gap-2">
              <input
                type="color"
                class="h-8 w-12 cursor-pointer rounded-lg border bg-transparent p-0.5 focus-visible:outline-2 focus-visible:outline-ring"
                :value="unidad.marca_color ?? '#808080'"
                :aria-label="t('unidad.marcaColor')"
                @change="(e) => guardarMarca((e.target as HTMLInputElement).value)"
              />
              <Input
                v-model="codigo"
                class="w-28"
                maxlength="4"
                autocomplete="off"
                :aria-label="t('unidad.marcaCodigo')"
                :placeholder="t('unidad.marcaCodigo')"
                @change="guardarMarca(unidad.marca_color)"
              />
              <Button type="button" variant="outline" size="sm" :disabled="sinMarca" @click="quitarMarca">
                {{ t("unidad.quitarMarca") }}
              </Button>
            </div>
            <p v-if="!unidad.marca_color" class="text-xs text-muted-foreground">{{ t("unidad.sinColor") }}</p>
          </fieldset>

          <div class="grid gap-1.5">
            <Label :for="`${uid}-jefatura`">{{ t("unidad.jefatura") }}</Label>
            <select
              :id="`${uid}-jefatura`"
              class="h-8 rounded-lg border bg-background px-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              :value="unidad.jefe_puesto_id ?? ''"
              @change="
                async (e) =>
                  avisar(await org.asignarJefe(unidad.id, (e.target as HTMLSelectElement).value || null))
              "
            >
              <option value="">{{ t("arbol.sinJefatura") }}</option>
              <option v-for="f in filas" :key="f.id" :value="f.id">{{ textoPuesto(f) }}</option>
            </select>
            <p v-if="jefe" class="text-sm">{{ jefe }}</p>
            <p v-else class="text-sm text-amber-700 dark:text-amber-400">
              {{ filas.length ? t("arbol.sinJefatura") : t("unidad.sinPuestosJefatura") }}
            </p>
          </div>

          <dl class="grid grid-cols-3 gap-2 text-center">
            <div class="rounded-lg border p-2">
              <dt class="text-xs text-muted-foreground">{{ t("unidad.dotacionDirecta") }}</dt>
              <dd class="text-lg font-semibold">{{ personal.directa }}</dd>
            </div>
            <div class="rounded-lg border p-2">
              <dt class="text-xs text-muted-foreground">{{ t("unidad.dotacionTotal") }}</dt>
              <dd class="text-lg font-semibold">{{ personal.total }}</dd>
            </div>
            <div class="rounded-lg border p-2">
              <dt class="text-xs text-muted-foreground">{{ t("unidad.vacantesRama") }}</dt>
              <dd class="text-lg font-semibold">{{ personal.vacantes }}</dd>
            </div>
          </dl>

          <section class="grid gap-1.5" :aria-labelledby="`${uid}-etiquetas`">
            <h3 :id="`${uid}-etiquetas`" class="text-sm font-medium">{{ t("unidad.etiquetas") }}</h3>
            <EditorEtiquetas :unidad-id="unidad.id" />
          </section>
          <section class="grid gap-1.5" :aria-labelledby="`${uid}-conexiones`">
            <h3 :id="`${uid}-conexiones`" class="text-sm font-medium">{{ t("unidad.conexiones") }}</h3>
            <EditorConexiones :unidad-id="unidad.id" />
          </section>

          <div class="flex flex-wrap items-center gap-2 border-t pt-3">
            <Button
              v-if="guardable"
              type="button"
              variant="outline"
              size="sm"
              :disabled="guardada"
              @click="async () => avisar(await org.guardarSubarbol(unidad.id))"
            >
              <component :is="guardada ? BookmarkCheck : Bookmark" aria-hidden="true" />
              {{ t(guardada ? "arboles.guardado" : "arboles.guardarEnArboles") }}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              :disabled="decision.accion === 'bloqueada'"
              :aria-describedby="decision.accion === 'bloqueada' ? `${uid}-bloqueada` : undefined"
              @click="decision.accion === 'mover' ? (confirmando = true) : eliminar()"
            >
              <Trash2 aria-hidden="true" />
              {{ t("unidad.eliminar") }}
            </Button>
            <p
              v-if="decision.accion === 'bloqueada'"
              :id="`${uid}-bloqueada`"
              class="w-full text-xs text-muted-foreground"
            >
              {{ t("store.raizConContenido") }}
            </p>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="puestos">
        <div class="grid gap-2 pt-2">
          <p v-if="!filas.length" class="text-sm text-muted-foreground">{{ t("puesto.sinPuestos") }}</p>
          <ul v-else class="grid gap-1">
            <li v-for="f in filas" :key="f.id">
              <button
                type="button"
                class="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                @click="puesto.abrir(f.id)"
              >
                <span
                  v-if="f.leyenda"
                  class="size-3 shrink-0 rounded-full border"
                  :style="{ background: f.leyenda.color }"
                  aria-hidden="true"
                />
                <span class="grid min-w-0 flex-1">
                  <span class="truncate font-medium">
                    {{ f.cargo }}
                    <span v-if="f.jefatura" class="font-normal text-muted-foreground"
                      >· {{ t("unidad.jefaturaInsignia") }}</span
                    >
                  </span>
                  <span
                    class="truncate text-xs"
                    :class="f.titular ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'"
                  >
                    {{ f.titular || t("puesto.vacante") }}
                    <template v-if="f.reemplazo">
                      · {{ t("puesto.reemplazoDe", { nombre: f.reemplazo }) }}</template
                    >
                  </span>
                </span>
                <span v-if="f.leyenda" class="sr-only">{{
                  t("leyenda.deLeyenda", { nombre: f.leyenda.nombre })
                }}</span>
              </button>
            </li>
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            class="justify-self-start"
            @click="puesto.nuevo(unidad.id)"
          >
            <Plus aria-hidden="true" />
            {{ t("puesto.nuevoPuesto") }}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="procesos">
        <p class="pt-4 text-sm text-muted-foreground">{{ t("unidad.procesosVacio") }}</p>
      </TabsContent>
    </Tabs>

    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t("unidad.eliminarTitulo", { unidad: unidad.nombre }) }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{
              t("unidad.eliminarTexto", {
                hijos: t("unidad.nSubunidades", decision.hijos),
                puestos: t("unidad.nPuestos", decision.puestos),
                superior: decision.superior?.nombre,
              })
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("arbol.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="eliminar">
            {{ t("unidad.moverYEliminar", { superior: decision.superior?.nombre }) }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </aside>
</template>
