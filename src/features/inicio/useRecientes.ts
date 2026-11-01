import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import type { Router } from "vue-router";
import { alReemplazarBase } from "@/db/cliente";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { agregarReciente, esVistaReciente, leerRecientes, type Reciente } from "./recientes";

/**
 * «Abierto recientemente» en Inicio: lo último que se abrió en esta organización (spec §7). Se registra al navegar y se
 * recuerda por PC y por proyecto, con la misma clave por base que las pestañas. Nombra personas: se puede borrar.
 */
export const useRecientes = defineStore("recientes", () => {
  const lista = ref<Reciente[]>([]);
  let clave: string | null = null;
  let valida: (ruta: string) => boolean = () => false;
  // sync: lo que se abre justo antes de cerrar la ventana alcanza a escribirse.
  watch(lista, (l) => clave && guardarPreferencia(clave, l), { flush: "sync" });

  // Lo eliminado desde la última vez ya no se ofrece, aunque siga guardado hasta la próxima limpieza.
  const visibles = computed(() => lista.value.filter((r) => valida(r.ruta)));

  const vaciar = () => (lista.value = []);

  /** Una sola vez, al arrancar, con los datos ya cargados: `valida` dice si una ruta sigue llevando a algo que existe. */
  function conectar(router: Router, proyecto: string, esValida: (ruta: string) => boolean) {
    clave = `recientes:${proyecto}`;
    valida = esValida;
    lista.value = leerRecientes(leerPreferencia<unknown>(clave, null), valida);
    router.afterEach((to, _from, fallo) => {
      if (!fallo && esVistaReciente(to.name) && valida(to.fullPath))
        lista.value = agregarReciente(lista.value, to.fullPath, Date.now());
    });
    // Importar con «Reemplazar» o restaurar un respaldo cambian la base.
    alReemplazarBase(vaciar);
  }

  /** Guarda sin lo que ya no existe (al mostrar Inicio). */
  function depurar() {
    const l = leerRecientes(lista.value, valida);
    if (l.length !== lista.value.length) lista.value = l;
  }

  return { visibles, conectar, vaciar, depurar };
});
