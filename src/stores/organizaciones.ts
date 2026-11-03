import { computed, nextTick, ref, watch } from "vue";
import { defineStore } from "pinia";
import { toast } from "vue-sonner";
import { soltarYEsperarEscrituras } from "@/app/ventana";
import {
  abrirOrganizacion,
  agregarArchivoOrganizacion,
  colaVacia,
  colorOrganizacion,
  confirmarArchivoOrganizacion,
  crearOrganizacionNueva,
  eliminarOrganizacion,
  infoApp,
  listarOrganizaciones,
  quitarOrganizacion,
  sincronizarOrganizacion,
  type ArchivoAgregado,
  type Organizacion,
} from "@/db/cliente";
import { MAX_PESTANAS } from "@/features/pestanas/pestanas";
import { usePestanas } from "@/features/pestanas/usePestanas";
import {
  falloOrganizacion,
  mensajeFallo,
  mensajeOrganizacion,
  respaldoAutomatico,
} from "@/features/respaldos/respaldos";
import type { OpcionesEliminar } from "@/features/organizaciones/eliminar";
import { useFicha } from "@/features/trabajadores/useFicha";
import { i18n } from "@/i18n";
import { BaseCambiada, baseActual, fijarBase, marcarCambio, soltarDatos } from "@/lib/baseActiva";
import { borrarPreferenciasOrg } from "@/lib/preferencias";
import { trabajos } from "@/lib/trabajos";
import { useOrganizacion, type Resultado } from "./organizacion";

const MAX_RECIENTES = 8;
// Decisión 3: por estos la pestaña se activa y muestra el motivo; por lo demás se queda en la actual, con un aviso.
const DEL_ARCHIVO = new Set([
  "no_encontrado",
  "esquema_nuevo",
  "contenido_invalido",
  "danado",
  "otro_id",
  "abierta_en_otra_copia",
  "desconocido",
  "migracion",
  "muy_pesado",
]);

const campo = (e: unknown, nombre: string): string =>
  typeof e === "object" && e !== null && nombre in e ? String(e[nombre as keyof typeof e]) : "";

const CANCELADO: Resultado = { ok: false, mensaje: "" };

/** Por qué una pestaña no pudo abrir o cargar su organización. */
export interface Motivo {
  codigo: string;
  mensaje: string;
  detalle: string;
}

/**
 * La lista de organizaciones y el cambio entre ellas, el único camino que cambia de base en TS. Sus acciones devuelven
 * `Resultado` y no lanzan. Nada de la organización anterior sigue vivo después: el orden está en `cambiarA`.
 */
export const useOrganizaciones = defineStore("organizaciones", () => {
  const { t } = i18n.global;
  const org = useOrganizacion();
  const lista = ref<Organizacion[]>([]);
  const recientes = computed(() =>
    [...lista.value].sort((a, b) => b.abierta.localeCompare(a.abierta)).slice(0, MAX_RECIENTES),
  );
  const cambiando = ref(false);
  /** Rust dijo `lista_protegida`: hasta reiniciar no se puede cambiar. Lo anota quien lo recibe, y sobrevive a la vista. */
  const listaProtegida = ref(false);
  /** Por id: lo que pidió el último eliminar que falló a medias. Lo anota el diálogo, y sobrevive a la vista que se remonta. */
  const intentosEliminar = ref(new Map<string, OpcionesEliminar>());
  /** Por id de pestaña: por qué no se pudo abrir o cargar su organización. */
  const sinAbrir = ref(new Map<string, Motivo>());
  /** Las organizaciones ya abiertas en esta sesión: con la frecuencia «al abrir», solo la primera vez respalda. */
  const yaAbiertas = new Set([baseActual()]);

  watch(
    () => org.org.nombre,
    () => {
      // un cambio ya deja la lista al día: aquí solo un nombre editado
      if (cambiando.value) return;
      sincronizarOrganizacion()
        .then(cargarLista)
        .catch((e: unknown) => {
          if (!(e instanceof BaseCambiada)) console.error(e);
        });
    },
  );

  let cargaLista = 0;
  async function cargarLista(): Promise<Resultado> {
    const esta = ++cargaLista;
    try {
      const l = await listarOrganizaciones();
      if (esta === cargaLista) lista.value = l;
      return { ok: true };
    } catch (e) {
      return { ok: false, mensaje: mensajeOrganizacion(e) };
    }
  }

  // Un solo cambio a la vez: otro que llegue espera y, de los que esperan, vale el último (Ctrl+Tab rápido).
  const enCurso = ref(false);
  let espera: { pedido: () => Promise<Resultado>; listo: (r: Resultado) => void } | null = null;
  async function enOrden(pedido: () => Promise<Resultado>): Promise<Resultado> {
    if (enCurso.value)
      return new Promise((listo) => {
        espera?.listo(CANCELADO); // uno más nuevo lo reemplazó: este no se hizo
        espera = { pedido, listo };
      });
    enCurso.value = true;
    const r = await pedido().catch((e: unknown) => ({ ok: false as const, mensaje: mensajeOrganizacion(e) }));
    enCurso.value = false;
    const siguiente = espera;
    espera = null;
    if (siguiente) void enOrden(siguiente.pedido).then(siguiente.listo);
    return r;
  }

  /** Pasos 1 y 2. Si la ficha sigue en edición, no hay mensaje: ya se le preguntó a quien lo pidió. */
  async function sePuedeSoltar(): Promise<Resultado> {
    if (!(await useFicha().puedeSoltar())) return CANCELADO;
    await soltarYEsperarEscrituras();
    return trabajos.value.length
      ? { ok: false, mensaje: mensajeFallo({ codigo: "trabajo_en_curso", detalle: "" }) }
      : { ok: true };
  }

  /** Paso 3: la vista se desmonta y guarda su estado. Lo que escriba al irse también sale antes de cambiar. */
  async function desmontar() {
    await colaVacia();
    marcarCambio(true);
    cambiando.value = true;
    await nextTick();
    await colaVacia();
  }

  const volverSinCambio = () => {
    marcarCambio(false);
    cambiando.value = false;
  };

  /** Pasos 5 y 6, con la base que dejó abierta Rust. `pestana` null es volver a Inicio. */
  async function entrarEn(id: string, pedida: string | null, inicio: number) {
    const pestanas = usePestanas();
    fijarBase(id);
    marcarCambio(false);
    soltarDatos();
    try {
      const r = await org.cargar();
      if (!pedida) {
        await pestanas.irAInicio();
        if (!r.ok) {
          // Inicio no lo muestra: se avisa ahora, y al volver la pestaña lleva el motivo en vez de verse vacía
          sinAbrir.value.set(pestanas.pestanaDeLlegada(null), {
            codigo: "fallo",
            mensaje: r.mensaje,
            detalle: r.mensaje,
          });
          if (r.mensaje) toast.error(r.mensaje);
        }
      } else {
        const pestana = pestanas.pestanaDeLlegada(pedida);
        pestanas.marcarActiva(pestana);
        if (r.ok) {
          sinAbrir.value.delete(pestana);
          // Sus datos ya cargaron: tampoco vale para las otras pestañas de esta organización.
          for (const [otra, m] of sinAbrir.value)
            if (m.codigo === "fallo" && pestanas.lista.find((x) => x.id === otra)?.org === id)
              sinAbrir.value.delete(otra);
          pestanas.validarActivada(pestana);
          await pestanas.navegar(pestana);
        } else {
          sinAbrir.value.set(pestana, { codigo: "fallo", mensaje: r.mensaje, detalle: r.mensaje });
          if (pestanas.enInicio()) await pestanas.navegar(pestana); // la base ya cambió: que se vea el motivo
        }
      }
      performance.measure("cambio-organizacion", { start: inicio });
      // De paso hacia otra pedida (Ctrl+Tab rápido) no respalda: como trabajo en curso, impediría llegar a ella.
      if (r.ok && !espera) {
        void respaldoAutomatico(!yaAbiertas.has(id));
        yaAbiertas.add(id);
      }
    } finally {
      cambiando.value = false;
    }
    void cargarLista();
  }

  async function cambiarA(id: string, pestana: string): Promise<Resultado> {
    const listo = await sePuedeSoltar();
    if (!listo.ok) return listo;
    const inicio = performance.now();
    await desmontar();
    let o;
    try {
      o = await abrirOrganizacion(id);
    } catch (e) {
      volverSinCambio();
      const mensaje = mensajeOrganizacion(e);
      const codigo = campo(e, "codigo");
      const pestanas = usePestanas();
      // si la pestaña se cerró mientras tanto, o se pidió desde Inicio, no hay dónde mostrar el motivo: lo avisa quien pidió
      if (!DEL_ARCHIVO.has(codigo) || !pestanas.existe(pestana) || pestanas.enInicio())
        return { ok: false, mensaje };
      sinAbrir.value.set(pestana, { codigo, mensaje, detalle: campo(e, "detalle") });
      pestanas.marcarActiva(pestana);
      return { ok: true };
    }
    await entrarEn(o.id, pestana, inicio);
    return { ok: true };
  }

  /** La pestaña de otra organización, por su id: cambia a su organización y la activa. */
  const activarPestana = (id: string): Promise<Resultado> =>
    enOrden(async () => {
      const p = usePestanas().lista.find((x) => x.id === id);
      return p ? cambiarA(p.org, id) : { ok: true }; // se cerró mientras esperaba
    });

  /** Activa una pestaña de la organización; sin ninguna, abre una en su inicio. Con el tope lleno no cambia de base. */
  const abrir = (id: string): Promise<Resultado> =>
    enOrden(async () => {
      const pestanas = usePestanas();
      pestanas.asegurarCargadas();
      const suya =
        pestanas.lista.find((p) => p.org === id && p.id === pestanas.activa) ??
        pestanas.lista.find((p) => p.org === id);
      if (suya) return cambiarA(id, suya.id);
      const nueva = pestanas.agregarDe(id);
      if (!nueva) return { ok: false, mensaje: t("pestanas.limite", { n: MAX_PESTANAS }) };
      const r = await cambiarA(id, nueva);
      if (!r.ok) pestanas.quitar(nueva);
      return r;
    });

  async function crearYAbrir(
    tipo: "vacia" | "ejemplo",
    datos?: { nombre: string; nombreRaiz: string },
  ): Promise<Resultado> {
    const pestanas = usePestanas();
    pestanas.asegurarCargadas();
    if (pestanas.lista.length >= MAX_PESTANAS)
      return { ok: false, mensaje: t("pestanas.limite", { n: MAX_PESTANAS }) };
    const listo = await sePuedeSoltar();
    if (!listo.ok) return listo;
    try {
      // sobre un `boldo.db` vacío abierto el id no cambia: un lote en cola entraría en la nueva
      await colaVacia();
      return await abrir(await crearOrganizacionNueva(org.sentenciasNueva(tipo, datos), tipo === "ejemplo"));
    } catch (e) {
      return { ok: false, mensaje: mensajeOrganizacion(e) };
    }
  }

  // Dos clics en «Explorar el ejemplo» crearían dos.
  let creando: Promise<Resultado> | null = null;
  /** Un archivo nuevo, y lo abre. No toca la base abierta ni pide respaldo. */
  function crear(
    tipo: "vacia" | "ejemplo",
    datos?: { nombre: string; nombreRaiz: string },
  ): Promise<Resultado> {
    if (tipo === "vacia" && (!datos?.nombre.trim() || !datos.nombreRaiz.trim()))
      return Promise.resolve({ ok: false, mensaje: t("store.nombreVacio") });
    return (creando ??= crearYAbrir(tipo, datos).finally(() => (creando = null)));
  }

  async function buscarOCrearEjemplo(): Promise<Resultado> {
    const r = await cargarLista();
    if (!r.ok) return r;
    const ya = lista.value.find((o) => o.ejemplo);
    return ya ? abrir(ya.id) : crear("ejemplo");
  }

  // Toda la acción, no solo el crear: un segundo clic decidiría con una lista pedida antes de que exista el ejemplo.
  let explorando: Promise<Resultado> | null = null;
  const explorarEjemplo = (): Promise<Resultado> =>
    (explorando ??= buscarOCrearEjemplo().finally(() => (explorando = null)));

  /** Solo la saca de la lista: sus pestañas dicen que ya no está. */
  async function quitar(id: string): Promise<Resultado> {
    try {
      await quitarOrganizacion(id);
      await cargarLista();
      return { ok: true };
    } catch (e) {
      return falloOrganizacion(e);
    }
  }

  async function cambiarColor(id: string, color: string): Promise<Resultado> {
    try {
      await colorOrganizacion(id, color);
      await cargarLista();
      return { ok: true };
    } catch (e) {
      return falloOrganizacion(e);
    }
  }

  /** Rust pudo dejar otra abierta antes de fallar, al borrar: la interfaz la sigue. Sin ninguna, la pantalla de error. */
  async function seguirARust(inicio: number) {
    try {
      const info = await infoApp();
      if (info.error) return location.reload();
      if (info.baseId !== baseActual()) return await entrarEn(info.baseId, null, inicio);
    } catch (e) {
      console.error(e);
    }
    volverSinCambio();
  }

  const eliminar = (
    id: string,
    opciones: { guardarCopia: boolean; borrarArchivo: boolean },
  ): Promise<Resultado> =>
    enOrden(async () => {
      const pestanas = usePestanas();
      pestanas.asegurarCargadas();
      const esLaAbierta = id === baseActual();
      let inicio = 0;
      if (esLaAbierta) {
        const listo = await sePuedeSoltar();
        if (!listo.ok) return listo;
        inicio = performance.now();
        await desmontar();
      }
      let otra: Organizacion | null;
      try {
        otra = await eliminarOrganizacion(id, opciones.guardarCopia, opciones.borrarArchivo);
      } catch (e) {
        if (esLaAbierta) await seguirARust(inicio);
        return falloOrganizacion(e);
      }
      // Ya se borró: lo que falle al entrar no es un fallo de eliminar, y sus pestañas no tienen a qué volver.
      if (otra) await entrarEn(otra.id, null, inicio).catch((e: unknown) => console.error(e));
      pestanas.cerrarDeOrganizacion(id);
      borrarPreferenciasOrg(id);
      void cargarLista();
      return { ok: true };
    });

  /** Pide un archivo y lo abre. Las preguntas y los avisos los muestra quien llama. Sin elegir, o con un no, no cambia nada. */
  async function agregarArchivo(
    confirmar: (pregunta: NonNullable<ArchivoAgregado["pide"]>) => Promise<boolean>,
    buscando?: string,
  ): Promise<Resultado & { avisos?: string[] }> {
    try {
      let r = await agregarArchivoOrganizacion(buscando);
      while (r?.pide) r = await confirmarArchivoOrganizacion(await confirmar(r.pide));
      if (!r?.id) return { ok: true };
      // Con otros datos, Rust saca la buscada de la lista y este archivo toma su lugar; una copia no: lo dice la lista. Vale
      // aunque `abrir` no llegue a abrirlo: en la lista ya no está. Sin poder leerla, las pestañas no se mueven.
      if (buscando && r.id !== buscando) {
        const ahora = await listarOrganizaciones().catch(() => null);
        if (ahora && !ahora.some((o) => o.id === buscando)) {
          const pestanas = usePestanas();
          pestanas.asegurarCargadas();
          pestanas.reasignar(buscando, r.id);
        }
        void cargarLista();
      }
      return { ...(await abrir(r.id)), avisos: r.avisos };
    } catch (e) {
      return { ok: false, mensaje: mensajeOrganizacion(e) };
    }
  }

  return {
    lista,
    recientes,
    cambiando,
    listaProtegida,
    intentosEliminar,
    enCurso,
    /** Si otro pedido espera su turno: lo que se pida ahora lo reemplaza. */
    hayEspera: () => espera !== null,
    sinAbrir,
    cargarLista,
    abrir,
    activarPestana,
    crear,
    explorarEjemplo,
    quitar,
    eliminar,
    cambiarColor,
    agregarArchivo,
  };
});
