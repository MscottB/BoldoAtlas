<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { EllipsisVertical, FileSearch, ListX, Trash2 } from "@lucide/vue";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Organizacion } from "@/db/cliente";
import DialogoEliminarOrganizacion from "@/features/organizaciones/DialogoEliminarOrganizacion.vue";
import PreguntaArchivo from "@/features/organizaciones/PreguntaArchivo.vue";
import { textoAConfirmar } from "@/features/organizaciones/eliminar";
import { useOrganizaciones } from "@/stores/organizaciones";
import { volverAlTerminar } from "./foco";
import { hace } from "./recientes";

// «Abierto recientemente» de Inicio: las organizaciones de la lista, la última abierta primero. Un clic abre; cada una
// tiene su menú para quitarla de la lista o eliminarla. Si su archivo no está, lo dice y ofrece buscarlo o quitarla.
const ID_RECIENTES = "inicio-recientes";
const { t, locale } = useI18n();
const organizaciones = useOrganizaciones();

const idEntrada = (id: string) => `inicio-org-${id}`;
const idMenu = (id: string) => `inicio-org-menu-${id}`;
const nombreDe = (o: Pick<Organizacion, "nombre">) => textoAConfirmar(o, t("barra.sinNombre"));
const inicial = (o: Organizacion) => nombreDe(o).trim().charAt(0).toLocaleUpperCase(locale.value);

const ahora = Date.now();
const relativo = computed(() => new Intl.RelativeTimeFormat(locale.value, { numeric: "auto" }));
function cuando(abierta: string): string {
  const en = Date.parse(abierta);
  if (Number.isNaN(en)) return "";
  const h = hace(en, ahora);
  return h ? relativo.value.format(h.valor, h.unidad) : t("inicio.ahora");
}

/** Una acción a la vez: un segundo clic mientras corre no hace nada. */
const ocupado = ref(false);
const bloqueado = computed(() => ocupado.value || organizaciones.enCurso);

// Si Inicio se desmonta al cambiar y algo falla, vuelve a mostrarse: el foco, a la entrada desde la que se pidió.
async function abrir(o: Organizacion) {
  if (bloqueado.value) return;
  ocupado.value = true;
  volverAlTerminar(idEntrada(o.id));
  const r = await organizaciones.abrir(o.id);
  ocupado.value = false;
  if (r.ok) volverAlTerminar(null);
  else toast.error(r.mensaje);
}

const preguntas = ref<InstanceType<typeof PreguntaArchivo> | null>(null);
async function buscar(o: Organizacion) {
  if (bloqueado.value) return;
  ocupado.value = true;
  volverAlTerminar(idEntrada(o.id));
  const r = await organizaciones.agregarArchivo(
    (p) => preguntas.value?.preguntar(p) ?? Promise.resolve(false),
    o.id,
  );
  ocupado.value = false;
  if (!r.ok) return void toast.error(r.mensaje);
  volverAlTerminar(null);
  for (const a of r.avisos ?? []) toast.warning(t(`organizaciones.avisoArchivo.${a}`));
}

// Donde estaba la entrada: la que tomó su lugar, la última si era la última, o el título si no queda ninguna.
async function enfocarEn(i: number) {
  await nextTick();
  const o = organizaciones.recientes[Math.min(i, organizaciones.recientes.length - 1)];
  (document.getElementById(o ? idEntrada(o.id) : "") ?? document.getElementById(ID_RECIENTES))?.focus();
}

const aQuitar = ref<Organizacion | null>(null); // no se limpia al cerrar: el texto sigue ahí mientras el diálogo se va
const quitando = ref(false);
let quitada = false;
function pedirQuitar(o: Organizacion) {
  aQuitar.value = o;
  quitada = false;
  quitando.value = true;
}
async function quitar() {
  const o = aQuitar.value;
  if (!o || quitada) return;
  quitada = true;
  const i = organizaciones.recientes.findIndex((x) => x.id === o.id);
  ocupado.value = true;
  const r = await organizaciones.quitar(o.id);
  ocupado.value = false;
  if (!r.ok) {
    if (r.codigo === "lista_protegida") organizaciones.listaProtegida = true;
    toast.error(r.mensaje);
  }
  await enfocarEn(i);
}
// Con un sí, el foco lo deja `quitar`: la entrada ya no está.
const alCerrarQuitar = (e: Event) => quitada && e.preventDefault();

const elegida = ref<Organizacion | null>(null);
const eliminando = ref(false);
let filaElegida = 0;
function pedirEliminar(o: Organizacion) {
  elegida.value = o;
  filaElegida = organizaciones.recientes.findIndex((x) => x.id === o.id);
  // La abierta desmonta Inicio, y al volver esta lista puede ya no estar (queda una sola): el foco va al título de la página.
  eliminando.value = true;
}
// Lo que dijo Rust tras un fallo, como que su archivo ya no está.
watch(
  () => organizaciones.lista,
  (lista) => {
    const ahora = lista.find((o) => o.id === elegida.value?.id);
    if (ahora) elegida.value = ahora;
  },
);
async function trasEliminar(eliminada: boolean) {
  await organizaciones.cargarLista();
  if (eliminada) await enfocarEn(filaElegida);
}
</script>

<template>
  <section :aria-labelledby="ID_RECIENTES" class="flex flex-col gap-2">
    <h2 :id="ID_RECIENTES" tabindex="-1" class="text-base font-semibold outline-none">
      {{ t("inicio.recientes") }}
    </h2>
    <ul class="flex flex-col rounded-lg border bg-card">
      <li v-for="o in organizaciones.recientes" :key="o.id" class="border-b last:border-b-0">
        <div class="flex items-center gap-1 pr-2">
          <button
            :id="idEntrada(o.id)"
            type="button"
            class="flex min-w-0 flex-1 items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
            :aria-disabled="bloqueado || undefined"
            @click="abrir(o)"
          >
            <span
              class="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 bg-muted font-semibold"
              :style="{ borderColor: o.color }"
              aria-hidden="true"
            >
              <img v-if="o.logo" :src="`data:image/png;base64,${o.logo}`" alt="" class="size-full object-contain" />
              <template v-else>{{ inicial(o) }}</template>
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium" :title="nombreDe(o)">{{ nombreDe(o) }}</span>
              <span v-if="!o.existe" class="block text-xs text-destructive">{{ t("inicio.sinArchivo") }}</span>
            </span>
            <Badge v-if="o.activa" variant="outline" class="shrink-0">{{ t("organizaciones.seccion.abierta") }}</Badge>
            <span v-if="cuando(o.abierta)" class="shrink-0 text-xs text-muted-foreground">{{ cuando(o.abierta) }}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button
                :id="idMenu(o.id)"
                type="button"
                variant="ghost"
                size="icon-sm"
                :aria-label="t('inicio.accionesDe', { nombre: nombreDe(o) })"
                :title="t('inicio.accionesDe', { nombre: nombreDe(o) })"
              >
                <EllipsisVertical aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <!-- Sin su archivo, buscarlo y quitarla están a la vista, bajo el nombre. -->
              <DropdownMenuItem
                v-if="o.existe && !o.activa"
                :disabled="bloqueado || organizaciones.listaProtegida"
                @select="pedirQuitar(o)"
              >
                <ListX aria-hidden="true" />
                {{ t("organizaciones.seccion.quitar") }}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                :disabled="bloqueado || organizaciones.listaProtegida"
                @select="pedirEliminar(o)"
              >
                <Trash2 aria-hidden="true" />
                {{ t("inicio.eliminar") }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div v-if="!o.existe" class="flex flex-wrap gap-2 px-3 pb-3 pl-15">
          <Button type="button" variant="outline" size="sm" :aria-busy="ocupado" @click="buscar(o)">
            <FileSearch aria-hidden="true" />
            {{ t("organizaciones.buscarArchivo") }}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            :disabled="organizaciones.listaProtegida"
            @click="pedirQuitar(o)"
          >
            <ListX aria-hidden="true" />
            {{ t("organizaciones.seccion.quitar") }}
          </Button>
        </div>
      </li>
    </ul>
    <p role="status" class="text-sm text-muted-foreground empty:hidden">
      {{ ocupado ? t("inicio.trabajando") : "" }}
    </p>

    <PreguntaArchivo ref="preguntas" :titulo="t('organizaciones.buscarArchivo')" />

    <AlertDialog v-model:open="quitando">
      <AlertDialogContent @close-auto-focus="alCerrarQuitar">
        <AlertDialogHeader>
          <AlertDialogTitle class="break-words">
            {{ t("organizaciones.seccion.quitarTitulo", { nombre: aQuitar ? nombreDe(aQuitar) : "" }) }}
          </AlertDialogTitle>
          <AlertDialogDescription class="break-words">
            {{
              t(
                aQuitar?.existe
                  ? "organizaciones.seccion.quitarTexto"
                  : "organizaciones.seccion.quitarTextoSinArchivo",
                { ruta: aQuitar?.ruta ?? "" },
              )
            }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("organizaciones.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="quitar">{{ t("organizaciones.seccion.quitar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <DialogoEliminarOrganizacion
      v-if="elegida"
      v-model:open="eliminando"
      :organizacion="elegida"
      @terminado="trasEliminar"
    />
  </section>
</template>
