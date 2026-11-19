// «Exportar esta lista a Excel»: cada lista pasa a una hoja con lo que se ve (sus filas ya filtradas y ordenadas, y sus
// columnas a la vista), sin ids internos. Las filas llegan de la vista: lo vivo de hoy o, si la lista la sigue, la
// fecha que se ve; lo eliminado ya no está en ellas.
import type { FilaDirectorio } from "@/features/directorio/filtrar";
import { frase } from "@/features/historial/frases";
import type { AccionBreve, Traducir as TraducirPlural } from "@/features/historial/tipos";
import type { FilaPersonaUnidad } from "@/features/unidades/personas";
import { momentoExcel, type Celda, type Hoja, type Traducir } from "./libro";

export interface ColumnasDirectorio {
  reemplazo: boolean;
  /** Los tipos de unidad a la vista, en su orden. */
  tipos: { id: string; nombre: string }[];
  tipoContrato: boolean;
  sede: boolean;
  jornada: boolean;
}

export function hojaDirectorio(filas: FilaDirectorio[], ver: ColumnasDirectorio, t: Traducir): Hoja {
  const extras = (["tipoContrato", "sede", "jornada"] as const).filter((c) => ver[c]);
  return {
    nombre: t("nav.directorio"),
    columnas: [
      t("directorio.persona"),
      t("directorio.cargo"),
      ...(ver.reemplazo ? [t("directorio.reemplazo")] : []),
      ...ver.tipos.map((x) => x.nombre),
      t("directorio.correo"),
      ...extras.map((c) => t(`directorio.${c}`)),
    ],
    filas: filas.map((f) => [
      f.persona ?? t("directorio.vacante"),
      f.estado === "sinPuesto" ? t("directorio.sinPuesto") : f.cargo,
      ...(ver.reemplazo ? [f.reemplazo] : []),
      ...ver.tipos.map((x) => f.ruta.find((r) => r.tipoId === x.id)?.nombre ?? null),
      f.correo,
      ...extras.map((c) => f[c]),
    ]),
  };
}

export interface SeccionRevision {
  titulo: string;
  /** null: las secciones que no son avisos (reemplazos, marcados). */
  nivel: string | null;
  /** `hija`: una persona de un grupo (correos, nombres); va después de la fila del grupo. */
  filas: { texto: string; detalle?: string; hija?: boolean }[];
}

/** Una fila por aviso; cada persona de un grupo lleva en «Aviso» el del grupo y en «Detalle» quién es. */
export function hojaRevision(secciones: SeccionRevision[], t: Traducir): Hoja {
  const filas: Celda[][] = [];
  for (const s of secciones) {
    let grupo = "";
    for (const f of s.filas) {
      const detalle = f.hija ? [f.texto, f.detalle].filter(Boolean).join(" · ") : f.detalle;
      if (!f.hija) grupo = f.texto;
      filas.push([s.titulo, s.nivel, grupo, detalle || null]);
    }
  }
  return {
    nombre: t("revision.titulo"),
    columnas: ["seccion", "nivel", "aviso", "detalle"].map((c) => t(`excel.revision.${c}`)),
    filas,
  };
}

export interface ValorMantenedor {
  nombre: string;
  usos: number;
  activo: boolean;
  color?: string;
  descripcion?: string | null;
}

/** `lista`: el nombre de la pestaña (Cargos, Sedes…); `usos`: el título de su columna de usos. */
export function hojaMantenedor(
  lista: string,
  usos: string,
  valores: ValorMantenedor[],
  esLeyenda: boolean,
  t: Traducir,
): Hoja {
  const col = (c: string) => t(`mantenedores.columnas.${c}`);
  return {
    nombre: lista,
    columnas: [col("nombre"), ...(esLeyenda ? [col("color"), col("descripcion")] : []), usos, col("estado")],
    filas: valores.map((v) => [
      v.nombre,
      ...(esLeyenda ? [v.color ?? null, v.descripcion || null] : []),
      v.usos,
      t(v.activo ? "mantenedores.activo" : "mantenedores.inactivo"),
    ]),
  };
}

/** Las personas de una unidad (o de su rama), como en su lista. */
export function hojaPersonas(filas: FilaPersonaUnidad[], unidad: string, t: Traducir): Hoja {
  return {
    nombre: unidad,
    columnas: ["nombre", "cargo", "tipo", "unidad"].map((c) => t(`excel.personas.${c}`)),
    filas: filas.map((f) => [f.nombre, f.cargo, t(`puesto.tipo.${f.tipo}`), f.unidad]),
  };
}

/** El Historial: una fila por acción, de la más nueva a la más antigua, con su hora local, su frase, su estado y cuántos
 * elementos tocó. `t` con plural, como lo pide la frase. */
export function hojaHistorial(filas: AccionBreve[], t: TraducirPlural): Hoja {
  return {
    nombre: t("historial.vista.titulo"),
    columnas: ["fecha", "cambio", "estado", "elementos"].map((c) => t(`excel.historial.${c}`)),
    filas: filas.map((a) => [
      momentoExcel(new Date(a.fecha)),
      frase(a, t),
      t(`historial.estado.${a.estado}`),
      a.filas,
    ]),
  };
}
