"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Package, Building2, ArrowLeft, Check } from "lucide-react";
import { Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type OrdenDapRef = {
  id: string;
  numero_dap: string;
  cantidad_actual: number;
  clientes: { nombre: string } | null;
  cdas: { clientes: { nombre: string } | null } | null;
};

type EtqClienteRef = { id: string; nombre: string };

const PRODUCTOS = ["ropa", "calzado", "bolso", "otro"];

export default function NuevaOrdenEtiquetadoPage() {
  const supabase = createClient();
  const router = useRouter();

  // Paso 1: con quién etiquetar
  const [origen, setOrigen] = useState<"etyecu" | "externo" | null>(null);

  // Datos para cada rama
  const [ordenesDap, setOrdenesDap] = useState<OrdenDapRef[]>([]);
  const [etqClientes, setEtqClientes] = useState<EtqClienteRef[]>([]);
  const [ordenDapId, setOrdenDapId] = useState("");
  const [etqClienteId, setEtqClienteId] = useState("");
  const [tipoProducto, setTipoProducto] = useState("ropa");
  const [observaciones, setObservaciones] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    // Órdenes en depósito (para etiquetar con ETYECU)
    const { data: dapData } = await supabase
      .from("ordenes_dap")
      .select("id, numero_dap, cantidad_actual, clientes(nombre), cdas(clientes(nombre))")
      .gt("cantidad_actual", 0)
      .order("numero_dap", { ascending: false });
    setOrdenesDap((dapData as unknown as OrdenDapRef[]) ?? []);

    // Clientes de etiquetado (para clientes externos)
    const { data: cliData } = await supabase
      .from("etq_clientes")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre");
    setEtqClientes((cliData as EtqClienteRef[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function nombreDap(o: OrdenDapRef): string {
    return o.clientes?.nombre ?? o.cdas?.clientes?.nombre ?? "—";
  }

  async function crear() {
    setErrorMsg(null);

    if (origen === "etyecu" && !ordenDapId) {
      setErrorMsg("Selecciona la carga de ETYECU que vas a etiquetar.");
      return;
    }
    if (origen === "externo" && !etqClienteId) {
      setErrorMsg("Selecciona el cliente de etiquetado.");
      return;
    }

    setSaving(true);

    // Nombre del cliente para el snapshot
    let clienteNombre = "";
    if (origen === "etyecu") {
      const o = ordenesDap.find((x) => x.id === ordenDapId);
      clienteNombre = o ? nombreDap(o) : "";
    } else {
      const c = etqClientes.find((x) => x.id === etqClienteId);
      clienteNombre = c?.nombre ?? "";
    }

    // Generar número de orden de etiquetado
    const { data: numData, error: numError } = await supabase.rpc("etq_siguiente_numero");
    if (numError) {
      setSaving(false);
      setErrorMsg("No se pudo generar el número: " + numError.message);
      return;
    }

    const payload = {
      numero_etq: numData as string,
      origen,
      orden_dap_id: origen === "etyecu" ? ordenDapId : null,
      etq_cliente_id: origen === "externo" ? etqClienteId : null,
      cliente_nombre: clienteNombre,
      tipo_producto: tipoProducto,
      observaciones: observaciones.trim() || null,
      estado: "abierta",
    };

    const { data, error } = await supabase.from("etq_ordenes").insert(payload).select().single();

    setSaving(false);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    setToast(`Orden ${numData} creada.`);
    setTimeout(() => router.push(`/etiquetado/${data.id}`), 700);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10 max-w-[760px]">
          <Link
            href="/etiquetado"
            className="inline-flex items-center gap-1.5 text-[12.5px] text-text-faint hover:text-text mb-4"
          >
            <ArrowLeft size={14} /> Volver a etiquetado
          </Link>

          <h1 className="text-[21px] font-semibold mb-1">Nueva orden de etiquetado</h1>
          <p className="text-[12.5px] text-text-faint mb-6">
            Primero elige con quién vas a etiquetar.
          </p>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {/* PASO 1: ¿Con quién etiquetar? */}
          <p className="text-[11.5px] font-semibold text-text-dim mb-2">¿Con quién vas a etiquetar?</p>
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={() => {
                setOrigen("etyecu");
                setEtqClienteId("");
              }}
              className={`card p-5 text-left transition-all ${
                origen === "etyecu" ? "border-accent-2/50 bg-accent/[0.06]" : "hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-9 h-9 rounded-lg bg-accent/[0.15] flex items-center justify-center">
                  <Package size={18} className="text-[#c4b8ff]" />
                </div>
                {origen === "etyecu" && <Check size={16} className="text-[#6ee7b7] ml-auto" />}
              </div>
              <p className="text-[14px] font-semibold">ETYECU</p>
              <p className="text-[11.5px] text-text-faint">Etiquetar una carga que ya está con nosotros</p>
            </button>

            <button
              onClick={() => {
                setOrigen("externo");
                setOrdenDapId("");
              }}
              className={`card p-5 text-left transition-all ${
                origen === "externo" ? "border-accent-2/50 bg-accent/[0.06]" : "hover:border-border-strong"
              }`}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-9 h-9 rounded-lg bg-amber/[0.15] flex items-center justify-center">
                  <Building2 size={18} className="text-[#fbbf24]" />
                </div>
                {origen === "externo" && <Check size={16} className="text-[#6ee7b7] ml-auto" />}
              </div>
              <p className="text-[14px] font-semibold">Cliente externo</p>
              <p className="text-[11.5px] text-text-faint">Nos movilizamos a la bodega del cliente</p>
            </button>
          </div>

          {/* PASO 2: según la elección */}
          {origen === "etyecu" && (
            <div className="card p-5 mb-6">
              <label className="text-[11.5px] text-text-faint block mb-1.5">
                Carga a etiquetar
              </label>
              {ordenesDap.length === 0 ? (
                <p className="text-[12.5px] text-amber">
                  No hay cargas disponibles para etiquetar en este momento.
                </p>
              ) : (
                <select
                  value={ordenDapId}
                  onChange={(e) => setOrdenDapId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona una carga…</option>
                  {ordenesDap.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.numero_dap} · {nombreDap(o)} ({o.cantidad_actual} und.)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {origen === "externo" && (
            <div className="card p-5 mb-6">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11.5px] text-text-faint">Cliente</label>
                <Link
                  href="/etiquetado/clientes"
                  className="text-[11px] text-[#c4b8ff] hover:underline"
                >
                  + Gestionar clientes
                </Link>
              </div>
              {etqClientes.length === 0 ? (
                <p className="text-[12.5px] text-amber">
                  No hay clientes registrados.{" "}
                  <Link href="/etiquetado/clientes" className="text-[#c4b8ff] hover:underline">
                    Crea el primero aquí.
                  </Link>
                </p>
              ) : (
                <select
                  value={etqClienteId}
                  onChange={(e) => setEtqClienteId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona un cliente…</option>
                  {etqClientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* PASO 3: datos comunes + crear */}
          {origen && (
            <>
              <div className="card p-5 mb-6">
                <label className="text-[11.5px] text-text-faint block mb-1.5">Tipo de producto</label>
                <div className="flex gap-2 mb-4 flex-wrap">
                  {PRODUCTOS.map((p) => (
                    <button
                      key={p}
                      onClick={() => setTipoProducto(p)}
                      className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium capitalize transition-all ${
                        tipoProducto === p
                          ? "bg-accent/[0.2] text-[#c4b8ff] border border-accent-2/40"
                          : "card text-text-dim hover:text-text"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <label className="text-[11.5px] text-text-faint block mb-1.5">
                  Observaciones (opcional)
                </label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Link
                  href="/etiquetado"
                  className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
                >
                  Cancelar
                </Link>
                <button
                  onClick={crear}
                  disabled={saving}
                  className="btn-primary text-[13px] font-semibold px-5 py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Creando…" : "Crear orden de etiquetado"}
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
