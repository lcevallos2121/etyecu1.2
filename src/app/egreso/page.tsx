"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { PackageMinus, X } from "lucide-react";

export const dynamic = "force-dynamic";

type OrdenActiva = {
  id: string;
  numero_dap: string;
  cantidad_actual: number;
  cantidad_ingresada: number;
  regimen: string;
  cdas: { numero_orden: string; clientes: { nombre: string } | null } | null;
};

type EgresoHistorial = {
  id: string;
  cantidad: number;
  salida_parcial: boolean;
  creado_en: string;
  ordenes_dap: { numero_dap: string } | null;
};

export default function EgresoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<OrdenActiva[]>([]);
  const [historial, setHistorial] = useState<EgresoHistorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenActiva | null>(null);
  const [cantidad, setCantidad] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [search, setSearch] = useState("");

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: ordenData, error: ordenError }, { data: histData, error: histError }] =
      await Promise.all([
        supabase
          .from("ordenes_dap")
          .select("id, numero_dap, cantidad_actual, cantidad_ingresada, regimen, cdas(numero_orden, clientes(nombre))")
          .gt("cantidad_actual", 0)
          .order("numero_dap"),
        supabase
          .from("egreso_transacciones")
          .select("id, cantidad, salida_parcial, creado_en, ordenes_dap(numero_dap)")
          .order("creado_en", { ascending: false })
          .limit(8),
      ]);

    if (ordenError) {
      setErrorMsg(
        ordenError.message.includes("permission")
          ? "Sin permisos para leer órdenes DAP."
          : ordenError.message
      );
    } else {
      setOrdenes((ordenData as unknown as OrdenActiva[]) ?? []);
    }

    if (!histError) setHistorial((histData as unknown as EgresoHistorial[]) ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function abrirEgreso(o: OrdenActiva) {
    setOrdenSeleccionada(o);
    setCantidad("");
    setErrorMsg(null);
    setOkMsg(null);
  }

  async function confirmarEgreso() {
    if (!ordenSeleccionada) return;
    const valor = Number(cantidad);

    if (!cantidad || valor <= 0) {
      setErrorMsg("Ingresa una cantidad válida.");
      return;
    }
    if (valor > ordenSeleccionada.cantidad_actual) {
      setErrorMsg(
        `No puedes egresar ${valor}: el saldo actual es ${ordenSeleccionada.cantidad_actual}.`
      );
      return;
    }

    setProcesando(true);
    setErrorMsg(null);

    const { data, error } = await supabase.rpc("registrar_egreso", {
      p_orden_id: ordenSeleccionada.id,
      p_cantidad: valor,
    });

    setProcesando(false);

    if (error) {
      setErrorMsg(
        error.message.includes("function") && error.message.includes("does not exist")
          ? "Falta crear la función registrar_egreso en Supabase (archivo registrar_egreso_function.sql)."
          : error.message
      );
      return;
    }

    const resultado = Array.isArray(data) ? data[0] : data;
    setOkMsg(
      `Egreso registrado. Nuevo saldo: ${resultado?.nuevo_saldo ?? "—"} unidades${
        resultado?.fue_parcial ? " (salida parcial)" : " (saldo agotado)"
      }.`
    );
    setOrdenSeleccionada(null);
    cargarDatos();
  }

  const ordenesFiltradas = ordenes.filter(
    (o) =>
      o.numero_dap.toLowerCase().includes(search.toLowerCase()) ||
      o.cdas?.clientes?.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/egreso" />

      <main className="flex-1 min-w-0">
        <Topbar userName="Abigail Cobos" userRole="Gerencia General" />

        <div className="px-6.5 pt-5.5 pb-10">
          <h1 className="text-[21px] font-semibold mb-0.5">Egreso de carga</h1>
          <p className="text-[12.5px] text-text-faint mb-4.5">
            {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} con saldo disponible para egresar
          </p>

          {okMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-green/10 border border-green/20 text-[12.5px] text-[#6ee7b7]">
              {okMsg}
            </div>
          )}
          {errorMsg && !ordenSeleccionada && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          <input
            placeholder="Buscar por número de DAP o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-[340px] card px-3 py-2 text-[12.5px] mb-4.5 outline-none focus:border-border-2 placeholder:text-text-faint"
          />

          <div className="flex gap-4.5 items-start">
            <div className="flex-1 min-w-0 card overflow-hidden">
              <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                <span>N° DAP</span>
                <span>Cliente</span>
                <span>Régimen</span>
                <span>Saldo actual</span>
                <span></span>
              </div>

              {loading ? (
                <p className="px-5 py-6 text-[13px] text-text-faint">Cargando órdenes…</p>
              ) : ordenesFiltradas.length === 0 ? (
                <p className="px-5 py-6 text-[13px] text-text-faint">
                  No hay órdenes con saldo disponible{search ? " que coincidan con la búsqueda" : ""}.
                </p>
              ) : (
                ordenesFiltradas.map((o) => (
                  <div
                    key={o.id}
                    className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_100px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                  >
                    <span className="text-[13px] font-medium">{o.numero_dap}</span>
                    <span className="text-[12.5px] text-text-dim truncate">
                      {o.cdas?.clientes?.nombre ?? "—"}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-accent/[0.18] text-[#c4b8ff] w-fit">
                      Rég. {o.regimen}
                    </span>
                    <span className="text-[12.5px] font-medium">
                      {o.cantidad_actual.toLocaleString("es-EC")}
                    </span>
                    <button
                      onClick={() => abrirEgreso(o)}
                      className="btn-primary flex items-center gap-1 text-[11.5px] font-semibold px-3 py-1.5 rounded-lg w-fit"
                    >
                      <PackageMinus size={13} /> Egresar
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="w-[300px] shrink-0 card p-4">
              <h3 className="text-[13px] font-semibold mb-3">Últimos egresos</h3>
              {historial.length === 0 ? (
                <p className="text-[12px] text-text-faint">Sin registros todavía.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {historial.map((h) => (
                    <div key={h.id} className="flex items-center justify-between text-[12px]">
                      <div>
                        <p className="text-text">{h.ordenes_dap?.numero_dap ?? "—"}</p>
                        <p className="text-text-faint text-[11px]">
                          {h.salida_parcial ? "Parcial" : "Total"}
                        </p>
                      </div>
                      <span className="text-text-dim">-{h.cantidad.toLocaleString("es-EC")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {ordenSeleccionada && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[420px] p-6 relative">
            <button
              onClick={() => setOrdenSeleccionada(null)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-1">
              Egresar · {ordenSeleccionada.numero_dap}
            </h2>
            <p className="text-[12px] text-text-faint mb-4">
              {ordenSeleccionada.cdas?.clientes?.nombre ?? "—"} · Saldo actual:{" "}
              <b className="text-text">
                {ordenSeleccionada.cantidad_actual.toLocaleString("es-EC")}
              </b>{" "}
              unidades
            </p>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <label className="text-[11.5px] text-text-faint block mb-1">
              Cantidad a egresar
            </label>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2 mb-1"
              placeholder="Ej. 300"
            />
            <p className="text-[11px] text-text-faint mb-4">
              Si la cantidad es menor al saldo, queda registrada como salida parcial.
            </p>

            <div className="flex gap-2">
              <button
                onClick={confirmarEgreso}
                disabled={procesando}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {procesando ? "Procesando…" : "Confirmar egreso"}
              </button>
              <button
                onClick={() => setOrdenSeleccionada(null)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
