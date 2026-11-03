import { describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";
import type { Organizacion } from "@/db/cliente";
import {
  aconsejaSinCopia,
  claveFalloFuera,
  claveHecha,
  claveQueSeBorra,
  confirmaEliminar,
  espacioQueLibera,
  intentoQueBorro,
  intentoTrasFallo,
  opcionesEliminar,
  pestanasDe,
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
    expect(claveHecha(o, opciones)).toBe(clave);
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

  it("Enter mantenido no confirma: cuenta solo la pulsación nueva", () => {
    const { alEnter, confirmar } = preparar();
    alEnter({ repeat: true } as KeyboardEvent);
    expect(confirmar).not.toHaveBeenCalled();
    alEnter({ repeat: false } as KeyboardEvent);
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
});

describe("un intento que falló a medias", () => {
  const conCopia = { guardarCopia: true, borrarArchivo: false };
  const conArchivo = { guardarCopia: false, borrarArchivo: true };
  const nada = { guardarCopia: false, borrarArchivo: false };

  it("se anota lo que pidió, y un no_encontrado o un cancelado no tocaron nada", () => {
    expect(intentoTrasFallo(undefined, conCopia, false, "fallo")).toEqual(conCopia);
    expect(intentoTrasFallo(undefined, conCopia, false, "no_encontrado")).toBeUndefined();
    expect(intentoTrasFallo(undefined, conCopia, false, undefined)).toBeUndefined();
  });

  it("reintentar sin las casillas no borra lo que logró el anterior", () => {
    expect(intentoTrasFallo(conCopia, nada, true, "fallo")).toEqual(conCopia);
  });

  it("con el archivo aún ahí, vale el último: el anterior no llegó a borrar nada", () => {
    expect(intentoTrasFallo(conCopia, nada, false, "fallo")).toEqual(nada);
  });

  it("solo cuenta si su archivo ya no está y le tocaba borrarlo", () => {
    expect(intentoQueBorro(org({ existe: false }), conCopia)).toEqual(conCopia);
    expect(intentoQueBorro(org({ existe: true }), conCopia)).toBeUndefined();
    expect(intentoQueBorro(org({ existe: false }), undefined)).toBeUndefined();
    expect(intentoQueBorro(org({ existe: false, externa: true }), conArchivo)).toEqual(conArchivo);
    // una externa a la que no se le pidió borrar: si no está, no fue la app
    expect(intentoQueBorro(org({ existe: false, externa: true }), nada)).toBeUndefined();
  });

  it("externa con su casilla: al terminar no dice que su archivo no se tocó, ni que pudo moverse", () => {
    const o = org({ externa: true, existe: false });
    const ya = intentoQueBorro(o, conArchivo);
    expect(claveQueSeBorra(o, true, false, ya)).toBe("reintentoSinCopia");
    expect(claveHecha(o, nada, ya)).toBe("hecha");
  });

  it("interna con copia: dice que la copia está, no que no se puede copiar", () => {
    const o = org({ existe: false });
    const ya = intentoQueBorro(o, conCopia);
    expect(claveQueSeBorra(o, true, false, ya)).toBe("reintentoConCopia");
    expect(claveHecha(o, nada, ya)).toBe("hechaConCopia");
  });

  it("interna sin copia: sus respaldos son lo único que queda", () => {
    const o = org({ existe: false });
    expect(claveQueSeBorra(o, true, false, intentoQueBorro(o, nada))).toBe("reintentoSinCopia");
  });
});

describe("claveFalloFuera: el aviso cuando el diálogo ya no está", () => {
  it("la que falló sin pasar a otra no necesita más que su motivo", () => {
    expect(claveFalloFuera({ pasoAOtra: false, sigueEnLaLista: true })).toBeNull();
  });
  it("ya en otra y sigue en la lista: se puede terminar", () => {
    expect(claveFalloFuera({ pasoAOtra: true, sigueEnLaLista: true })).toBe("falloYaEnOtra");
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
