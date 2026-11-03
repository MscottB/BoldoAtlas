import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { Organizacion } from "@/db/cliente";
import {
  aconsejaSinCopia,
  claveAbierta,
  claveFalloFuera,
  claveHecha,
  claveQueSeBorra,
  confirmaEliminar,
  espacioQueLibera,
  intentoTrasFallo,
  opcionesEliminar,
  pestanasDe,
  quedanAuxiliares,
  sinArchivoAlAbrir,
  textoAConfirmar,
  useConfirmacion,
} from "./eliminar";

const org = (cambios: Partial<Organizacion> = {}): Organizacion => ({
  id: "A",
  nombre: "Acme",
  color: "#3b6fb5",
  abierta: "",
  externa: false,
  ruta: "C:\\datos\\organizaciones\\A\\organizacion.db",
  existe: true,
  activa: false,
  logo: null,
  bytesBase: 100,
  bytesRespaldos: 30,
  ejemplo: false,
  ...cambios,
});

describe("confirmar con el nombre", () => {
  it("sin nombre se confirma con el texto que se muestra", () => {
    expect(textoAConfirmar({ nombre: "" }, "Sin nombre")).toBe("Sin nombre");
    expect(textoAConfirmar({ nombre: "   " }, "Sin nombre")).toBe("Sin nombre");
    expect(confirmaEliminar("Sin nombre", textoAConfirmar({ nombre: "" }, "Sin nombre"))).toBe(true);
  });

  it("muestra el mismo texto que pide, sin espacios de sobra", () => {
    expect(textoAConfirmar({ nombre: " Compañía  Ñandú " }, "Sin nombre")).toBe("Compañía Ñandú");
  });

  it("con tildes y espacios", () => {
    expect(confirmaEliminar("  Compañía  Ñandú ", "Compañía Ñandú")).toBe(true);
    expect(confirmaEliminar("compania ñandu", "Compañía Ñandú")).toBe(false);
  });

  it("la misma palabra en NFD confirma", () => {
    expect(confirmaEliminar("Ñandú".normalize("NFD"), "Ñandú")).toBe(true);
    expect(confirmaEliminar("Ñandú", "Ñandú".normalize("NFD"))).toBe(true);
  });

  it("otro nombre no confirma, y nada no confirma nada", () => {
    expect(confirmaEliminar("Otra", "Acme")).toBe(false);
    expect(confirmaEliminar("", "Acme")).toBe(false);
    expect(confirmaEliminar("", "")).toBe(false);
    expect(confirmaEliminar("  ", " ")).toBe(false);
  });
});

describe("espacioQueLibera", () => {
  it("interna: libera base y respaldos, con cualquier valor de borrarArchivo", () => {
    expect(espacioQueLibera(org(), false)).toBe(130);
    expect(espacioQueLibera(org(), true)).toBe(130);
  });

  it("externa: sin borrar el archivo libera solo los respaldos; borrándolo, también la base", () => {
    expect(espacioQueLibera(org({ externa: true }), false)).toBe(30);
    expect(espacioQueLibera(org({ externa: true }), true)).toBe(130);
  });

  it("lo que no se pudo leer no cuenta", () => {
    expect(espacioQueLibera(org({ bytesBase: Number.NaN }), false)).toBe(30);
    expect(espacioQueLibera(org({ bytesRespaldos: undefined as unknown as number }), false)).toBe(100);
  });
});

describe("pestanasDe", () => {
  it("cuenta las pestañas de la organización", () => {
    const lista = [
      { id: "1", org: "A", ruta: "/" },
      { id: "2", org: "B", ruta: "/" },
      { id: "3", org: "A", ruta: "/directorio" },
    ];
    expect(pestanasDe(lista, "A")).toBe(2);
    expect(pestanasDe(lista, "C")).toBe(0);
  });
});

describe("opcionesEliminar: lo que se le pide a Rust", () => {
  const marcadas = { copia: true, archivo: true };

  it("interna: la copia que se marque, y no hay casilla de archivo", () => {
    expect(opcionesEliminar(org(), marcadas, false)).toEqual({ guardarCopia: true, borrarArchivo: false });
    expect(opcionesEliminar(org(), { copia: false, archivo: false }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: false,
    });
  });

  it("externa: por defecto solo sale de la lista, sin leer su archivo", () => {
    expect(opcionesEliminar(org({ externa: true }), { copia: true, archivo: false }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: false,
    });
  });

  it("externa con su casilla: la borra, y entonces sí cuenta la copia", () => {
    expect(opcionesEliminar(org({ externa: true }), marcadas, false)).toEqual({
      guardarCopia: true,
      borrarArchivo: true,
    });
    expect(opcionesEliminar(org({ externa: true }), { copia: false, archivo: true }, false)).toEqual({
      guardarCopia: false,
      borrarArchivo: true,
    });
  });

  it.each([[false], [true]])(
    "sin archivo (externa: %s) nunca van las casillas: Rust daría no_encontrado",
    (externa) => {
      expect(opcionesEliminar(org({ externa }), marcadas, true)).toEqual({
        guardarCopia: false,
        borrarArchivo: false,
      });
    },
  );
});

describe("claveQueSeBorra: qué dice el diálogo", () => {
  it.each([
    ["interna", org(), false, false],
    ["principal", org({ ruta: "C:\\datos\\boldo.db" }), false, false],
    ["principal", org({ ruta: "/datos/boldo.db" }), false, false],
    ["internaSinArchivo", org(), true, false],
    ["internaSinArchivo", org({ ruta: "C:\\datos\\boldo.db" }), true, false],
    ["externa", org({ externa: true, ruta: "D:\\boldo.db" }), false, false],
    ["externaConArchivo", org({ externa: true }), false, true],
    ["externaSinArchivo", org({ externa: true }), true, false],
    ["externaSinArchivo", org({ externa: true }), true, true],
  ] as const)("%s", (clave, o, sinArchivo, borrarArchivo) => {
    expect(claveQueSeBorra(o, sinArchivo, borrarArchivo)).toBe(clave);
  });
});

describe("claveHecha: una externa sin su archivo no se dice eliminada", () => {
  it.each([
    ["hecha", org(), { guardarCopia: false, borrarArchivo: false }],
    ["hechaConCopia", org(), { guardarCopia: true, borrarArchivo: false }],
    ["salio", org({ externa: true }), { guardarCopia: false, borrarArchivo: false }],
    ["hecha", org({ externa: true }), { guardarCopia: false, borrarArchivo: true }],
    ["hechaConCopia", org({ externa: true }), { guardarCopia: true, borrarArchivo: true }],
  ] as const)("%s", (clave, o, opciones) => {
    expect(claveHecha(o, opciones, false)).toBe(clave);
  });
});

describe("useConfirmacion: lo escrito confirma las opciones de ese momento", () => {
  const preparar = () => {
    const sinArchivo = ref(false);
    const confirmar = vi.fn();
    const c = useConfirmacion(() => "Acme", () => sinArchivo.value, confirmar);
    c.escrito.value = "Acme";
    return { sinArchivo, confirmar, ...c };
  };

  it("si pasan a ser sin archivo, hay que escribir el nombre otra vez", async () => {
    const { sinArchivo, escrito, confirmado } = preparar();
    expect(confirmado.value).toBe(true);
    sinArchivo.value = true; // `no_encontrado`, o la lista releída tras un fallo
    await nextTick();
    expect(escrito.value).toBe("");
    expect(confirmado.value).toBe(false);
  });

  it("escrito de nuevo, vale para las opciones nuevas", async () => {
    const { sinArchivo, escrito, confirmado } = preparar();
    sinArchivo.value = true;
    await nextTick();
    escrito.value = "Acme";
    await nextTick();
    expect(escrito.value).toBe("Acme");
    expect(confirmado.value).toBe(true);
  });

  it("tras un fallo de Rust se vacía sin ceder el hilo: otro Enter no llega con el nombre escrito", () => {
    const { trasFallo, escrito, confirmado } = preparar();
    trasFallo("fallo");
    expect(escrito.value).toBe("");
    expect(confirmado.value).toBe(false);
  });

  it("un cancelado no pasó por Rust, y conserva lo escrito", () => {
    const { trasFallo, escrito } = preparar();
    trasFallo(undefined);
    expect(escrito.value).toBe("Acme");
  });

  it("Enter mantenido no confirma: cuenta solo la pulsación nueva", () => {
    const { alEnter, confirmar } = preparar();
    alEnter({ repeat: true } as KeyboardEvent);
    expect(confirmar).not.toHaveBeenCalled();
    alEnter({ repeat: false } as KeyboardEvent);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
});

describe("lo que Rust dijo que hizo un intento que falló", () => {
  const nada = { archivoBorrado: false, copia: null };
  const copio = { archivoBorrado: false, copia: "Acme_1.db" };
  const borro = { archivoBorrado: true, copia: null };
  const ambas = { archivoBorrado: true, copia: "Acme_1.db" };

  it("sin avance, como un cancelado, no cambia nada", () => {
    expect(intentoTrasFallo(undefined, undefined)).toBeUndefined();
    expect(intentoTrasFallo(copio, undefined)).toEqual(copio);
  });

  it("un segundo intento no borra lo que hizo el primero", () => {
    expect(intentoTrasFallo(ambas, nada)).toEqual(ambas);
    expect(intentoTrasFallo(copio, borro)).toEqual(ambas);
    expect(intentoTrasFallo(borro, copio)).toEqual(ambas);
  });

  it("la copia más nueva es la que se nombra", () => {
    expect(intentoTrasFallo(copio, { archivoBorrado: false, copia: "Acme_2.db" })?.copia).toBe("Acme_2.db");
  });

  it("falló antes de tocar nada y el archivo desapareció: no afirma un borrado ni una copia", () => {
    const interna = org({ existe: false });
    const externa = org({ existe: false, externa: true });
    expect(claveQueSeBorra(interna, true, false, nada)).toBe("internaSinArchivo");
    expect(claveQueSeBorra(externa, true, false, nada)).toBe("externaSinArchivo");
    const sinPedir = { guardarCopia: false, borrarArchivo: false };
    expect(claveHecha(interna, sinPedir, true, nada)).toBe("hecha");
    expect(claveHecha(externa, sinPedir, true, nada)).toBe("salioSinArchivo");
  });

  it("no se sabe (se reinició la app): tampoco lo afirma", () => {
    const externa = org({ existe: false, externa: true });
    expect(claveQueSeBorra(externa, true, false, undefined)).toBe("externaSinArchivo");
    expect(claveHecha(externa, { guardarCopia: false, borrarArchivo: false }, true)).toBe("salioSinArchivo");
  });

  it("borró el archivo: lo dice con certeza, con la copia o sin ella", () => {
    const o = org({ existe: false });
    expect(claveQueSeBorra(o, true, false, borro)).toBe("reintentoSinCopia");
    expect(claveQueSeBorra(o, true, false, ambas)).toBe("reintentoConCopia");
    const sinPedir = { guardarCopia: false, borrarArchivo: false };
    expect(claveHecha(o, sinPedir, true, borro)).toBe("hecha");
    expect(claveHecha(o, sinPedir, true, ambas)).toBe("hechaConCopia");
  });

  it("externa cuyo archivo borró la app: al terminar no dice que no se encontró", () => {
    const o = org({ externa: true, existe: false });
    expect(claveHecha(o, { guardarCopia: false, borrarArchivo: false }, true, borro)).toBe("hecha");
  });

  it("copió pero no borró, y sigue el archivo: el texto es el normal, y al final la copia no se niega", () => {
    const o = org();
    expect(claveQueSeBorra(o, false, false, copio)).toBe("interna");
    expect(claveHecha(o, { guardarCopia: false, borrarArchivo: false }, false, copio)).toBe("hechaConCopia");
  });

  it("el archivo volvió a estar: no dice que falta quitarla", () => {
    expect(claveQueSeBorra(org(), false, false, borro)).toBe("interna");
  });

  it("externa cuyo archivo volvió: Rust no lo toca, y el aviso no dice que se eliminó", () => {
    const sinPedir = { guardarCopia: false, borrarArchivo: false };
    expect(claveHecha(org({ externa: true }), sinPedir, false, borro)).toBe("salio");
    expect(claveHecha(org({ externa: true }), sinPedir, false, ambas)).toBe("salio");
    // si la borra otra vez con su casilla, sí
    expect(claveHecha(org({ externa: true }), { guardarCopia: false, borrarArchivo: true }, false, borro)).toBe("hecha");
  });

  it("solo una externa cuyo archivo borró la app puede dejar archivos auxiliares", () => {
    const externa = org({ externa: true, existe: false });
    expect(quedanAuxiliares(externa, true, borro)).toBe(true);
    expect(quedanAuxiliares(externa, true, nada)).toBe(false); // no se sabe: no lo afirma
    expect(quedanAuxiliares(externa, true, undefined)).toBe(false);
    expect(quedanAuxiliares(org({ externa: true }), false, borro)).toBe(false); // el archivo volvió
    expect(quedanAuxiliares(org({ existe: false }), true, borro)).toBe(false); // Rust limpia la interna
  });

  it("al reabrir sin poder leer la lista, lo que dijo Rust sigue valiendo", () => {
    expect(sinArchivoAlAbrir(borro, false)).toBe(true);
    expect(sinArchivoAlAbrir(borro, true)).toBe(false); // manda la lista, que puede decir que volvió
    expect(sinArchivoAlAbrir(copio, false)).toBe(false);
    expect(sinArchivoAlAbrir(undefined, false)).toBe(false);
  });

  it("externa que no está aunque la lista diga que sí: tampoco dice que no se tocó", () => {
    expect(claveHecha(org({ externa: true }), { guardarCopia: false, borrarArchivo: false }, true)).toBe("salioSinArchivo");
  });
});

describe("claveAbierta", () => {
  it("boldo.db no se pasa a sí misma", () => {
    expect(claveAbierta(org())).toBe("abierta");
    expect(claveAbierta(org({ ruta: "C:\\datos\\boldo.db" }))).toBe("abiertaPrincipal");
  });
});

describe("claveFalloFuera: el aviso cuando el diálogo ya no está", () => {
  it("la que falló sin pasar a otra no necesita más que su motivo", () => {
    expect(claveFalloFuera({ pasoAOtra: false, sigueEnLaLista: true })).toBeNull();
  });
  it("ya en otra y sigue en la lista: se puede terminar", () => {
    expect(claveFalloFuera({ pasoAOtra: true, sigueEnLaLista: true })).toBe("falloYaEnOtra");
  });
  it("sin poder leer la lista, no afirma que sigue en ella", () => {
    expect(claveFalloFuera({ pasoAOtra: true, sigueEnLaLista: null })).toBe("falloYaEnOtraSinLista");
  });
  it("boldo.db, la última: ya no está en la lista, y no se ofrece reintentar lo que no se puede", () => {
    expect(claveFalloFuera({ pasoAOtra: true, sigueEnLaLista: false })).toBe("falloSinVuelta");
  });
});

describe("aconsejaSinCopia", () => {
  it.each([
    ["danado", "x", true],
    ["contenido_invalido", "journal", true],
    ["contenido_invalido", "enlace", false], // el problema es borrar un enlace: la copia no tiene que ver
    ["fallo", "x", false],
    ["no_encontrado", "x", false],
  ])("%s (%s): %s", (codigo, detalle, si) => {
    expect(aconsejaSinCopia(codigo, detalle)).toBe(si);
  });
});
