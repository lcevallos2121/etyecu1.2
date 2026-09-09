"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Copy, X, Power, ChevronRight, RotateCw, MessageCircle, Send, Image as ImageIcon } from "lucide-react";
import { Toast, ConfirmModal } from "@/components/Feedback";

export const dynamic = "force-dynamic";

// Cliente combinado: un mismo cliente real (por nombre) puede tener un id
// en la tabla "clientes" (DAP), un id en "etq_clientes" (Etiquetado), o
// ambos a la vez con id's distintos. Se identifica por su NOMBRE, no por
// un solo id, para que el portal le dé un único acceso combinado sin
// importar de qué tabla(s) venga.
type ClienteCombinado = {
  nombre: string;
  clienteDapId: string | null;
  etqClienteId: string | null;
  rucCi: string | null; // el que esté disponible, solo para mostrar en el selector
};

type Acceso = {
  id: string;
  cliente_nombre: string;
  usuario: string;
  activo: boolean;
  ultimo_acceso: string | null;
};

type OrdenDapRef = { id: string; numero_dap: string };
type EtqOrdenRef = { id: string; numero_etq: string; estado: string };

type FaseOrden = {
  id: string;
  cliente_nombre: string;
  orden_dap_id: string | null;
  etq_orden_id: string | null;
  fases: string[];
  fase_actual: number;
  visible: boolean;
};

export default function TrackingImportadoresPage() {
  const supabase = createClient();

  const [clientes, setClientes] = useState<ClienteCombinado[]>([]);
  const [clienteNombre, setClienteNombre] = useState("");
  const [loading, setLoading] = useState(true);

  const [acceso, setAcceso] = useState<Acceso | null>(null);
  const [nuevoUsuario, setNuevoUsuario] = useState("");
  const [claveGenerada, setClaveGenerada] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  const [ordenesDap, setOrdenesDap] = useState<OrdenDapRef[]>([]);
  const [ordenesEtq, setOrdenesEtq] = useState<EtqOrdenRef[]>([]);
  const [fasesConfig, setFasesConfig] = useState<FaseOrden[]>([]);

  const [editandoFasesId, setEditandoFasesId] = useState<string | null>(null);
  const [fasesTexto, setFasesTexto] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [aDesactivar, setADesactivar] = useState(false);
  const [noLeidosPorFase, setNoLeidosPorFase] = useState<Record<string, number>>({});
  const [chatFaseId, setChatFaseId] = useState<string | null>(null);

  // Correos que reciben notificación cuando un cliente escribe en el chat
  const [mostrarCorreos, setMostrarCorreos] = useState(false);
  const [correos, setCorreos] = useState<{ id: string; correo: string; activo: boolean }[]>([]);
  const [nuevoCorreo, setNuevoCorreo] = useState("");
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);

  const cargarCorreos = useCallback(async () => {
    const { data } = await supabase
      .from("portal_notificaciones_correos")
      .select("id, correo, activo")
      .order("creado_en");
    setCorreos(data ?? []);
  }, [supabase]);

  useEffect(() => {
    cargarCorreos();
  }, [cargarCorreos]);

  async function agregarCorreo() {
    const limpio = nuevoCorreo.trim().toLowerCase();
    if (!limpio || !limpio.includes("@")) {
      setErrorMsg("Escribe un correo válido.");
      return;
    }
    setGuardandoCorreo(true);
    setErrorMsg(null);
    try {
      const { error } = await supabase
        .from("portal_notificaciones_correos")
        .insert({ correo: limpio });
      if (error) {
        setErrorMsg(
          error.message.includes("duplicate") ? "Ese correo ya está en la lista." : error.message
        );
        return;
      }
      setNuevoCorreo("");
      setToast("Correo agregado.");
      cargarCorreos();
    } finally {
      setGuardandoCorreo(false);
    }
  }

  async function toggleCorreoActivo(id: string, activo: boolean) {
    await supabase.from("portal_notificaciones_correos").update({ activo: !activo }).eq("id", id);
    cargarCorreos();
  }

  async function eliminarCorreo(id: string) {
    await supabase.from("portal_notificaciones_correos").delete().eq("id", id);
    cargarCorreos();
  }

  const cargarClientes = useCallback(async () => {
    const [dapRes, etqRes] = await Promise.all([
      supabase.from("clientes").select("id, nombre, ruc_ci").order("nombre"),
      supabase.from("etq_clientes").select("id, nombre, ruc_ci").order("nombre"),
    ]);

    // Combina ambas listas agrupando por nombre normalizado (mayúsculas,
    // espacios recortados) — así un cliente que existe en ambas tablas
    // (mismo nombre, id's distintos) aparece UNA SOLA VEZ en el selector.
    const combinados = new Map<string, ClienteCombinado>();

    (dapRes.data ?? []).forEach((c: { id: string; nombre: string; ruc_ci: string }) => {
      const clave = c.nombre.trim().toUpperCase();
      const actual = combinados.get(clave) ?? {
        nombre: c.nombre,
        clienteDapId: null,
        etqClienteId: null,
        rucCi: null,
      };
      actual.clienteDapId = c.id;
      actual.rucCi = actual.rucCi ?? c.ruc_ci;
      combinados.set(clave, actual);
    });

    (etqRes.data ?? []).forEach((c: { id: string; nombre: string; ruc_ci: string | null }) => {
      const clave = c.nombre.trim().toUpperCase();
      const actual = combinados.get(clave) ?? {
        nombre: c.nombre,
        clienteDapId: null,
        etqClienteId: null,
        rucCi: null,
      };
      actual.etqClienteId = c.id;
      actual.rucCi = actual.rucCi ?? c.ruc_ci;
      combinados.set(clave, actual);
    });

    setClientes(
      Array.from(combinados.values()).sort((a, b) => a.nombre.localeCompare(b.nombre))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarClientes();
  }, [cargarClientes]);

  const cargarDatosCliente = useCallback(
    async (nombre: string) => {
      if (!nombre) return;
      const clienteInfo = clientes.find((c) => c.nombre === nombre);

      const [accRes, dapRes, etqRes, fasesRes] = await Promise.all([
        supabase.from("portal_accesos").select("*").eq("cliente_nombre", nombre).maybeSingle(),
        clienteInfo?.clienteDapId
          ? supabase
              .from("ordenes_dap")
              .select("id, numero_dap")
              .eq("cliente_id", clienteInfo.clienteDapId)
              .order("creado_en", { ascending: false })
          : Promise.resolve({ data: [] as OrdenDapRef[] }),
        clienteInfo?.etqClienteId
          ? supabase
              .from("etq_ordenes")
              .select("id, numero_etq, estado")
              .eq("etq_cliente_id", clienteInfo.etqClienteId)
              .order("creado_en", { ascending: false })
          : Promise.resolve({ data: [] as EtqOrdenRef[] }),
        supabase.from("portal_ordenes_fases").select("*").eq("cliente_nombre", nombre),
      ]);
      setAcceso((accRes.data as Acceso) ?? null);
      setOrdenesDap((dapRes.data as OrdenDapRef[]) ?? []);
      setOrdenesEtq((etqRes.data as EtqOrdenRef[]) ?? []);
      setFasesConfig((fasesRes.data as FaseOrden[]) ?? []);

      // Conteo de mensajes del cliente que el equipo aún no ha leído, por orden
      const idsFases = (fasesRes.data as FaseOrden[] | null)?.map((f) => f.id) ?? [];
      if (idsFases.length > 0) {
        const { data: pendientes } = await supabase
          .from("portal_mensajes")
          .select("orden_fase_id")
          .in("orden_fase_id", idsFases)
          .eq("autor", "cliente")
          .eq("leido", false);
        const conteo: Record<string, number> = {};
        (pendientes ?? []).forEach((m: { orden_fase_id: string }) => {
          conteo[m.orden_fase_id] = (conteo[m.orden_fase_id] ?? 0) + 1;
        });
        setNoLeidosPorFase(conteo);
      } else {
        setNoLeidosPorFase({});
      }
    },
    [supabase, clientes]
  );

  useEffect(() => {
    if (clienteNombre) cargarDatosCliente(clienteNombre);
  }, [clienteNombre, cargarDatosCliente]);

  async function generarAcceso() {
    if (!nuevoUsuario.trim()) {
      setErrorMsg("Escribe un nombre de usuario para el cliente.");
      return;
    }
    setGenerando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/portal-importador/generar-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_nombre: clienteNombre, usuario: nuevoUsuario }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "No se pudo generar el acceso.");
        return;
      }
      setClaveGenerada(data.clave);
      cargarDatosCliente(clienteNombre);
    } finally {
      setGenerando(false);
    }
  }

  // Genera una clave NUEVA para el mismo usuario ya existente. Se necesita
  // porque la clave nunca se guarda en texto plano (solo su hash) — si no
  // se copió a tiempo la primera vez, no hay forma de "volver a verla",
  // solo de generar una nueva que reemplaza a la anterior.
  async function regenerarClave() {
    if (!acceso) return;
    setGenerando(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/portal-importador/generar-acceso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cliente_nombre: clienteNombre, usuario: acceso.usuario }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error ?? "No se pudo regenerar la clave.");
        return;
      }
      setClaveGenerada(data.clave);
      cargarDatosCliente(clienteNombre);
    } finally {
      setGenerando(false);
    }
  }

  async function desactivarAcceso() {
    if (!acceso) return;
    await supabase.from("portal_accesos").update({ activo: false }).eq("id", acceso.id);
    setADesactivar(false);
    setToast("Acceso desactivado. El cliente ya no podrá iniciar sesión.");
    cargarDatosCliente(clienteNombre);
  }

  async function reactivarAcceso() {
    if (!acceso) return;
    await supabase.from("portal_accesos").update({ activo: true }).eq("id", acceso.id);
    setToast("Acceso reactivado.");
    cargarDatosCliente(clienteNombre);
  }

  function abrirEditarFases(tipo: "dap" | "etq", ordenId: string) {
    const existente = fasesConfig.find((f) =>
      tipo === "dap" ? f.orden_dap_id === ordenId : f.etq_orden_id === ordenId
    );
    setEditandoFasesId(`${tipo}:${ordenId}`);
    setFasesTexto(existente ? existente.fases.join(", ") : "");
  }

  async function guardarFases() {
    if (!editandoFasesId) return;
    const [tipo, ordenId] = editandoFasesId.split(":");
    const fasesArr = fasesTexto
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const existente = fasesConfig.find((f) =>
      tipo === "dap" ? f.orden_dap_id === ordenId : f.etq_orden_id === ordenId
    );

    if (existente) {
      await supabase
        .from("portal_ordenes_fases")
        .update({ fases: fasesArr, actualizado_en: new Date().toISOString() })
        .eq("id", existente.id);
    } else {
      await supabase.from("portal_ordenes_fases").insert({
        cliente_nombre: clienteNombre,
        orden_dap_id: tipo === "dap" ? ordenId : null,
        etq_orden_id: tipo === "etq" ? ordenId : null,
        fases: fasesArr,
        fase_actual: 0,
      });
    }
    setEditandoFasesId(null);
    setToast("Fases guardadas.");
    cargarDatosCliente(clienteNombre);
  }

  async function avanzarFase(fase: FaseOrden, delta: number) {
    const nueva = Math.max(0, Math.min(fase.fases.length - 1, fase.fase_actual + delta));
    await supabase
      .from("portal_ordenes_fases")
      .update({ fase_actual: nueva, actualizado_en: new Date().toISOString() })
      .eq("id", fase.id);
    cargarDatosCliente(clienteNombre);
  }

  function copiarLink() {
    const url = `${window.location.origin}/portal-importador/login`;
    navigator.clipboard.writeText(url);
    setToast("Link copiado. Compártelo junto con el usuario y clave.");
  }

  const clienteActivo = clientes.find((c) => c.nombre === clienteNombre);

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/tracking-importadores" />
      <main className="flex-1 min-w-0">
        <Topbar />
        <div className="px-6.5 pt-5.5 pb-10 max-w-[1000px]">
          <div className="flex items-center justify-between mb-0.5">
            <h1 className="text-[21px] font-semibold">Tracking para importadores</h1>
            <button
              onClick={() => setMostrarCorreos((v) => !v)}
              className="text-[12px] font-medium text-[#c4b8ff] hover:underline"
            >
              {mostrarCorreos ? "Ocultar" : "Correos de notificación"}
            </button>
          </div>
          <p className="text-[12.5px] text-text-faint mb-5">
            Genera el acceso al portal externo y configura las fases que verá cada cliente.
          </p>

          {mostrarCorreos && (
            <div className="card p-4 mb-5">
              <h2 className="text-[14px] font-semibold mb-1">Correos de notificación</h2>
              <p className="text-[11.5px] text-text-dim mb-3">
                Cuando un cliente escribe en el chat de cualquiera de sus órdenes, se envía un
                correo a todos los que estén marcados como activos aquí.
              </p>

              {errorMsg && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                  {errorMsg}
                </div>
              )}

              <div className="flex items-end gap-2 mb-4">
                <div className="flex-1">
                  <label className="text-[11px] text-text-faint block mb-1">Agregar correo</label>
                  <input
                    value={nuevoCorreo}
                    onChange={(e) => setNuevoCorreo(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && agregarCorreo()}
                    placeholder="ej. denisse@etyecu.com"
                    className="w-full card px-3 py-2 text-[12.5px] outline-none"
                  />
                </div>
                <button
                  onClick={agregarCorreo}
                  disabled={guardandoCorreo}
                  className="btn-primary text-[12px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {guardandoCorreo ? "Agregando…" : "Agregar"}
                </button>
              </div>

              {correos.length === 0 ? (
                <p className="text-[12px] text-text-faint">
                  Todavía no hay correos configurados — nadie recibirá notificaciones.
                </p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {correos.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]"
                    >
                      <span className={`text-[12.5px] ${c.activo ? "" : "text-text-faint line-through"}`}>
                        {c.correo}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleCorreoActivo(c.id, c.activo)}
                          className={`text-[11px] px-2 py-1 rounded-md ${
                            c.activo
                              ? "bg-green/[0.15] text-[#6ee7b7]"
                              : "bg-white/[0.05] text-text-faint"
                          }`}
                        >
                          {c.activo ? "Activo" : "Inactivo"}
                        </button>
                        <button
                          onClick={() => eliminarCorreo(c.id)}
                          className="text-[11px] px-2 py-1 rounded-md bg-red/[0.1] text-[#fca5a5] hover:bg-red/[0.2]"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="card p-3 mb-5">
            <label className="text-[11px] text-text-faint block mb-1">Cliente</label>
            <select
              value={clienteNombre}
              onChange={(e) => {
                setClienteNombre(e.target.value);
                setClaveGenerada(null);
              }}
              className="card px-3 py-2 text-[12.5px] outline-none min-w-[320px]"
            >
              <option value="">Selecciona un cliente…</option>
              {clientes.map((c) => (
                <option key={c.nombre} value={c.nombre}>
                  {c.nombre} {c.rucCi ? `(${c.rucCi})` : ""}
                  {c.clienteDapId && c.etqClienteId ? " · DAP + Etiquetado" : ""}
                </option>
              ))}
            </select>
          </div>

          {!clienteNombre ? (
            <div className="card p-8 text-center">
              <p className="text-[13px] text-text-faint">Elige un cliente para configurar su acceso.</p>
            </div>
          ) : (
            <>
              <div className="card p-4 mb-5">
                <h2 className="text-[14px] font-semibold mb-3">Acceso al portal</h2>
                {errorMsg && (
                  <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                    {errorMsg}
                  </div>
                )}

                {acceso ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px]">
                        Usuario: <span className="font-semibold">{acceso.usuario}</span>
                      </p>
                      <p className="text-[11.5px] text-text-faint">
                        Estado:{" "}
                        <span className={acceso.activo ? "text-[#6ee7b7]" : "text-[#fca5a5]"}>
                          {acceso.activo ? "Activo" : "Desactivado"}
                        </span>
                        {acceso.ultimo_acceso &&
                          ` · Último acceso: ${new Date(acceso.ultimo_acceso).toLocaleString("es-EC")}`}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={copiarLink}
                        className="btn-secondary flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg"
                      >
                        <Copy size={13} /> Copiar link del portal
                      </button>
                      <button
                        onClick={regenerarClave}
                        disabled={generando}
                        className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber/[0.15] text-[#fbbf24] hover:bg-amber/[0.25] disabled:opacity-50"
                        title="Genera una clave nueva (la anterior deja de funcionar)"
                      >
                        <RotateCw size={13} /> {generando ? "Generando…" : "Regenerar clave"}
                      </button>
                      {acceso.activo ? (
                        <button
                          onClick={() => setADesactivar(true)}
                          className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-red/[0.15] text-[#fca5a5] hover:bg-red/[0.25]"
                        >
                          <Power size={13} /> Desactivar
                        </button>
                      ) : (
                        <button
                          onClick={reactivarAcceso}
                          className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-green/[0.15] text-[#6ee7b7] hover:bg-green/[0.25]"
                        >
                          <Power size={13} /> Reactivar
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-[11px] text-text-faint block mb-1">
                        Usuario para {clienteActivo?.nombre}
                      </label>
                      <input
                        value={nuevoUsuario}
                        onChange={(e) => setNuevoUsuario(e.target.value)}
                        placeholder="ej. subahi, radial-ecuador…"
                        className="w-full card px-3 py-2 text-[12.5px] outline-none"
                      />
                    </div>
                    <button
                      onClick={generarAcceso}
                      disabled={generando}
                      className="btn-primary text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                    >
                      {generando ? "Generando…" : "Generar acceso"}
                    </button>
                  </div>
                )}

                {claveGenerada && (
                  <div className="mt-3 p-3 rounded-lg bg-accent/[0.1] border border-accent-2/30">
                    <p className="text-[12px] text-text-dim mb-1">
                      Clave generada (solo se muestra una vez, cópiala ahora):
                    </p>
                    <p className="text-[18px] font-mono font-bold tracking-wider text-[#c4b8ff]">
                      {claveGenerada}
                    </p>
                  </div>
                )}
              </div>

              {ordenesDap.length > 0 && (
                <div className="mb-5">
                  <h2 className="text-[14px] font-semibold mb-2">Órdenes de DAP</h2>
                  <div className="card overflow-hidden">
                    {ordenesDap.map((o) => {
                      const fase = fasesConfig.find((f) => f.orden_dap_id === o.id);
                      return (
                        <FilaOrden
                          key={o.id}
                          numero={o.numero_dap}
                          fase={fase}
                          noLeidos={fase ? noLeidosPorFase[fase.id] ?? 0 : 0}
                          onConfigurar={() => abrirEditarFases("dap", o.id)}
                          onAvanzar={(d) => fase && avanzarFase(fase, d)}
                          onAbrirChat={() => fase && setChatFaseId(fase.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {ordenesEtq.length > 0 && (
                <div className="mb-5">
                  <h2 className="text-[14px] font-semibold mb-2">Órdenes de Etiquetado</h2>
                  <div className="card overflow-hidden">
                    {ordenesEtq.map((o) => {
                      const fase = fasesConfig.find((f) => f.etq_orden_id === o.id);
                      return (
                        <FilaOrden
                          key={o.id}
                          numero={o.numero_etq}
                          fase={fase}
                          noLeidos={fase ? noLeidosPorFase[fase.id] ?? 0 : 0}
                          onConfigurar={() => abrirEditarFases("etq", o.id)}
                          onAvanzar={(d) => fase && avanzarFase(fase, d)}
                          onAbrirChat={() => fase && setChatFaseId(fase.id)}
                        />
                      );
                    })}
                  </div>
                </div>
              )}

              {ordenesDap.length === 0 && ordenesEtq.length === 0 && !loading && (
                <p className="text-[12.5px] text-text-faint">
                  Este cliente todavía no tiene órdenes de DAP ni de Etiquetado registradas.
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {editandoFasesId && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[480px] my-6 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-semibold">Configurar fases</h2>
              <button onClick={() => setEditandoFasesId(null)} className="text-text-faint hover:text-text">
                <X size={18} />
              </button>
            </div>
            <p className="text-[12px] text-text-dim mb-3">
              Escribe las fases separadas por coma, en el orden en que ocurren.
            </p>
            <input
              value={fasesTexto}
              onChange={(e) => setFasesTexto(e.target.value)}
              placeholder="Llegó al depósito, Clasificando, Etiquetando, Listo para retiro"
              className="w-full card px-3 py-2 text-[13px] outline-none mb-4"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setEditandoFasesId(null)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={guardarFases}
                className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {chatFaseId && (
        <ModalChatInterno
          orderFaseId={chatFaseId}
          supabase={supabase}
          onCerrar={() => {
            setChatFaseId(null);
            if (clienteNombre) cargarDatosCliente(clienteNombre);
          }}
        />
      )}

      <ConfirmModal
        abierto={aDesactivar}
        titulo="¿Desactivar este acceso?"
        mensaje="El cliente ya no podrá iniciar sesión en el portal hasta que lo reactives."
        onConfirmar={desactivarAcceso}
        onCancelar={() => setADesactivar(false)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}

type MensajeInterno = {
  id: string;
  autor: "cliente" | "equipo";
  autor_nombre: string | null;
  mensaje: string | null;
  foto_url: string | null;
  leido: boolean;
  creado_en: string;
};

function ModalChatInterno({
  orderFaseId,
  supabase,
  onCerrar,
}: {
  orderFaseId: string;
  supabase: ReturnType<typeof createClient>;
  onCerrar: () => void;
}) {
  const [mensajes, setMensajes] = useState<MensajeInterno[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [errorFoto, setErrorFoto] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cargarYMarcarLeidos = useCallback(async () => {
    const { data } = await supabase
      .from("portal_mensajes")
      .select("*")
      .eq("orden_fase_id", orderFaseId)
      .order("creado_en", { ascending: true });
    setMensajes((data as MensajeInterno[]) ?? []);

    // Marcar como leídos todos los mensajes del cliente pendientes
    await supabase
      .from("portal_mensajes")
      .update({ leido: true })
      .eq("orden_fase_id", orderFaseId)
      .eq("autor", "cliente")
      .eq("leido", false);
  }, [supabase, orderFaseId]);

  useEffect(() => {
    cargarYMarcarLeidos();
  }, [cargarYMarcarLeidos]);

  async function enviar(fotoUrl?: string) {
    if (!texto.trim() && !fotoUrl) return;
    setEnviando(true);
    try {
      const { data: fase } = await supabase
        .from("portal_ordenes_fases")
        .select("cliente_nombre")
        .eq("id", orderFaseId)
        .maybeSingle();
      await supabase.from("portal_mensajes").insert({
        orden_fase_id: orderFaseId,
        cliente_nombre: fase?.cliente_nombre,
        autor: "equipo",
        autor_nombre: "ETYECU",
        mensaje: texto.trim() || null,
        foto_url: fotoUrl || null,
        leido: true,
      });
      setTexto("");
      cargarYMarcarLeidos();
    } finally {
      setEnviando(false);
    }
  }

  async function subirFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrorFoto("Solo se permiten imágenes.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErrorFoto("La imagen no puede superar 8MB.");
      return;
    }
    setSubiendoFoto(true);
    setErrorFoto(null);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const nombreArchivo = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("portal-chat-fotos")
        .upload(nombreArchivo, file, { contentType: file.type });
      if (error) {
        setErrorFoto(error.message);
        return;
      }
      const { data: urlData } = supabase.storage
        .from("portal-chat-fotos")
        .getPublicUrl(nombreArchivo);
      await enviar(urlData.publicUrl);
    } finally {
      setSubiendoFoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div className="card w-full max-w-[440px] h-[560px] flex flex-col p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <p className="text-[14px] font-semibold">Chat con el cliente</p>
          <button onClick={onCerrar} className="text-text-faint hover:text-text">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2.5">
          {mensajes.length === 0 ? (
            <p className="text-[12px] text-text-faint text-center mt-6">Sin mensajes todavía.</p>
          ) : (
            mensajes.map((m) => (
              <div
                key={m.id}
                className={`max-w-[80%] rounded-xl px-3 py-2 text-[12.5px] ${
                  m.autor === "equipo"
                    ? "self-end bg-accent/[0.25] text-white"
                    : "self-start bg-white/[0.06] text-text"
                }`}
              >
                {m.foto_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.foto_url}
                    alt="Foto adjunta"
                    className="rounded-lg mb-1.5 max-w-full max-h-[180px] object-cover"
                  />
                )}
                {m.mensaje && <p>{m.mensaje}</p>}
                <p className="text-[9.5px] opacity-60 mt-1">
                  {new Date(m.creado_en).toLocaleString("es-EC", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))
          )}
        </div>
        {errorFoto && (
          <div className="mx-3 mb-1 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[11.5px] text-[#fca5a5]">
            {errorFoto}
          </div>
        )}
        <div className="px-3 py-3 border-t border-border flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={subirFoto}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={subiendoFoto}
            className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center card text-text-dim hover:text-text disabled:opacity-50"
            title="Adjuntar foto"
          >
            <ImageIcon size={15} />
          </button>
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") enviar();
            }}
            placeholder="Responder…"
            className="flex-1 card px-3 py-2 text-[12.5px] outline-none"
          />
          <button
            onClick={() => enviar()}
            disabled={enviando || !texto.trim()}
            className="btn-primary w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

function FilaOrden({
  numero,
  fase,
  noLeidos,
  onConfigurar,
  onAvanzar,
  onAbrirChat,
}: {
  numero: string;
  fase?: FaseOrden;
  noLeidos: number;
  onConfigurar: () => void;
  onAvanzar: (delta: number) => void;
  onAbrirChat: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0">
      <div className="flex-1">
        <p className="text-[13px] font-medium">{numero}</p>
        {fase && fase.fases.length > 0 ? (
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {fase.fases.map((f, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span
                  className={`text-[10.5px] px-2 py-0.5 rounded-full ${
                    i < fase.fase_actual
                      ? "bg-green/[0.15] text-[#6ee7b7]"
                      : i === fase.fase_actual
                      ? "bg-accent/[0.2] text-[#c4b8ff] font-semibold"
                      : "bg-white/[0.05] text-text-faint"
                  }`}
                >
                  {f}
                </span>
                {i < fase.fases.length - 1 && <ChevronRight size={11} className="text-text-faint" />}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-amber mt-1">Sin fases configuradas todavía.</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {fase && (
          <button
            onClick={onAbrirChat}
            className="relative text-[11px] px-2 py-1 rounded-md bg-white/[0.05] text-text-dim hover:text-text flex items-center gap-1"
          >
            <MessageCircle size={13} /> Chat
            {noLeidos > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red text-white text-[9px] flex items-center justify-center font-bold">
                {noLeidos}
              </span>
            )}
          </button>
        )}
        {fase && fase.fases.length > 0 && (
          <>
            <button
              onClick={() => onAvanzar(-1)}
              disabled={fase.fase_actual === 0}
              className="text-[11px] px-2 py-1 rounded-md card text-text-dim disabled:opacity-30"
            >
              ← Retroceder
            </button>
            <button
              onClick={() => onAvanzar(1)}
              disabled={fase.fase_actual >= fase.fases.length - 1}
              className="text-[11px] px-2 py-1 rounded-md bg-accent/[0.15] text-[#c4b8ff] disabled:opacity-30"
            >
              Avanzar fase →
            </button>
          </>
        )}
        <button
          onClick={onConfigurar}
          className="text-[11px] px-2 py-1 rounded-md card text-text-dim hover:text-text"
        >
          {fase ? "Editar fases" : "+ Configurar"}
        </button>
      </div>
    </div>
  );
}
