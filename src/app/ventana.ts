import { nextTick, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { trabajos } from "@/lib/trabajos";
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
const AL_CERRAR = "alCerrar";
const PREGUNTAR = "preguntarAlSalir"; // la casilla de antes: apagada equivale a «Cerrar la app»

export const OPCIONES_AL_CERRAR = ["preguntar", "bandeja", "cerrar"] as const;
export type AlCerrar = (typeof OPCIONES_AL_CERRAR)[number];

/** Lo guardado en este PC: si la opción aún no se eligió (o está dañada), vale la casilla de antes. */
export function alCerrarGuardado(opcion: unknown, preguntaba: unknown): AlCerrar {
  if (OPCIONES_AL_CERRAR.includes(opcion as AlCerrar)) return opcion as AlCerrar;
  return preguntaba === false ? "cerrar" : "preguntar";
}

/** `salida`: «Salir» o un cierre que no es del usuario, que nunca termina en la bandeja. */
export function decidirCierre(a: {
  opcion: AlCerrar;
  hayTrabajos: boolean;
  hayBandeja: boolean;
  salida: boolean;
}): AlCerrar {
  if (a.hayTrabajos) return "preguntar";
  if (a.opcion !== "bandeja") return a.opcion;
  if (a.salida) return "cerrar";
  return a.hayBandeja ? "bandeja" : "preguntar";
}

// Por PC. Solo el valor contrario guardado cambia la opción (lo demás, dañado o ausente, vale el valor por defecto).
export const continuarDondeEstaba = ref(leerPreferencia<unknown>(CONTINUAR, false) === true);
export const alCerrar = ref(
  alCerrarGuardado(leerPreferencia<unknown>(AL_CERRAR, null), leerPreferencia<unknown>(PREGUNTAR, true)),
);
/** Si el icono de la bandeja existe de verdad (lo marca `crearBandeja`): sin él no hay desde dónde volver. */
export const bandejaLista = ref(false);

export function guardarContinuarDondeEstaba(si: boolean): void {
  continuarDondeEstaba.value = si;
  guardarPreferencia(CONTINUAR, si);
}
export function guardarAlCerrar(opcion: AlCerrar): void {
  alCerrar.value = opcion;
  guardarPreferencia(AL_CERRAR, opcion);
}

/** Si «¿Seguro que quieres salir?» está abierto. Es uno solo: otro intento de cerrar no apila otro diálogo. */
export const salidaAbierta = ref(false);

/** «Salir» del menú: el mismo camino que la X, pero nunca termina en la bandeja. Fuera de Tauri no hace nada. */
export async function pedirSalir(): Promise<void> {
  try {
    await invoke("pedir_salida");
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}

/**
 * Rust pidió cerrar (`salida.rs`): se pregunta, se oculta o se sale. Si la interfaz está colgada no llega aquí y, sin
 * respuesta, Rust sale solo. Lo mismo con la interfaz en blanco (`App.vue` falló al montar), donde no hay diálogo.
 */
export async function alPedirCierre(salida = false): Promise<void> {
  const accion = decidirCierre({
    opcion: alCerrar.value,
    hayTrabajos: trabajos.value.length > 0,
    hayBandeja: bandejaLista.value,
    salida,
  });
  if (accion !== "preguntar" && !salidaAbierta.value)
    return accion === "cerrar" ? salir() : dejarEnBandeja();
  salidaAbierta.value = true;
  await nextTick();
  if (!document.querySelector("[data-dialogo-salir]")) return;
  await invoke("cierre_atendido");
  await traerAlFrente();
}

/** Respuesta del diálogo. Cancelar no pasa por aquí: no guarda nada, aunque la casilla esté marcada. */
export async function responderSalida(accion: "bandeja" | "cerrar", recordar: boolean): Promise<void> {
  if (recordar) guardarAlCerrar(accion);
  await (accion === "cerrar" ? salir() : dejarEnBandeja());
}

function soltarEdicion(): void {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
}
// Tauri no lo avisa al salir: las pestañas guardan su estado
const guardarPestanas = () => window.dispatchEvent(new Event("beforeunload"));

/** Oculta la ventana: la app sigue abierta y un apagado o el instalador pueden cerrarla sin volver a mostrarla. */
async function dejarEnBandeja(): Promise<void> {
  soltarEdicion();
  guardarPestanas();
  await invoke("ocultar_en_bandeja");
}

const ESPERA_ESCRITURAS_MS = 2000;

/** Termina la app. El campo en edición se guarda al perder el foco; hasta 2 s para que se escriba lo que quede en curso. */
export async function salir(): Promise<void> {
  soltarEdicion();
  const org = useOrganizacion();
  const tope = Date.now() + ESPERA_ESCRITURAS_MS;
  do await new Promise((r) => setTimeout(r, 20));
  while (org.guardando && Date.now() < tope);
  guardarPestanas();
  await invoke("salir_app");
}

/** Desde aquí Rust ya no cierra sin preguntarle a la interfaz. Sin Tauri, o si esto falla, cerrar sigue cerrando. */
export async function conectarCierre(): Promise<void> {
  try {
    await listen<boolean>("cierre-pedido", (e) => void alPedirCierre(e.payload));
    await invoke("cierre_listo");
  } catch {
    /* sin ventana nativa (vista previa en el navegador) */
  }
}
