<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { History, LocateFixed, Redo2, Undo2 } from "@lucide/vue";
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
import { nombreColumna } from "@/features/intercambio/intercambio";
import { frase } from "./frases";
import { camposVisibles, textoCampo } from "./historial";
import type { AccionBreve, FilaDetalle, Pregunta, Sentido } from "./tipos";

// El detalle de una acción, campo por campo, y lo que se puede hacer con ella. Quien lo usa pide a Rust y llena
// `pregunta` (con `usePregunta`): el diálogo nombra las acciones que van juntas, o cuántas deshace «Volver a este punto».
// Cerrarlo es cancelar. El botón de confirmar también lo cierra, y antes de su propio clic: por eso `preguntando` va aparte
// y lo preguntado sigue ahí cuando llega `confirmar`.
const props = defineProps<{
  accion: AccionBreve;
  /** null: aún se está leyendo. */
  filas: FilaDetalle[] | null;
  soloLectura: boolean;
  pregunta?: Pregunta | null;
  preguntando?: boolean;
  ocupado?: boolean;
  /** Si hay a dónde ir: lo que tocó sigue existiendo. */
  puedeIr?: boolean;
  /** El nombre de lo que apunta un campo `*_id`; null si ya no está. */
  nombreDe?: (columna: string, id: string) => string | null;
}>();
const emit = defineEmits<{ ir: []; mover: [sentido: Sentido]; volver: []; confirmar: []; cancelar: [] }>();
const { t } = useI18n();

const etiqueta = (c: string) => (c === "deleted_at" ? t("historial.vista.eliminado") : nombreColumna(c));
const valor = (c: string, v: unknown) => textoCampo(c, v, props.nombreDe ?? (() => null), t);
</script>

<template>
  <div class="grid gap-3 border-t bg-muted/30 px-3 py-3" data-detalle>
    <p v-if="filas === null" class="text-sm text-muted-foreground">{{ t("historial.vista.cargando") }}</p>
    <p v-else-if="!filas.length" class="text-sm text-muted-foreground">
      {{ t("historial.vista.sinCampos") }}
    </p>
    <section v-for="(f, i) in filas ?? []" :key="i" class="grid gap-1">
      <h4 class="text-sm font-medium">
        {{ t(`historial.vista.op.${f.op}`) }}: {{ f.nombre ?? t("historial.vista.otro") }}
        <span class="font-normal text-muted-foreground">({{ t(`intercambio.tablas.${f.tabla}`) }})</span>
      </h4>
      <dl class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <template v-for="[c, antes, despues] in camposVisibles(f)" :key="c">
          <dt class="text-muted-foreground">{{ etiqueta(c) }}</dt>
          <dd v-if="f.op === 'update'" class="min-w-0 break-words">
            {{ valor(c, antes) }} → {{ valor(c, despues) }}
          </dd>
          <dd v-else class="min-w-0 break-words">{{ valor(c, f.op === "insert" ? despues : antes) }}</dd>
        </template>
      </dl>
    </section>

    <!-- En solo lectura (una fecha, o la organización de al lado) se mira y nada más. -->
    <div v-if="!soloLectura" class="flex flex-wrap gap-2">
      <Button
        v-if="puedeIr"
        type="button"
        size="sm"
        variant="outline"
        :disabled="ocupado"
        @click="emit('ir')"
      >
        <LocateFixed aria-hidden="true" />
        {{ t("historial.vista.irA") }}
      </Button>
      <template v-if="!accion.bloqueada">
        <Button
          v-if="accion.estado === 'hecha'"
          type="button"
          size="sm"
          variant="outline"
          data-deshacer
          :disabled="ocupado"
          @click="emit('mover', 'deshacer')"
        >
          <Undo2 aria-hidden="true" />
          {{ t("historial.vista.deshacer") }}
        </Button>
        <Button
          v-else
          type="button"
          size="sm"
          variant="outline"
          data-rehacer
          :disabled="ocupado"
          @click="emit('mover', 'rehacer')"
        >
          <Redo2 aria-hidden="true" />
          {{ t("historial.vista.rehacer") }}
        </Button>
      </template>
      <!-- Rust vuelve solo a una hecha: lo que hay ahora no es el estado justo después de una deshecha. -->
      <Button
        v-if="accion.estado === 'hecha'"
        type="button"
        size="sm"
        variant="outline"
        data-volver
        :disabled="ocupado"
        @click="emit('volver')"
      >
        <History aria-hidden="true" />
        {{ t("historial.vista.volver") }}
      </Button>
    </div>

    <AlertDialog :open="preguntando && !!pregunta" @update:open="(v: boolean) => v || emit('cancelar')">
      <AlertDialogContent>
        <template v-if="pregunta?.tipo === 'juntas'">
          <AlertDialogHeader>
            <AlertDialogTitle>{{ t(`historial.vista.juntas.titulo.${pregunta.sentido}`) }}</AlertDialogTitle>
            <AlertDialogDescription as="div" class="grid gap-2">
              <p>{{ t(`historial.vista.juntas.texto.${pregunta.sentido}`) }}</p>
              <ul class="list-inside list-disc text-foreground">
                <li v-for="a in pregunta.acciones" :key="a.id">{{ frase(a, t) }}</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ t("historial.vista.cancelar") }}</AlertDialogCancel>
            <AlertDialogAction data-confirmar @click="emit('confirmar')">
              {{ t(`historial.vista.juntas.boton.${pregunta.sentido}`, { n: pregunta.acciones.length + 1 }) }}
            </AlertDialogAction>
          </AlertDialogFooter>
        </template>
        <!-- Una posterior que no se puede deshacer haría fallar todo: se dice por qué y no se ofrece confirmar. -->
        <template v-else-if="pregunta?.bloqueada">
          <AlertDialogHeader>
            <AlertDialogTitle>{{ t("historial.vista.volver") }}</AlertDialogTitle>
            <AlertDialogDescription>{{ t("historial.vista.volverBloqueada") }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ t("historial.vista.cerrar") }}</AlertDialogCancel>
          </AlertDialogFooter>
        </template>
        <template v-else-if="pregunta">
          <AlertDialogHeader>
            <AlertDialogTitle>{{ t("historial.vista.volver") }}</AlertDialogTitle>
            <AlertDialogDescription>{{
              t("historial.vista.volverTexto", { n: pregunta.n }, pregunta.n)
            }}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{{ t("historial.vista.cancelar") }}</AlertDialogCancel>
            <AlertDialogAction data-confirmar @click="emit('confirmar')">{{
              t("historial.vista.volver")
            }}</AlertDialogAction>
          </AlertDialogFooter>
        </template>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
