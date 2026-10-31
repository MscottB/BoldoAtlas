import { onScopeDispose, ref, watch, type Ref } from "vue";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";

/** Demoras (ms) de la barra contraída al pasar el mouse: no se abre al cruzarla de paso ni se cierra al salir un instante. */
export const DEMORA_ABRIR = 200;
export const DEMORA_CERRAR = 300;

const CLAVE = "abrirBarraAlPasar";
// Por PC; activa por defecto. Solo un false guardado la apaga (lo demás, dañado o ausente, vale el valor por defecto).
export const abrirAlPasar = ref(leerPreferencia<unknown>(CLAVE, true) !== false);

export function guardarAbrirAlPasar(si: boolean): void {
  abrirAlPasar.value = si;
  guardarPreferencia(CLAVE, si);
}

/**
 * Barra lateral contraída que se despliega sobre el contenido (sin correrlo): con el mouse tras DEMORA_ABRIR y se pliega
 * DEMORA_CERRAR después de salir; con el teclado, al entrar el foco, y se pliega al salir el foco o con Esc. Solo si la
 * barra está contraída y la opción de Configuración está activa.
 */
export function useBarraFlotante(colapsada: Ref<boolean>) {
  const flotando = ref(false);
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const fijar = (abierta: boolean, demora = 0) => {
    clearTimeout(reloj);
    if (demora) reloj = setTimeout(() => (flotando.value = abierta), demora);
    else flotando.value = abierta;
  };
  const puede = () => colapsada.value && abrirAlPasar.value;
  // Fijarla abierta o contraída (botón, ancho de la ventana) o apagar la opción termina el despliegue.
  watch([colapsada, abrirAlPasar], () => fijar(false));
  onScopeDispose(() => clearTimeout(reloj));
  return {
    flotando,
    abrirAlPasar,
    entrar: () => puede() && fijar(true, DEMORA_ABRIR),
    salir: () => fijar(false, DEMORA_CERRAR),
    enfocar: () => puede() && fijar(true),
    cerrar: () => fijar(false),
  };
}
