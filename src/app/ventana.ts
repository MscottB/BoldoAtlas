import { nextTick, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion } from "@/stores/organizacion";
import { tituloVentana } from "./estructura";

/** Pone «BoldoAtlas — organización» como título de la ventana. Fuera de Tauri no hay ventana: no hace nada. */
export async function ponerTitulo(organizacion: string): Promise<void> {
  try {
    await getCurrentWindow().setTitle(tituloVentana(organizacion));
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}

/** Trae la ventana al frente, también si está minimizada u oculta. */
export async function traerAlFrente(): Promise<void> {
  const ventana = getCurrentWindow();
  await ventana.unminimize();
  await ventana.show();
  await ventana.setFocus();
}

const CONTINUAR = "continuarDondeEstaba";
const PREGUNTAR = "preguntarAlSalir";
// Por PC. Solo el valor contrario guardado cambia la opción (lo demás, dañado o ausente, vale el valor por defecto).
export const continuarDondeEstaba = ref(leerPreferencia<unknown>(CONTINUAR, false) === true);
export const preguntarAlSalir = ref(leerPreferencia<unknown>(PREGUNTAR, true) !== false);

export function guardarContinuarDondeEstaba(si: boolean): void {
  continuarDondeEstaba.value = si;
  guardarPreferencia(CONTINUAR, si);
}
export function guardarPreguntarAlSalir(si: boolean): void {
  preguntarAlSalir.value = si;
  guardarPreferencia(PREGUNTAR, si);
}

/** Si «¿Seguro que quieres salir?» está abierto. Es uno solo: otro intento de cerrar no apila otro diálogo. */
export const salidaAbierta = ref(false);

/** «Salir» del menú y de la bandeja: el mismo camino que la X de la ventana. Fuera de Tauri no hace nada. */
export async function pedirSalir(): Promise<void> {
  try {
    await getCurrentWindow().close();
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}

/**
 * Rust pidió cerrar (`salida.rs`): se pregunta o se sale. Solo se responde a Rust si el diálogo existe de verdad: con la
 * interfaz en blanco (`App.vue` falló al montar) no hay quien pregunte y, sin respuesta, Rust sale solo.
 */
export async function alPedirCierre(): Promise<void> {
  if (!preguntarAlSalir.value) return salir();
  salidaAbierta.value = true;
  await nextTick();
  if (!document.querySelector("[data-dialogo-salir]")) return;
  await invoke("cierre_atendido");
  await traerAlFrente();
}

const ESPERA_ESCRITURAS_MS = 2000;

/** Termina la app. El campo en edición se guarda al perder el foco; hasta 2 s para que se escriba lo que quede en curso. */
export async function salir(): Promise<void> {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const org = useOrganizacion();
  const tope = Date.now() + ESPERA_ESCRITURAS_MS;
  do await new Promise((r) => setTimeout(r, 20));
  while (org.guardando && Date.now() < tope);
  window.dispatchEvent(new Event("beforeunload")); // Tauri no lo avisa al salir: las pestañas guardan su estado
  await invoke("salir_app");
}

/** Desde aquí Rust ya no cierra sin preguntarle a la interfaz. Sin Tauri, o si esto falla, cerrar sigue cerrando. */
export async function conectarCierre(): Promise<void> {
  try {
    await listen("cierre-pedido", () => void alPedirCierre());
    await invoke("cierre_listo");
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}
