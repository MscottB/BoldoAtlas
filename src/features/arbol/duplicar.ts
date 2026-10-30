import type { Sentencia } from "@/db/cliente";
import type { Conexion, Puesto, Unidad } from "@/db/tipos";
import * as X from "@/db/repos/conexiones";
import * as E from "@/db/repos/etiquetas";
import * as P from "@/db/repos/puestos";
import * as U from "@/db/repos/unidades";
import { indiceHijos } from "./jerarquia";

type ConBorrado<T> = T & { deleted_at?: string | null };

/** Lo que `duplicarRama` lee: las filas del store (o crudas: las eliminadas se saltan). */
export interface EstadoRama {
  unidades: ConBorrado<Unidad>[];
  puestos: ConBorrado<Puesto>[];
  unidadEtiquetas: ConBorrado<{ unidad_id: string; etiqueta_id: string }>[];
  conexiones: ConBorrado<Conexion>[];
}

/**
 * Sentencias que copian la unidad y todos sus descendientes vivos: ids nuevos, marca, tipo, descripción, etiquetas,
 * puestos (sin asignaciones: nacen vacantes), jefatura hacia el puesto copiado y conexiones laterales con ambos
 * extremos dentro de la rama. La copia queda justo después de la original, con `nombreCopia` solo en su raíz.
 */
export function duplicarRama(
  estado: EstadoRama,
  unidadId: string,
  nombreCopia: string,
): { id: string; sentencias: Sentencia[] } {
  const vivas = estado.unidades.filter((u) => !u.deleted_at);
  const indice = indiceHijos(vivas);
  const original = vivas.find((u) => u.id === unidadId)!;
  const sentencias: Sentencia[] = [];

  // La copia toma el orden siguiente al de la original; los hermanos que la siguen se corren solo si hace falta.
  let tope = original.orden + 1;
  const ordenDeLaCopia = tope;
  const hermanos = indice.get(original.parent_id) ?? [];
  for (const h of hermanos.slice(hermanos.indexOf(original) + 1)) {
    if (h.orden > tope) tope = h.orden;
    else sentencias.push(...U.editarUnidad(h.id, { orden: ++tope }));
  }

  const copiaDe = new Map<string, string>(); // unidad original → su copia
  const cola = [original];
  for (const u of cola) {
    const esRaiz = u === original;
    const nueva = U.crearUnidad({
      tipo_id: u.tipo_id,
      nombre: esRaiz ? nombreCopia : u.nombre,
      descripcion: u.descripcion,
      parent_id: esRaiz ? u.parent_id : copiaDe.get(u.parent_id!),
      orden: esRaiz ? ordenDeLaCopia : u.orden,
    });
    copiaDe.set(u.id, nueva.id);
    sentencias.push(...nueva.sentencias);
    if (u.marca_color || u.marca_codigo)
      sentencias.push(
        ...U.editarUnidad(nueva.id, { marca_color: u.marca_color, marca_codigo: u.marca_codigo }),
      );
    cola.push(...(indice.get(u.id) ?? []));
  }

  const puestoDe = new Map<string, string>(); // puesto original → su copia
  for (const p of estado.puestos) {
    if (p.deleted_at || !copiaDe.has(p.unidad_id)) continue;
    const nuevo = P.crearPuesto({
      unidad_id: copiaDe.get(p.unidad_id)!,
      cargo_id: p.cargo_id,
      descripcion: p.descripcion,
      leyenda_id: p.leyenda_id,
      orden: p.orden,
    });
    puestoDe.set(p.id, nuevo.id);
    sentencias.push(...nuevo.sentencias);
  }
  for (const u of cola) {
    const jefe = u.jefe_puesto_id && puestoDe.get(u.jefe_puesto_id);
    if (jefe) sentencias.push(...U.asignarJefe(copiaDe.get(u.id)!, jefe));
  }

  for (const x of estado.unidadEtiquetas)
    if (!x.deleted_at && copiaDe.has(x.unidad_id))
      sentencias.push(...E.etiquetarUnidad(copiaDe.get(x.unidad_id)!, x.etiqueta_id));
  for (const c of estado.conexiones) {
    const origen = copiaDe.get(c.origen_id);
    const destino = copiaDe.get(c.destino_id);
    if (!c.deleted_at && origen && destino)
      sentencias.push(...X.crearConexion(origen, destino, c.etiqueta).sentencias);
  }

  return { id: copiaDe.get(unidadId)!, sentencias };
}
