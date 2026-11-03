import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, ref, watch } from "vue";
import { createMemoryHistory, createRouter, type Router } from "vue-router";
import { enCambio, baseActual, fijarBase, marcarCambio, soltarDatos, alSoltarDatos } from "@/lib/baseActiva";
import { trabajos } from "@/lib/trabajos";
import { recordarPorArbol, useVista } from "@/features/arbol/useVista";
import { MAX_PESTANAS } from "@/features/pestanas/pestanas";
import { usePestanas } from "@/features/pestanas/usePestanas";
import { useFicha } from "@/features/trabajadores/useFicha";
import { datosProyectoAbierto } from "@/features/proyecto/menuApp";
import { usePuesto } from "@/features/puestos/usePuesto";
import { useOrganizacion } from "./organizacion";
import { useOrganizaciones } from "./organizaciones";

const c = vi.hoisted(() => ({
  abrirOrganizacion: vi.fn(),
  agregarArchivoOrganizacion: vi.fn(),
  colaVacia: vi.fn(),
  colorOrganizacion: vi.fn(),
  confirmarArchivoOrganizacion: vi.fn(),
  consultar: vi.fn(),
  crearOrganizacionNueva: vi.fn(),
  eliminarOrganizacion: vi.fn(),
  infoApp: vi.fn(),
  leerMeta: vi.fn(),
  listarOrganizaciones: vi.fn(),
  listarRespaldos: vi.fn(),
  lote: vi.fn(),
  quitarOrganizacion: vi.fn(),
  respaldarAhora: vi.fn(),
  sincronizarOrganizacion: vi.fn(),
}));
vi.mock("@/db/cliente", () => c);
const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn() }));
vi.mock("vue-sonner", () => ({ toast }));

const vacio = { render: () => null };
const CLAVE = "boldo:pestanas:C:/datos";
let datos: Map<string, string>;
let router: Router;

const fallo = (codigo: string, detalle = "x") => ({ codigo, detalle });
const esperar = () => vi.waitFor(() => expect(useOrganizaciones().cambiando).toBe(false));
const pendiente = <T>() => {
  let resolver!: (v: T) => void;
  let rechazar!: (e: unknown) => void;
  const promesa = new Promise<T>((res, rej) => ((resolver = res), (rechazar = rej)));
  return { promesa, resolver, rechazar };
};

beforeEach(() => {
  datos = new Map();
  vi.stubGlobal("localStorage", {
    get length() {
      return datos.size;
    },
    key: (i: number) => [...datos.keys()][i] ?? null,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => datos.set(k, v),
    removeItem: (k: string) => datos.delete(k),
  });
  vi.stubGlobal("document", { activeElement: null, body: {}, getElementById: () => null });
  vi.stubGlobal("HTMLElement", class {});
  fijarBase("A");
  marcarCambio(false);
  setActivePinia(createPinia());
  trabajos.value = [];
  useFicha().registrarSoltar(async () => true);
  for (const f of Object.values(c)) f.mockReset();
  toast.error.mockReset();
  toast.warning.mockReset();
  c.abrirOrganizacion.mockImplementation(async (id: string) => ({ id }));
  c.colaVacia.mockResolvedValue(undefined);
  c.consultar.mockResolvedValue([]);
  c.leerMeta.mockResolvedValue({});
  c.listarOrganizaciones.mockResolvedValue([]);
  c.listarRespaldos.mockResolvedValue([]);
  c.respaldarAhora.mockResolvedValue("x");
  c.sincronizarOrganizacion.mockResolvedValue(undefined);
  c.infoApp.mockResolvedValue({ baseId: "A", error: null });
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", name: "arbol", component: vacio },
      { path: "/directorio", name: "directorio", component: vacio },
      { path: "/revision", name: "revision", component: vacio },
      { path: "/configuracion", name: "configuracion", component: vacio },
      { path: "/bienvenida", name: "bienvenida", component: vacio, meta: { sinMarco: true } },
    ],
  });
});
afterEach(async () => {
  await new Promise((res) => setTimeout(res)); // lo que quede en camino, como el foco tras cerrar, con `document` aún puesto
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const TRES = {
  lista: [
    { id: "a1", org: "A", ruta: "/" },
    { id: "b1", org: "B", ruta: "/directorio" },
    { id: "c1", org: "C", ruta: "/revision" },
  ],
  activa: "a1",
};

async function arrancar(guardado: unknown = TRES) {
  if (guardado) datos.set(CLAVE, JSON.stringify(guardado));
  const p = usePestanas();
  p.conectar(router, "C:/datos", "C:/datos/boldo.db");
  await router.replace(p.entrar());
  return { p, o: useOrganizaciones() };
}
const ids = () => usePestanas().lista.map((x) => x.id);

describe("el cambio, en orden", () => {
  it("espera la cola de lotes antes de abrir", async () => {
    const { o } = await arrancar();
    const orden: string[] = [];
    c.colaVacia.mockImplementation(async () => void orden.push("colaVacia"));
    c.abrirOrganizacion.mockImplementation(async (id: string) => (orden.push("abrir"), { id }));
    await o.activarPestana("b1");
    expect(orden[0]).toBe("colaVacia");
    expect(orden.indexOf("abrir")).toBeGreaterThan(0);
  });

  it("lo que escribe la vista al desmontarse sale antes de abrir", async () => {
    const { o } = await arrancar();
    const orden: string[] = [];
    watch(
      () => o.cambiando,
      (v) => v && orden.push("desmonta"),
    );
    c.colaVacia.mockImplementation(async () => void orden.push("colaVacia"));
    c.abrirOrganizacion.mockImplementation(async (id: string) => (orden.push("abrir"), { id }));
    await o.activarPestana("b1");
    expect(orden).toEqual(["colaVacia", "desmonta", "colaVacia", "abrir"]);
  });

  it("con un trabajo en curso avisa y no cambia", async () => {
    const { o } = await arrancar();
    trabajos.value = ["Respaldo"];
    const r = await o.activarPestana("b1");
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/trabajo/i) });
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
    expect(baseActual()).toBe("A");
  });

  it("la ficha con cambios y Cancelar no cambia", async () => {
    const { o } = await arrancar();
    useFicha().registrarSoltar(async () => false);
    const r = await o.activarPestana("b1");
    expect(r).toEqual({ ok: false, mensaje: "" });
    expect(c.colaVacia).not.toHaveBeenCalled();
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
  });

  it("espera lo que se está guardando, hasta 2 s", async () => {
    const { o } = await arrancar();
    const fin = pendiente<void>();
    c.lote.mockReturnValue(fin.promesa);
    await useOrganizacion().cargar();
    void useOrganizacion().guardarOrg("x", null);
    const r = o.activarPestana("b1");
    await new Promise((res) => setTimeout(res, 60));
    expect(c.colaVacia).not.toHaveBeenCalled();
    fin.resolver();
    await r;
    expect(c.abrirOrganizacion).toHaveBeenCalled();
  });

  it.each(["no_encontrado", "desconocido", "migracion"])(
    "un error del archivo (%s) muestra el motivo en la pestaña y no cambia la base",
    async (codigo) => {
      const { p, o } = await arrancar();
      c.abrirOrganizacion.mockRejectedValue(fallo(codigo));
      const r = await o.activarPestana("b1");
      expect(r).toEqual({ ok: true });
      expect(o.sinAbrir.get("b1")).toMatchObject({ codigo, mensaje: expect.any(String) });
      expect(o.sinAbrir.get("b1")!.mensaje).not.toBe("");
      expect(p.activa).toBe("b1");
      expect(baseActual()).toBe("A");
      expect(enCambio()).toBe(false);
      expect(o.cambiando).toBe(false);
    },
  );

  it.each(["trabajo_en_curso", "lista_protegida"])(
    "un error pasajero (%s) se queda en la pestaña actual",
    async (codigo) => {
      const { p, o } = await arrancar();
      c.abrirOrganizacion.mockRejectedValue(fallo(codigo));
      const r = await o.activarPestana("b1");
      expect(r).toMatchObject({ ok: false, mensaje: expect.any(String) });
      expect(o.sinAbrir.size).toBe(0);
      expect(p.activa).toBe("a1");
      expect(baseActual()).toBe("A");
      expect(c.consultar).not.toHaveBeenCalled();
    },
  );

  it("al abrir: fijarBase, luego soltarDatos, luego org.cargar", async () => {
    const { o } = await arrancar();
    const orden: string[] = [];
    alSoltarDatos(() => orden.push(`soltar en ${baseActual()}`));
    c.consultar.mockImplementation(async () => (orden.push(`cargar en ${baseActual()}`), []));
    await o.activarPestana("b1");
    expect(orden[0]).toBe("soltar en B");
    expect(orden[1]).toBe("cargar en B");
    expect(baseActual()).toBe("B");
  });

  it("soltarDatos cierra ficha y puesto, y vacía el store", async () => {
    const { o } = await arrancar();
    useFicha().abrir("persona-de-A");
    usePuesto().abrir("puesto-de-A");
    datosProyectoAbierto.value = true;
    useOrganizacion().unidades = [{ id: "u", nombre: "de A", parent_id: null }] as never;
    useOrganizacion().org = { nombre: "A", logo: null };
    const carga = pendiente<never[]>();
    c.consultar.mockReturnValue(carga.promesa);
    const r = o.activarPestana("b1");
    await vi.waitFor(() => expect(baseActual()).toBe("B"));
    expect(useFicha().abierta.value).toBeNull();
    expect(usePuesto().abierta.value).toBeNull();
    expect(datosProyectoAbierto.value).toBe(false);
    expect(useOrganizacion().unidades).toEqual([]);
    expect(useOrganizacion().org.nombre).toBe("");
    carga.resolver([]);
    await r;
  });

  it("si org.cargar falla tras cambiar, sinAbrir lleva su mensaje", async () => {
    const { p, o } = await arrancar();
    c.consultar.mockRejectedValue("no such table: unidades");
    const r = await o.activarPestana("b1");
    expect(r).toEqual({ ok: true });
    expect(o.sinAbrir.get("b1")?.mensaje).toMatch(/no such table/);
    expect(p.activa).toBe("b1");
    expect(baseActual()).toBe("B");
    expect(o.cambiando).toBe(false);
  });

  it("un cambio bien hecho borra el motivo que tenía la pestaña", async () => {
    const { o } = await arrancar();
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("no_encontrado"));
    await o.activarPestana("b1");
    expect(o.sinAbrir.has("b1")).toBe(true);
    await o.activarPestana("b1");
    expect(o.sinAbrir.has("b1")).toBe(false);
  });

  it("durante el cambio cambiando y enCambio() son true y la vista se desmonta antes de abrir; con error, ambos vuelven", async () => {
    const { o } = await arrancar();
    let visto: unknown[] = [];
    const desmontada = ref(false);
    watch(
      () => o.cambiando,
      (v) => (desmontada.value = v),
    );
    c.abrirOrganizacion.mockImplementation(async () => {
      visto = [o.cambiando, enCambio(), desmontada.value];
      throw fallo("trabajo_en_curso");
    });
    await o.activarPestana("b1");
    expect(visto).toEqual([true, true, true]);
    expect(o.cambiando).toBe(false);
    expect(enCambio()).toBe(false);
  });

  it("performance.measure recibe { start }, tomado tras el paso 2", async () => {
    const { o } = await arrancar();
    let paso = 0;
    vi.spyOn(performance, "now").mockImplementation(() => paso);
    const medida = vi.spyOn(performance, "measure").mockImplementation(() => ({}) as never);
    useFicha().registrarSoltar(async () => ((paso = 1), true));
    c.colaVacia.mockImplementation(async () => void (paso = 2));
    await o.activarPestana("b1");
    expect(medida).toHaveBeenCalledWith("cambio-organizacion", { start: 1 });
  });

  it("dos cambios seguidos terminan en el último y nunca a la vez", async () => {
    const { p, o } = await arrancar();
    let enCurso = 0;
    let maximo = 0;
    const pasos: ReturnType<typeof pendiente<void>>[] = [];
    c.abrirOrganizacion.mockImplementation(async (id: string) => {
      maximo = Math.max(maximo, ++enCurso);
      const paso = pendiente<void>();
      pasos.push(paso);
      await paso.promesa;
      enCurso--;
      return { id };
    });
    const b = o.activarPestana("b1");
    await vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1));
    const c1 = o.activarPestana("c1");
    pasos[0]!.resolver();
    await b;
    await vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(2));
    pasos[1]!.resolver();
    await c1;
    expect(maximo).toBe(1);
    expect(baseActual()).toBe("C");
    expect(p.activa).toBe("c1");
  });

  it("una organización de paso no respalda: el trabajo impediría llegar a la última", async () => {
    const { o } = await arrancar();
    const paso = pendiente<void>();
    c.abrirOrganizacion.mockImplementationOnce(async (id: string) => (await paso.promesa, { id }));
    const b = o.activarPestana("b1");
    await vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1));
    const c1 = o.activarPestana("c1");
    paso.resolver();
    await Promise.all([b, c1]);
    expect(baseActual()).toBe("C");
    await vi.waitFor(() => expect(c.respaldarAhora).toHaveBeenCalledTimes(1));
    expect(c.listarRespaldos).toHaveBeenCalledTimes(1);
  });

  it("de varios en espera solo corre el último", async () => {
    const { p, o } = await arrancar({
      lista: [...TRES.lista, { id: "d1", org: "D", ruta: "/" }],
      activa: "a1",
    });
    const paso = pendiente<void>();
    c.abrirOrganizacion.mockImplementationOnce(async (id: string) => (await paso.promesa, { id }));
    const b = o.activarPestana("b1");
    await vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1));
    const c1 = o.activarPestana("c1");
    const d1 = o.activarPestana("d1");
    expect(await c1).toEqual({ ok: false, mensaje: "" });
    paso.resolver();
    await Promise.all([b, d1]);
    expect(c.abrirOrganizacion.mock.calls.map(([id]) => id)).toEqual(["B", "D"]);
    expect(p.activa).toBe("d1");
  });

  it("volver a la organización de partida con un cambio en curso también pasa por la cola", async () => {
    const { p } = await arrancar({
      lista: [TRES.lista[0], TRES.lista[1], { id: "a2", org: "A", ruta: "/revision" }],
      activa: "a1",
    });
    const paso = pendiente<void>();
    c.abrirOrganizacion.mockImplementationOnce(async (id: string) => (await paso.promesa, { id }));
    p.siguiente(1);
    await vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1));
    p.siguiente(1); // a2, que es de A: mientras tanto, baseActual() sigue siendo A
    paso.resolver();
    await vi.waitFor(() => expect(p.activa).toBe("a2"));
    await esperar();
    expect(baseActual()).toBe("A");
    expect(router.currentRoute.value.fullPath).toBe("/revision");
  });
});

describe("el último pedido gana", () => {
  const DOS = { lista: [TRES.lista[0], TRES.lista[1]], activa: "a1" };

  function abrirConPausa() {
    const paso = pendiente<void>();
    c.abrirOrganizacion.mockImplementationOnce(async (id: string) => (await paso.promesa, { id }));
    return paso;
  }
  const abiertas = () => c.abrirOrganizacion.mock.calls.map(([id]) => id);
  const unaAbriendose = () => vi.waitFor(() => expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1));

  it("A→B→A con dos pestañas termina en A", async () => {
    const { p } = await arrancar(DOS);
    const paso = abrirConPausa();
    p.siguiente(1);
    await unaAbriendose();
    p.siguiente(1);
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await vi.waitFor(() => expect(baseActual()).toBe("A"));
    await esperar();
    expect(p.activa).toBe("a1");
  });

  it("un clic en la pestaña de partida mientras se abre otra vuelve a ella", async () => {
    const { p } = await arrancar(DOS);
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.activar("a1");
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await esperar();
    expect(p.activa).toBe("a1");
    expect(baseActual()).toBe("A");
  });

  it("A→B→C en espera→a1 termina en A, sin pasar por C", async () => {
    const { p } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.activar("c1");
    p.activar("a1");
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await esperar();
    expect(p.activa).toBe("a1");
    expect(baseActual()).toBe("A");
  });

  it("ir durante abrir queda en la cola", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "a2", org: "A", ruta: "/revision" }, TRES.lista[1]],
      activa: "a1",
    });
    const paso = abrirConPausa();
    const r = o.abrir("B");
    await unaAbriendose();
    p.activar("a2");
    expect(router.currentRoute.value.fullPath).toBe("/");
    paso.resolver();
    await r;
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await vi.waitFor(() => expect(p.activa).toBe("a2"));
    await esperar();
    expect(baseActual()).toBe("A");
    expect(router.currentRoute.value.fullPath).toBe("/revision");
  });

  it("un clic en la activa durante abrir también gana", async () => {
    const { p, o } = await arrancar(DOS);
    const paso = abrirConPausa();
    const r = o.abrir("B");
    await unaAbriendose();
    p.activar("a1");
    paso.resolver();
    await r;
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await esperar();
    expect(p.activa).toBe("a1");
    expect(baseActual()).toBe("A");
  });

  it("con b1 en curso y abrir(C) en espera, un clic en b1 gana y no termina en C", async () => {
    const { p, o } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    const enEspera = o.abrir("C");
    p.activar("b1");
    expect(await enEspera).toEqual({ ok: false, mensaje: "" });
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "B"]));
    await esperar();
    expect(p.activa).toBe("b1");
    expect(baseActual()).toBe("B");
  });

  it("con b1 en curso y eliminar en espera, un clic en b1 gana", async () => {
    const { p, o } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    const enEspera = o.eliminar("C", { guardarCopia: false, borrarArchivo: false });
    p.activar("b1");
    expect(await enEspera).toEqual({ ok: false, mensaje: "" });
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "B"]));
    await esperar();
    expect(p.activa).toBe("b1");
    expect(c.eliminarOrganizacion).not.toHaveBeenCalled();
  });

  it("otro clic en la que ya espera no hace perder adónde se va: Ctrl+Tab sigue contando desde ella", async () => {
    const { p } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.activar("c1");
    p.activar("c1");
    await new Promise((res) => setTimeout(res)); // el reemplazado ya respondió
    p.siguiente(1); // la vecina de c1 es a1
    paso.resolver();
    await vi.waitFor(() => expect(abiertas()).toEqual(["B", "A"]));
    await esperar();
    expect(p.activa).toBe("a1");
  });

  it("ir durante eliminar queda en la cola", async () => {
    const { p, o } = await arrancar();
    const paso = pendiente<null>();
    c.eliminarOrganizacion.mockReturnValueOnce(paso.promesa);
    const r = o.eliminar("C", { guardarCopia: false, borrarArchivo: false });
    await vi.waitFor(() => expect(c.eliminarOrganizacion).toHaveBeenCalled());
    p.activar("b1");
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
    paso.resolver(null);
    expect(await r).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.activa).toBe("b1"));
    expect(baseActual()).toBe("B");
    expect(ids()).toEqual(["a1", "b1"]);
  });

  it("al crear gana la nueva, aunque se pida otra pestaña mientras se crea", async () => {
    datos.set("boldo:respaldos", JSON.stringify("nunca"));
    const { p, o } = await arrancar();
    const creada = pendiente<string>();
    c.crearOrganizacionNueva.mockReturnValueOnce(creada.promesa);
    const r = o.crear("ejemplo");
    await vi.waitFor(() => expect(c.crearOrganizacionNueva).toHaveBeenCalled());
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    creada.resolver("N");
    await new Promise((res) => setTimeout(res)); // la nueva ya pidió abrirse
    paso.resolver();
    expect((await r).ok).toBe(true);
    expect(abiertas()).toEqual(["B", "N"]);
    expect(baseActual()).toBe("N");
    expect(p.lista.find((x) => x.id === p.activa)?.org).toBe("N");
  });

  it("un eliminar en espera y reemplazado no dice que se hizo", async () => {
    const { o } = await arrancar();
    const paso = abrirConPausa();
    const b = o.activarPestana("b1");
    await unaAbriendose();
    const quitada = o.eliminar("C", { guardarCopia: false, borrarArchivo: false });
    const a = o.activarPestana("a1");
    expect(await quitada).toEqual({ ok: false, mensaje: "" });
    paso.resolver();
    await Promise.all([b, a]);
    expect(c.eliminarOrganizacion).not.toHaveBeenCalled();
    expect(ids()).toContain("c1");
  });

  it("cerrar hacia una vecina, si otro pedido lo reemplaza, no quita la pestaña ni vuelve a ella", async () => {
    const { p } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.cerrar("a1"); // su vecina es b1, y queda en espera
    p.activar("c1");
    paso.resolver();
    await vi.waitFor(() => expect(baseActual()).toBe("C"));
    await esperar();
    expect(p.activa).toBe("c1");
    expect(ids()).toContain("a1");
  });

  it("si se cierra la pestaña mientras se cambia hacia ella, queda una de la abierta en su inicio", async () => {
    const { p } = await arrancar();
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.cerrar("b1");
    paso.resolver();
    await vi.waitFor(() => expect(baseActual()).toBe("B"));
    await esperar();
    const activa = p.lista.find((x) => x.id === p.activa);
    expect(activa).toMatchObject({ org: "B", ruta: "/" });
    expect(router.currentRoute.value.fullPath).toBe("/");
  });

  it("y si la abierta tiene otra, activa esa", async () => {
    const { p } = await arrancar({
      lista: [TRES.lista[0], TRES.lista[1], { id: "b2", org: "B", ruta: "/revision" }],
      activa: "a1",
    });
    const paso = abrirConPausa();
    p.activar("b1");
    await unaAbriendose();
    p.cerrar("b1");
    paso.resolver();
    await vi.waitFor(() => expect(baseActual()).toBe("B"));
    await esperar();
    expect(p.activa).toBe("b2");
    expect(router.currentRoute.value.fullPath).toBe("/revision");
  });

  it("si se cierra y el archivo no abre, sigue en la actual con el motivo en un aviso", async () => {
    const { p } = await arrancar();
    const paso = pendiente<void>();
    c.abrirOrganizacion.mockImplementationOnce(async () => {
      await paso.promesa;
      throw fallo("no_encontrado");
    });
    p.activar("b1");
    await unaAbriendose();
    p.cerrar("b1");
    paso.resolver();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(p.activa).toBe("a1");
    expect(baseActual()).toBe("A");
    expect(useOrganizaciones().sinAbrir.size).toBe(0);
  });
});

describe("desde las pestañas", () => {
  it("Ctrl+Tab dos veces entre organizaciones avanza dos pestañas", async () => {
    const { p } = await arrancar();
    p.siguiente(1);
    p.siguiente(1);
    await vi.waitFor(() => expect(p.activa).toBe("c1"));
    await esperar();
    expect(baseActual()).toBe("C");
    expect(c.abrirOrganizacion).not.toHaveBeenCalledWith("A");
  });

  it("activar una pestaña de otra organización avisa con toast lo que reciba", async () => {
    const { p } = await arrancar();
    c.abrirOrganizacion.mockRejectedValue(fallo("trabajo_en_curso"));
    p.activar("b1");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(p.activa).toBe("a1");
  });

  it("cerrar hacia una vecina que no se pudo abrir no deja activa la que ya no está", async () => {
    const { p, o } = await arrancar({
      lista: [
        { id: "a1", org: "A", ruta: "/" },
        { id: "a2", org: "A", ruta: "/revision" },
      ],
      activa: "a1",
    });
    o.sinAbrir.set("a2", { codigo: "no_encontrado", mensaje: "m", detalle: "" }); // al ir a ella, reintenta
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("sin_espacio"));
    p.cerrar("a1");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
    await vi.waitFor(() => expect(p.activa).toBe("a2"));
    await esperar();
    expect(ids()).toEqual(["a2"]);
    expect(router.currentRoute.value.fullPath).toBe("/revision");
  });

  describe("una pestaña sin abrir", () => {
    const motivo = (codigo = "no_encontrado") => ({ codigo, mensaje: "m", detalle: "" });
    const TRES_CON_MOTIVO = {
      lista: [
        { id: "a1", org: "A", ruta: "/revision" },
        { id: "z1", org: "Z", ruta: "/" },
        { id: "y1", org: "Y", ruta: "/" },
      ],
      activa: "a1",
    };

    it("«Cerrar pestaña» cierra aunque la vecina tampoco abra, y sin cambiar de base", async () => {
      const { p, o } = await arrancar(TRES_CON_MOTIVO);
      p.marcarActiva("z1");
      o.sinAbrir.set("z1", motivo());
      c.abrirOrganizacion.mockRejectedValue(fallo("no_encontrado"));
      expect(p.cerrar("z1")).toEqual({ ok: true });
      await vi.waitFor(() => expect(p.activa).toBe("a1"));
      expect(ids()).toEqual(["a1", "y1"]);
      expect(c.abrirOrganizacion).not.toHaveBeenCalled();
      expect(router.currentRoute.value.fullPath).toBe("/revision");
    });

    it("cerrar otra pestaña con motivo no toca la activa", async () => {
      const { p, o } = await arrancar(TRES_CON_MOTIVO);
      o.sinAbrir.set("z1", motivo());
      p.cerrar("z1");
      await esperar();
      expect(p.activa).toBe("a1");
      expect(ids()).toEqual(["a1", "y1"]);
    });

    it("navegar con ella a la vista abre la ruta en una pestaña nueva de la abierta", async () => {
      const { p, o } = await arrancar(TRES_CON_MOTIVO);
      p.marcarActiva("z1");
      o.sinAbrir.set("z1", motivo());
      await router.push("/directorio");
      const nueva = p.lista.find((x) => x.ruta === "/directorio")!;
      expect(p.activa).toBe(nueva.id);
      expect(nueva.org).toBe("A");
      expect(p.lista.find((x) => x.id === "z1")?.ruta).toBe("/");
    });

    it("con el tope lleno, avisa y no navega", async () => {
      const { p, o } = await arrancar({
        lista: Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `t${i}`, org: "A", ruta: "/" })),
        activa: "t0",
      });
      o.sinAbrir.set("t0", motivo());
      await router.push("/directorio");
      expect(toast.warning).toHaveBeenCalled();
      expect(p.lista).toHaveLength(MAX_PESTANAS);
      expect(router.currentRoute.value.fullPath).toBe("/");
    });

    it("si no cargaron sus datos, no se abre otra pestaña vacía de esa organización", async () => {
      const { p, o } = await arrancar();
      c.consultar.mockRejectedValue("no such table: unidades");
      await o.activarPestana("b1");
      const antes = ids();
      expect(p.abrirNueva("/revision").ok).toBe(false);
      await router.push("/revision");
      expect(ids()).toEqual(antes);
      expect(router.currentRoute.value.fullPath).toBe("/");
      expect(toast.warning).toHaveBeenCalled();
    });

    it("si no cargaron sus datos, cerrarla no va a Inicio y el motivo sigue en la que queda", async () => {
      const { p, o } = await arrancar();
      c.consultar.mockRejectedValue("no such table: unidades");
      await o.activarPestana("b1");
      const ruta = router.currentRoute.value.fullPath;
      expect(p.cerrar("b1")).toEqual({ ok: true });
      await esperar();
      expect(router.currentRoute.value.fullPath).toBe(ruta);
      expect(ids()).not.toContain("b1");
      expect(p.lista.find((x) => x.id === p.activa)?.org).toBe("B");
      expect(o.sinAbrir.get(p.activa)?.codigo).toBe("fallo");
    });

    describe("con sus datos sin cargar y otra pestaña de la misma organización", () => {
      const CON_B2 = {
        lista: [
          { id: "a1", org: "A", ruta: "/" },
          { id: "b1", org: "B", ruta: "/revision" },
          { id: "b2", org: "B", ruta: "/directorio?persona=pB" },
        ],
        activa: "a1",
      };

      it("ir a la otra reintenta: ni árbol vacío ni rutas borradas", async () => {
        const { p, o } = await arrancar(CON_B2);
        c.consultar.mockRejectedValue("no such table: unidades");
        await o.activarPestana("b1");
        c.abrirOrganizacion.mockClear();
        p.activar("b2");
        await vi.waitFor(() => expect(o.sinAbrir.has("b2")).toBe(true));
        expect(c.abrirOrganizacion).toHaveBeenCalledWith("B");
        expect(p.activa).toBe("b2");
        expect(p.lista.find((x) => x.id === "b2")?.ruta).toBe("/directorio?persona=pB");
      });

      it("si ahora cargan, ninguna pestaña de esa organización sigue con ese motivo", async () => {
        const { p, o } = await arrancar(CON_B2);
        c.consultar.mockRejectedValueOnce("no such table: unidades");
        await o.activarPestana("b1");
        c.consultar.mockResolvedValue([]);
        p.activar("b2");
        await vi.waitFor(() => expect(o.sinAbrir.size).toBe(0));
      });

      it("«Reintentar» vuelve a pedir la misma organización y recarga", async () => {
        const { p, o } = await arrancar(CON_B2);
        c.consultar.mockRejectedValueOnce("no such table: unidades");
        await o.activarPestana("b1");
        c.abrirOrganizacion.mockClear();
        c.consultar.mockResolvedValue([]);
        expect(await o.activarPestana("b1")).toEqual({ ok: true });
        expect(c.abrirOrganizacion).toHaveBeenCalledWith("B");
        expect(o.sinAbrir.has("b1")).toBe(false);
        expect(useOrganizacion().cargado).toBe(true);
        expect(p.activa).toBe("b1");
      });

      it("volver de Inicio no descarta pestañas por ids que no se pueden comprobar, ni pierde el motivo", async () => {
        const { p, o } = await arrancar(CON_B2);
        await router.replace("/bienvenida");
        c.consultar.mockRejectedValue("no such table: unidades");
        expect((await o.abrir("B")).ok).toBe(true);
        await vi.waitFor(() => expect(router.currentRoute.value.path).not.toBe("/bienvenida"));
        await esperar();
        expect(ids()).toContain("b2");
        expect(p.lista.find((x) => x.id === "b2")?.ruta).toBe("/directorio?persona=pB");
        expect(o.sinAbrir.has(p.activa)).toBe(true);
      });
    });
  });

  it("una pestaña reasignada se queda en su vista, sin los ids ni el estado de la que ya no está", async () => {
    const { p } = await arrancar({
      lista: [
        { id: "a1", org: "A", ruta: "/revision" },
        { id: "z1", org: "Z", ruta: "/directorio?persona=pZ", volver: "/?ver=uZ" },
      ],
      activa: "a1",
    });
    p.guardarEstado("z1", "/directorio?persona=pZ", { algo: 1 });
    p.reasignar("Z", "A");
    expect(p.lista.find((x) => x.id === "z1")).toEqual({ id: "z1", org: "A", ruta: "/directorio" });
    p.activar("z1");
    await vi.waitFor(() => expect(p.activa).toBe("z1"));
    expect(router.currentRoute.value.fullPath).toBe("/directorio");
  });

  it("la única pestaña, sin abrir, se cierra y queda una de la abierta en su inicio", async () => {
    const { p, o } = await arrancar({ lista: [{ id: "z1", org: "Z", ruta: "/revision" }], activa: "z1" });
    const deA = p.activa; // al entrar con A abierta se abrió una suya
    p.marcarActiva("z1");
    p.cerrar(deA);
    o.sinAbrir.set("z1", { codigo: "no_encontrado", mensaje: "m", detalle: "" });
    expect(p.lista.map((x) => x.id)).toEqual(["z1"]);
    expect(p.cerrar("z1")).toEqual({ ok: true });
    await vi.waitFor(() => expect(p.activa).not.toBe("z1"));
    expect(p.lista).toHaveLength(1);
    expect(p.lista[0]).toMatchObject({ org: "A", ruta: "/" });
    expect(p.activa).toBe(p.lista[0]!.id);
  });

  it("la única pestaña de la abierta, sin motivo, no se cierra", async () => {
    const { p } = await arrancar({ lista: [TRES.lista[0]], activa: "a1" });
    expect(p.cerrar("a1").ok).toBe(false);
  });

  it("cerrar la última pestaña de la abierta: si el cambio sale bien, se quita", async () => {
    const { p } = await arrancar({ lista: [TRES.lista[0], TRES.lista[1]], activa: "a1" });
    p.cerrar("a1");
    await vi.waitFor(() => expect(ids()).toEqual(["b1"]));
    expect(p.activa).toBe("b1");
    expect(baseActual()).toBe("B");
  });

  it.each(["trabajo_en_curso", "no_encontrado"])(
    "cerrar la última pestaña de la abierta hacia otra organización: si el cambio falla (%s), sigue en la lista y activa",
    async (codigo) => {
      const { p } = await arrancar({ lista: [TRES.lista[0], TRES.lista[1]], activa: "a1" });
      c.abrirOrganizacion.mockRejectedValue(fallo(codigo));
      p.cerrar("a1");
      await vi.waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(ids()).toEqual(["a1", "b1"]);
      expect(p.activa).toBe("a1");
      expect(baseActual()).toBe("A");
    },
  );

  it("cerrar hacia una vecina de la misma organización no cambia de base", async () => {
    const { p } = await arrancar({
      lista: [TRES.lista[0], { id: "a2", org: "A", ruta: "/revision" }, TRES.lista[1]],
      activa: "a1",
    });
    p.cerrar("a1");
    await vi.waitFor(() => expect(p.activa).toBe("a2"));
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
  });

  it("con la activa de otra organización, navegar no anota rutas en ella", async () => {
    const { p, o } = await arrancar();
    c.abrirOrganizacion.mockRejectedValue(fallo("no_encontrado"));
    await o.activarPestana("b1");
    await router.push("/revision");
    expect(p.lista.find((x) => x.id === "b1")?.ruta).toBe("/directorio");
    p.activar("a1");
    await vi.waitFor(() => expect(p.activa).toBe("a1"));
    expect(c.abrirOrganizacion).toHaveBeenCalledTimes(1);
  });

  it("la ruta que no existe en la organización abierta vuelve a /", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "b1", org: "B", ruta: "/?raiz=borrada", volver: "/?raiz=borrada" }],
      activa: "a1",
    });
    await o.activarPestana("b1");
    const b1 = p.lista.find((x) => x.id === "b1")!;
    expect(b1.ruta).toBe("/");
    expect(b1.volver).toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe("/");
  });
});

describe("abrir", () => {
  it("una pestaña de la otra organización se activa y, sin ninguna, se abre una nueva", async () => {
    const { p, o } = await arrancar();
    await o.abrir("B");
    expect(p.activa).toBe("b1");
    expect(ids()).toEqual(["a1", "b1", "c1"]);
    await o.abrir("Z");
    expect(ids()).toHaveLength(4);
    const nueva = p.lista.find((x) => x.org === "Z")!;
    expect(p.activa).toBe(nueva.id);
    expect(nueva.ruta).toBe("/");
    expect(baseActual()).toBe("Z");
  });

  it("con el tope de pestañas no cambia de base", async () => {
    const lista = Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `p${i}`, org: "A", ruta: "/" }));
    const { p, o } = await arrancar({ lista, activa: "p0" });
    const r = await o.abrir("B");
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringContaining(String(MAX_PESTANAS)) });
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
    expect(p.lista).toHaveLength(MAX_PESTANAS);
  });

  it("un error pasajero no deja la pestaña nueva; uno del archivo la deja con el motivo", async () => {
    const { p, o } = await arrancar();
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("trabajo_en_curso"));
    expect((await o.abrir("Z")).ok).toBe(false);
    expect(ids()).toEqual(["a1", "b1", "c1"]);
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("no_encontrado"));
    expect((await o.abrir("Z")).ok).toBe(true);
    const nueva = p.lista.find((x) => x.org === "Z")!;
    expect(o.sinAbrir.has(nueva.id)).toBe(true);
    expect(p.activa).toBe(nueva.id);
  });

  it("con dos pestañas de la organización, prefiere la activa", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], TRES.lista[1], { id: "b2", org: "B", ruta: "/revision" }],
      activa: "a1",
    });
    p.marcarActiva("b2");
    await o.abrir("B");
    expect(p.activa).toBe("b2");
  });

  it("desde Inicio, un error del archivo vuelve a quien pidió abrir y no deja pestaña", async () => {
    const { p, o } = await arrancar();
    await router.replace("/bienvenida");
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("no_encontrado"));
    const r = await o.abrir("Z");
    expect(r).toEqual({ ok: false, mensaje: expect.stringMatching(/no se encontr/i) });
    expect(ids()).toEqual(["a1", "b1", "c1"]);
    expect(p.activa).toBe("a1");
    expect(o.sinAbrir.size).toBe(0);
    expect(router.currentRoute.value.fullPath).toBe("/bienvenida");
    expect(baseActual()).toBe("A");
  });

  it("desde Inicio, si el archivo abre pero no carga, entra a su pestaña con el motivo", async () => {
    const { p, o } = await arrancar();
    await router.replace("/bienvenida");
    c.consultar.mockRejectedValueOnce(new Error("rota"));
    expect((await o.abrir("B")).ok).toBe(true);
    expect(p.activa).toBe("b1");
    expect(o.sinAbrir.has("b1")).toBe(true);
    await vi.waitFor(() => expect(router.currentRoute.value.fullPath).toBe("/directorio"));
    await esperar();
    expect(p.activa).toBe("b1");
  });

  it("desde Inicio sin un entrar previo no pisa la clave nueva", async () => {
    datos.set(CLAVE, JSON.stringify(TRES));
    const p = usePestanas();
    p.conectar(router, "C:/datos", "C:/datos/boldo.db");
    await router.replace("/bienvenida"); // como al arrancar sin «Continuar donde estaba»
    await useOrganizaciones().abrir("B");
    expect(ids()).toEqual(["a1", "b1", "c1"]);
    expect(JSON.parse(datos.get(CLAVE)!).lista).toHaveLength(3);
    expect(p.activa).toBe("b1");
    expect(router.currentRoute.value.fullPath).toBe("/directorio");
  });

  it("con la frecuencia abrir, respalda la primera vez por organización y no al volver a ella", async () => {
    datos.set("boldo:respaldos", JSON.stringify("abrir"));
    const { o } = await arrancar();
    await o.activarPestana("b1");
    await vi.waitFor(() => expect(c.respaldarAhora).toHaveBeenCalledTimes(1));
    await o.activarPestana("a1"); // la del arranque ya hizo el suyo
    await o.activarPestana("b1");
    await new Promise((res) => setTimeout(res));
    expect(c.respaldarAhora).toHaveBeenCalledTimes(1);
  });
});

describe("recientes y lista", () => {
  it("recientes ordena por abierta y corta en 8", async () => {
    const lista = Array.from({ length: 10 }, (_, i) => ({
      id: `o${i}`,
      abierta: `2026-11-0${i}T10:00:00.000Z`,
    }));
    c.listarOrganizaciones.mockResolvedValue(lista);
    const o = useOrganizaciones();
    await o.cargarLista();
    expect(o.recientes.map((x) => x.id)).toEqual(["o9", "o8", "o7", "o6", "o5", "o4", "o3", "o2"]);
  });

  it("una lista que tarda no pisa a una más nueva", async () => {
    const vieja = pendiente<unknown[]>();
    c.listarOrganizaciones.mockReturnValueOnce(vieja.promesa).mockResolvedValueOnce([{ id: "nueva" }]);
    const o = useOrganizaciones();
    const r = o.cargarLista();
    await o.cargarLista();
    vieja.resolver([{ id: "vieja" }]);
    await r;
    expect(o.lista.map((x) => x.id)).toEqual(["nueva"]);
  });

  it("cambiarColor y quitar actualizan la lista y traducen el error", async () => {
    const o = useOrganizaciones();
    c.colorOrganizacion.mockResolvedValue(undefined);
    c.listarOrganizaciones.mockResolvedValue([{ id: "x" }]);
    expect(await o.cambiarColor("x", "#112233")).toEqual({ ok: true });
    expect(o.lista).toHaveLength(1);
    c.quitarOrganizacion.mockRejectedValue(fallo("abierta"));
    const r = await o.quitar("x");
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/abierta/) });
  });

  it("renombrar la organización actualiza la lista; un cambio no", async () => {
    const { o } = await arrancar();
    useOrganizacion().org = { nombre: "Nueva", logo: null };
    await nextTick();
    expect(c.sincronizarOrganizacion).toHaveBeenCalledTimes(1);
    c.leerMeta.mockResolvedValue({ org_nombre: "De B" });
    await o.activarPestana("b1");
    await nextTick();
    expect(c.sincronizarOrganizacion).toHaveBeenCalledTimes(1);
  });
});

describe("crear", () => {
  beforeEach(() => void datos.set("boldo:respaldos", JSON.stringify("nunca")));

  it("valida el nombre sin llamar a Rust", async () => {
    const { o } = await arrancar();
    const r = await o.crear("vacia", { nombre: " ", nombreRaiz: "Raíz" });
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/nombre/i) });
    expect((await o.crear("vacia")).ok).toBe(false);
    expect(c.crearOrganizacionNueva).not.toHaveBeenCalled();
  });

  it("con datos no vacía la base", async () => {
    const { o } = await arrancar();
    const orden: string[] = [];
    c.colaVacia.mockImplementation(async () => void orden.push("colaVacia"));
    c.crearOrganizacionNueva.mockImplementation(async () => (orden.push("crear"), "N"));
    c.abrirOrganizacion.mockImplementation(async (id: string) => (orden.push(`abrir ${id}`), { id }));
    const r = await o.crear("vacia", { nombre: "Nueva", nombreRaiz: "Raíz" });
    expect(r.ok).toBe(true);
    expect(orden[0]).toBe("colaVacia");
    expect(orden.indexOf("crear")).toBeLessThan(orden.indexOf("abrir N"));
    expect(c.crearOrganizacionNueva.mock.calls[0]![1]).toBe(false);
    expect(c.lote).not.toHaveBeenCalled();
    expect(c.respaldarAhora).not.toHaveBeenCalled();
    expect(baseActual()).toBe("N");
  });

  it("sobre el boldo.db abierto, Rust no reabre pero se recarga igual", async () => {
    const { o } = await arrancar();
    c.crearOrganizacionNueva.mockResolvedValue("A");
    await o.crear("vacia", { nombre: "Nueva", nombreRaiz: "Raíz" });
    expect(c.abrirOrganizacion).toHaveBeenCalledWith("A");
    expect(c.consultar).toHaveBeenCalled();
  });

  it("un solo crear a la vez", async () => {
    const { o } = await arrancar();
    c.crearOrganizacionNueva.mockResolvedValue("N");
    const [a, b] = await Promise.all([o.crear("ejemplo"), o.crear("ejemplo")]);
    expect(a).toEqual(b);
    expect(c.crearOrganizacionNueva).toHaveBeenCalledTimes(1);
    expect(c.crearOrganizacionNueva.mock.calls[0]![1]).toBe(true);
  });

  it("con el tope de pestañas no crea nada", async () => {
    const lista = Array.from({ length: MAX_PESTANAS }, (_, i) => ({ id: `p${i}`, org: "A", ruta: "/" }));
    const { o } = await arrancar({ lista, activa: "p0" });
    const r = await o.crear("ejemplo");
    expect(r.ok).toBe(false);
    expect(c.crearOrganizacionNueva).not.toHaveBeenCalled();
  });

  it("si Rust falla, traduce el motivo y no abre", async () => {
    const { o } = await arrancar();
    c.crearOrganizacionNueva.mockRejectedValue(fallo("sin_espacio"));
    const r = await o.crear("ejemplo");
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/espacio/) });
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
  });

  it("explorarEjemplo abre el de la lista; sin él, lo crea con ejemplo: true", async () => {
    const { o } = await arrancar();
    c.listarOrganizaciones.mockResolvedValue([{ id: "B", ejemplo: true }]);
    await o.explorarEjemplo();
    expect(c.crearOrganizacionNueva).not.toHaveBeenCalled();
    expect(c.abrirOrganizacion).toHaveBeenCalledWith("B");
    c.listarOrganizaciones.mockResolvedValue([]);
    c.crearOrganizacionNueva.mockResolvedValue("N");
    await o.explorarEjemplo();
    expect(c.crearOrganizacionNueva.mock.calls[0]![1]).toBe(true);
  });

  it("dos clics en explorarEjemplo crean uno", async () => {
    const { o } = await arrancar();
    c.crearOrganizacionNueva.mockResolvedValue("N");
    await Promise.all([o.explorarEjemplo(), o.explorarEjemplo()]);
    expect(c.crearOrganizacionNueva).toHaveBeenCalledTimes(1);
  });

  it("el segundo clic no decide con la lista vieja cuando el primero ya creó el ejemplo", async () => {
    const { o } = await arrancar();
    const creada = pendiente<string>();
    const vieja = pendiente<unknown[]>();
    c.crearOrganizacionNueva.mockReturnValue(creada.promesa);
    c.listarOrganizaciones.mockResolvedValueOnce([]).mockReturnValueOnce(vieja.promesa);
    const primero = o.explorarEjemplo();
    await vi.waitFor(() => expect(c.crearOrganizacionNueva).toHaveBeenCalledTimes(1));
    const segundo = o.explorarEjemplo(); // su lista se pidió antes de que exista el ejemplo
    creada.resolver("N");
    await primero;
    vieja.resolver([]);
    await segundo;
    expect(c.crearOrganizacionNueva).toHaveBeenCalledTimes(1);
  });
});

describe("eliminar", () => {
  it("la abierta pasa por el cambio y cierra sus pestañas", async () => {
    const { p, o } = await arrancar();
    c.eliminarOrganizacion.mockResolvedValue({ id: "B" });
    const r = await o.eliminar("A", { guardarCopia: true, borrarArchivo: false });
    expect(r).toEqual({ ok: true });
    expect(c.eliminarOrganizacion).toHaveBeenCalledWith("A", true, false);
    expect(baseActual()).toBe("B");
    expect(ids()).toEqual(["b1", "c1"]);
    expect(p.activa).toBe("b1");
    expect(router.currentRoute.value.fullPath).toBe("/bienvenida");
    expect(o.cambiando).toBe(false);
  });

  it("la abierta espera la cola y desmonta la vista antes de llamar a Rust", async () => {
    const { o } = await arrancar();
    const orden: unknown[] = [];
    c.colaVacia.mockImplementation(async () => void orden.push("colaVacia"));
    c.eliminarOrganizacion.mockImplementation(async () => (orden.push(enCambio()), { id: "B" }));
    await o.eliminar("A", { guardarCopia: false, borrarArchivo: false });
    expect(orden).toEqual(["colaVacia", "colaVacia", true]);
  });

  it("de otra, las cierra sin cambiar de base", async () => {
    const { p, o } = await arrancar();
    c.eliminarOrganizacion.mockResolvedValue(null);
    expect(await o.eliminar("B", { guardarCopia: false, borrarArchivo: true })).toEqual({ ok: true });
    expect(baseActual()).toBe("A");
    expect(ids()).toEqual(["a1", "c1"]);
    expect(p.activa).toBe("a1");
    expect(c.consultar).not.toHaveBeenCalled();
  });

  it("si era la última, queda una de la abierta en /", async () => {
    const { p, o } = await arrancar({ lista: [TRES.lista[0]], activa: "a1" });
    c.eliminarOrganizacion.mockResolvedValue({ id: "B" });
    await o.eliminar("A", { guardarCopia: false, borrarArchivo: false });
    expect(p.lista).toHaveLength(1);
    expect(p.lista[0]).toMatchObject({ org: "B", ruta: "/" });
    expect(p.activa).toBe(p.lista[0]!.id);
  });

  it("borra las preferencias si salió bien; si falla, no borra ni preferencias ni pestañas", async () => {
    const { o } = await arrancar();
    datos.set("boldo:minimapa:B", "true");
    datos.set("boldo:minimapa:A", "true");
    c.eliminarOrganizacion.mockRejectedValueOnce(fallo("sin_espacio"));
    const r = await o.eliminar("B", { guardarCopia: true, borrarArchivo: false });
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/espacio/) });
    expect(datos.has("boldo:minimapa:B")).toBe(true);
    expect(ids()).toContain("b1");
    c.eliminarOrganizacion.mockResolvedValueOnce(null);
    await o.eliminar("B", { guardarCopia: true, borrarArchivo: false });
    expect(datos.has("boldo:minimapa:B")).toBe(false);
    expect(datos.has("boldo:minimapa:A")).toBe(true);
  });

  it("si la abierta falla antes de pasar a otra, sigue todo como estaba", async () => {
    const { p, o } = await arrancar();
    c.eliminarOrganizacion.mockRejectedValue(fallo("sin_espacio"));
    const r = await o.eliminar("A", { guardarCopia: true, borrarArchivo: false });
    expect(r.ok).toBe(false);
    expect(baseActual()).toBe("A");
    expect(ids()).toContain("a1");
    expect(p.activa).toBe("a1");
    expect(o.cambiando).toBe(false);
    expect(enCambio()).toBe(false);
  });

  it("si Rust ya pasó a otra y falló al borrar, la interfaz la sigue y no pierde las pestañas", async () => {
    const { o } = await arrancar();
    c.eliminarOrganizacion.mockRejectedValue(fallo("fallo", "no se pudo borrar"));
    c.infoApp.mockResolvedValue({ baseId: "B", error: null });
    const r = await o.eliminar("A", { guardarCopia: true, borrarArchivo: false });
    expect(r.ok).toBe(false);
    expect(baseActual()).toBe("B");
    expect(ids()).toContain("a1");
    expect(o.cambiando).toBe(false);
    expect(enCambio()).toBe(false);
  });

  it("si la siguiente no carga, el motivo se avisa y queda en su pestaña al volver de Inicio", async () => {
    const { p, o } = await arrancar();
    c.eliminarOrganizacion.mockResolvedValue({ id: "B" });
    c.consultar.mockRejectedValue(new Error("no se pudo leer"));
    expect(await o.eliminar("A", { guardarCopia: false, borrarArchivo: false })).toEqual({ ok: true });
    expect(router.currentRoute.value.fullPath).toBe("/bienvenida");
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no se pudo leer/));
    expect(ids()).toEqual(["b1", "c1"]);
    expect(p.activa).toBe("b1");
    expect(o.sinAbrir.get("b1")).toMatchObject({ codigo: "fallo" });
    await p.volverAlProyecto();
    expect(o.sinAbrir.has(p.activa)).toBe(true);
  });

  it("si Rust ya pasó a otra, falló al borrar y esa tampoco carga, también lo dice", async () => {
    const { p, o } = await arrancar();
    c.eliminarOrganizacion.mockRejectedValue(fallo("fallo", "no se pudo borrar"));
    c.infoApp.mockResolvedValue({ baseId: "B", error: null });
    c.consultar.mockRejectedValue(new Error("no se pudo leer"));
    expect((await o.eliminar("A", { guardarCopia: false, borrarArchivo: false })).ok).toBe(false);
    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/no se pudo leer/));
    expect(o.sinAbrir.get(p.activa)).toMatchObject({ codigo: "fallo" });
    expect(p.lista.find((x) => x.id === p.activa)?.org).toBe("B");
  });

  it("devuelve el código de Rust, para que el diálogo sepa qué ofrecer", async () => {
    const { o } = await arrancar();
    c.eliminarOrganizacion.mockRejectedValue(fallo("no_encontrado"));
    expect(await o.eliminar("B", { guardarCopia: true, borrarArchivo: false })).toMatchObject({
      ok: false,
      codigo: "no_encontrado",
    });
  });

  it("la abierta respeta a la ficha y a los trabajos en curso", async () => {
    const { o } = await arrancar();
    useFicha().registrarSoltar(async () => false);
    expect((await o.eliminar("A", { guardarCopia: true, borrarArchivo: false })).ok).toBe(false);
    useFicha().registrarSoltar(async () => true);
    trabajos.value = ["Respaldo"];
    expect((await o.eliminar("A", { guardarCopia: true, borrarArchivo: false })).ok).toBe(false);
    expect(c.eliminarOrganizacion).not.toHaveBeenCalled();
  });
});

describe("recordarPorArbol con la vista viva", () => {
  const GUARDADA = JSON.stringify({ direccion: "horizontal", verPuestos: true });

  async function conVista() {
    datos.set("boldo:vista:completo:B", GUARDADA);
    const r = await arrancar();
    const scope = effectScope();
    scope.run(() => recordarPorArbol(ref("completo")));
    await nextTick();
    return { ...r, scope };
  }

  it("abrir no pisa vista:completo:B", async () => {
    const { o, scope } = await conVista();
    await o.activarPestana("b1");
    await nextTick();
    expect(datos.get("boldo:vista:completo:B")).toBe(GUARDADA);
    scope.stop();
  });

  it("eliminar no pisa vista:completo:B", async () => {
    const { o, scope } = await conVista();
    c.eliminarOrganizacion.mockResolvedValue({ id: "B" });
    await o.eliminar("A", { guardarCopia: false, borrarArchivo: false });
    await nextTick();
    expect(datos.get("boldo:vista:completo:B")).toBe(GUARDADA);
    scope.stop();
  });

  it("usePestanas.cerrar no pisa vista:completo:B", async () => {
    const { p, scope } = await conVista();
    p.cerrar("a1"); // su vecina es de B
    await vi.waitFor(() => expect(baseActual()).toBe("B"));
    await esperar();
    await nextTick();
    expect(datos.get("boldo:vista:completo:B")).toBe(GUARDADA);
    scope.stop();
  });

  it("en la misma organización sí la recuerda", async () => {
    const { scope } = await conVista();
    const { config } = useVista();
    const antes = config.value.verPuestos;
    config.value.verPuestos = !antes;
    await nextTick();
    expect(JSON.parse(datos.get("boldo:vista:completo:A")!).verPuestos).toBe(!antes);
    scope.stop();
  });
});

describe("agregarArchivo", () => {
  it("sin elegir nada no cambia nada", async () => {
    const { o } = await arrancar();
    c.agregarArchivoOrganizacion.mockResolvedValue(null);
    expect(await o.agregarArchivo(async () => true)).toEqual({ ok: true });
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
  });

  it.each(["red", "tope", "otro_id", "journal"] as const)(
    "con pide %s llama a confirmar y, con true, sigue y abre",
    async (motivo) => {
      const { o } = await arrancar();
      c.agregarArchivoOrganizacion.mockResolvedValue({ id: null, pide: motivo, avisos: [] });
      c.confirmarArchivoOrganizacion.mockResolvedValue({ id: "B", pide: null, avisos: [] });
      const confirmar = vi.fn(async () => true);
      const r = await o.agregarArchivo(confirmar);
      expect(confirmar).toHaveBeenCalledWith(motivo);
      expect(c.confirmarArchivoOrganizacion).toHaveBeenCalledWith(true);
      expect(c.abrirOrganizacion).toHaveBeenCalledWith("B");
      expect(r.ok).toBe(true);
    },
  );

  it.each(["red", "tope"] as const)("con pide %s y false no cambia nada", async (motivo) => {
    const { o } = await arrancar();
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: null, pide: motivo, avisos: [] });
    c.confirmarArchivoOrganizacion.mockResolvedValue(null);
    const r = await o.agregarArchivo(async () => false);
    expect(c.confirmarArchivoOrganizacion).toHaveBeenCalledWith(false);
    expect(c.abrirOrganizacion).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true });
    expect(baseActual()).toBe("A");
  });

  it("pregunta hasta que Rust no pida más", async () => {
    const { o } = await arrancar();
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: null, pide: "red", avisos: [] });
    c.confirmarArchivoOrganizacion
      .mockResolvedValueOnce({ id: null, pide: "tope", avisos: [] })
      .mockResolvedValueOnce({ id: "B", pide: null, avisos: [] });
    const confirmar = vi.fn<(m: string) => Promise<boolean>>(async () => true);
    await o.agregarArchivo(confirmar, "B");
    expect(c.agregarArchivoOrganizacion).toHaveBeenCalledWith("B");
    expect(confirmar.mock.calls.map(([m]) => m)).toEqual(["red", "tope"]);
  });

  it("al buscar un archivo con otros datos, las pestañas de la buscada pasan a él", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }, { id: "z2", org: "Z", ruta: "/revision" }],
      activa: "a1",
    });
    p.marcarActiva("z2");
    o.sinAbrir.set("z2", { codigo: "no_encontrado", mensaje: "m", detalle: "" });
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: null, pide: "otro_id", avisos: [] });
    c.confirmarArchivoOrganizacion.mockResolvedValue({ id: "N", pide: null, avisos: [] });
    expect((await o.agregarArchivo(async () => true, "Z")).ok).toBe(true);
    expect(p.lista.map((x) => x.org)).toEqual(["A", "N", "N"]);
    expect(p.activa).toBe("z2");
    expect(o.sinAbrir.has("z2")).toBe(false);
    expect(baseActual()).toBe("N");
  });

  it("al buscar el mismo archivo, la pestaña activa deja de mostrar el motivo", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }, { id: "z2", org: "Z", ruta: "/revision" }],
      activa: "a1",
    });
    p.marcarActiva("z2");
    o.sinAbrir.set("z2", { codigo: "no_encontrado", mensaje: "m", detalle: "" });
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: "Z", pide: null, avisos: [] });
    await o.agregarArchivo(async () => true, "Z");
    expect(p.lista.map((x) => x.org)).toEqual(["A", "Z", "Z"]);
    expect(p.activa).toBe("z2");
    expect(o.sinAbrir.has("z2")).toBe(false);
  });

  it("una copia con el mismo id deja a la buscada en la lista: sus pestañas no se mueven", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }],
      activa: "a1",
    });
    p.marcarActiva("z1");
    o.sinAbrir.set("z1", { codigo: "contenido_invalido", mensaje: "m", detalle: "red" });
    c.listarOrganizaciones.mockResolvedValue([{ id: "Z" }, { id: "N" }]);
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: "N", pide: null, avisos: ["copia"] });
    const r = await o.agregarArchivo(async () => true, "Z");
    expect(r).toMatchObject({ ok: true, avisos: ["copia"] });
    expect(p.lista.find((x) => x.id === "z1")?.org).toBe("Z");
    expect(o.sinAbrir.has("z1")).toBe(true);
    expect(p.lista.find((x) => x.id === p.activa)?.org).toBe("N");
  });

  it("y si esa copia no abre, la pestaña de la buscada sigue como estaba", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }],
      activa: "a1",
    });
    p.marcarActiva("z1");
    o.sinAbrir.set("z1", { codigo: "contenido_invalido", mensaje: "m", detalle: "red" });
    c.listarOrganizaciones.mockResolvedValue([{ id: "Z" }, { id: "N" }]);
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: "N", pide: null, avisos: ["copia"] });
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("sin_espacio"));
    expect((await o.agregarArchivo(async () => true, "Z")).ok).toBe(false);
    expect(ids()).toEqual(["a1", "z1"]);
    expect(p.lista.find((x) => x.id === "z1")?.org).toBe("Z");
    expect(p.activa).toBe("z1");
    expect(o.sinAbrir.has("z1")).toBe(true);
  });

  it("si la buscada salió de la lista y la nueva no abre, las pestañas ya son de ella y siguen con motivo", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }],
      activa: "a1",
    });
    p.marcarActiva("z1");
    o.sinAbrir.set("z1", { codigo: "no_encontrado", mensaje: "m", detalle: "" });
    c.listarOrganizaciones.mockResolvedValue([{ id: "N" }]);
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: "N", pide: null, avisos: [] });
    c.abrirOrganizacion.mockRejectedValueOnce(fallo("sin_espacio"));
    expect((await o.agregarArchivo(async () => true, "Z")).ok).toBe(false);
    expect(p.lista.find((x) => x.id === "z1")?.org).toBe("N");
    expect(p.activa).toBe("z1");
    expect(o.sinAbrir.has("z1")).toBe(true);
    expect(baseActual()).toBe("A");
  });

  it("si la lista no se pudo leer, no mueve las pestañas", async () => {
    const { p, o } = await arrancar({
      lista: [TRES.lista[0], { id: "z1", org: "Z", ruta: "/" }],
      activa: "a1",
    });
    c.listarOrganizaciones.mockResolvedValueOnce([{ id: "Z" }]);
    await o.cargarLista();
    c.listarOrganizaciones.mockRejectedValueOnce(fallo("lista_protegida"));
    c.agregarArchivoOrganizacion.mockResolvedValue({ id: "N", pide: null, avisos: [] });
    await o.agregarArchivo(async () => true, "Z");
    expect(p.lista.find((x) => x.id === "z1")?.org).toBe("Z");
  });

  it("devuelve los avisos copia y fuera_de_portable", async () => {
    const { o } = await arrancar();
    c.agregarArchivoOrganizacion.mockResolvedValue({
      id: "B",
      pide: null,
      avisos: ["copia", "fuera_de_portable"],
    });
    const r = await o.agregarArchivo(async () => true);
    expect(r).toMatchObject({ ok: true, avisos: ["copia", "fuera_de_portable"] });
  });

  it("un error de Rust se traduce y no lanza", async () => {
    const { o } = await arrancar();
    c.agregarArchivoOrganizacion.mockRejectedValue(fallo("contenido_invalido", "journal"));
    const r = await o.agregarArchivo(async () => true);
    expect(r).toMatchObject({ ok: false, mensaje: expect.stringMatching(/diario|recuper/i) });
  });
});

describe("soltarDatos", () => {
  it("un suscriptor que lanza no impide a los demás", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const despues = vi.fn();
    alSoltarDatos(() => {
      throw new Error("sin pinia");
    });
    alSoltarDatos(despues);
    expect(() => soltarDatos()).not.toThrow();
    expect(despues).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
