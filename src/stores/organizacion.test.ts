import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { abrirBasePrueba, type BasePrueba } from "@/db/prueba/sqlite";
import * as U from "@/db/repos/unidades";
import { useOrganizacion } from "./organizacion";

// antesDeLote / antesDeMeta: ganchos de los tests para pausar una llamada y forzar solapes.
const h = vi.hoisted(() => ({
  bd: null as BasePrueba | null,
  antesDeLote: null as (() => Promise<void>) | null,
  antesDeMeta: null as (() => Promise<void>) | null,
}));

// El store corre SQL real sobre el esquema real (node:sqlite) detrás de la API de cliente.ts.
vi.mock("@/db/cliente", () => ({
  consultar: async (sql: string, params?: unknown[]) => h.bd!.consultar(sql, params),
  lote: async (s: Parameters<BasePrueba["aplicar"]>[0]) => {
    await h.antesDeLote?.();
    h.bd!.aplicar(s);
  },
  leerMeta: async () => {
    await h.antesDeMeta?.();
    return Object.fromEntries(
      h
        .bd!.consultar<{ clave: string; valor: string | null }>("SELECT clave, valor FROM meta")
        .map((f) => [f.clave, f.valor ?? ""]),
    );
  },
}));

const revision = () =>
  Number(h.bd!.consultar<{ valor: string }>("SELECT valor FROM meta WHERE clave = 'data_revision'")[0].valor);

function nuevo() {
  setActivePinia(createPinia());
  return useOrganizacion();
}

/** Crea una unidad y devuelve su id (falla el test si no se pudo). */
async function unidad(s: ReturnType<typeof nuevo>, nombre: string, parent_id: string | null = null) {
  const r = await s.crearUnidad({ tipo: "area", nombre, parent_id });
  if (!r.ok || !r.id) throw new Error("no se creó la unidad");
  return r.id;
}

async function persona(
  s: ReturnType<typeof nuevo>,
  unidad_id: string,
  nombre: string,
  correo: string | null = null,
) {
  const r = await s.crearTrabajador({ unidad_id, nombre, correo });
  if (!r.ok || !r.id) throw new Error("no se creó la persona");
  return r.id;
}

beforeEach(() => {
  h.bd = abrirBasePrueba();
  h.antesDeLote = null;
  h.antesDeMeta = null;
});
afterEach(() => vi.useRealTimers());

describe("unidades", () => {
  it("crea una raíz y una hija", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const r = await s.crearUnidad({ tipo: "area", nombre: "Hija", parent_id: raiz });
    expect(r.ok).toBe(true);
    expect(s.unidades).toHaveLength(2);
    expect(s.raices.map((u) => u.id)).toEqual([raiz]);
    expect(s.vacia).toBe(false);
  });

  it("rechaza mover una unidad dentro de su propia rama sin escribir", async () => {
    const s = nuevo();
    const padre = await unidad(s, "Padre");
    const hija = await unidad(s, "Hija", padre);
    const antes = revision();
    const r = await s.moverUnidad(padre, hija);
    expect(r).toEqual({ ok: false, mensaje: "No se puede mover una unidad dentro de su propia rama." });
    expect(revision()).toBe(antes);
  });

  it("al eliminar deja hijos y personas en el superior, y deshacer los devuelve", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    const media = await unidad(s, "Media", raiz);
    const hija = await unidad(s, "Hija", media);
    const ana = await persona(s, media, "Ana");

    expect((await s.eliminarUnidad(media)).ok).toBe(true);
    expect(s.porId.has(media)).toBe(false);
    expect(s.porId.get(hija)?.parent_id).toBe(raiz);
    expect(s.trabajadores.find((t) => t.id === ana)?.unidad_id).toBe(raiz);
    expect(s.ultimoBorrado).toMatchObject({ tipo: "unidad", id: media });

    expect((await s.deshacer()).ok).toBe(true);
    expect(s.porId.get(media)).toBeDefined();
    expect(s.porId.get(hija)?.parent_id).toBe(media);
    expect(s.trabajadores.find((t) => t.id === ana)?.unidad_id).toBe(media);
    expect(s.ultimoBorrado).toBeNull();
  });

  it("rechaza eliminar una raíz con contenido antes de escribir", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    await unidad(s, "Hija", raiz);
    const antes = revision();
    const r = await s.eliminarUnidad(raiz);
    expect(r).toEqual({
      ok: false,
      mensaje: "No se puede eliminar la unidad raíz mientras tenga contenido.",
    });
    expect(revision()).toBe(antes);
    expect(s.unidades).toHaveLength(2);
  });

  it("rechaza eliminar una raíz que solo tiene personas", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    await persona(s, raiz, "Ana");
    expect((await s.eliminarUnidad(raiz)).ok).toBe(false);
  });

  it("permite eliminar una raíz vacía y queda vacía la organización", async () => {
    const s = nuevo();
    const raiz = await unidad(s, "Raíz");
    expect((await s.eliminarUnidad(raiz)).ok).toBe(true);
    expect(s.vacia).toBe(true);
  });
});

describe("trabajadores", () => {
  it("traduce el error de correo repetido y deja el store intacto", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    await persona(s, u, "Ana", "ana@x.cl");
    const r = await s.crearTrabajador({ unidad_id: u, nombre: "Otra", correo: " ANA@x.cl " });
    expect(r).toEqual({ ok: false, mensaje: "Ya existe una persona con ese correo." });
    expect(s.trabajadores).toHaveLength(1);
    expect(s.error).toBe("Ya existe una persona con ese correo.");
  });

  it("deshacer no hace nada una vez vencido", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const ana = await persona(s, u, "Ana");
    vi.useFakeTimers({ toFake: ["Date"] });
    await s.eliminarTrabajador(ana);
    expect(s.trabajadores).toHaveLength(0);
    const antes = revision();
    vi.setSystemTime(Date.now() + 8_001);
    const r = await s.deshacer();
    expect(r.ok).toBe(false);
    expect(revision()).toBe(antes);
    expect(s.trabajadores).toHaveLength(0);
  });

  it("deshacer informa si el correo se reutilizó mientras estaba borrado", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    const ana = await persona(s, u, "Ana", "ana@x.cl");
    await s.eliminarTrabajador(ana);
    await persona(s, u, "Ana bis", "ana@x.cl");
    const r = await s.deshacer();
    expect(r).toEqual({ ok: false, mensaje: "Ya existe una persona con ese correo." });
    expect(s.trabajadores).toHaveLength(1);
  });
});

describe("cargarEjemplo", () => {
  it("crea una organización de muestra en un solo lote", async () => {
    const s = nuevo();
    const antes = revision();
    const r = await s.cargarEjemplo();
    expect(r).toEqual({ ok: true });
    expect(revision()).toBe(antes + 1);
    expect(s.unidades.length).toBeGreaterThanOrEqual(10);
    expect(s.conexiones.length).toBeGreaterThanOrEqual(1);
    expect(s.trabajadores.some((t) => t.estado === "vacante")).toBe(true);
    expect(s.etiquetas.length).toBeGreaterThanOrEqual(3);
    for (const tabla of ["cargos", "tipos_contrato", "sedes", "jornadas"] as const)
      expect(s.activos(tabla).length).toBeGreaterThan(0);
    expect(s.org.nombre).toBe("Compañía Demo");
    expect(s.unidades.some((u) => u.jefe_id)).toBe(true);
  });
});

describe("mantenedores", () => {
  it("no crea un valor activo repetido y devuelve el existente", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista de compras");
    if (!a.ok) throw new Error("no se creó");
    const antes = revision();
    const r = await s.crearValor("cargos", "analista  de Compras");
    expect(r).toEqual({
      ok: false,
      mensaje: "Ya existe «Analista de compras» en la lista.",
      existente: a.id,
    });
    expect(revision()).toBe(antes);
  });

  it("crea uno nuevo si el existente está desactivado", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista de compras");
    if (!a.ok) throw new Error("no se creó");
    await s.desactivarValor("cargos", a.id);
    const r = await s.crearValor("cargos", "analista  de Compras");
    expect(r.ok).toBe(true);
    expect(s.activos("cargos")).toHaveLength(1);
    expect(s.catalogos.cargos).toHaveLength(2);
  });

  it("un cargo desactivado en uso se conserva en la ficha y sigue contando", async () => {
    const s = nuevo();
    const cargo = await s.crearValor("cargos", "Analista");
    if (!cargo.ok) throw new Error("no se creó");
    const u = await unidad(s, "Raíz");
    const r = await s.crearTrabajador({ unidad_id: u, nombre: "Ana", cargo_id: cargo.id });
    if (!r.ok) throw new Error("no se creó");
    await s.desactivarValor("cargos", cargo.id);
    expect(s.trabajadores[0].cargo_id).toBe(cargo.id);
    expect(s.activos("cargos").map((v) => v.id)).not.toContain(cargo.id);
    expect(s.usos("cargos", cargo.id)).toBe(1);
  });

  it("activos ordena por orden y luego por nombre", async () => {
    const s = nuevo();
    const b = await s.crearValor("sedes", "Sur");
    const a = await s.crearValor("sedes", "Norte");
    if (!a.ok || !b.ok) throw new Error("no se creó");
    expect(s.activos("sedes").map((v) => v.nombre)).toEqual(["Sur", "Norte"]);
    await s.moverValor("sedes", a.id, 0);
    await s.moverValor("sedes", b.id, 0);
    expect(s.activos("sedes").map((v) => v.nombre)).toEqual(["Norte", "Sur"]);
  });
});

describe("organización, etiquetas y conexiones", () => {
  it("guarda el nombre y el logo de la organización", async () => {
    const s = nuevo();
    expect((await s.guardarOrg("Acme", "data:image/png;base64,AAAA")).ok).toBe(true);
    expect(s.org).toEqual({ nombre: "Acme", logo: "data:image/png;base64,AAAA" });
    await s.guardarOrg("Acme", null);
    expect(s.org.logo).toBeNull();
  });

  it("etiqueta y quita etiquetas, crea y elimina conexiones", async () => {
    const s = nuevo();
    const a = await unidad(s, "A");
    const b = await unidad(s, "B");
    const e = await s.crearEtiqueta("Crítica", "#c2410c");
    if (!e.ok || !e.id) throw new Error("no se creó");
    await s.etiquetar(a, e.id);
    expect(s.unidadEtiquetas).toEqual([{ unidad_id: a, etiqueta_id: e.id }]);
    await s.quitarEtiqueta(a, e.id);
    expect(s.unidadEtiquetas).toHaveLength(0);
    const c = await s.crearConexion(a, b, "Apoyo");
    if (!c.ok || !c.id) throw new Error("no se creó");
    expect(s.conexiones).toHaveLength(1);
    await s.eliminarConexion(c.id);
    expect(s.conexiones).toHaveLength(0);
  });
});

describe("concurrencia", () => {
  it("guardando sigue activo hasta que terminan todas las escrituras superpuestas", async () => {
    const s = nuevo();
    const liberar: (() => void)[] = [];
    h.antesDeLote = () => new Promise<void>((resolver) => liberar.push(resolver));
    const p1 = s.crearUnidad({ tipo: "area", nombre: "A", parent_id: null });
    const p2 = s.crearUnidad({ tipo: "area", nombre: "B", parent_id: null });
    expect(s.guardando).toBe(true);
    liberar[0]();
    await p1;
    expect(s.guardando).toBe(true);
    liberar[1]();
    await p2;
    expect(s.guardando).toBe(false);
  });

  it("una recarga lenta no pisa el resultado de una más reciente", async () => {
    const s = nuevo();
    let liberar!: () => void;
    h.antesDeMeta = () => {
      h.antesDeMeta = null;
      return new Promise<void>((resolver) => (liberar = resolver));
    };
    const vieja = s.cargar(); // foto sin unidades, queda pausada
    h.bd!.aplicar(U.crearUnidad({ tipo: "area", nombre: "Nueva", parent_id: null }).sentencias);
    await s.cargar(); // foto con la unidad
    expect(s.unidades).toHaveLength(1);
    liberar();
    await vieja;
    expect(s.unidades).toHaveLength(1);
  });
});

describe("errores", () => {
  it("el siguiente éxito limpia el error de un rechazo previo", async () => {
    const s = nuevo();
    const padre = await unidad(s, "Padre");
    const hija = await unidad(s, "Hija", padre);
    await s.moverUnidad(padre, hija);
    expect(s.error).not.toBeNull();
    expect((await s.crearUnidad({ tipo: "area", nombre: "Otra", parent_id: null })).ok).toBe(true);
    expect(s.error).toBeNull();
  });

  it("el siguiente éxito limpia el error de una escritura fallida", async () => {
    const s = nuevo();
    const u = await unidad(s, "Raíz");
    await persona(s, u, "Ana", "ana@x.cl");
    await s.crearTrabajador({ unidad_id: u, nombre: "Otra", correo: "ana@x.cl" });
    expect(s.error).not.toBeNull();
    expect((await s.cargar()).ok).toBe(true);
    expect(s.error).toBeNull();
  });
});

describe("nombre vacío en mantenedores", () => {
  it("crearValor y renombrarValor piden un nombre sin escribir", async () => {
    const s = nuevo();
    const a = await s.crearValor("cargos", "Analista");
    if (!a.ok) throw new Error("no se creó");
    const antes = revision();
    const esperado = { ok: false, mensaje: "Escribe un nombre." };
    expect(await s.crearValor("cargos", "")).toEqual(esperado);
    expect(await s.crearValor("cargos", "   ")).toEqual(esperado);
    expect(await s.renombrarValor("cargos", a.id, " ")).toEqual(esperado);
    expect(revision()).toBe(antes);
    expect(s.catalogos.cargos[0].nombre).toBe("Analista");
    expect(s.error).toBe("Escribe un nombre.");
  });
});
