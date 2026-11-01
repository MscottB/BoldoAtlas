import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { defineStore } from "pinia";
import {
  NavigationFailureType,
  isNavigationFailure,
  useRoute,
  type RouteLocationRaw,
  type Router,
} from "vue-router";
import { useEventListener } from "@vueuse/core";
import { toast } from "vue-sonner";
import { esVistaCerrable } from "@/app/estructura";
import { i18n } from "@/i18n";
import { nuevoId } from "@/lib/ids";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import * as P from "./pestanas";

/** Id del área central (el panel de las pestañas): recibe el foco si al cerrar una pestaña no queda barra. */
export const ID_AREA = "area-central";
export const idPestana = (id: string) => `pestana-${id}`;

/**
 * Pestañas de trabajo del proyecto abierto (spec §7). La ruta de la pestaña activa es la del router: navegar dentro de
 * ella la actualiza; cambiar de pestaña navega a la ruta de la otra (con replace: la historia sigue siendo de la vista).
 * Solo la activa está montada (App.vue usa su id como key de la vista); cada vista guarda su estado al desmontarse
 * (`useEstadoPestana`). Se recuerdan por PC y por proyecto.
 */
export const usePestanas = defineStore("pestanas", () => {
  const t = i18n.global.t;
  const modelo = ref<P.Pestanas>(P.unaPestana(nuevoId()));
  let router: Router | null = null;
  let clave: string | null = null;
  /** false mientras se ve la Bienvenida (fuera del proyecto): al volver se recargan y validan sus pestañas. */
  let enProyecto = false;
  /** Pestaña que pasa a activa cuando llegue la navegación a su ruta: así la vista vieja no se remonta con otra key. */
  let destino: { id: string; ruta: string } | null = null;

  const lista = computed(() => modelo.value.lista);
  const activa = computed(() => modelo.value.activa);
  // sync: el estado que una vista guarda al cerrar la ventana alcanza a escribirse.
  watch(modelo, (m) => clave && guardarPreferencia(clave, m), { flush: "sync" });

  function valida(ruta: string): boolean {
    if (!router) return false;
    const org = useOrganizacion();
    const r = router.resolve(ruta);
    return P.rutaValida(
      { nombre: r.name, query: r.query },
      { unidad: (id) => org.porId.has(id), persona: (id) => org.trabajadores.some((x) => x.id === id) },
    );
  }

  /** Carga las pestañas guardadas del proyecto (validadas) y devuelve la ruta de la activa. */
  function entrar(): string {
    modelo.value = P.leerPestanas(clave ? leerPreferencia<unknown>(clave, null) : null, valida, nuevoId);
    enProyecto = true;
    const p = modelo.value.lista.find((x) => x.id === modelo.value.activa)!;
    // Configuración, Ayuda y Acerca de son de paso: al entrar se llega a la vista de trabajo de la pestaña.
    return esVistaCerrable(router?.resolve(p.ruta).name) ? (p.volver ?? P.RUTA_INICIO) : p.ruta;
  }

  /** Una sola vez, al arrancar: `proyecto` identifica el proyecto abierto (la ruta de su base). */
  function conectar(r: Router, proyecto: string) {
    router = r;
    clave = `pestanas:${proyecto}`;
    r.afterEach((to, from, fallo) => {
      if (fallo) {
        // Cancelada por otra navegación más nueva (p. ej. un segundo Ctrl+Tab antes de cargar la vista): el cambio de
        // pestaña pendiente, si lo hay, es el de esa otra y lo resuelve su llegada.
        if (!isNavigationFailure(fallo, NavigationFailureType.cancelled)) destino = null;
        return;
      }
      if (to.meta.sinMarco) return void (enProyecto = false);
      const cambios: Partial<P.Pestana> = { ruta: to.fullPath };
      if (!enProyecto) {
        // De vuelta de la Bienvenida: la pestaña que ya muestra ese destino; si no hay, la activa pasa a mostrarlo. Una
        // vista cerrable (Configuración desde la bandeja) no le quita su lugar: «Cerrar» vuelve a él.
        const anterior = entrar();
        const { lista, activa } = modelo.value;
        // con dos pestañas en la misma ruta manda la activa
        const ya =
          lista.find((p) => p.id === activa && p.ruta === to.fullPath) ??
          lista.find((p) => p.ruta === to.fullPath);
        if (ya) modelo.value = { ...modelo.value, activa: ya.id };
        else if (esVistaCerrable(to.name) && !esVistaCerrable(r.resolve(anterior).name))
          cambios.volver = anterior;
      } else if (destino?.ruta === to.fullPath) {
        modelo.value = { ...modelo.value, activa: destino.id };
      } else if (!esVistaCerrable(to.name)) {
        cambios.volver = undefined;
      } else if (!esVistaCerrable(from.name)) {
        // Dentro de la pestaña, hacia Configuración, Ayuda o Acerca de: «Cerrar» vuelve a donde estaba (de una cerrable a
        // otra se conserva la vuelta de la primera; al cambiar de pestaña, la de esa pestaña).
        cambios.volver = from.matched.length ? from.fullPath : undefined;
      }
      destino = null;
      modelo.value = P.cambiar(modelo.value, modelo.value.activa, cambios);
    });
  }

  // Tras cambiar o cerrar, el foco va a la pestaña activa (o, sin barra, al área central): siempre al cerrar o si se
  // cambió desde la barra (la vista que se monta, p. ej. el panel de la unidad, no se lo lleva); si no, solo si quedó suelto.
  async function enfocar(siempre: boolean) {
    await nextTick();
    const el = document.activeElement;
    if (!siempre && el && el !== document.body) return;
    (document.getElementById(idPestana(activa.value)) ?? document.getElementById(ID_AREA))?.focus();
  }
  const enLaBarra = () => !!document.activeElement?.closest?.('[role="tablist"]');

  async function ir(id: string, siempre = enLaBarra()) {
    const p = modelo.value.lista.find((x) => x.id === id);
    if (!p || !router) return;
    const r = router.resolve(p.ruta);
    destino = { id, ruta: r.fullPath };
    // force: dos pestañas pueden mostrar la misma ruta; igual hay que cambiar de pestaña.
    await router.replace({ path: r.path, query: r.query, hash: r.hash, force: true });
    await enfocar(siempre);
  }

  function activar(id: string): Resultado {
    if (id !== activa.value) void ir(id);
    return { ok: true };
  }

  /** Abre `destino` en una pestaña nueva, a la derecha de la activa, y la activa. */
  function abrirNueva(destino: RouteLocationRaw): Resultado {
    if (!router) return { ok: false, mensaje: t("pestanas.noAbre") };
    const r = router.resolve(destino);
    if (!r.matched.length || r.meta.sinMarco) return { ok: false, mensaje: t("pestanas.noAbre") };
    const id = nuevoId();
    const m = P.abrir(modelo.value, id, r.fullPath);
    if (!m) return { ok: false, mensaje: t("pestanas.limite", { n: P.MAX_PESTANAS }) };
    modelo.value = { ...m, activa: modelo.value.activa }; // se activa al llegar (ver `destino`)
    void ir(id);
    return { ok: true, id };
  }

  function cerrar(id: string): Resultado {
    if (modelo.value.lista.length <= 1) return { ok: false, mensaje: t("pestanas.ultima") };
    const m = P.cerrar(modelo.value, id);
    if (m === modelo.value) return { ok: false, mensaje: t("pestanas.noAbre") };
    // La cerrada sigue como activa (sin estar en la lista) hasta llegar a la ruta de la nueva.
    modelo.value = { ...m, activa: modelo.value.activa };
    if (id === activa.value) void ir(m.activa, true);
    else void enfocar(true);
    return { ok: true };
  }

  return {
    lista,
    activa,
    conectar,
    entrar,
    /** Desde la Bienvenida, a la vista que estaba activa. */
    async volverAlProyecto() {
      const ruta = entrar();
      enProyecto = false; // la llegada la trata como vuelta de la Bienvenida (ver `conectar`)
      await router?.push(ruta);
    },
    activar,
    abrirNueva,
    cerrar,
    /** Ctrl+Tab (1) y Ctrl+Mayús+Tab (-1). */
    /** Ctrl+Tab (1) y Ctrl+Mayús+Tab (-1); con un cambio aún en curso, cuenta desde la pestaña a la que se va. */
    siguiente: (paso: 1 | -1) =>
      activar(P.vecina({ ...modelo.value, activa: destino?.id ?? modelo.value.activa }, paso)),
    /** «Cerrar» en Configuración, Ayuda o Acerca de: a la ruta de esta pestaña desde la que se abrió, o al inicio. */
    async cerrarVista() {
      const p = modelo.value.lista.find((x) => x.id === modelo.value.activa);
      await router?.replace(p?.volver ?? P.RUTA_INICIO);
    },
    mover(id: string, posicion: number): Resultado {
      modelo.value = P.mover(modelo.value, id, posicion);
      return { ok: true };
    },
    guardarEstado(id: string, ruta: string, datos: unknown) {
      modelo.value = P.cambiar(modelo.value, id, { estado: { ruta, datos } });
    },
    estadoDe: (id: string, ruta: string) => P.estadoDe(modelo.value, id, ruta),
    /** Título automático: el nombre del subárbol o la persona, o el de la vista. Sigue a los cambios de nombre. */
    titulo(p: P.Pestana): string {
      const org = useOrganizacion();
      const r = router?.resolve(p.ruta);
      const q = (k: string) => (typeof r?.query[k] === "string" ? (r.query[k] as string) : "");
      switch (r?.name) {
        case "arbol": {
          const raiz = q("raiz");
          const ver = org.porId.get(q("ver"))?.nombre;
          return (
            (raiz &&
              (org.subarboles.find((s) => s.unidad_id === raiz)?.nombre || org.porId.get(raiz)?.nombre)) ||
            (ver ? t("pestanas.tituloVer", { nombre: ver }) : t("nav.arbol"))
          );
        }
        case "directorio": {
          const persona = org.trabajadores.find((x) => x.id === q("persona"))?.nombre;
          const unidad = org.porId.get(q("unidad"))?.nombre;
          return persona ?? (unidad ? `${t("nav.directorio")} · ${unidad}` : t("nav.directorio"));
        }
        case "mantenedores":
          return t("mantenedores.titulo");
        default:
          return typeof r?.name === "string" ? t(`nav.${r.name}`) : "";
      }
    },
  };
});

/** «Abrir en pestaña nueva»: si no se puede (tope de pestañas), lo avisa. */
export function abrirEnPestanaNueva(destino: RouteLocationRaw) {
  const r = usePestanas().abrirNueva(destino);
  if (!r.ok) toast.warning(r.mensaje);
}

/** Ctrl+clic (Cmd en Mac) o clic central sobre algo que navega: lo abre en una pestaña nueva y anula el clic. */
export function clicNuevaPestana(e: MouseEvent, destino: RouteLocationRaw): boolean {
  if (e.type === "auxclick" ? e.button !== 1 : !(e.ctrlKey || e.metaKey)) return false;
  e.preventDefault();
  abrirEnPestanaNueva(destino);
  return true;
}

/**
 * Para una vista: devuelve lo que guardó antes en esta pestaña para esta misma ruta (undefined si nada) y, al
 * desmontarse o cerrarse la ventana, guarda `leer()` en la pestaña donde se montó.
 */
export function useEstadoPestana(leer: () => unknown): unknown {
  const pestanas = usePestanas();
  const route = useRoute();
  const id = pestanas.activa;
  const nombre = route.name;
  // La ruta que esta vista muestra: al desmontarse, `route` ya es la siguiente (de esta u otra pestaña).
  let ruta = route.fullPath;
  watch(
    () => route.fullPath,
    (r) => {
      if (route.name === nombre && pestanas.activa === id) ruta = r;
    },
  );
  const guardar = () => pestanas.guardarEstado(id, ruta, leer());
  // También mientras se usa (tras una pausa): al cerrar la ventana, Tauri puede no avisar con beforeunload.
  let espera: ReturnType<typeof setTimeout> | undefined;
  // Al montar: `leer` suele usar refs que la vista declara después de llamar a esta función.
  onMounted(() =>
    watch(
      leer,
      () => {
        clearTimeout(espera);
        espera = setTimeout(guardar, 500);
      },
      { deep: true },
    ),
  );
  onBeforeUnmount(() => {
    clearTimeout(espera); // lo pendiente leería el estado compartido de la vista siguiente
    guardar();
  });
  useEventListener(window, "beforeunload", guardar);
  return pestanas.estadoDe(id, route.fullPath);
}
