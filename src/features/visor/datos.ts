import { toRaw } from "vue";
import type { Conexion, Puesto, Unidad } from "@/db/tipos";
import { i18n, type Idioma } from "@/i18n";
import { useOrganizacion } from "@/stores/organizacion";
import { jefeEnTarjeta, type ConfigVista } from "@/features/arbol/vista";
import type { Tarjeta } from "@/features/export/niveles";
import { contenidoImagen, type ContenidoImagen, type PedidoImagen } from "@/features/export/preparar";

/** Una persona en el panel de una unidad. Sin `nombre` es una vacante. */
export interface PersonaPanel {
  cargo: string;
  nombre?: string;
  reemplazo?: string;
  correo?: string;
  telefono?: string;
}

/** Lo que lleva el archivo del visor HTML: solo lo que el nivel elegido incluye. */
export interface DatosVisor {
  version: 1;
  nivel: PedidoImagen["nivel"];
  idioma: Idioma;
  /** Fecha y hora para leer. */
  generado: string;
  encabezado: ContenidoImagen["encabezado"];
  /** Las del alcance, sin descripción. */
  unidades: Unidad[];
  /** Los que dibuja «Como en pantalla» con «Ver puestos», sin descripción. */
  puestos: Puesto[];
  conexiones: Conexion[];
  tiposAlinear: ContenidoImagen["tiposAlinear"];
  jefeEnTarjeta: boolean;
  tam: ContenidoImagen["tam"];
  opcionesLayout: ContenidoImagen["opcionesLayout"];
  config: ConfigVista;
  /** De todas las unidades y puestos, abiertas: `mas` siempre 0 (el visor lo calcula al plegar). */
  tarjetas: Tarjeta[];
  zonas: ContenidoImagen["zonasDatos"];
  leyenda: ContenidoImagen["leyenda"];
  /** Las ramas plegadas al abrir. */
  plegadas: string[];
  panel: Record<string, { ruta: string[]; jefatura?: PersonaPanel; personas: PersonaPanel[] }>;
  /** Los textos del visor (`visor.*`) y los del dibujo que usa. */
  textos: Record<string, string>;
}

const aplanar = (o: Record<string, unknown>, prefijo: string): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === "string"
      ? [[`${prefijo}.${k}`, v] as [string, string]]
      : v && typeof v === "object"
        ? aplanar(v as Record<string, unknown>, `${prefijo}.${k}`)
        : [],
  );

function textosDelVisor(idioma: Idioma): Record<string, string> {
  const msgs = i18n.global.getLocaleMessage(idioma) as Record<string, Record<string, unknown>>;
  const clave = (k: string) =>
    k.split(".").reduce<unknown>((m, p) => (m as Record<string, unknown> | undefined)?.[p], msgs);
  return Object.fromEntries([
    ...aplanar(msgs.visor ?? {}, "visor"),
    ...["imagen.masUnidades", "puesto.vacante", "puesto.reemplazoDe"].map((k) => [k, String(clave(k))]),
  ]);
}

/**
 * Los datos del visor HTML, leídos del store a la fecha que se ve. Lo que el nivel no lleva no se lee: Estructura no
 * toca personas; el correo y el teléfono, solo los del titular y solo con su casilla. Nunca notas, fotos, costos ni
 * descripciones.
 */
export function datosVisor(o: PedidoImagen & { correo: boolean; telefono: boolean }): DatosVisor {
  const org = useOrganizacion();
  const e = toRaw(org.enFecha);
  const idioma = i18n.global.locale.value as Idioma;
  const abiertas = contenidoImagen({ ...o, abrirTodo: true });
  const plegadas = o.abrirTodo ? new Set<string>() : contenidoImagen(o).plegadas;

  const enAlcance = new Set(abiertas.unidades.map((u) => u.id));
  const todas = toRaw(e.unidades);
  const porId = new Map(todas.map((u) => [u.id, u]));
  const cargos = new Map(toRaw(org.catalogos).cargos.map((c) => [c.id, c.nombre]));
  const trabajadores = new Map(toRaw(e.trabajadores).map((x) => [x.id, x]));
  const conPersonas = o.nivel !== "estructura";
  const puestos = [...toRaw(e.puestos)].sort((a, b) => a.orden - b.orden);

  const persona = (p: Puesto): PersonaPanel => {
    const cargo = cargos.get(p.cargo_id) ?? "";
    if (!conPersonas) return { cargo };
    const v = e.vigentes.get(p.id);
    const titular = v?.titular && trabajadores.get(v.titular.trabajador_id);
    const reemplazo = v?.reemplazo && trabajadores.get(v.reemplazo.trabajador_id)?.nombre;
    return {
      cargo,
      ...(titular && { nombre: titular.nombre }),
      ...(reemplazo && { reemplazo }),
      ...(titular && o.correo && titular.correo && { correo: titular.correo }),
      ...(titular && o.telefono && titular.telefono && { telefono: titular.telefono }),
    };
  };
  const ruta = (u: Unidad) => {
    const r: string[] = [];
    for (
      let x: Unidad | undefined = u;
      x && r.length <= todas.length;
      x = x.parent_id ? porId.get(x.parent_id) : undefined
    )
      r.unshift(x.nombre);
    return r;
  };
  const panel: DatosVisor["panel"] = {};
  for (const u of abiertas.unidades) {
    const suyos = puestos.filter((p) => p.unidad_id === u.id);
    const jefe = suyos.find((p) => p.id === u.jefe_puesto_id);
    panel[u.id] = {
      ruta: ruta(u),
      ...(jefe && { jefatura: persona(jefe) }),
      personas: suyos.filter((p) => p !== jefe).map(persona),
    };
  }

  const sinDescripcion = <T extends { descripcion: string | null }>(x: T): T => ({ ...x, descripcion: null });
  return {
    version: 1,
    nivel: o.nivel,
    idioma,
    generado: new Date().toLocaleString(idioma === "es" ? "es-CL" : "en-US", {
      dateStyle: "long",
      timeStyle: "short",
    }),
    encabezado: abiertas.encabezado,
    unidades: abiertas.unidades.map(sinDescripcion),
    puestos: abiertas.g.puestos.map(sinDescripcion),
    conexiones: toRaw(org.conexiones).filter(
      (c) => enAlcance.has(c.origen_id) && enAlcance.has(c.destino_id),
    ),
    tiposAlinear: abiertas.tiposAlinear,
    jefeEnTarjeta: o.nivel === "pantalla" ? jefeEnTarjeta(o.config) : o.nivel === "presentacion",
    tam: abiertas.tam,
    opcionesLayout: abiertas.opcionesLayout,
    config: o.config,
    tarjetas: abiertas.tarjetas.map((t) => ({ ...t, mas: 0 })),
    zonas: abiertas.zonasDatos,
    leyenda: abiertas.leyenda,
    plegadas: [...plegadas],
    panel,
    textos: textosDelVisor(idioma),
  };
}
