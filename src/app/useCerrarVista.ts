import { useRouter } from "vue-router";
import { destinoAlCerrar } from "./estructura";

/** Cierra Configuración, Ayuda o Acerca de: vuelve a la vista anterior o, si no la hay, al árbol. */
export function useCerrarVista() {
  const router = useRouter();
  return () => {
    // vue-router guarda en history.state la ruta anterior de la app (null si esta fue la primera).
    if (destinoAlCerrar(window.history.state?.back) === "atras") router.back();
    else void router.push("/");
  };
}
