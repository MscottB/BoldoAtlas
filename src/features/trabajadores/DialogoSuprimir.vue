<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coincideNombre } from "./suprimir";

// Borrar definitivamente a una persona: se confirma escribiendo su nombre. Quien lo usa llama al store al confirmar.
const props = defineProps<{ nombre: string }>();
const abierto = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ confirmar: [] }>();
const { t } = useI18n();
const escrito = ref("");
const listo = computed(() => coincideNombre(escrito.value, props.nombre));
// cada vez que se abre, de cero
watch(abierto, (v) => v && (escrito.value = ""));
</script>

<template>
  <AlertDialog v-model:open="abierto">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t("suprimir.titulo", { nombre }) }}</AlertDialogTitle>
        <AlertDialogDescription as="div" class="grid gap-2">
          <p>{{ t("suprimir.queSeBorra") }}</p>
          <p class="font-medium text-foreground">{{ t("suprimir.noSeDeshace") }}</p>
          <p>{{ t("suprimir.respaldos") }}</p>
        </AlertDialogDescription>
      </AlertDialogHeader>
      <div class="grid gap-2">
        <Label for="suprimir-nombre">{{ t("suprimir.escribe", { nombre }) }}</Label>
        <Input id="suprimir-nombre" v-model="escrito" autocomplete="off" @keydown.enter.prevent />
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ t("suprimir.cancelar") }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" :disabled="!listo" @click="emit('confirmar')">
          {{ t("suprimir.confirmar") }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
