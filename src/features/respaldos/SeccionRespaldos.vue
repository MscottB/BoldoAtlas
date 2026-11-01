<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { DatabaseBackup, FolderOpen, History } from "@lucide/vue";
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
import BloquePlegable from "@/components/BloquePlegable.vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  abrirCarpetaRespaldos,
  listarRespaldos,
  restaurarRespaldo,
  type Respaldo,
} from "@/db/cliente";
import { tamano } from "@/lib/formato";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { FRECUENCIA_POR_DEFECTO, FRECUENCIAS } from "./programa";
import { conTrabajo } from "@/lib/trabajos";
import { mensajeFallo, PREFERENCIA, respaldar as hacerRespaldo } from "./respaldos";
import { claseSelect } from "@/lib/utils";

const { t, locale } = useI18n();
const route = useRoute();

const frecuencia = ref(leerPreferencia<string>(PREFERENCIA, FRECUENCIA_POR_DEFECTO));
watch(frecuencia, (f) => guardarPreferencia(PREFERENCIA, f));

const lista = ref<Respaldo[]>([]);
const ocupado = ref(false);
async function cargar() {
  try {
    lista.value = await listarRespaldos();
  } catch (e) {
    toast.error(mensajeFallo(e));
  }
}
onMounted(cargar);

async function respaldar() {
  ocupado.value = true;
  try {
    await hacerRespaldo();
    toast.success(t("respaldos.hecho"));
    await cargar();
  } catch (e) {
    toast.error(mensajeFallo(e));
  } finally {
    ocupado.value = false;
  }
}

const abrirCarpeta = () => abrirCarpetaRespaldos().catch((e: unknown) => toast.error(mensajeFallo(e)));

// `elegido` no se limpia al cerrar el diálogo: la acción lo necesita después de que el diálogo se cierra.
const confirmando = ref(false);
const elegido = ref<Respaldo | null>(null);
function pedirRestaurar(r: Respaldo) {
  elegido.value = r;
  confirmando.value = true;
}
async function restaurar() {
  if (!elegido.value) return;
  ocupado.value = true;
  try {
    const { nombre } = elegido.value;
    await conTrabajo(t("trabajos.restaurar"), () => restaurarRespaldo(nombre)); // si sale bien, la app se reinicia
  } catch (e) {
    toast.error(mensajeFallo(e));
    ocupado.value = false;
    await cargar();
  }
}

// El más reciente, sea automático, hecho a mano o de seguridad (la fecha es AAAA-MM-DDTHH:MM: se compara como texto).
const ultimo = computed(() =>
  lista.value.reduce<Respaldo | null>((a, r) => (!a || r.fecha > a.fecha ? r : a), null),
);
const fecha = (r: Respaldo) =>
  new Intl.DateTimeFormat(locale.value, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(r.fecha),
  );
</script>

<template>
  <section class="grid gap-4" aria-labelledby="cfg-respaldos">
    <div>
      <h2 id="cfg-respaldos" class="font-medium">{{ t("respaldos.titulo") }}</h2>
      <p class="text-sm text-muted-foreground">{{ t("respaldos.ayuda") }}</p>
    </div>
    <div class="flex flex-wrap items-center gap-3">
      <p class="text-sm" :class="!ultimo && 'text-muted-foreground'">
        {{ ultimo ? t("respaldos.ultimo", { fecha: fecha(ultimo) }) : t("respaldos.vacio") }}
      </p>
      <Button type="button" variant="outline" size="sm" :disabled="ocupado" @click="respaldar">
        <DatabaseBackup aria-hidden="true" />
        {{ t("respaldos.ahora") }}
      </Button>
    </div>

    <!-- «Respaldos» del menú de la app llega con #cfg-respaldos: viene a restaurar, así que la lista se abre sola. -->
    <BloquePlegable
      clave="configuracion.respaldos"
      :titulo="t('respaldos.verLista')"
      :abrir="route.hash === '#cfg-respaldos'"
      class="text-sm"
    >
      <div class="grid gap-4 pt-2 pl-5">
        <div class="flex flex-wrap items-end gap-3">
          <div class="grid gap-1.5">
            <Label for="cfg-frecuencia">{{ t("respaldos.frecuencia.etiqueta") }}</Label>
            <select id="cfg-frecuencia" v-model="frecuencia" :class="claseSelect">
              <option v-for="f in FRECUENCIAS" :key="f" :value="f">
                {{ t(`respaldos.frecuencia.${f}`) }}
              </option>
            </select>
          </div>
          <Button type="button" variant="outline" size="sm" @click="abrirCarpeta">
            <FolderOpen aria-hidden="true" />
            {{ t("respaldos.carpeta") }}
          </Button>
        </div>

        <div v-if="lista.length" class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b text-left text-xs text-muted-foreground">
                <th scope="col" class="py-2 pr-2 font-medium">{{ t("respaldos.columnas.fecha") }}</th>
                <th scope="col" class="px-2 text-right font-medium">{{ t("respaldos.columnas.tamano") }}</th>
                <th scope="col" class="px-2 text-right font-medium">
                  {{ t("respaldos.columnas.revision") }}
                </th>
                <th scope="col" class="py-2 pl-2 font-medium">
                  <span class="sr-only">{{ t("respaldos.columnas.acciones") }}</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y">
              <tr v-for="r in lista" :key="r.nombre">
                <td class="py-2 pr-2">
                  {{ fecha(r) }}
                  <Badge v-if="r.seguridad" variant="outline" class="ml-2">{{
                    t(
                      r.importacion
                        ? "respaldos.antesDeImportar"
                        : r.reemplazo
                          ? "respaldos.antesDeReemplazar"
                          : "respaldos.seguridad",
                    )
                  }}</Badge>
                </td>
                <td class="px-2 text-right tabular-nums">{{ tamano(r.bytes, locale) }}</td>
                <td class="px-2 text-right tabular-nums">
                  <span v-if="r.legible">{{ r.revision }}</span>
                  <Badge v-else variant="destructive">{{ t("respaldos.ilegible") }}</Badge>
                </td>
                <td class="py-2 pl-2 text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    :disabled="ocupado || !r.legible"
                    :aria-label="t('respaldos.restaurarDe', { fecha: fecha(r) })"
                    @click="pedirRestaurar(r)"
                  >
                    <History aria-hidden="true" />
                    {{ t("respaldos.restaurar") }}
                  </Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </BloquePlegable>

    <AlertDialog v-model:open="confirmando">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t("respaldos.confirmarTitulo", { fecha: elegido ? fecha(elegido) : "" }) }}
          </AlertDialogTitle>
          <AlertDialogDescription>{{ t("respaldos.confirmarTexto") }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t("respaldos.cancelar") }}</AlertDialogCancel>
          <AlertDialogAction @click="restaurar">{{ t("respaldos.confirmar") }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>
</template>
