"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { PackageMinus, X, MapPin, FileText, Trash2 } from "lucide-react";
import { ConfirmModal } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type OrdenActiva = {
  id: string;
  numero_dap: string;
  cantidad_actual: number;
  cantidad_ingresada: number;
  regimen: string;
  tipo_espacio: string | null;
  cdas: { numero_cda: string | null; bl: string | null; clientes: { nombre: string } | null } | null;
};

type UbicacionOrden = {
  id: string;
  cantidad: number;
  posiciones_nivel: {
    codigo_posicion: string;
    niveles_rack: { numero_nivel: number; racks: { codigo: string } } | null;
  } | null;
};

type Egreso = {
  id: string;
  cantidad: number;
  salida_parcial: boolean;
  creado_en: string;
  ordenes_dap: {
    numero_dap: string;
    cdas: { numero_cda: string | null; clientes: { nombre: string } | null } | null;
  } | null;
};

export default function EgresoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<OrdenActiva[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [ordenSeleccionada, setOrdenSeleccionada] = useState<OrdenActiva | null>(null);
  const [ubicacionesOrden, setUbicacionesOrden] = useState<UbicacionOrden[]>([]);
  const [ubicacionElegida, setUbicacionElegida] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [nombreRetira, setNombreRetira] = useState("");
  const [cedulaRetira, setCedulaRetira] = useState("");
  const [placaRetira, setPlacaRetira] = useState("");
  const [procesando, setProcesando] = useState(false);

  const [egresoImprimir, setEgresoImprimir] = useState<Egreso | null>(null);
  const [aRevertir, setARevertir] = useState<Egreso | null>(null);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: ordenData, error: ordenError }, { data: egresoData }] = await Promise.all([
      supabase
        .from("ordenes_dap")
        .select("id, numero_dap, cantidad_actual, cantidad_ingresada, regimen, tipo_espacio, cdas(numero_cda, bl, clientes(nombre))")
        .gt("cantidad_actual", 0)
        .order("numero_dap"),
      supabase
        .from("egreso_transacciones")
        .select("id, cantidad, salida_parcial, creado_en, ordenes_dap(numero_dap, cdas(numero_cda, clientes(nombre)))")
        .order("creado_en", { ascending: false }),
    ]);

    if (ordenError) setErrorMsg(ordenError.message);
    else setOrdenes((ordenData as unknown as OrdenActiva[]) ?? []);
    setEgresos((egresoData as unknown as Egreso[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  async function abrirEgreso(o: OrdenActiva) {
    setOrdenSeleccionada(o);
    setCantidad("");
    setUbicacionElegida("");
    setNombreRetira("");
    setCedulaRetira("");
    setPlacaRetira("");
    setErrorMsg(null);
    setOkMsg(null);

    const { data } = await supabase
      .from("ubicaciones_carga")
      .select("id, cantidad, posiciones_nivel(codigo_posicion, niveles_rack(numero_nivel, racks(codigo)))")
      .eq("orden_dap_id", o.id);
    setUbicacionesOrden((data as unknown as UbicacionOrden[]) ?? []);
  }

  const ubicacionActiva = ubicacionesOrden.find((u) => u.id === ubicacionElegida);
  const maxEgresable =
    ubicacionesOrden.length > 0
      ? ubicacionActiva?.cantidad ?? 0
      : ordenSeleccionada?.cantidad_actual ?? 0;

  async function confirmarEgreso() {
    if (!ordenSeleccionada) return;
    const valor = Number(cantidad);

    if (!cantidad || valor <= 0) {
      setErrorMsg("Ingresa una cantidad válida.");
      return;
    }
    if (ubicacionesOrden.length > 0 && !ubicacionElegida) {
      setErrorMsg("Selecciona de qué ubicación sale la carga.");
      return;
    }
    if (valor > maxEgresable) {
      setErrorMsg(
        `No puedes egresar ${valor}: el máximo disponible ${
          ubicacionesOrden.length > 0 ? "en esta ubicación" : ""
        } es ${maxEgresable}.`
      );
      return;
    }

    setProcesando(true);
    setErrorMsg(null);

    const { data, error } =
      ubicacionesOrden.length > 0
        ? await supabase.rpc("registrar_egreso_ubicacion", {
            p_ubicacion_id: ubicacionElegida,
            p_cantidad: valor,
          })
        : await supabase.rpc("registrar_egreso", {
            p_orden_id: ordenSeleccionada.id,
            p_cantidad: valor,
          });

    if (error) {
      setProcesando(false);
      setErrorMsg(
        error.message.includes("does not exist")
          ? "Falta crear la función en Supabase (registrar_egreso_ubicacion.sql)."
          : error.message
      );
      return;
    }

    // Buscar el egreso recién creado para poder imprimir su orden de inmediato
    const { data: ultimo } = await supabase
      .from("egreso_transacciones")
      .select("id, cantidad, salida_parcial, creado_en, ordenes_dap(numero_dap, cdas(numero_cda, clientes(nombre)))")
      .eq("orden_dap_id", ordenSeleccionada.id)
      .order("creado_en", { ascending: false })
      .limit(1)
      .single();

    setProcesando(false);
    const r = Array.isArray(data) ? data[0] : data;
    setOkMsg(
      `Egreso registrado. Saldo de la orden: ${r?.saldo_orden ?? r?.nuevo_saldo ?? "—"}${
        r?.posicion_liberada ? " · posición liberada del rack." : "."
      }`
    );
    setOrdenSeleccionada(null);
    cargarDatos();

    // Guardar datos de quien retira para el PDF y abrir impresión
    if (ultimo) {
      setDatosRetiro({
        nombre: nombreRetira,
        cedula: cedulaRetira,
        placa: placaRetira,
      });
      setEgresoImprimir(ultimo as unknown as Egreso);
    }
  }

  const [datosRetiro, setDatosRetiro] = useState<{ nombre: string; cedula: string; placa: string }>(
    { nombre: "", cedula: "", placa: "" }
  );

  function imprimirEgreso(e: Egreso) {
    setDatosRetiro({ nombre: "", cedula: "", placa: "" });
    setEgresoImprimir(e);
  }

  useEffect(() => {
    if (egresoImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [egresoImprimir]);

  async function confirmarRevertir() {
    const e = aRevertir;
    if (!e) return;
    setARevertir(null);
    const { error } = await supabase.rpc("revertir_egreso", { p_egreso_id: e.id });
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist")
          ? "Falta crear la función revertir_egreso en Supabase."
          : error.message
      );
      return;
    }
    setOkMsg(`Egreso anulado. Se devolvieron ${e.cantidad} unidades al saldo.`);
    cargarDatos();
  }

  const ordenesFiltradas = ordenes.filter(
    (o) =>
      o.numero_dap.toLowerCase().includes(search.toLowerCase()) ||
      o.cdas?.clientes?.nombre.toLowerCase().includes(search.toLowerCase())
  );

  const egresosFiltrados = egresos.filter(
    (e) =>
      (e.ordenes_dap?.numero_dap ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (e.ordenes_dap?.cdas?.clientes?.nombre ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/egreso" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <h1 className="text-[21px] font-semibold mb-0.5">Egreso de carga</h1>
          <p className="text-[12.5px] text-text-faint mb-4.5">
            {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} con saldo · {egresos.length}{" "}
            egreso{egresos.length !== 1 ? "s" : ""} registrado{egresos.length !== 1 ? "s" : ""}
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

          {/* Órdenes con saldo */}
          <p className="text-[12px] font-semibold text-text-dim mb-2">Órdenes con saldo disponible</p>
          <div className="card overflow-hidden mb-6">
            <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>N° DAP</span>
              <span>Cliente</span>
              <span>Régimen</span>
              <span>Saldo actual</span>
              <span></span>
            </div>
            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando…</p>
            ) : ordenesFiltradas.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay órdenes con saldo disponible.
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

          {/* Historial de egresos */}
          <p className="text-[12px] font-semibold text-text-dim mb-2">Historial de egresos</p>
          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>N° DAP</span>
              <span>Cliente</span>
              <span>Cantidad</span>
              <span>Fecha</span>
              <span></span>
            </div>
            {egresosFiltrados.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Sin egresos registrados.</p>
            ) : (
              egresosFiltrados.map((e) => (
                <div
                  key={e.id}
                  className="grid grid-cols-[1.2fr_1.6fr_1fr_1fr_100px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">
                    {e.ordenes_dap?.numero_dap ?? "—"}
                  </span>
                  <span className="text-[12.5px] text-text-dim truncate">
                    {e.ordenes_dap?.cdas?.clientes?.nombre ?? "—"}
                  </span>
                  <span className="text-[12.5px]">
                    {e.cantidad.toLocaleString("es-EC")}
                    <span className="text-text-faint text-[11px]">
                      {" "}
                      · {e.salida_parcial ? "Parcial" : "Total"}
                    </span>
                  </span>
                  <span className="text-[12px] text-text-dim">
                    {new Date(e.creado_en).toLocaleDateString("es-EC")}
                  </span>
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => imprimirEgreso(e)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Orden de egreso"
                      title="Orden de egreso (PDF)"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      onClick={() => setARevertir(e)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-red-300 hover:bg-red/10"
                      aria-label="Anular egreso"
                      title="Anular (devuelve el stock)"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* MODAL DE EGRESO */}
      {ordenSeleccionada && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="card w-full max-w-[440px] p-6 relative max-h-[92vh] overflow-y-auto">
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
              {ordenSeleccionada.cdas?.clientes?.nombre ?? "—"} · Saldo total:{" "}
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

            {ubicacionesOrden.length > 0 ? (
              <>
                <label className="text-[11.5px] text-text-faint mb-1 flex items-center gap-1">
                  <MapPin size={12} /> Ubicación de donde sale la carga
                </label>
                <select
                  value={ubicacionElegida}
                  onChange={(e) => {
                    setUbicacionElegida(e.target.value);
                    setCantidad("");
                  }}
                  className="w-full card px-3 py-2 text-[13px] outline-none mb-3"
                >
                  <option value="">Selecciona una ubicación…</option>
                  {ubicacionesOrden.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.posiciones_nivel?.niveles_rack?.racks.codigo} · N
                      {u.posiciones_nivel?.niveles_rack?.numero_nivel} ·{" "}
                      {u.posiciones_nivel?.codigo_posicion} (disp. {u.cantidad})
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <p className="text-[11.5px] text-amber mb-3">
                Esta orden no tiene ubicaciones asignadas — el egreso descuenta directo del saldo.
              </p>
            )}

            <label className="text-[11.5px] text-text-faint block mb-1">
              Cantidad a egresar {maxEgresable > 0 && `(máx. ${maxEgresable})`}
            </label>
            <input
              type="number"
              step="0.01"
              autoFocus
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              className="w-full card px-3 py-2 text-[13px] outline-none focus:border-border-2 mb-3"
              placeholder="Ej. 300"
            />

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">Quien retira la carga</p>
            <div className="grid grid-cols-2 gap-2 mb-1">
              <input
                value={nombreRetira}
                onChange={(e) => setNombreRetira(e.target.value)}
                placeholder="Nombre"
                className="card px-3 py-2 text-[12.5px] outline-none"
              />
              <input
                value={cedulaRetira}
                onChange={(e) => setCedulaRetira(e.target.value)}
                placeholder="Cédula"
                className="card px-3 py-2 text-[12.5px] outline-none"
              />
            </div>
            <input
              value={placaRetira}
              onChange={(e) => setPlacaRetira(e.target.value)}
              placeholder="Placa del vehículo"
              className="w-full card px-3 py-2 text-[12.5px] outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                onClick={confirmarEgreso}
                disabled={procesando}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {procesando ? "Procesando…" : "Confirmar y generar orden"}
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

      {/* VISTA DE IMPRESIÓN: ORDEN DE EGRESO */}
      {egresoImprimir && (
        <div className="print-area hidden print:block text-black bg-white p-10">
          <div className="max-w-[640px] mx-auto">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="font-bold text-[18px]">ETYECU</span>
              <span className="text-[14px] font-bold">DEPÓSITO ADUANERO PÚBLICO</span>
            </div>
            <p className="text-[15px] font-bold text-center mb-5">
              ORDEN DE EGRESO DE CARGA · {egresoImprimir.ordenes_dap?.numero_dap}
            </p>

            <table className="w-full text-[10.5px] border border-black/50 border-collapse mb-5">
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold w-[130px]">DAP:</td>
                  <td className="border border-black/40 p-1.5 w-[200px]">
                    {egresoImprimir.ordenes_dap?.numero_dap}
                  </td>
                  <td className="border border-black/40 p-1.5 font-bold w-[80px]">Fecha:</td>
                  <td className="border border-black/40 p-1.5 text-right">
                    {new Date(egresoImprimir.creado_en).toLocaleDateString("es-EC")}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Consignatario:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {egresoImprimir.ordenes_dap?.cdas?.clientes?.nombre ?? ""}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Referencia a CDA:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {egresoImprimir.ordenes_dap?.cdas?.numero_cda ?? "Pendiente"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Cantidad egresada:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {egresoImprimir.cantidad.toLocaleString("es-EC")} paquete(s) ·{" "}
                    {egresoImprimir.salida_parcial ? "Salida parcial" : "Salida total"}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[10.5px] font-bold mb-1.5">Detalle de la mercancía retirada:</p>
            <table className="w-full text-[10px] border border-black/50 border-collapse mb-10">
              <thead>
                <tr>
                  <th className="border border-black/40 p-1.5 text-left">Descripción</th>
                  <th className="border border-black/40 p-1.5 w-[80px]">Cantidad</th>
                  <th className="border border-black/40 p-1.5 text-left w-[220px]">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1.5">Mercancía según DAP</td>
                  <td className="border border-black/40 p-1.5 text-center">
                    {egresoImprimir.cantidad}
                  </td>
                  <td className="border border-black/40 p-1.5"></td>
                </tr>
                {Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="border border-black/40 p-1.5">&nbsp;</td>
                    <td className="border border-black/40 p-1.5"></td>
                    <td className="border border-black/40 p-1.5"></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between text-[10px] mt-16">
              <div className="w-[240px] text-center">
                <p className="border-t border-black pt-1">Retira Conforme</p>
                {datosRetiro.nombre && <p className="font-bold mt-1">{datosRetiro.nombre}</p>}
                {datosRetiro.cedula && <p>C.C: {datosRetiro.cedula}</p>}
                {datosRetiro.placa && <p>Placa: {datosRetiro.placa}</p>}
              </div>
              <div className="w-[240px] text-center">
                <p className="border-t border-black pt-1">Entregó (DAP ETYECU)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={aRevertir !== null}
        titulo="¿Anular este egreso?"
        mensaje={
          aRevertir
            ? `Se devolverán ${aRevertir.cantidad} unidades al saldo de la orden ${aRevertir.ordenes_dap?.numero_dap ?? ""}.`
            : ""
        }
        textoConfirmar="Sí, anular"
        onConfirmar={confirmarRevertir}
        onCancelar={() => setARevertir(null)}
      />
    </div>
  );
}
