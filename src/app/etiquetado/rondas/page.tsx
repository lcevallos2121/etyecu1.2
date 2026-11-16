"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";
import { Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

// "Rondas de piso" es una herramienta aparte, de uso exclusivo del dueño
// (gateado en middleware.ts y en el Sidebar por user_id, no por rol). No
// usa el Sidebar/Topbar del sistema: es pantalla completa, pensada para
// usarse caminando con un celular o una tablet, no sentado en un escritorio.
//
// Mide por MUESTREO DE TRABAJO (work sampling): en vez de instrumentar cada
// puesto físico de marquilla/etiquetado (costaría tablets por puesto), el
// dueño camina la planta unas pocas veces al día y registra, persona por
// persona, en qué fase y qué ROL está cada quien en ese instante — o si
// está interrumpida y por qué. Con suficientes rondas acumuladas en el mes,
// el % de tiempo que cada persona pasa en cada fase/rol (o interrumpida) se
// vuelve una estimación estadísticamente razonable, sin hardware nuevo.
//
// Todo input/select de esta página usa 16px de fuente a propósito: por
// debajo de eso Safari en iOS hace zoom automático al enfocar, que es justo
// lo que se reportó como molesto.

type Fase = { id: string; nombre: string; color_slot: number };
type Rol = { id: string; fase_id: string; nombre: string };
type Persona = { id: string; nombre: string; activo: boolean };
type PersonaHabitual = { persona_id: string; fase_id: string };
type OrdenRef = { id: string; numero_etq: string; cliente_nombre: string };
type OrdenFase = { orden_id: string; fase_id: string; posicion: number };
type Asignacion = { orden_id: string; persona_id: string };
type RondaHoy = { id: string; hora: string; total: number };

type Draft = {
  faseId: string | null;
  rolId: string | null;
  interrumpido: boolean;
  motivo: string | null;
  avance: number;
  ordenId: string;
  equipoId?: string | null;
};
type Equipo = { id: string; nombre: string; persona_ids: string[] };

function arraysIguales(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

const MOTIVOS = ["Lo llamaron a otra tarea", "Pasando cajas a costura", "Falta de material", "Descanso", "Otro"];
const COLOR_SLOTS: Record<number, string> = {
  1: "#5b9bf0",
  2: "var(--amber)",
  3: "#2dd4bf",
  4: "var(--accent)",
  5: "#f472b6",
  6: "#a3e635",
};
const INPUT_STYLE = { background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text)", fontSize: 16 };

function colorFase(slot: number | undefined) {
  return COLOR_SLOTS[slot ?? 1] ?? COLOR_SLOTS[1];
}
function colorFaseSlot(slot: number) {
  return COLOR_SLOTS[slot] ?? COLOR_SLOTS[1];
}
function hoyStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function horaStr(d: Date) {
  return d.toLocaleTimeString("es-EC", { hour: "2-digit", minute: "2-digit" });
}

function Paginador({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 pt-1 pb-1">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="btn-secondary text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        ‹ Anterior
      </button>
      <span className="text-[11.5px] text-text-dim">
        Página {page} de {totalPages}
      </span>
      <button
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="btn-secondary text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40"
      >
        Siguiente ›
      </button>
    </div>
  );
}

export default function RondasDePisoPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<"ronda" | "personal" | "ordenes" | "resumen">("ronda");
  const [clock, setClock] = useState("--:--");
  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [fases, setFases] = useState<Fase[]>([]);
  const [roles, setRoles] = useState<Rol[]>([]);
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [habituales, setHabituales] = useState<PersonaHabitual[]>([]);
  const [ordenes, setOrdenes] = useState<OrdenRef[]>([]);
  const [ordenFases, setOrdenFases] = useState<OrdenFase[]>([]);
  const [asignaciones, setAsignaciones] = useState<Asignacion[]>([]);
  const [rondasHoy, setRondasHoy] = useState<RondaHoy[]>([]);

  const [enCurso, setEnCurso] = useState<Record<string, Draft>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function avisar(msg: string) {
    setToast(msg);
  }

  const cargarTodo = useCallback(async () => {
    const hoy = hoyStr();
    const [fasesRes, rolesRes, equiposRes, personasRes, habitualesRes, ordenesRes] = await Promise.all([
      supabase.from("rondas_fases").select("id, nombre, color_slot").order("creado_en"),
      supabase.from("rondas_roles").select("id, fase_id, nombre").order("creado_en"),
      supabase.from("rondas_equipos").select("id, nombre, persona_ids").order("creado_en"),
      supabase.from("rondas_personas").select("id, nombre, activo").eq("activo", true).order("nombre"),
      supabase.from("rondas_persona_fases_habituales").select("persona_id, fase_id"),
      supabase
        .from("etq_ordenes")
        .select("id, numero_etq, cliente_nombre")
        .eq("estado", "abierta")
        .order("creado_en", { ascending: false })
        .limit(80),
    ]);
    const ordenIds = (ordenesRes.data ?? []).map((o) => o.id);
    const [ordenFasesRes, asignacionesRes, rondasRes] = await Promise.all([
      ordenIds.length
        ? supabase.from("rondas_orden_fases").select("orden_id, fase_id, posicion").in("orden_id", ordenIds).order("posicion")
        : Promise.resolve({ data: [] as OrdenFase[] }),
      ordenIds.length
        ? supabase.from("rondas_asignaciones").select("orden_id, persona_id").eq("fecha", hoy).in("orden_id", ordenIds)
        : Promise.resolve({ data: [] as Asignacion[] }),
      supabase.from("rondas").select("id, hora").eq("fecha", hoy).order("hora", { ascending: false }),
    ]);

    const rondaIds = (rondasRes.data ?? []).map((r: { id: string }) => r.id);
    const conteos: Record<string, number> = {};
    if (rondaIds.length) {
      const { data: obs } = await supabase.from("rondas_observaciones").select("ronda_id").in("ronda_id", rondaIds);
      (obs ?? []).forEach((o: { ronda_id: string }) => {
        conteos[o.ronda_id] = (conteos[o.ronda_id] ?? 0) + 1;
      });
    }

    setFases((fasesRes.data as Fase[]) ?? []);
    setRoles((rolesRes.data as Rol[]) ?? []);
    setEquipos((equiposRes.data as Equipo[]) ?? []);
    setPersonas((personasRes.data as Persona[]) ?? []);
    setHabituales((habitualesRes.data as PersonaHabitual[]) ?? []);
    setOrdenes((ordenesRes.data as OrdenRef[]) ?? []);
    setOrdenFases((ordenFasesRes.data as OrdenFase[]) ?? []);
    setAsignaciones((asignacionesRes.data as Asignacion[]) ?? []);
    setRondasHoy(
      ((rondasRes.data as { id: string; hora: string }[]) ?? []).map((r) => ({
        id: r.id,
        hora: horaStr(new Date(r.hora)),
        total: conteos[r.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial de datos tras montar, no un ciclo de sincronización
    cargarTodo();
  }, [supabase, cargarTodo]);

  useEffect(() => {
    const t = setInterval(() => setClock(horaStr(new Date())), 15000);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fija el reloj de inmediato para no mostrar "--:--" al montar
    setClock(horaStr(new Date()));
    return () => clearInterval(t);
  }, []);

  function faseLabel(id: string | null) {
    if (!id) return "";
    return fases.find((f) => f.id === id)?.nombre ?? "(fase eliminada)";
  }
  function faseColor(id: string | null) {
    if (!id) return "var(--text-dim)";
    return colorFase(fases.find((f) => f.id === id)?.color_slot);
  }
  function rolLabel(id: string | null) {
    if (!id) return "";
    return roles.find((r) => r.id === id)?.nombre ?? "";
  }
  function rolesDeFase(faseId: string | null) {
    if (!faseId) return [];
    return roles.filter((r) => r.fase_id === faseId);
  }
  function fasesDeOrden(ordenId: string) {
    return ordenFases
      .filter((of) => of.orden_id === ordenId)
      .sort((a, b) => a.posicion - b.posicion)
      .map((of) => fases.find((f) => f.id === of.fase_id))
      .filter(Boolean) as Fase[];
  }
  function personaById(id: string) {
    return personas.find((p) => p.id === id);
  }

  // ---------------- Ronda: marcar + guardar ----------------
  function marcar(personaId: string, ordenId: string, draft: Draft) {
    setEnCurso((prev) => ({ ...prev, [personaId]: draft }));
    setAbierto(null);
  }

  // Equipo: varias personas haciendo la misma fase/rol juntas (ej. 3
  // personas en inventario de una orden) se marcan de una sola vez y
  // quedan vinculadas al mismo equipo_id para que Trazabilidad de piso las
  // agrupe como una sola mesa en vez de medirlas por separado.
  async function obtenerOCrearEquipo(nombre: string, personaIds: string[]) {
    const ordenados = [...personaIds].sort();
    const existente = equipos.find((e) => e.nombre === nombre && arraysIguales([...e.persona_ids].sort(), ordenados));
    if (existente) return existente.id;
    const { data, error } = await supabase.from("rondas_equipos").insert({ nombre, persona_ids: personaIds }).select("id").single();
    if (error || !data) {
      avisar("No se pudo crear el equipo: " + (error?.message ?? ""));
      return null;
    }
    setEquipos((prev) => [...prev, { id: data.id, nombre, persona_ids: personaIds }]);
    return data.id as string;
  }

  async function marcarEquipo(personaIds: string[], ordenId: string, draftComun: Omit<Draft, "equipoId" | "ordenId">, nombreEquipo: string) {
    const equipoId = await obtenerOCrearEquipo(nombreEquipo, personaIds);
    if (!equipoId) return;
    setEnCurso((prev) => {
      const next = { ...prev };
      personaIds.forEach((pid) => {
        next[pid] = { ...draftComun, ordenId, equipoId };
      });
      return next;
    });
  }

  async function guardarRonda() {
    const ids = Object.keys(enCurso);
    if (ids.length === 0) {
      avisar("Marca al menos una persona antes de guardar");
      return;
    }
    setGuardando(true);
    try {
      const { data: ronda, error: errRonda } = await supabase
        .from("rondas")
        .insert({ fecha: hoyStr(), hora: new Date().toISOString(), creado_por: userId })
        .select("id")
        .single();
      if (errRonda || !ronda) {
        avisar("No se pudo guardar la ronda: " + (errRonda?.message ?? ""));
        return;
      }
      const filas = ids.map((pid) => {
        const d = enCurso[pid];
        return {
          ronda_id: ronda.id,
          persona_id: pid,
          orden_id: d.ordenId,
          fase_id: d.interrumpido ? null : d.faseId,
          rol_id: d.interrumpido ? null : d.rolId,
          equipo_id: d.equipoId ?? null,
          interrumpido: d.interrumpido,
          motivo: d.motivo,
          avance: d.avance || 0,
        };
      });
      const { error: errObs } = await supabase.from("rondas_observaciones").insert(filas);
      if (errObs) {
        avisar("No se pudo guardar el detalle: " + errObs.message);
        return;
      }
      setEnCurso({});
      await cargarTodo();
      avisar(`Ronda guardada — ${filas.length} personas registradas`);
    } finally {
      setGuardando(false);
    }
  }

  // ---------------- Personal ----------------
  async function agregarPersona(nombre: string, faseIds: string[]) {
    const { data, error } = await supabase.from("rondas_personas").insert({ nombre }).select("id").single();
    if (error || !data) {
      avisar("No se pudo agregar: " + (error?.message ?? ""));
      return;
    }
    if (faseIds.length) {
      await supabase.from("rondas_persona_fases_habituales").insert(faseIds.map((fid) => ({ persona_id: data.id, fase_id: fid })));
    }
    await cargarTodo();
    avisar(nombre + " agregado");
  }

  async function editarPersona(id: string, nombre: string, faseIds: string[]) {
    await supabase.from("rondas_personas").update({ nombre }).eq("id", id);
    await supabase.from("rondas_persona_fases_habituales").delete().eq("persona_id", id);
    if (faseIds.length) {
      await supabase.from("rondas_persona_fases_habituales").insert(faseIds.map((fid) => ({ persona_id: id, fase_id: fid })));
    }
    await cargarTodo();
    avisar("Cambios guardados");
  }

  async function eliminarPersona(id: string, nombre: string) {
    await supabase.from("rondas_personas").update({ activo: false }).eq("id", id);
    await cargarTodo();
    avisar(nombre + " eliminado");
  }

  // ---------------- Órdenes: fases, roles y asignaciones ----------------
  async function reordenarFasesOrden(ordenId: string, nuevaListaFaseIds: string[]) {
    await supabase.from("rondas_orden_fases").delete().eq("orden_id", ordenId);
    if (nuevaListaFaseIds.length) {
      await supabase.from("rondas_orden_fases").insert(
        nuevaListaFaseIds.map((fid, idx) => ({ orden_id: ordenId, fase_id: fid, posicion: idx }))
      );
    }
    await cargarTodo();
  }

  async function agregarFaseCatalogo(nombre: string) {
    const slot = (fases.length % 6) + 1;
    const { error } = await supabase.from("rondas_fases").insert({ nombre, color_slot: slot });
    if (error) {
      avisar("No se pudo agregar la fase: " + error.message);
      return;
    }
    await cargarTodo();
    avisar(`"${nombre}" agregada al catálogo — ahora arrástrala a la orden que la necesite`);
  }

  async function agregarRol(faseId: string, nombre: string) {
    const { error } = await supabase.from("rondas_roles").insert({ fase_id: faseId, nombre });
    if (error) {
      avisar("No se pudo agregar el rol: " + error.message);
      return;
    }
    await cargarTodo();
    avisar(`Rol "${nombre}" agregado`);
  }

  async function asignarPersona(ordenId: string, personaId: string) {
    const { error } = await supabase.from("rondas_asignaciones").insert({ orden_id: ordenId, persona_id: personaId, fecha: hoyStr() });
    if (error && !error.message.includes("duplicate")) {
      avisar("No se pudo asignar: " + error.message);
      return;
    }
    await cargarTodo();
  }
  async function quitarAsignacion(ordenId: string, personaId: string) {
    await supabase.from("rondas_asignaciones").delete().eq("orden_id", ordenId).eq("persona_id", personaId).eq("fecha", hoyStr());
    await cargarTodo();
  }

  // ---------------- Drag & drop (puntero, funciona con mouse y touch) ----------------
  const dragRef = useRef<{ faseId: string; origenOrdenId: string | null; ghost: HTMLDivElement } | null>(null);

  function iniciarDrag(e: React.PointerEvent, faseId: string, origenOrdenId: string | null) {
    e.preventDefault();
    const ghost = document.createElement("div");
    ghost.textContent = faseLabel(faseId);
    Object.assign(ghost.style, {
      position: "fixed",
      zIndex: "50",
      pointerEvents: "none",
      borderRadius: "999px",
      padding: "7px 13px",
      font: "600 12.5px -apple-system,system-ui,sans-serif",
      boxShadow: "0 8px 24px rgba(0,0,0,.4)",
      transform: "translate(-50%,-50%) scale(1.04)",
      background: "var(--card-2)",
      border: `1.5px solid ${faseColor(faseId)}`,
      color: faseColor(faseId),
      left: e.clientX + "px",
      top: e.clientY + "px",
    });
    document.body.appendChild(ghost);
    dragRef.current = { faseId, origenOrdenId, ghost };

    function onMove(ev: PointerEvent) {
      if (!dragRef.current) return;
      dragRef.current.ghost.style.left = ev.clientX + "px";
      dragRef.current.ghost.style.top = ev.clientY + "px";
      document.querySelectorAll("[data-dropzone].over, [data-catalogo-zone].over").forEach((z) => z.classList.remove("over"));
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const zona = under?.closest("[data-dropzone],[data-catalogo-zone]");
      if (zona) zona.classList.add("over");
    }

    async function onUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onMove);
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag) return;
      document.querySelectorAll("[data-dropzone].over, [data-catalogo-zone].over").forEach((z) => z.classList.remove("over"));
      drag.ghost.remove();

      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      const dropzone = under?.closest("[data-dropzone]") as HTMLElement | null;
      const catalogoZone = under?.closest("[data-catalogo-zone]") as HTMLElement | null;

      if (dropzone) {
        const ordenId = dropzone.dataset.dropzone!;
        const actual = fasesDeOrden(ordenId).map((f) => f.id);
        let destino = actual.slice();
        if (drag.origenOrdenId && drag.origenOrdenId !== ordenId) {
          const origenActual = fasesDeOrden(drag.origenOrdenId).map((f) => f.id);
          await reordenarFasesOrden(drag.origenOrdenId, origenActual.filter((x) => x !== drag.faseId));
        } else if (drag.origenOrdenId === ordenId) {
          destino = destino.filter((x) => x !== drag.faseId);
        }
        if (!destino.includes(drag.faseId)) {
          const chips = Array.from(dropzone.querySelectorAll<HTMLElement>("[data-chip-fase]"));
          let idx = chips.length;
          for (let i = 0; i < chips.length; i++) {
            const r = chips[i].getBoundingClientRect();
            if (ev.clientY < r.top + r.height / 2) {
              idx = i;
              break;
            }
          }
          destino.splice(idx, 0, drag.faseId);
        }
        await reordenarFasesOrden(ordenId, destino);
      } else if (catalogoZone && drag.origenOrdenId) {
        const origenActual = fasesDeOrden(drag.origenOrdenId).map((f) => f.id);
        await reordenarFasesOrden(drag.origenOrdenId, origenActual.filter((x) => x !== drag.faseId));
        avisar("Fase quitada de esa orden");
      }
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
  }

  const subs: Record<string, string> = {
    ronda: "Marca la fase y el rol de cada persona al pasar",
    personal: "Busca, edita o agrega a quién trabaja contigo",
    ordenes: "Fases, roles y personas de cada orden de hoy",
    resumen: "Historial y vista previa del reporte mensual",
  };

  if (loading) {
    return (
      <div style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh" }} className="flex items-center justify-center text-[13px] text-text-dim">
        Cargando rondas…
      </div>
    );
  }

  return (
    <div
      style={{
        background: "var(--bg)",
        color: "var(--text)",
        minHeight: "100dvh",
        paddingLeft: "max(16px, env(safe-area-inset-left,0px))",
        paddingRight: "max(16px, env(safe-area-inset-right,0px))",
      }}
    >
      <div className="max-w-[640px] mx-auto flex flex-col min-h-[100dvh]">
        <div
          className="sticky z-10 pb-2.5 border-b border-border"
          style={{ top: "env(safe-area-inset-top,0px)", background: "var(--bg)", paddingTop: 14 }}
        >
          <div className="flex items-baseline justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <Link href="/etiquetado" className="text-[11px] text-text-faint hover:text-text">
                ← Etiquetado
              </Link>
              <h1 className="text-[18px] font-bold">Rondas de piso</h1>
            </div>
            <span className="text-[13px] font-semibold text-text-dim tabular-nums">{clock}</span>
          </div>
          <p className="text-[12px] text-text-faint mt-0.5">{subs[tab]}</p>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto py-4 flex flex-col gap-3" style={{ paddingBottom: 96 }}>
          {tab === "ronda" && (
            <RondaTab
              ordenes={ordenes}
              asignaciones={asignaciones}
              personaById={personaById}
              fasesDeOrden={fasesDeOrden}
              rolesDeFase={rolesDeFase}
              equipos={equipos}
              enCurso={enCurso}
              abierto={abierto}
              setAbierto={setAbierto}
              marcar={marcar}
              marcarEquipo={marcarEquipo}
              faseLabel={faseLabel}
              faseColor={faseColor}
              rolLabel={rolLabel}
              rondasHoy={rondasHoy}
              guardarRonda={guardarRonda}
              guardando={guardando}
            />
          )}
          {tab === "personal" && (
            <PersonalTab
              fases={fases}
              personas={personas}
              habituales={habituales}
              faseLabel={faseLabel}
              agregarPersona={agregarPersona}
              editarPersona={editarPersona}
              eliminarPersona={eliminarPersona}
            />
          )}
          {tab === "ordenes" && (
            <OrdenesTab
              fases={fases}
              ordenes={ordenes}
              personas={personas}
              asignaciones={asignaciones}
              fasesDeOrden={fasesDeOrden}
              rolesDeFase={rolesDeFase}
              iniciarDrag={iniciarDrag}
              agregarFaseCatalogo={agregarFaseCatalogo}
              agregarRol={agregarRol}
              asignarPersona={asignarPersona}
              quitarAsignacion={quitarAsignacion}
              reordenarFasesOrden={reordenarFasesOrden}
            />
          )}
          {tab === "resumen" && <ResumenTab rondasHoy={rondasHoy} fases={fases} />}
        </div>

        <nav
          className="fixed left-1/2 z-20 flex rounded-full overflow-hidden shadow-lg"
          style={{
            transform: "translateX(-50%)",
            bottom: "calc(14px + env(safe-area-inset-bottom,0px))",
            background: "var(--card)",
            border: "1px solid var(--border-2)",
            width: "calc(100% - 32px)",
            maxWidth: 420,
          }}
        >
          {(
            [
              ["ronda", "Ronda"],
              ["personal", "Personal"],
              ["ordenes", "Órdenes"],
              ["resumen", "Resumen"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold"
              style={{ color: tab === key ? "var(--accent-2)" : "var(--text-dim)" }}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}

// ========================= RONDA =========================
function RondaTab({
  ordenes,
  asignaciones,
  personaById,
  fasesDeOrden,
  rolesDeFase,
  equipos,
  enCurso,
  abierto,
  setAbierto,
  marcar,
  marcarEquipo,
  faseLabel,
  faseColor,
  rolLabel,
  rondasHoy,
  guardarRonda,
  guardando,
}: {
  ordenes: OrdenRef[];
  asignaciones: Asignacion[];
  personaById: (id: string) => Persona | undefined;
  fasesDeOrden: (ordenId: string) => Fase[];
  rolesDeFase: (faseId: string | null) => Rol[];
  equipos: Equipo[];
  enCurso: Record<string, Draft>;
  abierto: string | null;
  setAbierto: (v: string | null) => void;
  marcar: (personaId: string, ordenId: string, draft: Draft) => void;
  marcarEquipo: (personaIds: string[], ordenId: string, draftComun: Omit<Draft, "equipoId" | "ordenId">, nombreEquipo: string) => Promise<void>;
  faseLabel: (id: string | null) => string;
  faseColor: (id: string | null) => string;
  rolLabel: (id: string | null) => string;
  rondasHoy: RondaHoy[];
  guardarRonda: () => void;
  guardando: boolean;
}) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;
  const conPersonas = ordenes.filter((o) => asignaciones.some((a) => a.orden_id === o.id));
  const totalPages = Math.max(1, Math.ceil(conPersonas.length / PAGE_SIZE));
  const visibles = conPersonas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const [equipoModoOrdenId, setEquipoModoOrdenId] = useState<string | null>(null);
  const [equipoSeleccion, setEquipoSeleccion] = useState<string[]>([]);
  const [equipoPanelOrdenId, setEquipoPanelOrdenId] = useState<string | null>(null);

  function salirDeModoEquipo() {
    setEquipoModoOrdenId(null);
    setEquipoSeleccion([]);
    setEquipoPanelOrdenId(null);
  }

  return (
    <>
      {conPersonas.length === 0 && (
        <p className="text-center text-[12.5px] text-text-faint py-5">
          No hay personas asignadas a ninguna orden todavía — ve a la pestaña &quot;Órdenes&quot;.
        </p>
      )}
      {visibles.map((orden) => {
        const ids = asignaciones.filter((a) => a.orden_id === orden.id).map((a) => a.persona_id);
        const enModoEquipo = equipoModoOrdenId === orden.id;
        const panelAbierto = equipoPanelOrdenId === orden.id;
        const equiposDeEstaOrden = equipos.filter((e) => e.persona_ids.every((pid) => ids.includes(pid)));

        return (
          <div key={orden.id} className="card p-3.5 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-[14.5px] font-bold">{orden.numero_etq}</span>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-text-dim">{orden.cliente_nombre}</span>
                <button
                  onClick={() => {
                    if (enModoEquipo) {
                      salirDeModoEquipo();
                    } else {
                      setEquipoModoOrdenId(orden.id);
                      setEquipoSeleccion([]);
                    }
                  }}
                  className="text-[10.5px] font-bold px-2 py-1 rounded-full"
                  style={
                    enModoEquipo
                      ? { background: "var(--accent-2)", color: "#1a1626" }
                      : { border: "1px solid var(--border-2)", color: "var(--text-dim)" }
                  }
                >
                  👥 Equipo
                </button>
              </div>
            </div>

            {panelAbierto ? (
              <EquipoPanel
                orden={orden}
                personas={equipoSeleccion.map(personaById).filter(Boolean) as Persona[]}
                fases={fasesDeOrden(orden.id)}
                rolesDeFase={rolesDeFase}
                faseLabel={faseLabel}
                nombreSugerido={equiposDeEstaOrden.find((e) => arraysIguales([...e.persona_ids].sort(), [...equipoSeleccion].sort()))?.nombre}
                onCancelar={() => setEquipoPanelOrdenId(null)}
                onConfirmar={async (draftComun, nombreEquipo) => {
                  await marcarEquipo(equipoSeleccion, orden.id, draftComun, nombreEquipo);
                  salirDeModoEquipo();
                }}
              />
            ) : enModoEquipo ? (
              <>
                {equiposDeEstaOrden.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {equiposDeEstaOrden.map((e) => (
                      <button
                        key={e.id}
                        onClick={() => setEquipoSeleccion(e.persona_ids)}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full"
                        style={{ background: "var(--card-2)", border: "1px solid var(--border-2)", color: "var(--text-dim)" }}
                      >
                        {e.nombre} ({e.persona_ids.length})
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
                  {ids.map((pid) => {
                    const persona = personaById(pid);
                    if (!persona) return null;
                    const sel = equipoSeleccion.includes(pid);
                    return (
                      <button
                        key={pid}
                        onClick={() => setEquipoSeleccion((s) => (sel ? s.filter((x) => x !== pid) : [...s, pid]))}
                        className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left"
                        style={{ background: sel ? "color-mix(in srgb, var(--accent-2) 18%, transparent)" : "var(--card-2)", border: `1px solid ${sel ? "var(--accent-2)" : "var(--border)"}` }}
                      >
                        <span
                          className="w-4 h-4 rounded shrink-0 flex items-center justify-center text-[10px] font-bold"
                          style={{ background: sel ? "var(--accent-2)" : "transparent", border: `1px solid ${sel ? "var(--accent-2)" : "var(--border-2)"}`, color: "#1a1626" }}
                        >
                          {sel ? "✓" : ""}
                        </span>
                        <span className="text-[13px] font-semibold truncate">{persona.nombre}</span>
                      </button>
                    );
                  })}
                </div>
                <button
                  disabled={equipoSeleccion.length < 2}
                  onClick={() => setEquipoPanelOrdenId(orden.id)}
                  className="btn-primary w-full py-2.5 rounded-xl text-[12.5px] font-bold disabled:opacity-40"
                >
                  Marcar equipo ({equipoSeleccion.length}) →
                </button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2 max-[420px]:grid-cols-1">
                {ids.map((pid) => {
                  const persona = personaById(pid);
                  if (!persona) return null;
                  const marca = enCurso[pid];
                  const expandido = abierto === pid;
                  return (
                    <PersonaChip
                      key={pid}
                      persona={persona}
                      orden={orden}
                      marca={marca}
                      expandido={expandido}
                      fases={fasesDeOrden(orden.id)}
                      rolesDeFase={rolesDeFase}
                      faseLabel={faseLabel}
                      faseColor={faseColor}
                      rolLabel={rolLabel}
                      onToggle={() => setAbierto(expandido ? null : pid)}
                      onConfirmar={(d) => marcar(pid, orden.id, d)}
                      onCancelar={() => setAbierto(null)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <Paginador page={page} totalPages={totalPages} onChange={setPage} />

      <button
        onClick={guardarRonda}
        disabled={guardando}
        className="btn-primary w-full py-3 rounded-xl text-[13.5px] font-bold disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar ronda"}
      </button>
      <p className="text-[11px] text-text-faint text-center -mt-1.5">
        {rondasHoy.length === 0
          ? "Todavía no has guardado ninguna ronda hoy."
          : `Rondas guardadas hoy: ${rondasHoy.length} · última a las ${rondasHoy[0].hora}`}
      </p>
    </>
  );
}

function PersonaChip({
  persona,
  orden,
  marca,
  expandido,
  fases,
  rolesDeFase,
  faseLabel,
  faseColor,
  rolLabel,
  onToggle,
  onConfirmar,
  onCancelar,
}: {
  persona: Persona;
  orden: OrdenRef;
  marca: Draft | undefined;
  expandido: boolean;
  fases: Fase[];
  rolesDeFase: (faseId: string | null) => Rol[];
  faseLabel: (id: string | null) => string;
  faseColor: (id: string | null) => string;
  rolLabel: (id: string | null) => string;
  onToggle: () => void;
  onConfirmar: (d: Draft) => void;
  onCancelar: () => void;
}) {
  const vacio: Draft = { faseId: null, rolId: null, interrumpido: false, motivo: null, avance: 0, ordenId: orden.id };
  const [draft, setDraft] = useState<Draft>(marca ?? vacio);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el borrador al abrir/cambiar de persona, no un ciclo de sincronización
    if (expandido) setDraft(marca ?? vacio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandido, marca, orden.id]);

  const rolesActuales = rolesDeFase(draft.faseId);
  const faltaRol = !draft.interrumpido && !!draft.faseId && rolesActuales.length > 0 && !draft.rolId;

  return (
    <div className={expandido ? "col-span-2 flex flex-col gap-1.5 max-[420px]:col-span-1" : ""}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left"
        style={{ background: "var(--card-2)", border: `1px solid ${expandido ? "var(--accent)" : "var(--border)"}` }}
      >
        <span className="text-[13px] font-semibold truncate">{persona.nombre}</span>
        {!marca ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-dashed border-border-2 text-text-faint shrink-0">
            sin marcar
          </span>
        ) : marca.interrumpido ? (
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "rgba(248,113,113,.15)", color: "var(--red)" }}>
            Interrumpido
          </span>
        ) : (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 truncate max-w-[130px]"
            style={{ background: `color-mix(in srgb, ${faseColor(marca.faseId)} 18%, transparent)`, color: faseColor(marca.faseId) }}
          >
            {faseLabel(marca.faseId)}
            {marca.rolId ? ` · ${rolLabel(marca.rolId)}` : ""}
          </span>
        )}
      </button>

      {expandido && (
        <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--card-2)", border: "1px solid var(--border)" }}>
          <p className="text-[13px] font-bold">
            {persona.nombre} · {orden.numero_etq}
          </p>

          {fases.length === 0 ? (
            <p className="text-[11.5px] text-text-faint">
              Esta orden no tiene fases configuradas — ve a &quot;Órdenes&quot; y arrastra algunas.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {fases.map((f) => {
                const on = draft.faseId === f.id && !draft.interrumpido;
                return (
                  <button
                    key={f.id}
                    onClick={() => setDraft((d) => ({ ...d, faseId: f.id, rolId: null, interrumpido: false, motivo: null }))}
                    className="rounded-lg px-2 py-2.5 text-[12px] font-semibold text-center"
                    style={{
                      border: `1px solid ${on ? colorFaseSlot(f.color_slot) : "var(--border-2)"}`,
                      background: on ? `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 18%, transparent)` : "var(--card)",
                      color: on ? colorFaseSlot(f.color_slot) : "var(--text)",
                    }}
                  >
                    {f.nombre}
                  </button>
                );
              })}
            </div>
          )}

          {!draft.interrumpido && draft.faseId && rolesActuales.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-text-dim">¿Qué rol tenía en {faseLabel(draft.faseId)}?</p>
              <div className="flex flex-wrap gap-1.5">
                {rolesActuales.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setDraft((d) => ({ ...d, rolId: r.id }))}
                    className="rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold"
                    style={{
                      border: `1px solid ${draft.rolId === r.id ? "var(--accent-2)" : "var(--border-2)"}`,
                      background: draft.rolId === r.id ? "color-mix(in srgb, var(--accent-2) 18%, transparent)" : "var(--card)",
                      color: draft.rolId === r.id ? "var(--accent-2)" : "var(--text-dim)",
                    }}
                  >
                    {r.nombre}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() =>
              setDraft((d) => ({
                ...d,
                interrumpido: !d.interrumpido,
                faseId: d.interrumpido ? d.faseId : null,
                rolId: d.interrumpido ? d.rolId : null,
                motivo: d.interrumpido ? null : d.motivo,
              }))
            }
            className="rounded-lg px-2 py-2 text-[12px] font-semibold text-center"
            style={{
              border: `1px solid ${draft.interrumpido ? "var(--red)" : "var(--border-2)"}`,
              background: draft.interrumpido ? "rgba(248,113,113,.12)" : "var(--card)",
              color: draft.interrumpido ? "var(--red)" : "var(--text-dim)",
            }}
          >
            Interrumpido / sin trabajar
          </button>

          {draft.interrumpido && (
            <div className="flex flex-wrap gap-1.5">
              {MOTIVOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setDraft((d) => ({ ...d, motivo: m }))}
                  className="rounded-full px-2.5 py-1 text-[11px] font-medium"
                  style={{
                    border: `1px solid ${draft.motivo === m ? "var(--red)" : "var(--border-2)"}`,
                    background: draft.motivo === m ? "rgba(248,113,113,.12)" : "var(--card)",
                    color: draft.motivo === m ? "var(--red)" : "var(--text-dim)",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2.5">
            <span className="text-[12px] text-text-dim">Cajas/lotes avanzados (opcional)</span>
            <div className="flex items-center rounded-lg overflow-hidden border border-border-2">
              <button onClick={() => setDraft((d) => ({ ...d, avance: Math.max(0, d.avance - 1) }))} className="w-8 h-8 text-[16px] font-bold" style={{ background: "var(--card)" }}>
                –
              </button>
              <span className="w-9 text-center text-[13px] font-bold tabular-nums">{draft.avance}</span>
              <button onClick={() => setDraft((d) => ({ ...d, avance: d.avance + 1 }))} className="w-8 h-8 text-[16px] font-bold" style={{ background: "var(--card)" }}>
                +
              </button>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={onCancelar} className="text-[12px] font-bold px-3.5 py-2 rounded-lg text-text-dim">
              Cerrar
            </button>
            <button
              onClick={() => {
                if (!draft.faseId && !draft.interrumpido) return;
                if (draft.interrumpido && !draft.motivo) return;
                if (faltaRol) return;
                onConfirmar(draft);
              }}
              className="btn-primary text-[12px] font-bold px-3.5 py-2 rounded-lg disabled:opacity-40"
              disabled={faltaRol}
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Panel para marcar a VARIAS personas (un equipo) de una sola vez, con la
// misma fase/rol/interrupción/avance — igual a PersonaChip pero para N
// personas en vez de una, y pidiendo un nombre de equipo para poder
// reusarlo después (ej. "Mesa 1") y para que Trazabilidad de piso las
// agrupe como una sola mesa.
function EquipoPanel({
  orden,
  personas,
  fases,
  rolesDeFase,
  faseLabel,
  nombreSugerido,
  onCancelar,
  onConfirmar,
}: {
  orden: OrdenRef;
  personas: Persona[];
  fases: Fase[];
  rolesDeFase: (faseId: string | null) => Rol[];
  faseLabel: (id: string | null) => string;
  nombreSugerido?: string;
  onCancelar: () => void;
  onConfirmar: (draftComun: Omit<Draft, "equipoId" | "ordenId">, nombreEquipo: string) => void | Promise<void>;
}) {
  const [faseId, setFaseId] = useState<string | null>(null);
  const [rolId, setRolId] = useState<string | null>(null);
  const [interrumpido, setInterrumpido] = useState(false);
  const [motivo, setMotivo] = useState<string | null>(null);
  const [avance, setAvance] = useState(0);
  const [nombreEquipo, setNombreEquipo] = useState(nombreSugerido ?? "");
  const [guardando, setGuardando] = useState(false);

  const rolesActuales = rolesDeFase(faseId);
  const faltaRol = !interrumpido && !!faseId && rolesActuales.length > 0 && !rolId;
  const nombrePorDefecto = personas.map((p) => p.nombre.split(" ")[0]).join(" + ");

  return (
    <div className="rounded-xl p-3 flex flex-col gap-2.5" style={{ background: "var(--card-2)", border: "1px solid var(--border)" }}>
      <p className="text-[13px] font-bold">
        {personas.map((p) => p.nombre).join(", ")} · {orden.numero_etq}
      </p>
      <input
        value={nombreEquipo}
        onChange={(e) => setNombreEquipo(e.target.value)}
        placeholder={`Nombre del equipo (ej. Mesa 1) — si lo dejas vacío, se usa "${nombrePorDefecto}"`}
        className="w-full rounded-lg px-3 py-2 outline-none"
        style={INPUT_STYLE}
      />

      {fases.length === 0 ? (
        <p className="text-[11.5px] text-text-faint">Esta orden no tiene fases configuradas — ve a &quot;Órdenes&quot; y arrastra algunas.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {fases.map((f) => {
            const on = faseId === f.id && !interrumpido;
            return (
              <button
                key={f.id}
                onClick={() => {
                  setFaseId(f.id);
                  setRolId(null);
                  setInterrumpido(false);
                  setMotivo(null);
                }}
                className="rounded-lg px-2 py-2.5 text-[12px] font-semibold text-center"
                style={{
                  border: `1px solid ${on ? colorFaseSlot(f.color_slot) : "var(--border-2)"}`,
                  background: on ? `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 18%, transparent)` : "var(--card)",
                  color: on ? colorFaseSlot(f.color_slot) : "var(--text)",
                }}
              >
                {f.nombre}
              </button>
            );
          })}
        </div>
      )}

      {!interrumpido && faseId && rolesActuales.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-semibold text-text-dim">¿Qué rol tenía el equipo en {faseLabel(faseId)}?</p>
          <div className="flex flex-wrap gap-1.5">
            {rolesActuales.map((r) => (
              <button
                key={r.id}
                onClick={() => setRolId(r.id)}
                className="rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  border: `1px solid ${rolId === r.id ? "var(--accent-2)" : "var(--border-2)"}`,
                  background: rolId === r.id ? "color-mix(in srgb, var(--accent-2) 18%, transparent)" : "var(--card)",
                  color: rolId === r.id ? "var(--accent-2)" : "var(--text-dim)",
                }}
              >
                {r.nombre}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => {
          setInterrumpido((v) => !v);
          setFaseId(null);
          setRolId(null);
          setMotivo(null);
        }}
        className="rounded-lg px-2 py-2 text-[12px] font-semibold text-center"
        style={{
          border: `1px solid ${interrumpido ? "var(--red)" : "var(--border-2)"}`,
          background: interrumpido ? "rgba(248,113,113,.12)" : "var(--card)",
          color: interrumpido ? "var(--red)" : "var(--text-dim)",
        }}
      >
        Interrumpido / sin trabajar
      </button>

      {interrumpido && (
        <div className="flex flex-wrap gap-1.5">
          {MOTIVOS.map((m) => (
            <button
              key={m}
              onClick={() => setMotivo(m)}
              className="rounded-full px-2.5 py-1 text-[11px] font-medium"
              style={{
                border: `1px solid ${motivo === m ? "var(--red)" : "var(--border-2)"}`,
                background: motivo === m ? "rgba(248,113,113,.12)" : "var(--card)",
                color: motivo === m ? "var(--red)" : "var(--text-dim)",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2.5">
        <span className="text-[12px] text-text-dim">Cajas/lotes avanzados por el equipo (opcional)</span>
        <div className="flex items-center rounded-lg overflow-hidden border border-border-2">
          <button onClick={() => setAvance((a) => Math.max(0, a - 1))} className="w-8 h-8 text-[16px] font-bold" style={{ background: "var(--card)" }}>
            –
          </button>
          <span className="w-9 text-center text-[13px] font-bold tabular-nums">{avance}</span>
          <button onClick={() => setAvance((a) => a + 1)} className="w-8 h-8 text-[16px] font-bold" style={{ background: "var(--card)" }}>
            +
          </button>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancelar} className="text-[12px] font-bold px-3.5 py-2 rounded-lg text-text-dim">
          Cerrar
        </button>
        <button
          onClick={async () => {
            if (!faseId && !interrumpido) return;
            if (interrumpido && !motivo) return;
            if (faltaRol) return;
            setGuardando(true);
            await onConfirmar({ faseId, rolId, interrumpido, motivo, avance }, nombreEquipo.trim() || nombrePorDefecto);
            setGuardando(false);
          }}
          className="btn-primary text-[12px] font-bold px-3.5 py-2 rounded-lg disabled:opacity-40"
          disabled={faltaRol || guardando}
        >
          {guardando ? "Marcando…" : `Confirmar equipo (${personas.length})`}
        </button>
      </div>
    </div>
  );
}

// ========================= PERSONAL =========================
function PersonalTab({
  fases,
  personas,
  habituales,
  faseLabel,
  agregarPersona,
  editarPersona,
  eliminarPersona,
}: {
  fases: Fase[];
  personas: Persona[];
  habituales: PersonaHabitual[];
  faseLabel: (id: string | null) => string;
  agregarPersona: (nombre: string, faseIds: string[]) => void;
  editarPersona: (id: string, nombre: string, faseIds: string[]) => void;
  eliminarPersona: (id: string, nombre: string) => void;
}) {
  const [nombre, setNombre] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editSel, setEditSel] = useState<string[]>([]);

  const [busq, setBusq] = useState("");
  const [filtroFase, setFiltroFase] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const filtradas = personas.filter((p) => {
    if (busq.trim() && !p.nombre.toLowerCase().includes(busq.trim().toLowerCase())) return false;
    if (filtroFase && !habituales.some((h) => h.persona_id === p.id && h.fase_id === filtroFase)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visibles = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function iniciarEdicion(p: Persona) {
    setEditandoId(p.id);
    setEditNombre(p.nombre);
    setEditSel(habituales.filter((h) => h.persona_id === p.id).map((h) => h.fase_id));
  }

  return (
    <>
      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint">Agregar persona</h2>
      <div className="card p-3.5 flex flex-col gap-2.5">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          className="w-full rounded-lg px-3 py-2.5 outline-none"
          style={INPUT_STYLE}
        />
        <div className="flex flex-wrap gap-1.5">
          {fases.map((f) => {
            const on = sel.includes(f.id);
            return (
              <button
                key={f.id}
                onClick={() => setSel((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
                className="rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold"
                style={{
                  border: `1px solid ${on ? colorFaseSlot(f.color_slot) : "var(--border-2)"}`,
                  background: on ? `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 15%, transparent)` : "var(--card-2)",
                  color: on ? colorFaseSlot(f.color_slot) : "var(--text-dim)",
                }}
              >
                {f.nombre}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => {
            if (!nombre.trim()) return;
            agregarPersona(nombre.trim(), sel);
            setNombre("");
            setSel([]);
          }}
          className="btn-primary self-start text-[12.5px] font-bold px-4 py-2 rounded-lg"
        >
          Agregar
        </button>
      </div>

      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint">Personal registrado ({filtradas.length})</h2>
      <div className="flex gap-2">
        <input
          value={busq}
          onChange={(e) => {
            setBusq(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por nombre…"
          className="flex-1 rounded-lg px-3 py-2 outline-none"
          style={INPUT_STYLE}
        />
        <select
          value={filtroFase}
          onChange={(e) => {
            setFiltroFase(e.target.value);
            setPage(1);
          }}
          className="rounded-lg px-2 py-2 shrink-0"
          style={{ ...INPUT_STYLE, maxWidth: 150 }}
        >
          <option value="">Todas las fases</option>
          {fases.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="card p-3.5">
        {filtradas.length === 0 && (
          <p className="text-[12.5px] text-text-faint text-center py-3">
            {personas.length === 0 ? "Todavía no has agregado a nadie." : "Nadie coincide con esa búsqueda/filtro."}
          </p>
        )}
        {visibles.map((p, i) => {
          const fids = habituales.filter((h) => h.persona_id === p.id).map((h) => h.fase_id);
          const editando = editandoId === p.id;
          return (
            <div key={p.id} className={`py-2.5 ${i > 0 ? "border-t border-border" : ""}`}>
              {editando ? (
                <div className="flex flex-col gap-2">
                  <input
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 outline-none"
                    style={INPUT_STYLE}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {fases.map((f) => {
                      const on = editSel.includes(f.id);
                      return (
                        <button
                          key={f.id}
                          onClick={() => setEditSel((s) => (on ? s.filter((x) => x !== f.id) : [...s, f.id]))}
                          className="rounded-full px-2.5 py-1.5 text-[11.5px] font-semibold"
                          style={{
                            border: `1px solid ${on ? colorFaseSlot(f.color_slot) : "var(--border-2)"}`,
                            background: on ? `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 15%, transparent)` : "var(--card-2)",
                            color: on ? colorFaseSlot(f.color_slot) : "var(--text-dim)",
                          }}
                        >
                          {f.nombre}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setEditandoId(null)} className="text-[12px] font-bold px-3.5 py-2 rounded-lg text-text-dim">
                      Cancelar
                    </button>
                    <button
                      onClick={() => {
                        if (!editNombre.trim()) return;
                        editarPersona(p.id, editNombre.trim(), editSel);
                        setEditandoId(null);
                      }}
                      className="btn-primary text-[12px] font-bold px-3.5 py-2 rounded-lg"
                    >
                      Guardar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2.5">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold">{p.nombre}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {fids.length === 0 ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-text-faint" style={{ background: "var(--card-2)" }}>
                          sin fase habitual
                        </span>
                      ) : (
                        fids.map((fid) => (
                          <span key={fid} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-text-dim" style={{ background: "var(--card-2)" }}>
                            {faseLabel(fid)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => iniciarEdicion(p)}
                      className="w-8 h-8 rounded-lg text-[12px] font-bold"
                      style={{ border: "1px solid var(--border-2)", color: "var(--text-dim)" }}
                      title="Editar"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        if (confirmandoId !== p.id) {
                          setConfirmandoId(p.id);
                          setTimeout(() => setConfirmandoId((c) => (c === p.id ? null : c)), 2500);
                          return;
                        }
                        eliminarPersona(p.id, p.nombre);
                        setConfirmandoId(null);
                      }}
                      className="w-8 h-8 rounded-lg text-[14px] font-bold"
                      style={{ border: "1px solid var(--red)", color: "var(--red)" }}
                      title="Eliminar"
                    >
                      {confirmandoId === p.id ? "✓?" : "×"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Paginador page={page} totalPages={totalPages} onChange={setPage} />
    </>
  );
}

// ========================= ÓRDENES =========================
function OrdenesTab({
  fases,
  ordenes,
  personas,
  asignaciones,
  fasesDeOrden,
  rolesDeFase,
  iniciarDrag,
  agregarFaseCatalogo,
  agregarRol,
  asignarPersona,
  quitarAsignacion,
  reordenarFasesOrden,
}: {
  fases: Fase[];
  ordenes: OrdenRef[];
  personas: Persona[];
  asignaciones: Asignacion[];
  fasesDeOrden: (ordenId: string) => Fase[];
  rolesDeFase: (faseId: string | null) => Rol[];
  iniciarDrag: (e: React.PointerEvent, faseId: string, origenOrdenId: string | null) => void;
  agregarFaseCatalogo: (nombre: string) => void;
  agregarRol: (faseId: string, nombre: string) => void;
  asignarPersona: (ordenId: string, personaId: string) => void;
  quitarAsignacion: (ordenId: string, personaId: string) => void;
  reordenarFasesOrden: (ordenId: string, nuevaListaFaseIds: string[]) => Promise<void>;
}) {
  const [nuevaFase, setNuevaFase] = useState("");
  const [faseRolAbierta, setFaseRolAbierta] = useState<string | null>(null);
  const [nuevoRol, setNuevoRol] = useState("");

  const [busq, setBusq] = useState("");
  const [filtro, setFiltro] = useState<"todas" | "sin-fases" | "sin-personas">("todas");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 4;

  const filtradas = ordenes.filter((o) => {
    if (busq.trim()) {
      const q = busq.trim().toLowerCase();
      if (!o.numero_etq.toLowerCase().includes(q) && !o.cliente_nombre.toLowerCase().includes(q)) return false;
    }
    if (filtro === "sin-fases" && fasesDeOrden(o.id).length > 0) return false;
    if (filtro === "sin-personas" && asignaciones.some((a) => a.orden_id === o.id)) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtradas.length / PAGE_SIZE));
  const visibles = filtradas.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint">Catálogo de fases y roles</h2>
      <div className="card p-3.5">
        <p className="text-[12px] text-text-faint mb-2.5">
          Arrastra una fase de aquí hacia &quot;Fases de esta orden&quot; en cada orden de abajo, en el orden en que realmente ocurren. Toca
          una fase para ver/agregar sus roles (ej. en Inventario: el que ingresa y el ayudante que cuenta).
        </p>
        <div data-catalogo-zone className="flex flex-col gap-2 min-h-[38px] rounded-xl transition-colors [&.over]:bg-[rgba(248,113,113,.12)]">
          {fases.map((f) => {
            const rolesF = rolesDeFase(f.id);
            const abierta = faseRolAbierta === f.id;
            return (
              <div key={f.id} className="flex flex-col gap-1.5">
                <div
                  onPointerDown={(e) => iniciarDrag(e, f.id, null)}
                  onClick={() => setFaseRolAbierta(abierta ? null : f.id)}
                  className="self-start flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-semibold cursor-grab select-none"
                  style={{
                    touchAction: "none",
                    background: `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 15%, transparent)`,
                    border: `1.5px solid ${colorFaseSlot(f.color_slot)}`,
                    color: colorFaseSlot(f.color_slot),
                  }}
                >
                  <span className="opacity-50 text-[11px]">⠿</span>
                  {f.nombre}
                  <span className="text-[10px] opacity-70">({rolesF.length} rol{rolesF.length === 1 ? "" : "es"})</span>
                </div>
                {abierta && (
                  <div className="ml-3 pl-3 flex flex-col gap-2" style={{ borderLeft: "2px solid var(--border-2)" }}>
                    <div className="flex flex-wrap gap-1.5">
                      {rolesF.length === 0 && <span className="text-[11px] text-text-faint">Todavía no tiene roles.</span>}
                      {rolesF.map((r) => (
                        <span key={r.id} className="text-[11px] font-semibold px-2 py-1 rounded-full text-text-dim" style={{ background: "var(--card-2)" }}>
                          {r.nombre}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={faseRolAbierta === f.id ? nuevoRol : ""}
                        onChange={(e) => setNuevoRol(e.target.value)}
                        placeholder={`Nuevo rol en ${f.nombre}…`}
                        className="flex-1 rounded-lg px-2.5 py-1.5 outline-none"
                        style={{ ...INPUT_STYLE, fontSize: 16 }}
                      />
                      <button
                        onClick={() => {
                          if (!nuevoRol.trim()) return;
                          agregarRol(f.id, nuevoRol.trim());
                          setNuevoRol("");
                        }}
                        className="btn-secondary text-[12px] font-bold px-2.5 py-1.5 rounded-lg shrink-0"
                      >
                        + Rol
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2.5">
          <input
            value={nuevaFase}
            onChange={(e) => setNuevaFase(e.target.value)}
            placeholder="¿Falta una fase? Escríbela aquí…"
            className="flex-1 rounded-lg px-2.5 py-2 outline-none"
            style={INPUT_STYLE}
          />
          <button
            onClick={() => {
              if (!nuevaFase.trim()) return;
              agregarFaseCatalogo(nuevaFase.trim());
              setNuevaFase("");
            }}
            className="btn-secondary text-[12px] font-bold px-3 py-2 rounded-lg shrink-0"
          >
            + Agregar al catálogo
          </button>
        </div>
      </div>

      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint">Órdenes abiertas ({filtradas.length})</h2>
      <div className="flex gap-2">
        <input
          value={busq}
          onChange={(e) => {
            setBusq(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar por número o cliente…"
          className="flex-1 rounded-lg px-3 py-2 outline-none"
          style={INPUT_STYLE}
        />
        <select
          value={filtro}
          onChange={(e) => {
            setFiltro(e.target.value as typeof filtro);
            setPage(1);
          }}
          className="rounded-lg px-2 py-2 shrink-0"
          style={{ ...INPUT_STYLE, maxWidth: 150 }}
        >
          <option value="todas">Todas</option>
          <option value="sin-fases">Sin fases</option>
          <option value="sin-personas">Sin personas</option>
        </select>
      </div>

      {filtradas.length === 0 && <p className="text-[12.5px] text-text-faint text-center py-4">No hay órdenes que coincidan.</p>}
      {visibles.map((orden) => {
        const fasesOrden = fasesDeOrden(orden.id);
        const idsAsignados = asignaciones.filter((a) => a.orden_id === orden.id).map((a) => a.persona_id);
        const disponibles = personas.filter((p) => !idsAsignados.includes(p.id));
        return (
          <div key={orden.id} className="card p-3.5 flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap">
              <span className="text-[14.5px] font-bold">{orden.numero_etq}</span>
              <span className="text-[12px] text-text-dim">{orden.cliente_nombre}</span>
            </div>

            <p className="text-[11.5px] font-semibold text-text-dim">Fases de esta orden, en orden:</p>
            <div
              data-dropzone={orden.id}
              className="flex flex-wrap gap-1.5 min-h-[44px] p-2 rounded-xl border-2 border-dashed border-border-2 transition-colors [&.over]:border-accent [&.over]:bg-accent/10"
            >
              {fasesOrden.length === 0 && <span className="text-[11.5px] text-text-faint px-0.5 py-1.5">Arrastra fases aquí desde el catálogo de arriba</span>}
              {fasesOrden.map((f, idx) => (
                <div
                  key={f.id}
                  data-chip-fase
                  onPointerDown={(e) => iniciarDrag(e, f.id, orden.id)}
                  className="flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1.5 text-[12px] font-semibold cursor-grab select-none"
                  style={{
                    touchAction: "none",
                    background: `color-mix(in srgb, ${colorFaseSlot(f.color_slot)} 15%, transparent)`,
                    border: `1.5px solid ${colorFaseSlot(f.color_slot)}`,
                    color: colorFaseSlot(f.color_slot),
                  }}
                >
                  <span className="text-[10px] font-bold opacity-70">{idx + 1}</span>
                  {f.nombre}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reordenarFasesOrden(orden.id, fasesOrden.filter((x) => x.id !== f.id).map((x) => x.id));
                    }}
                    className="w-4 h-4 rounded-full text-[11px] font-bold flex items-center justify-center"
                    style={{ background: "rgba(0,0,0,.2)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <p className="text-[11.5px] font-semibold text-text-dim mt-1">Personas asignadas hoy:</p>
            <div className="flex flex-wrap gap-1.5">
              {idsAsignados.length === 0 && <span className="text-[11.5px] text-text-faint">Nadie asignado todavía.</span>}
              {idsAsignados.map((pid) => {
                const p = personas.find((x) => x.id === pid);
                if (!p) return null;
                return (
                  <span key={pid} className="flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-[12px] font-semibold" style={{ background: "var(--card-2)" }}>
                    {p.nombre}
                    <button
                      onClick={() => quitarAsignacion(orden.id, pid)}
                      className="w-4 h-4 rounded-full text-[11px] font-bold flex items-center justify-center"
                      style={{ background: "rgba(0,0,0,.25)" }}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
            <select
              onChange={(e) => {
                if (e.target.value) asignarPersona(orden.id, e.target.value);
                e.target.value = "";
              }}
              defaultValue=""
              className="rounded-lg px-2.5 py-2"
              style={INPUT_STYLE}
            >
              <option value="">+ Agregar persona a esta orden…</option>
              {disponibles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>
        );
      })}
      <Paginador page={page} totalPages={totalPages} onChange={setPage} />
    </>
  );
}

// ========================= RESUMEN =========================
function ResumenTab({ rondasHoy, fases }: { rondasHoy: RondaHoy[]; fases: Fase[] }) {
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 6;
  const totalPages = Math.max(1, Math.ceil(rondasHoy.length / PAGE_SIZE));
  const visibles = rondasHoy.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const ejemplo = [
    { n: "Rubén", d: [["Inventario", 55], ["Preclasificación", 10], ["__interrumpido", 35]] },
    { n: "Francisco", d: [["Inventario", 60], ["Preclasificación", 15], ["__interrumpido", 25]] },
    { n: "Daniela", d: [["Marquilla", 40], ["Etiquetado", 45], ["__interrumpido", 15]] },
    { n: "Teresa", d: [["Etiquetado", 70], ["Marquilla", 10], ["__interrumpido", 20]] },
  ] as const;

  function colorPorNombre(nombre: string) {
    const f = fases.find((x) => x.nombre === nombre);
    return f ? colorFaseSlot(f.color_slot) : "var(--text-dim)";
  }

  return (
    <>
      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint">Rondas guardadas hoy</h2>
      <div className="card p-3.5">
        {rondasHoy.length === 0 ? (
          <p className="text-[12.5px] text-text-faint text-center py-3">Todavía no hay rondas guardadas hoy.</p>
        ) : (
          visibles.map((r, i) => (
            <div key={r.id} className={`flex items-baseline justify-between gap-2 py-2 text-[12.5px] ${i > 0 ? "border-t border-border" : ""}`}>
              <span>{r.total} personas registradas</span>
              <span className="text-text-dim tabular-nums">{r.hora}</span>
            </div>
          ))
        )}
      </div>
      <Paginador page={page} totalPages={totalPages} onChange={setPage} />

      <div className="card p-3.5 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[12.5px] text-text-dim">
          El detalle completo (por persona, orden, fase y rol) ya se puede filtrar en Reportes de etiquetado, en la pestaña{" "}
          <b>&quot;Trazabilidad de piso&quot;</b>, junto a Productividad.
        </p>
        <Link href="/etiquetado/reportes" className="btn-secondary text-[12px] font-bold px-3 py-2 rounded-lg shrink-0">
          Ir a Reportes →
        </Link>
      </div>

      <h2 className="text-[12.5px] font-bold uppercase tracking-wide text-text-faint flex items-center gap-2">
        Vista rápida
        <span className="text-[10px] font-bold uppercase tracking-wide text-text-faint px-2 py-0.5 rounded-full" style={{ background: "var(--card-2)", border: "1px solid var(--border-2)" }}>
          vista previa · datos de ejemplo
        </span>
      </h2>
      <div className="card p-3.5">
        <p className="text-[12px] text-text-faint mb-2.5">
          Así se vería al acumular rondas reales durante el mes — % de tiempo que cada persona aparece en cada fase:
        </p>
        {ejemplo.map((f, i) => (
          <div key={f.n} className={`flex items-center gap-2.5 py-2 ${i > 0 ? "border-t border-border" : ""}`}>
            <span className="w-[84px] shrink-0 text-[12.5px] font-semibold">{f.n}</span>
            <div className="flex-1 flex h-4 rounded overflow-hidden min-w-0" style={{ background: "var(--card-2)" }}>
              {f.d.map(([label, pct]) =>
                pct > 0 ? (
                  <span
                    key={label}
                    style={{
                      width: pct + "%",
                      background: label === "__interrumpido" ? "var(--red)" : colorPorNombre(label),
                    }}
                  />
                ) : null
              )}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap gap-2.5 mt-2.5">
          {fases.map((f) => (
            <span key={f.id} className="flex items-center gap-1.5 text-[11px] text-text-dim">
              <span className="w-2 h-2 rounded-[3px]" style={{ background: colorFaseSlot(f.color_slot) }} />
              {f.nombre}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[11px] text-text-dim">
            <span className="w-2 h-2 rounded-[3px]" style={{ background: "var(--red)" }} />
            Interrumpido
          </span>
        </div>
      </div>
    </>
  );
}
