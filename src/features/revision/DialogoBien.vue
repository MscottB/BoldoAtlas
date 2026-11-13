<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hoyISO } from "@/features/puestos/puestos";
import { useRetornoFoco } from "@/lib/foco";
import { useOrganizacion } from "@/stores/organizacion";
import { marcar, MOTIVO_MAX } from "./marcas";
import { useAvisos } from "./useAvisos";

// «Así está bien»: el aviso deja de contar, con un motivo. `aviso` null = cerrado.
const props = defineProps<{ aviso: { clave: string; texto: string } | null }>();
const emit = defineEmits<{ cerrar: [] }>();
const { t } = useI18n();
const org = useOrganizacion();
const estado = useAvisos();
const retorno = useRetornoFoco();

const motivo = ref("");
const error = ref("");
// El texto sigue a la vista mientras el diálogo se desvanece.
const texto = ref("");
watch(
  () => props.aviso,
  (a) => {
    if (!a) return;
    texto.value = a.texto;
    motivo.value = error.value = "";
  },
);

async function guardar() {
  if (!props.aviso) return;
  // Todo el mapa: guardarMarcasRevision reemplaza el JSON entero.
  const { marcas, vigentes } = estado.value;
  const m = marcar(marcas, props.aviso.clave, motivo.value, hoyISO(new Date()), vigentes);
  if (!m) return;
  const r = await org.guardarMarcasRevision(m);
  if (r.ok) emit("cerrar");
  else error.value = r.mensaje;
}
</script>

<template>
  <Dialog :open="!!aviso" @update:open="(v) => v || emit('cerrar')">
    <DialogContent @open-auto-focus="retorno.alAbrir" @close-auto-focus="retorno.alCerrar">
      <form class="grid gap-4" @submit.prevent="guardar">
        <DialogHeader>
          <DialogTitle>{{ t("revision.bien.titulo") }}</DialogTitle>
          <DialogDescription>{{ texto }}</DialogDescription>
        </DialogHeader>
        <div class="grid gap-2">
          <Label for="revision-motivo">{{ t("revision.bien.motivo") }}</Label>
          <Textarea
            id="revision-motivo"
            v-model="motivo"
            :maxlength="MOTIVO_MAX"
            aria-describedby="revision-motivo-ejemplo"
            :aria-invalid="!!error || undefined"
          />
          <p id="revision-motivo-ejemplo" class="text-sm text-muted-foreground">
            {{ t("revision.bien.ejemplo") }}
          </p>
          <p v-if="error" role="alert" class="text-sm text-destructive">{{ error }}</p>
        </div>
        <DialogFooter>
          <DialogClose as-child>
            <Button type="button" variant="outline">{{ t("revision.bien.cancelar") }}</Button>
          </DialogClose>
          <Button type="submit" :disabled="!motivo.trim()">{{ t("revision.bien.guardar") }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
