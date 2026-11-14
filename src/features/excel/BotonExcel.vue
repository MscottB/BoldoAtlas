<script setup lang="ts">
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { FileSpreadsheet } from "@lucide/vue";
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
import { excelAbrirCarpeta, excelGuardar, infoApp, leerMeta } from "@/db/cliente";
import { hoyISO } from "@/features/puestos/puestos";
import { mensajeFallo } from "@/features/respaldos/respaldos";
import { useOrganizacion } from "@/stores/organizacion";
import { escribirAparte } from "./aparte";
import { exportar, type Lista } from "./exportar";
import { hojaInformacion, nombreArchivo } from "./libro";

// «Exportar esta lista a Excel»: la lista da lo que se ve (`lista`, que se lee al aceptar). Antes, en cada exportación,
// el aviso de spec §11; sin aceptarlo no se genera nada.
defineOptions({ inheritAttrs: false });
const props = defineProps<{ lista: () => Lista }>();
const { t } = useI18n();
const org = useOrganizacion();

const abierto = ref(false);
const ocupado = ref(false);
let responder: (acepta: boolean) => void = () => {};
// Cerrar el aviso de cualquier forma (Cancelar, Esc, clic fuera) es no aceptarlo. «Exportar» responde antes.
watch(abierto, (v) => v || responder(false));

async function armar() {
  const [meta, info] = await Promise.all([leerMeta(), infoApp()]);
  const l = props.lista();
  const generado = new Date();
  const hoy = hoyISO(generado);
  const revision = Number(meta.data_revision ?? 0);
  const datos = {
    organizacion: org.org.nombre,
    generado,
    versionApp: __APP_VERSION__,
    versionEsquema: info.versionEsquema,
    revision,
    dbId: meta.db_id ?? "",
    lista: l.nombre,
    fecha: l.fecha ?? hoy,
    filtros: l.filtros,
    orden: l.orden,
  };
  return { nombre: nombreArchivo(org.org.nombre, hoy, revision), hojas: [l.hoja, hojaInformacion(datos, t)] };
}

async function pulsar() {
  if (ocupado.value) return;
  ocupado.value = true;
  try {
    const nombre = await exportar({
      aceptar: () =>
        new Promise((r) => {
          responder = r;
          abierto.value = true;
        }),
      armar,
      escribir: escribirAparte,
      guardar: excelGuardar,
    });
    if (nombre)
      toast.success(t("excel.guardado", { nombre }), {
        duration: 10000,
        action: {
          label: t("excel.abrirCarpeta"),
          onClick: () => void excelAbrirCarpeta().catch((e: unknown) => toast.error(mensajeFallo(e))),
        },
      });
  } catch (e) {
    toast.error(mensajeFallo(e));
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <Button type="button" variant="outline" size="sm" v-bind="$attrs" :disabled="ocupado" @click="pulsar">
    <FileSpreadsheet aria-hidden="true" />
    {{ t("excel.exportar") }}
  </Button>
  <AlertDialog v-model:open="abierto">
    <AlertDialogContent data-aviso-excel>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("excel.aviso.titulo") }}</AlertDialogTitle>
        <AlertDialogDescription>{{ t("excel.aviso.texto") }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("excel.aviso.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction @click="responder(true)">{{ t("excel.aviso.aceptar") }}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
