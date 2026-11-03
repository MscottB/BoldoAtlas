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
import { RUTA_BIENVENIDA, esVistaCerrable } from "@/app/estructura";
import { i18n } from "@/i18n";
import { baseActual } from "@/lib/baseActiva";
import { nuevoId } from "@/lib/ids";
import { guardarPreferencia, leerPreferencia } from "@/lib/preferencias";
import { useOrganizacion, type Resultado } from "@/stores/organizacion";
import { useOrganizaciones, type Motivo } from "@/stores/organizaciones";
import * as P from "./pestanas";

/** Id del área central (el panel de las pestañas): recibe el foco si al cerrar una pestaña no queda barra. */
export const ID_AREA = "area-central";
export const idPestana = (id: string) => `pestana-${id}`;

/**
 * Pestañas de trabajo del proyecto abierto (spec §7). La ruta de la pestaña activa es la del router: navegar dentro de
 * ella la actualiza; cambiar de pestaña navega a la ruta de la otra (con replace: la historia sigue siendo de la vista).
 * Solo la activa está montada (App.vue usa su id como key de la vista); cada vista guarda su estado al desmontarse
 * (`useEstadoPestana`). Se recuerdan por copia de la app: cada una sabe de qué organización es.
 */
export const usePestanas = defineStore("pestanas", () => {
  const t = i18n.global.t;
  const modelo = ref<P.Pestanas>(P.unaPestana(nuevoId(), baseActual()));
  let router: Router | null = null;
  let clave: string | null = null;
  /** false mientras se ve la Bienvenida (fuera del proyecto): al volver se recargan y validan sus pestañas. */
  let enProyecto = false;
  /** Pestaña que pasa a activa cuando llegue la navegación a su ruta: así la vista vieja no se remonta con otra key. */
  let destino: { id: string; ruta: string } | null = null;
  /** Acerca de abierto con el enlace de Inicio: «Cerrar» vuelve allí. No se guarda: solo vale para esta visita. */
  let vueltaAInicio = false;
  /** Pestaña a la que va un cambio de organización aún en curso: lo siguiente cuenta desde ella y pasa por la misma cola. */
  let pedida: string | null = null;
  let ultimoPedido = 0;
  /** false mientras `modelo` sea el inicial: desde Inicio se puede llegar aquí sin `entrar`, y guardarlo pisaría la clave. */
  let cargadas = false;

  const lista = computed(() => modelo.value.lista);
  const activa = computed(() => modelo.value.activa);
  // sync: el estado que una vista guarda al cerrar la ventana alcanza a escribirse.
  watch(modelo, (m) => clave && guardarPreferencia(clave, m), { flush: "sync" });

  /** Para otra organización solo mira la vista: sus unidades y personas no están cargadas. */
  function valida(ruta: string, org = baseActual()): boolean {
    if (!router) return false;
    const datos = useOrganizacion();
    const r = router.resolve(ruta);
    return P.rutaValida(
      { nombre: r.name, query: org === baseActual() ? r.query : {} },
      {
        // también lo que existe en la fecha que se está viendo: desde ahí se abren pestañas
        unidad: (id) => datos.porId.has(id) || datos.enFecha.porId.has(id),
        persona: (id) => [...datos.trabajadores, ...datos.enFecha.trabajadores].some((x) => x.id === id),
      },
    );
  }

  /** Ya cargada su organización: lo que nombra su ruta se puede comprobar. Si no existe, vuelve al inicio. */
  function validarActivada(id: string) {
    const p = modelo.value.lista.find((x) => x.id === id);
    if (!p) return;
    if (!valida(p.ruta))
      modelo.value = P.cambiar(modelo.value, id, {
        ruta: P.RUTA_INICIO,
        volver: undefined,
        estado: undefined,
      });
    else if (p.volver && !valida(p.volver)) modelo.value = P.cambiar(modelo.value, id, { volver: undefined });
  }

  /** Siempre activa una de la organización abierta; sin ninguna, abre una en el inicio. */
  function aLaAbierta(m: P.Pestanas): P.Pestanas {
    const org = baseActual();
    // la activa puede no estar en la lista: se cerró mientras se llegaba a otra
    const de = (x?: P.Pestana) => x?.org === org;
    if (de(m.lista.find((x) => x.id === m.activa))) return m;
    const suya = m.lista.find(de);
    if (suya) return { ...m, activa: suya.id };
    const id = nuevoId();
    // Con el tope lleno de otras se pasa por una, que `leerPestanas` admite. `abrir` de otra organización avisa en vez de
    // pasarse. shortcut: al arrancar con esa de más, en una tercera sin pestañas porque la última no abrió, habría 14 y al
    // releer se recorta la última; cerrar pestañas de más si alguien llega a eso.
    return (
      P.abrir(m, id, P.RUTA_INICIO, org) ?? {
        lista: [...m.lista, { id, org, ruta: P.RUTA_INICIO }],
        activa: id,
      }
    );
  }

  function cargarGuardadas() {
    const guardadas = clave ? leerPreferencia<unknown>(clave, null) : null;
    modelo.value = aLaAbierta(P.leerPestanas(guardadas, valida, nuevoId, baseActual()));
    cargadas = true;
  }

  /** Carga las pestañas guardadas del proyecto (validadas) y devuelve la ruta de la activa. */
  function entrar(): string {
    cargarGuardadas();
    enProyecto = true;
    const p = modelo.value.lista.find((x) => x.id === modelo.value.activa)!;
    // Configuración, Ayuda y Acerca de son de paso: al entrar se llega a la vista de trabajo de la pestaña.
    return esVistaCerrable(router?.resolve(p.ruta).name) ? (p.volver ?? P.RUTA_INICIO) : p.ruta;
  }

  /** Una sola vez, al arrancar y con la base fijada: `dirDatos` identifica esta copia; `rutaBd`, su clave antigua. */
  function conectar(r: Router, dirDatos: string, rutaBd: string) {
    router = r;
    clave = `pestanas:${dirDatos}`;
    // Aquí y no en `entrar`: al arrancar solo existe `boldo.db`, y después se podría entrar con otra abierta.
    // Sin validar, para no descartar nada; la clave antigua no se borra.
    if (leerPreferencia<unknown>(clave, null) === null) {
      const antigua = leerPreferencia<unknown>(`pestanas:${rutaBd}`, null);
      if (antigua !== null)
        guardarPreferencia(
          clave,
          P.leerPestanas(antigua, () => true, nuevoId, baseActual()),
        );
    }
    // Con una pestaña sin abrir a la vista, ir a otra vista (la barra lateral, el menú, la bandeja) no se vería: esta misma
    // navegación pasa a ser la de una pestaña nueva de la abierta (ver `destino`).
    r.beforeEach((to) => {
      if (!enProyecto || destino || to.meta.sinMarco || !useOrganizaciones().sinAbrir.has(activa.value))
        return;
      const nueva = agregarNueva(to.fullPath);
      if (!nueva.ok) {
        toast.warning(nueva.mensaje);
        return false;
      }
      destino = { id: nueva.id!, ruta: to.fullPath };
    });
    r.afterEach((to, from, fallo) => {
      if (fallo) {
        // Cancelada por otra navegación más nueva (p. ej. un segundo Ctrl+Tab antes de cargar la vista): el cambio de
        // pestaña pendiente, si lo hay, es el de esa otra y lo resuelve su llegada.
        if (!isNavigationFailure(fallo, NavigationFailureType.cancelled)) destino = null;
        return;
      }
      if (!esVistaCerrable(to.name) || destino) vueltaAInicio = false;
      if (from.name === "bienvenida" && to.name === "acerca") vueltaAInicio = true;
      if (to.meta.sinMarco) return void (enProyecto = false);
      const cambios: Partial<P.Pestana> = { ruta: to.fullPath };
      if (!enProyecto) {
        // De vuelta de la Bienvenida: la pestaña que ya muestra ese destino; si no hay, la activa pasa a mostrarlo. Una
        // vista cerrable (Configuración desde la bandeja) no le quita su lugar: «Cerrar» vuelve a él.
        const anterior = entrar();
        const { lista, activa } = modelo.value;
        const org = baseActual();
        // con dos pestañas en la misma ruta manda la activa
        const ya =
          lista.find((p) => p.org === org && p.id === activa && p.ruta === to.fullPath) ??
          lista.find((p) => p.org === org && p.ruta === to.fullPath);
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
      // La activa aún es de otra organización (cambiando, o sin abrir): esta ruta no es suya.
      if (modelo.value.lista.find((p) => p.id === modelo.value.activa)?.org !== baseActual()) return;
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

  /** Va a la ruta de la pestaña, que debe ser de la organización abierta. */
  async function navegar(id: string) {
    const p = modelo.value.lista.find((x) => x.id === id);
    if (!p || !router) return;
    const r = router.resolve(p.ruta);
    destino = { id, ruta: r.fullPath };
    // force: dos pestañas pueden mostrar la misma ruta; igual hay que cambiar de pestaña.
    await router.replace({ path: r.path, query: r.query, hash: r.hash, force: true });
  }

  /** Cambia de organización para activar la pestaña. `pedida` se borra al terminar, salga bien o mal, si nadie pidió otra. */
  async function cambiarHacia(id: string): Promise<Resultado> {
    pedida = id;
    const este = ++ultimoPedido;
    const r = await useOrganizaciones().activarPestana(id);
    if (este === ultimoPedido) pedida = null;
    return r;
  }

  async function ir(id: string, siempre = enLaBarra()) {
    const p = modelo.value.lista.find((x) => x.id === id);
    if (!p || !router) return;
    const organizaciones = useOrganizaciones();
    // Con un cambio en curso también pasa por la cola: `baseActual()` aún no dice dónde se va a terminar. Con motivo, reintenta.
    if (p.org !== baseActual() || organizaciones.enCurso || organizaciones.sinAbrir.has(id)) {
      const r = await cambiarHacia(id);
      if (!r.ok && r.mensaje) toast.error(r.mensaje);
      // La cerrada seguía como activa hasta llegar a su vecina, y no se llegó. Con otro cambio en curso, lo resuelve él.
      if (!r.ok && !organizaciones.enCurso && !modelo.value.lista.some((x) => x.id === activa.value)) {
        modelo.value = aLaAbierta(modelo.value);
        await navegar(modelo.value.activa);
      }
    } else {
      validarActivada(id); // una pestaña reasignada conserva ids de la organización que ya no está
      await navegar(id);
    }
    await enfocar(siempre);
  }

  function activar(id: string): Resultado {
    // Se compara con adónde se va, no con la activa de ahora. Un `abrir` o `eliminar` en curso o en espera no dice adónde: a la cola.
    const organizaciones = useOrganizaciones();
    const sinSaberAdonde = organizaciones.enCurso && (!pedida || organizaciones.hayEspera());
    if (sinSaberAdonde || id !== (pedida ?? destino?.id ?? activa.value)) void ir(id);
    return { ok: true };
  }

  /** Una pestaña nueva de la abierta, sin activarla: se activa al llegar (ver `destino`). */
  function agregarNueva(ruta: string): Resultado {
    // Sus datos no cargaron: la pestaña nueva se vería vacía, y parecería que se perdieron.
    const motivo = useOrganizaciones().sinAbrir.get(activa.value);
    if (motivo?.codigo === "fallo") return { ok: false, mensaje: motivo.mensaje };
    const id = nuevoId();
    const m = P.abrir(modelo.value, id, ruta, baseActual());
    if (!m) return { ok: false, mensaje: t("pestanas.limite", { n: P.MAX_PESTANAS }) };
    modelo.value = { ...m, activa: modelo.value.activa };
    return { ok: true, id };
  }

  /** Abre `destino` en una pestaña nueva, a la derecha de la activa, y la activa. */
  function abrirNueva(destino: RouteLocationRaw): Resultado {
    if (!router) return { ok: false, mensaje: t("pestanas.noAbre") };
    const r = router.resolve(destino);
    if (!r.matched.length || r.meta.sinMarco) return { ok: false, mensaje: t("pestanas.noAbre") };
    const nueva = agregarNueva(r.fullPath);
    if (nueva.ok) void ir(nueva.id!);
    return nueva;
  }

  /** La vecina es de otra organización: primero el cambio, y la pestaña se quita solo si salió bien. */
  async function cerrarCambiando(id: string, vecina: string) {
    const r = await cambiarHacia(vecina);
    if (!r.ok && !r.mensaje) return; // cancelado o reemplazado por otro pedido: no se cambió, y sigue en la lista
    const motivo = useOrganizaciones().sinAbrir.get(vecina);
    if (r.ok && !motivo) {
      if (activa.value !== id) modelo.value = P.cerrar(modelo.value, id);
    } else {
      // el motivo queda en la vecina, para cuando se vaya a ella
      modelo.value = { ...modelo.value, activa: id };
      const mensaje = r.ok ? motivo?.mensaje : r.mensaje;
      if (mensaje) toast.error(mensaje);
    }
    await enfocar(true);
  }

  /** La activa muestra un motivo: no monta nada ni tiene por qué cambiar de base, así que se quita y queda una de la abierta. */
  function cerrarSinAbrir(id: string, motivo: Motivo): Resultado {
    const m = aLaAbierta({ ...modelo.value, lista: modelo.value.lista.filter((x) => x.id !== id) });
    if (motivo.codigo === "fallo") {
      // Sus datos no cargaron: la que queda se vería vacía. Lleva el motivo, y se va a Inicio, desde donde se puede abrir otra.
      useOrganizaciones().sinAbrir.set(m.activa, motivo);
      modelo.value = m;
      void router?.replace(RUTA_BIENVENIDA);
      return { ok: true };
    }
    // La cerrada sigue como activa (sin estar en la lista) hasta llegar a la ruta de la nueva.
    modelo.value = { ...m, activa: modelo.value.activa };
    void ir(m.activa, true);
    return { ok: true };
  }

  function cerrar(id: string): Resultado {
    const motivo = useOrganizaciones().sinAbrir.get(id);
    if (motivo && id === activa.value) return cerrarSinAbrir(id, motivo);
    if (modelo.value.lista.length <= 1) return { ok: false, mensaje: t("pestanas.ultima") };
    const m = P.cerrar(modelo.value, id);
    if (m === modelo.value) return { ok: false, mensaje: t("pestanas.noAbre") };
    const nueva = m.lista.find((x) => x.id === m.activa)!;
    if (id === activa.value && nueva.org !== baseActual()) {
      void cerrarCambiando(id, nueva.id);
      return { ok: true };
    }
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
    /** Si la ruta sigue llevando a algo que existe (una vista del proyecto; una unidad o persona no eliminada). */
    valida,
    activar,
    abrirNueva,
    cerrar,
    /** Ctrl+Tab (1) y Ctrl+Mayús+Tab (-1); con un cambio aún en curso, cuenta desde la pestaña a la que se va. */
    siguiente: (paso: 1 | -1) =>
      activar(P.vecina({ ...modelo.value, activa: pedida ?? destino?.id ?? modelo.value.activa }, paso)),
    /** Las guardadas, si aún no se leyeron: lo que sigue parte de ellas y no de la pestaña inicial. */
    asegurarCargadas() {
      if (!cargadas) cargarGuardadas();
    },
    navegar,
    /** Tras eliminar la organización abierta. */
    async irAInicio() {
      await router?.replace(RUTA_BIENVENIDA);
    },
    existe: (id: string) => modelo.value.lista.some((x) => x.id === id),
    /** La pestaña a la que llega un cambio; si se cerró mientras tanto, una de la abierta, o una nueva en su inicio. */
    pestanaDeLlegada(id: string): string {
      if (modelo.value.lista.some((x) => x.id === id)) return id;
      modelo.value = aLaAbierta(modelo.value);
      return modelo.value.activa;
    },
    /** Activa sin navegar: la pestaña de una organización que no abrió, que muestra el motivo, o la del cambio en curso. */
    marcarActiva(id: string) {
      modelo.value = { ...modelo.value, activa: id };
    },
    validarActivada,
    /** Viendo Inicio, las pestañas no están a la vista. */
    enInicio: () => !enProyecto,
    /** Otro archivo tomó el lugar de `de`: sus pestañas pasan a él. */
    reasignar(de: string, a: string) {
      modelo.value = {
        ...modelo.value,
        lista: modelo.value.lista.map((p) => (p.org === de ? { ...p, org: a } : p)),
      };
    },
    /** Una pestaña nueva de `org` en el inicio, sin activarla. null con el tope lleno. */
    agregarDe(org: string): string | null {
      const id = nuevoId();
      const m = P.abrir(modelo.value, id, P.RUTA_INICIO, org);
      if (!m) return null;
      modelo.value = { ...m, activa: modelo.value.activa };
      return id;
    },
    /** La quita sin más: es la que `agregarDe` dejó para un cambio que no ocurrió, y nunca la activa. */
    quitar(id: string) {
      modelo.value = { ...modelo.value, lista: modelo.value.lista.filter((p) => p.id !== id) };
    },
    /** Sus pestañas se cierran solas: la organización ya no existe. */
    cerrarDeOrganizacion(org: string) {
      const antes = modelo.value.activa;
      modelo.value = P.sinOrganizacion(modelo.value, org, nuevoId, baseActual());
      // directo: corre dentro de `eliminar`, y la nueva activa ya es de la abierta
      if (enProyecto && modelo.value.activa !== antes)
        void navegar(modelo.value.activa).then(() => enfocar(true));
    },
    /** «Cerrar» en Configuración, Ayuda o Acerca de: a la ruta de esta pestaña desde la que se abrió, o al inicio. */
    async cerrarVista() {
      const p = modelo.value.lista.find((x) => x.id === modelo.value.activa);
      await router?.replace(vueltaAInicio ? RUTA_BIENVENIDA : (p?.volver ?? P.RUTA_INICIO));
    },
    mover(id: string, posicion: number): Resultado {
      modelo.value = P.mover(modelo.value, id, posicion);
      return { ok: true };
    },
    guardarEstado(id: string, ruta: string, datos: unknown) {
      modelo.value = P.cambiar(modelo.value, id, { estado: { ruta, datos } });
    },
    estadoDe: (id: string, ruta: string) => P.estadoDe(modelo.value, id, ruta),
    /**
     * Título automático: el nombre del subárbol o la persona, o el de la vista. Sigue a los cambios de nombre.
     * De otra organización, solo el de la vista: sus ids no significan nada en los datos de la abierta.
     */
    titulo(p: { ruta: string; org?: string }): string {
      const org = useOrganizacion();
      const r = router?.resolve(p.ruta);
      const deLaAbierta = p.org === undefined || p.org === baseActual();
      const q = (k: string) => (deLaAbierta && typeof r?.query[k] === "string" ? (r.query[k] as string) : "");
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
