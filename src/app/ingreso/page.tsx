"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X, MapPin, FileText } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

type TipoEspacio = "deposito_aduanero_publico" | "bodega_simple";

const espacioLabel: Record<TipoEspacio, string> = {
  deposito_aduanero_publico: "Depósito Aduanero Público",
  bodega_simple: "Bodega Simple",
};

type CdaRef = {
  id: string;
  numero_cda: string | null;
  folio: number;
  bl: string | null;
  clientes: { nombre: string } | null;
};

type Catalogo = { id: string; nombre: string };

type Bodega = {
  id: string;
  codigo: string;
  nombre: string;
  tipo_espacio: string;
};

type PosicionLibre = {
  id: string;
  codigo_posicion: string;
  ocupado: boolean;
  nivel_id: string;
  niveles_rack: {
    numero_nivel: number;
    rack_id: string;
    racks: { codigo: string; tipo_espacio: string; bodega_id: string | null };
  } | null;
};

type Ubicacion = { posicion_id: string; cantidad: string };

type OrdenDap = {
  id: string;
  numero_dap: string;
  cda_id: string;
  cantidad_ingresada: number;
  cantidad_actual: number;
  regimen: string;
  tipo_espacio: string | null;
  bodega_id: string | null;
  tipo_carga_regimen: string | null;
  total_pallets: number | null;
  total_unidades: number | null;
  peso_total_kg: number | null;
  paletizada: boolean | null;
  tipo_carga: string | null;
  nombre_transportista: string | null;
  cedula_transportista: string | null;
  placa_vehiculo: string | null;
  candados: string | null;
  sellos: string | null;
  hora_llegada: string | null;
  observaciones: string | null;
  fecha_emision_ingreso: string | null;
  transporte_id: string | null;
  operador_candado_id: string | null;
  cdas: CdaRef | null;
};

export default function IngresoPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<OrdenDap[]>([]);
  const [cdas, setCdas] = useState<CdaRef[]>([]);
  const [transportes, setTransportes] = useState<Catalogo[]>([]);
  const [operadores, setOperadores] = useState<Catalogo[]>([]);
  const [posiciones, setPosiciones] = useState<PosicionLibre[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formId, setFormId] = useState<string | undefined>(undefined);

  // Sección 1
  const [numeroDap, setNumeroDap] = useState("");
  const [fechaEmision, setFechaEmision] = useState(new Date().toISOString().slice(0, 10));
  const [cdaId, setCdaId] = useState("");
  const [regimen, setRegimen] = useState<"70" | "10" | "general">("70");
  const [tipoEspacio, setTipoEspacio] = useState<TipoEspacio>("deposito_aduanero_publico");
  const [bodegas, setBodegas] = useState<Bodega[]>([]);
  const [bodegaId, setBodegaId] = useState("");

  // Sección 2
  const [totalPaquetes, setTotalPaquetes] = useState("");
  const [totalPallets, setTotalPallets] = useState("");
  const [totalUnidades, setTotalUnidades] = useState("");
  const [pesoTotal, setPesoTotal] = useState("");
  const [paletizada, setPaletizada] = useState<"si" | "no" | "">("");
  const [tipoCarga, setTipoCarga] = useState<"contenedor" | "plataforma" | "camion" | "">("");

  // Sección 3
  const [nombreTransportista, setNombreTransportista] = useState("");
  const [cedulaTransportista, setCedulaTransportista] = useState("");
  const [transporteId, setTransporteId] = useState("");
  const [placa, setPlaca] = useState("");
  const [candados, setCandados] = useState("");
  const [sellos, setSellos] = useState("");
  const [operadorId, setOperadorId] = useState("");
  const [horaLlegada, setHoraLlegada] = useState("");
  const [observaciones, setObservaciones] = useState("");

  // Sección 4: ubicaciones
  const [ubicaciones, setUbicaciones] = useState<Ubicacion[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  // Impresión de orden de ingreso
  const [ordenImprimir, setOrdenImprimir] = useState<OrdenDap | null>(null);
  const [transporteImprimir, setTransporteImprimir] = useState<string>("");

  async function imprimirOrden(o: OrdenDap) {
    const transporte = transportes.find((t) => t.id === o.transporte_id);
    setTransporteImprimir(transporte?.nombre ?? "");
    setOrdenImprimir(o);
  }

  useEffect(() => {
    if (ordenImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [ordenImprimir]);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [ordenRes, cdaRes, transRes, operRes, posRes, bodegaRes] = await Promise.all([
      supabase
        .from("ordenes_dap")
        .select("*, cdas(id, numero_cda, folio, bl, clientes(nombre))")
        .order("creado_en", { ascending: false }),
      supabase.from("cdas").select("id, numero_cda, folio, bl, clientes(nombre)").order("folio", { ascending: false }),
      supabase.from("catalogo_transportes").select("*").order("nombre"),
      supabase.from("catalogo_operadores_candado").select("*").order("nombre"),
      supabase
        .from("posiciones_nivel")
        .select("id, codigo_posicion, ocupado, nivel_id, niveles_rack(numero_nivel, rack_id, racks(codigo, tipo_espacio, bodega_id))"),
      supabase.from("bodegas").select("id, codigo, nombre, tipo_espacio").order("codigo"),
    ]);

    if (ordenRes.error) {
      setErrorMsg(
        ordenRes.error.message.includes("column")
          ? "Faltan columnas nuevas. ¿Corriste migracion_bodegas_tipo_carga.sql en Supabase?"
          : ordenRes.error.message
      );
    } else {
      setOrdenes((ordenRes.data as unknown as OrdenDap[]) ?? []);
    }
    setCdas((cdaRes.data as unknown as CdaRef[]) ?? []);
    setTransportes(transRes.data ?? []);
    setOperadores(operRes.data ?? []);
    setPosiciones((posRes.data as unknown as PosicionLibre[]) ?? []);
    setBodegas((bodegaRes.data as unknown as Bodega[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  const cdaSeleccionado = cdas.find((c) => c.id === cdaId);

  // Posiciones que ya están seleccionadas en el formulario (para no perderlas del
  // desplegable al editar, aunque figuren como "ocupadas" en la base).
  const idsPosicionesEnForm = ubicaciones.map((u) => u.posicion_id).filter(Boolean);

  // Solo posiciones libres de la BODEGA elegida, MÁS las que esta orden
  // ya tiene asignadas (para poder mantenerlas o cambiarlas al editar).
  const posicionesDisponibles = posiciones.filter(
    (p) =>
      p.niveles_rack?.racks.bodega_id === bodegaId &&
      (!p.ocupado || idsPosicionesEnForm.includes(p.id))
  );

  const sumaUbicaciones = ubicaciones.reduce((acc, u) => acc + Number(u.cantidad || 0), 0);

  function limpiarForm() {
    setFormId(undefined);
    setNumeroDap("");
    setFechaEmision(new Date().toISOString().slice(0, 10));
    setCdaId("");
    setRegimen("70");
    setTipoEspacio("deposito_aduanero_publico");
    setTotalPaquetes("");
    setTotalPallets("");
    setTotalUnidades("");
    setPesoTotal("");
    setPaletizada("");
    setTipoCarga("");
    setNombreTransportista("");
    setCedulaTransportista("");
    setTransporteId("");
    setPlaca("");
    setCandados("");
    setSellos("");
    setOperadorId("");
    setHoraLlegada("");
    setObservaciones("");
    setUbicaciones([]);
    setErrorMsg(null);
  }

  async function generarNumeroDap(): Promise<string> {
    const anio = new Date().getFullYear();
    // Busca el último número del año actual (formato "AAAA-NNN")
    const { data } = await supabase
      .from("ordenes_dap")
      .select("numero_dap")
      .ilike("numero_dap", `${anio}-%`)
      .order("numero_dap", { ascending: false })
      .limit(1);

    let siguiente = 1;
    if (data && data.length > 0) {
      const partes = data[0].numero_dap.split("-");
      const ultimo = parseInt(partes[1], 10);
      if (!isNaN(ultimo)) siguiente = ultimo + 1;
    }
    return `${anio}-${String(siguiente).padStart(3, "0")}`;
  }

  async function abrirNuevo() {
    limpiarForm();
    setNumeroDap(await generarNumeroDap());
    // Arranca en Rég. 70 -> Depósito Aduanero Público, bodega única auto-asignada
    const dap = bodegas.find((b) => b.tipo_espacio === "deposito_aduanero_publico");
    setBodegaId(dap?.id ?? "");
    setShowForm(true);
  }

  // El tipo de carga determina el espacio: Rég.70 -> Depósito; Rég.10 y General -> Bodega
  function espacioSegunCarga(carga: "70" | "10" | "general"): TipoEspacio {
    return carga === "70" ? "deposito_aduanero_publico" : "bodega_simple";
  }

  function cambiarTipoCarga(carga: "70" | "10" | "general") {
    setRegimen(carga);
    const espacio = espacioSegunCarga(carga);
    setTipoEspacio(espacio);
    setUbicaciones([]); // reiniciar ubicaciones al cambiar de espacio

    if (espacio === "deposito_aduanero_publico") {
      // Depósito: hay una sola bodega física, se asigna sola
      const dap = bodegas.find((b) => b.tipo_espacio === "deposito_aduanero_publico");
      setBodegaId(dap?.id ?? "");
    } else {
      // Bodega simple: el usuario debe elegir cuál (BDG-ETY o BDG-VIALACOSTA)
      setBodegaId("");
    }
  }

  // Bodegas simples disponibles para elegir (cuando el tipo de carga es 10 o general)
  const bodegasSimples = bodegas.filter((b) => b.tipo_espacio === "bodega_simple");
  const bodegaElegida = bodegas.find((b) => b.id === bodegaId);
  const nombreBodega = bodegaElegida ? `${bodegaElegida.codigo} · ${bodegaElegida.nombre}` : espacioLabel[tipoEspacio];

  async function abrirEditar(o: OrdenDap) {
    limpiarForm();
    setFormId(o.id);
    setNumeroDap(o.numero_dap);
    setFechaEmision(o.fecha_emision_ingreso ?? new Date().toISOString().slice(0, 10));
    setCdaId(o.cda_id);
    setRegimen((o.tipo_carga_regimen as "70" | "10" | "general") ?? (o.regimen as "70" | "10" | "general") ?? "70");
    setTipoEspacio((o.tipo_espacio as TipoEspacio) ?? "deposito_aduanero_publico");
    setBodegaId(o.bodega_id ?? "");
    setTotalPaquetes(o.cantidad_ingresada?.toString() ?? "");
    setTotalPallets(o.total_pallets?.toString() ?? "");
    setTotalUnidades(o.total_unidades?.toString() ?? "");
    setPesoTotal(o.peso_total_kg?.toString() ?? "");
    setPaletizada(o.paletizada === true ? "si" : o.paletizada === false ? "no" : "");
    setTipoCarga((o.tipo_carga as typeof tipoCarga) ?? "");
    setNombreTransportista(o.nombre_transportista ?? "");
    setCedulaTransportista(o.cedula_transportista ?? "");
    setTransporteId(o.transporte_id ?? "");
    setPlaca(o.placa_vehiculo ?? "");
    setCandados(o.candados ?? "");
    setSellos(o.sellos ?? "");
    setOperadorId(o.operador_candado_id ?? "");
    setHoraLlegada(o.hora_llegada ?? "");
    setObservaciones(o.observaciones ?? "");

    // Cargar las ubicaciones ya asignadas a esta orden para poder editarlas
    const { data: ubiData } = await supabase
      .from("ubicaciones_carga")
      .select("posicion_id, cantidad")
      .eq("orden_dap_id", o.id);
    setUbicaciones(
      (ubiData ?? []).map((u) => ({
        posicion_id: u.posicion_id,
        cantidad: u.cantidad?.toString() ?? "",
      }))
    );

    setShowForm(true);
  }

  function agregarUbicacion() {
    setUbicaciones((prev) => [...prev, { posicion_id: "", cantidad: "" }]);
  }

  function actualizarUbicacion(idx: number, campo: keyof Ubicacion, valor: string) {
    setUbicaciones((prev) => prev.map((u, i) => (i === idx ? { ...u, [campo]: valor } : u)));
  }

  function quitarUbicacion(idx: number) {
    setUbicaciones((prev) => prev.filter((_, i) => i !== idx));
  }

  async function guardar() {
    if (!numeroDap.trim() || !cdaId || !totalPaquetes) {
      setErrorMsg("Número de DAP, CDA y total de paquetes son obligatorios.");
      return;
    }

    if (!bodegaId) {
      setErrorMsg(
        tipoEspacio === "bodega_simple"
          ? "Selecciona a qué bodega simple entra la carga (BDG-ETY o BDG-VIALACOSTA)."
          : "No se pudo determinar la bodega. Revisa que existan bodegas creadas."
      );
      return;
    }

    const cantidad = Number(totalPaquetes);

    // Validar que las ubicaciones (si hay) sumen el total de paquetes
    if (ubicaciones.length > 0) {
      const ubicacionesValidas = ubicaciones.filter((u) => u.posicion_id && u.cantidad);
      if (ubicacionesValidas.length !== ubicaciones.length) {
        setErrorMsg("Hay ubicaciones sin posición o sin cantidad. Complétalas o quítalas.");
        return;
      }
      if (sumaUbicaciones !== cantidad) {
        setErrorMsg(
          `Las ubicaciones suman ${sumaUbicaciones}, pero el total de paquetes es ${cantidad}. Deben coincidir.`
        );
        return;
      }
    }

    setSaving(true);
    setErrorMsg(null);

    // Blindaje contra concurrencia: si es un ingreso nuevo, confirmar que el
    // número generado no lo haya tomado otra persona entre abrir y guardar.
    let numeroFinal = numeroDap.trim();
    if (!formId) {
      const { data: existe } = await supabase
        .from("ordenes_dap")
        .select("id")
        .eq("numero_dap", numeroFinal)
        .maybeSingle();
      if (existe) {
        numeroFinal = await generarNumeroDap();
        setNumeroDap(numeroFinal);
      }
    }

    const payload = {
      numero_dap: numeroFinal,
      cda_id: cdaId,
      regimen: regimen === "general" ? "10" : regimen,
      tipo_carga_regimen: regimen,
      tipo_espacio: tipoEspacio,
      bodega_id: bodegaId,
      cantidad_ingresada: cantidad,
      fecha_emision_ingreso: fechaEmision || null,
      total_pallets: totalPallets ? Number(totalPallets) : null,
      total_unidades: totalUnidades ? Number(totalUnidades) : null,
      peso_total_kg: pesoTotal ? Number(pesoTotal) : null,
      paletizada: paletizada === "si" ? true : paletizada === "no" ? false : null,
      tipo_carga: tipoCarga || null,
      nombre_transportista: nombreTransportista.trim() || null,
      cedula_transportista: cedulaTransportista.trim() || null,
      transporte_id: transporteId || null,
      placa_vehiculo: placa.trim() || null,
      candados: candados.trim() || null,
      sellos: sellos.trim() || null,
      operador_candado_id: operadorId || null,
      hora_llegada: horaLlegada.trim() || null,
      observaciones: observaciones.trim() || null,
    };

    let ordenId = formId;

    if (formId) {
      const { error } = await supabase.from("ordenes_dap").update(payload).eq("id", formId);
      if (error) {
        setSaving(false);
        setErrorMsg(error.message.includes("duplicate") ? "Ya existe una orden con ese número de DAP." : error.message);
        return;
      }
    } else {
      const { data, error } = await supabase
        .from("ordenes_dap")
        .insert({ ...payload, cantidad_actual: cantidad })
        .select()
        .single();
      if (error) {
        setSaving(false);
        setErrorMsg(error.message.includes("duplicate") ? "Ya existe una orden con ese número de DAP." : error.message);
        return;
      }
      ordenId = data.id;
    }

    // Manejo de ubicaciones: al editar, primero liberar las anteriores y
    // borrarlas; luego (en ambos casos) escribir las nuevas y ocupar posiciones.
    if (formId) {
      const { data: viejas } = await supabase
        .from("ubicaciones_carga")
        .select("posicion_id")
        .eq("orden_dap_id", formId);
      const idsViejas = (viejas ?? []).map((v) => v.posicion_id);
      if (idsViejas.length > 0) {
        await supabase.from("posiciones_nivel").update({ ocupado: false }).in("id", idsViejas);
        await supabase.from("ubicaciones_carga").delete().eq("orden_dap_id", formId);
      }
    }

    if (ubicaciones.length > 0 && ordenId) {
      const ubicacionesPayload = ubicaciones
        .filter((u) => u.posicion_id && u.cantidad)
        .map((u) => ({
          orden_dap_id: ordenId,
          posicion_id: u.posicion_id,
          cantidad: Number(u.cantidad),
        }));
      const { error: ubiError } = await supabase.from("ubicaciones_carga").insert(ubicacionesPayload);
      if (!ubiError) {
        const idsPosiciones = ubicacionesPayload.map((u) => u.posicion_id);
        await supabase.from("posiciones_nivel").update({ ocupado: true }).in("id", idsPosiciones);
      }
    }

    setSaving(false);
    setShowForm(false);
    setToast(formId ? "Orden actualizada correctamente." : "Ingreso registrado exitosamente.");
    cargarDatos();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("ordenes_dap").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(
        error.message.includes("foreign key") || error.message.includes("violates")
          ? "No se puede eliminar: esta orden tiene egresos o ubicaciones asociadas."
          : error.message
      );
      return;
    }
    setToast("Orden eliminada correctamente.");
    cargarDatos();
  }

  const ordenesFiltradas = ordenes.filter(
    (o) =>
      o.numero_dap.toLowerCase().includes(search.toLowerCase()) ||
      o.cdas?.clientes?.nombre.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/ingreso" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Ingreso de carga</h1>
              <p className="text-[12.5px] text-text-faint">
                {ordenes.length} orden{ordenes.length !== 1 ? "es" : ""} DAP registrada
                {ordenes.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              disabled={cdas.length === 0}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <Plus size={15} /> Nuevo ingreso
            </button>
          </div>

          {cdas.length === 0 && !loading && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber/10 border border-amber/20 text-[12.5px] text-[#fbbf24]">
              Todavía no hay CDA registrados. Crea uno primero en la pantalla de CDA.
            </div>
          )}

          <input
            placeholder="Buscar por número de DAP o cliente…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-[340px] card px-3 py-2 text-[12.5px] mb-4.5 outline-none focus:border-border-2 placeholder:text-text-faint"
          />

          {errorMsg && !showForm && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[1.1fr_1.5fr_1.4fr_1fr_1fr_120px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>N° DAP</span>
              <span>Cliente</span>
              <span>Espacio</span>
              <span>Ingresado</span>
              <span>Actual</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando órdenes…</p>
            ) : ordenesFiltradas.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay órdenes {search ? "que coincidan con la búsqueda" : "registradas todavía"}.
              </p>
            ) : (
              ordenesFiltradas.map((o) => (
                <div
                  key={o.id}
                  className="grid grid-cols-[1.1fr_1.5fr_1.4fr_1fr_1fr_120px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[13px] font-medium">{o.numero_dap}</span>
                  <span className="text-[12.5px] text-text-dim truncate">
                    {o.cdas?.clientes?.nombre ?? "—"}
                  </span>
                  <span
                    className={`text-[10.5px] px-2 py-0.5 rounded-full w-fit ${
                      o.tipo_espacio === "bodega_simple"
                        ? "bg-amber/[0.14] text-[#fbbf24]"
                        : "bg-accent/[0.18] text-[#c4b8ff]"
                    }`}
                  >
                    {o.tipo_espacio ? espacioLabel[o.tipo_espacio as TipoEspacio] : "—"}
                  </span>
                  <span className="text-[12.5px] text-text-dim">
                    {o.cantidad_ingresada.toLocaleString("es-EC")}
                  </span>
                  <span
                    className={`text-[12.5px] font-medium ${
                      o.cantidad_actual < o.cantidad_ingresada ? "text-amber" : "text-text"
                    }`}
                  >
                    {o.cantidad_actual.toLocaleString("es-EC")}
                  </span>
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => imprimirOrden(o)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Imprimir orden de ingreso"
                      title="Imprimir orden de ingreso"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      onClick={() => abrirEditar(o)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Editar"
                      title="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setAEliminar(o.id)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-red-300 hover:bg-red/10"
                      aria-label="Eliminar"
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

      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-[760px] p-6 relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">
              {formId ? "Editar ingreso de carga" : "Nuevo ingreso de carga"}
            </h2>

            {/* SECCIÓN 1 */}
            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              1. Datos generales y referencia CDA
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Número Orden DAP (automático)
                </label>
                <input
                  value={numeroDap}
                  readOnly
                  tabIndex={-1}
                  className="w-full card px-3 py-2 text-[13px] outline-none opacity-70 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Fecha emisión *</label>
                <input
                  type="date"
                  value={fechaEmision}
                  onChange={(e) => setFechaEmision(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Referencia CDA *</label>
                <select
                  value={cdaId}
                  onChange={(e) => setCdaId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona un CDA…</option>
                  {cdas.map((c) => (
                    <option key={c.id} value={c.id}>
                      CDA #{c.folio} · {c.clientes?.nombre ?? "—"}{" "}
                      {c.numero_cda ? `(${c.numero_cda})` : "(pendiente)"}
                    </option>
                  ))}
                </select>
              </div>
              {cdaSeleccionado && (
                <div className="col-span-3 text-[11.5px] text-text-faint px-1">
                  <span>Consignatario: {cdaSeleccionado.clientes?.nombre}</span>
                  {cdaSeleccionado.bl && <span> · BL: {cdaSeleccionado.bl}</span>}
                </div>
              )}
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Tipo de carga *</label>
                <div className="flex gap-2">
                  {([
                    { v: "70", label: "Rég. 70" },
                    { v: "10", label: "Rég. 10" },
                    { v: "general", label: "Carga General" },
                  ] as const).map((r) => (
                    <button
                      key={r.v}
                      type="button"
                      onClick={() => cambiarTipoCarga(r.v)}
                      className={`flex-1 text-[12px] font-medium py-2 rounded-lg border ${
                        regimen === r.v
                          ? "bg-accent/[0.18] text-[#c4b8ff] border-accent-2/30"
                          : "border-border-2 text-text-dim"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Tipo de espacio (se asigna automáticamente según el tipo de carga)
                </label>
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[12.5px] font-medium ${
                    tipoEspacio === "bodega_simple"
                      ? "bg-amber/[0.12] text-[#fbbf24] border-amber/25"
                      : "bg-accent/[0.14] text-[#c4b8ff] border-accent-2/25"
                  }`}
                >
                  <MapPin size={13} />
                  {espacioLabel[tipoEspacio]}
                  <span className="ml-auto text-[10.5px] text-text-faint font-normal">
                    {regimen === "70" ? "Rég. 70" : regimen === "10" ? "Rég. 10" : "Carga General"}
                  </span>
                </div>
              </div>

              {tipoEspacio === "bodega_simple" && (
                <div className="col-span-3">
                  <label className="text-[11.5px] text-text-faint block mb-1">
                    ¿A qué bodega entra la carga? *
                  </label>
                  <div className="flex gap-2">
                    {bodegasSimples.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          setBodegaId(b.id);
                          setUbicaciones([]); // cambiar de bodega reinicia ubicaciones
                        }}
                        className={`flex-1 text-[12px] font-medium py-2 rounded-lg border ${
                          bodegaId === b.id
                            ? "bg-accent/[0.18] text-[#c4b8ff] border-accent-2/30"
                            : "border-border-2 text-text-dim"
                        }`}
                      >
                        {b.codigo} · {b.nombre}
                      </button>
                    ))}
                    {bodegasSimples.length === 0 && (
                      <span className="text-[11.5px] text-amber py-2">
                        No hay bodegas simples creadas. Córrelas en la migración.
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SECCIÓN 2 */}
            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              2. Detalles de carga y transporte
            </p>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Total paquetes *</label>
                <input
                  type="number"
                  value={totalPaquetes}
                  onChange={(e) => setTotalPaquetes(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Total pallets</label>
                <input
                  type="number"
                  value={totalPallets}
                  onChange={(e) => setTotalPallets(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Total unidades</label>
                <input
                  type="number"
                  value={totalUnidades}
                  onChange={(e) => setTotalUnidades(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Peso total (Kg)</label>
                <input
                  type="number"
                  step="0.01"
                  value={pesoTotal}
                  onChange={(e) => setPesoTotal(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Paletizada</label>
                <select
                  value={paletizada}
                  onChange={(e) => setPaletizada(e.target.value as "si" | "no" | "")}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">—</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="col-span-3">
                <label className="text-[11.5px] text-text-faint block mb-1">Carga llega como</label>
                <select
                  value={tipoCarga}
                  onChange={(e) => setTipoCarga(e.target.value as typeof tipoCarga)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona…</option>
                  <option value="contenedor">Contenedor</option>
                  <option value="plataforma">Plataforma</option>
                  <option value="camion">Camión</option>
                </select>
              </div>
            </div>

            {/* SECCIÓN 3 */}
            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              3. Transportista que trajo la carga
            </p>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Nombre(s)</label>
                <input
                  value={nombreTransportista}
                  onChange={(e) => setNombreTransportista(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Cédula / RUC</label>
                <input
                  value={cedulaTransportista}
                  onChange={(e) => setCedulaTransportista(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Transporte</label>
                <select
                  value={transporteId}
                  onChange={(e) => setTransporteId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona…</option>
                  {transportes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Placa vehículo</label>
                <input
                  value={placa}
                  onChange={(e) => setPlaca(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Candado(s)</label>
                <input
                  value={candados}
                  onChange={(e) => setCandados(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Sello(s)</label>
                <input
                  value={sellos}
                  onChange={(e) => setSellos(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Operador candado</label>
                <select
                  value={operadorId}
                  onChange={(e) => setOperadorId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona…</option>
                  {operadores.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Hora llegada</label>
                <input
                  value={horaLlegada}
                  onChange={(e) => setHoraLlegada(e.target.value)}
                  placeholder="09:00 AM"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div className="col-span-3">
                <label className="text-[11.5px] text-text-faint block mb-1">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                />
              </div>
            </div>

            {/* SECCIÓN 4: UBICACIONES */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11.5px] font-semibold text-text-dim">
                4. Asignación de ubicaciones (opcional)
              </p>
              <button
                onClick={agregarUbicacion}
                disabled={posicionesDisponibles.length === 0}
                className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg disabled:opacity-40"
              >
                <MapPin size={12} /> Ubicación
              </button>
            </div>

            {posicionesDisponibles.length === 0 ? (
              <p className="text-[11px] text-text-faint mb-4">
                No hay posiciones libres en {nombreBodega}. Puedes guardar sin ubicar y
                asignarla después, o crear posiciones en Racks.
              </p>
            ) : (
              <>
                <p className="text-[10.5px] text-text-faint mb-2">
                  La suma de cantidades debe coincidir con el total de paquetes. Solo se muestran
                  posiciones libres de {nombreBodega}.
                </p>
                <div className="flex flex-col gap-2 mb-2">
                  {ubicaciones.map((u, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_120px_28px] gap-2">
                      <select
                        value={u.posicion_id}
                        onChange={(e) => actualizarUbicacion(idx, "posicion_id", e.target.value)}
                        className="card px-2 py-1.5 text-[12px] outline-none"
                      >
                        <option value="">Selecciona posición…</option>
                        {posicionesDisponibles.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.niveles_rack?.racks.codigo} · N{p.niveles_rack?.numero_nivel} ·{" "}
                            {p.codigo_posicion}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={u.cantidad}
                        onChange={(e) => actualizarUbicacion(idx, "cantidad", e.target.value)}
                        placeholder="Cantidad"
                        className="card px-2 py-1.5 text-[12px] outline-none"
                      />
                      <button
                        onClick={() => quitarUbicacion(idx)}
                        className="text-red-300 hover:bg-red/10 rounded-lg flex items-center justify-center"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                {ubicaciones.length > 0 && (
                  <p
                    className={`text-[11.5px] mb-4 ${
                      sumaUbicaciones === Number(totalPaquetes || 0)
                        ? "text-[#6ee7b7]"
                        : "text-amber"
                    }`}
                  >
                    Suma ubicada: {sumaUbicaciones} / {totalPaquetes || 0} paquetes
                  </p>
                )}
              </>
            )}

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={guardar}
                disabled={saving}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar ingreso"}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* -------------------- VISTA DE IMPRESIÓN: ORDEN DE INGRESO -------------------- */}
      {ordenImprimir && (
        <div className="print-area hidden print:block text-black bg-white p-10">
          <div className="max-w-[640px] mx-auto">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="font-bold text-[18px]">ETYECU</span>
              <span className="text-[14px] font-bold">DEPÓSITO ADUANERO PÚBLICO</span>
            </div>
            <p className="text-[15px] font-bold text-center mb-5">
              ORDEN DE INGRESO DE CARGA {ordenImprimir.numero_dap}
            </p>

            <table className="w-full text-[10.5px] border border-black/50 border-collapse mb-5">
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold w-[130px]">DAP:</td>
                  <td className="border border-black/40 p-1.5 w-[200px]">{ordenImprimir.numero_dap}</td>
                  <td className="border border-black/40 p-1.5 font-bold w-[80px]">Fecha:</td>
                  <td className="border border-black/40 p-1.5 text-right">
                    {ordenImprimir.fecha_emision_ingreso
                      ? new Date(ordenImprimir.fecha_emision_ingreso).toLocaleDateString("es-EC")
                      : ""}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Consignatario:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {ordenImprimir.cdas?.clientes?.nombre ?? ""}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Referencia a CDA:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {ordenImprimir.cdas?.numero_cda ?? "Pendiente"}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">BL o Guía:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {ordenImprimir.cdas?.bl ?? ""}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Carga llega:</td>
                  <td className="border border-black/40 p-1.5 capitalize">
                    {ordenImprimir.tipo_carga ?? ""}
                  </td>
                  <td className="border border-black/40 p-1.5 font-bold">Cod. Transp:</td>
                  <td className="border border-black/40 p-1.5 text-right">{transporteImprimir}</td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Paletizada:</td>
                  <td className="border border-black/40 p-1.5">
                    {ordenImprimir.paletizada === true
                      ? "Sí"
                      : ordenImprimir.paletizada === false
                      ? "No"
                      : ""}
                  </td>
                  <td className="border border-black/40 p-1.5 font-bold">Peso:</td>
                  <td className="border border-black/40 p-1.5 text-right">
                    {ordenImprimir.peso_total_kg ?? 0}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1.5 font-bold">Candado:</td>
                  <td className="border border-black/40 p-1.5" colSpan={3}>
                    {ordenImprimir.candados ?? ""}
                  </td>
                </tr>
              </tbody>
            </table>

            <p className="text-[10.5px] font-bold mb-1.5">
              Detalle de mercancía nacionalizada según ítems de la declaración aduanera:
            </p>
            <table className="w-full text-[10px] border border-black/50 border-collapse mb-10">
              <thead>
                <tr>
                  <th className="border border-black/40 p-1.5 text-left">Descripción General</th>
                  <th className="border border-black/40 p-1.5 w-[80px]">Cant. Pallets</th>
                  <th className="border border-black/40 p-1.5 w-[60px]">Cajas</th>
                  <th className="border border-black/40 p-1.5 w-[70px]">Peso (Kg)</th>
                  <th className="border border-black/40 p-1.5 text-left w-[190px]">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1.5 capitalize">
                    {ordenImprimir.tipo_carga ?? ""}
                  </td>
                  <td className="border border-black/40 p-1.5 text-center">
                    {ordenImprimir.total_pallets ?? ""}
                  </td>
                  <td className="border border-black/40 p-1.5 text-center">
                    {ordenImprimir.cantidad_ingresada}
                  </td>
                  <td className="border border-black/40 p-1.5 text-center">
                    {ordenImprimir.peso_total_kg ?? 0}
                  </td>
                  <td className="border border-black/40 p-1.5">
                    {ordenImprimir.observaciones ?? "Ninguna"}
                  </td>
                </tr>
                {Array.from({ length: 9 }).map((_, i) => (
                  <tr key={i}>
                    <td className="border border-black/40 p-1.5">&nbsp;</td>
                    <td className="border border-black/40 p-1.5"></td>
                    <td className="border border-black/40 p-1.5"></td>
                    <td className="border border-black/40 p-1.5"></td>
                    <td className="border border-black/40 p-1.5"></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-between text-[10px] mt-16">
              <div className="w-[240px] text-center">
                <p className="border-t border-black pt-1">Entregué Conforme</p>
                <p className="font-bold mt-1">{ordenImprimir.nombre_transportista ?? ""}</p>
                {ordenImprimir.cedula_transportista && (
                  <p>C.C: {ordenImprimir.cedula_transportista}</p>
                )}
                {ordenImprimir.placa_vehiculo && <p>Placa: {ordenImprimir.placa_vehiculo}</p>}
              </div>
              <div className="w-[240px] text-center">
                <p className="border-t border-black pt-1">Recibí Conforme (DAP ETYECU)</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar orden DAP?"
        mensaje="Esta acción no se puede deshacer. Se eliminará la orden de ingreso permanentemente."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
