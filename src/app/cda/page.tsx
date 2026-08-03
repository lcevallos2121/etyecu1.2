"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X, FileText, Upload } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const MONEDAS = [
  "DOLAR",
  "EURO",
  "YUAN CHINO",
  "LIBRA ESTERLINA",
  "YEN JAPONES",
  "DOLAR CANADIENSE",
  "FRANCO SUIZO",
  "WON COREANO",
  "PESO MEXICANO",
  "REAL BRASILEÑO",
];

function normalizarEncabezado(texto: string): string {
  return texto
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();
}

const MAPA_COLUMNAS: Record<string, string[]> = {
  partida_arancelaria: ["partida arancelaria", "partida"],
  modelo: ["modelo", "codigo", "código"],
  descripcion: ["descripcion mercaderia", "descripcion", "descripción mercadería", "descripción"],
  unidad_comercial: ["unidad comercial", "unidad"],
  cantidad: ["cantidad"],
  precio_unitario_exw: ["p unit exw", "precio unitario", "p unit", "preciounitario", "punitexw"],
};

function detectarColumna(encabezado: string): string | null {
  const norm = normalizarEncabezado(encabezado);
  for (const [campo, variantes] of Object.entries(MAPA_COLUMNAS)) {
    if (variantes.some((v) => normalizarEncabezado(v) === norm)) return campo;
  }
  return null;
}

type ClienteRef = {
  id: string;
  nombre: string;
  ruc_ci: string;
  direccion: string | null;
  telefono: string | null;
  correo: string | null;
};

type CdaItem = {
  id?: string;
  partida_arancelaria: string;
  modelo: string;
  descripcion: string;
  unidad_comercial: string;
  cantidad: string;
  precio_unitario_exw: string;
};

type Cda = {
  id: string;
  folio: number;
  numero_cda: string | null;
  cliente_id: string;
  transporte: string | null;
  pais_origen: string | null;
  puerto_embarque_1: string | null;
  puerto_embarque_2: string | null;
  puerto_desembarque: string | null;
  moneda: string | null;
  bl: string | null;
  proveedor: string | null;
  factura: string | null;
  fecha_factura: string | null;
  valor_garantia: number | null;
  gastos_origen: number | null;
  flete: number | null;
  seguro: number | null;
  creado_en: string;
  clientes: ClienteRef | null;
};

const emptyItem: CdaItem = {
  partida_arancelaria: "",
  modelo: "",
  descripcion: "",
  unidad_comercial: "U",
  cantidad: "",
  precio_unitario_exw: "",
};

export default function CdaPage() {
  const supabase = createClient();

  const [cdas, setCdas] = useState<Cda[]>([]);
  const [clientes, setClientes] = useState<ClienteRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formId, setFormId] = useState<string | undefined>(undefined);
  const [clienteId, setClienteId] = useState("");
  const [numeroCda, setNumeroCda] = useState("");
  const [transporte, setTransporte] = useState("MARITIMO");
  const [paisOrigen, setPaisOrigen] = useState("");
  const [puerto1, setPuerto1] = useState("");
  const [puerto2, setPuerto2] = useState("");
  const [puertoDesembarque, setPuertoDesembarque] = useState("");
  const [moneda, setMoneda] = useState("DOLAR");
  const [bl, setBl] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [factura, setFactura] = useState("");
  const [fechaFactura, setFechaFactura] = useState("");
  const [valorGarantia, setValorGarantia] = useState("");
  const [gastosOrigen, setGastosOrigen] = useState("");
  const [flete, setFlete] = useState("");
  const [seguro, setSeguro] = useState("");
  const [items, setItems] = useState<CdaItem[]>([{ ...emptyItem }]);

  const [cdaImprimir, setCdaImprimir] = useState<(Cda & { itemsImpresion: CdaItem[] }) | null>(
    null
  );
  const [avisoExcel, setAvisoExcel] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  async function manejarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    setAvisoExcel(null);

    try {
      const buffer = await archivo.arrayBuffer();
      const libro = XLSX.read(buffer, { type: "array" });
      const hoja = libro.Sheets[libro.SheetNames[0]];
      const filas: unknown[][] = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: "" });

      if (filas.length < 2) {
        setAvisoExcel("El archivo no tiene filas de datos debajo del encabezado.");
        return;
      }

      const encabezados = filas[0] as string[];
      const indiceCampo: Record<number, string> = {};
      encabezados.forEach((h, i) => {
        const campo = detectarColumna(String(h));
        if (campo) indiceCampo[i] = campo;
      });

      const camposEncontrados = new Set(Object.values(indiceCampo));
      const camposEsperados = Object.keys(MAPA_COLUMNAS);
      const faltantes = camposEsperados.filter((c) => !camposEncontrados.has(c));

      const nuevosItems: CdaItem[] = [];
      for (let f = 1; f < filas.length; f++) {
        const fila = filas[f];
        if (!fila || fila.every((c) => c === "" || c == null)) continue;

        const item: CdaItem = { ...emptyItem };
        Object.entries(indiceCampo).forEach(([idx, campo]) => {
          const valor = fila[Number(idx)];
          if (valor === "" || valor == null) return;
          if (campo === "cantidad" || campo === "precio_unitario_exw") {
            (item as unknown as Record<string, string>)[campo] = String(valor);
          } else {
            (item as unknown as Record<string, string>)[campo] = String(valor);
          }
        });
        if (item.modelo.trim() || item.descripcion.trim()) nuevosItems.push(item);
      }

      if (nuevosItems.length === 0) {
        setAvisoExcel("No se detectaron filas de mercancía válidas en el archivo.");
        return;
      }

      setItems(nuevosItems);
      setAvisoExcel(
        faltantes.length > 0
          ? `Se cargaron ${nuevosItems.length} ítems. No se reconocieron las columnas: ${faltantes.join(", ")} — revísalas manualmente.`
          : `Se cargaron ${nuevosItems.length} ítems correctamente desde el Excel.`
      );
    } catch {
      setAvisoExcel("No se pudo leer el archivo. Verifica que sea un .xls o .xlsx válido.");
    } finally {
      e.target.value = "";
    }
  }

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [{ data: cdaData, error: cdaError }, { data: clienteData }] = await Promise.all([
      supabase
        .from("cdas")
        .select("*, clientes(id, nombre, ruc_ci, direccion, telefono, correo)")
        .order("folio", { ascending: false }),
      supabase.from("clientes").select("id, nombre, ruc_ci, direccion, telefono, correo").order("nombre"),
    ]);

    if (cdaError) {
      setErrorMsg(
        cdaError.message.includes("permission")
          ? "Sin permisos para leer CDA. Falta correr migracion_flujo_real.sql."
          : cdaError.message
      );
    } else {
      setCdas((cdaData as unknown as Cda[]) ?? []);
    }
    setClientes(clienteData ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  function abrirNuevo() {
    setFormId(undefined);
    setClienteId("");
    setNumeroCda("");
    setTransporte("MARITIMO");
    setPaisOrigen("");
    setPuerto1("");
    setPuerto2("");
    setPuertoDesembarque("");
    setMoneda("DOLAR");
    setBl("");
    setProveedor("");
    setFactura("");
    setFechaFactura("");
    setValorGarantia("");
    setGastosOrigen("");
    setFlete("");
    setSeguro("");
    setItems([{ ...emptyItem }]);
    setErrorMsg(null);
    setShowForm(true);
  }

  async function abrirEditar(c: Cda) {
    setFormId(c.id);
    setClienteId(c.cliente_id);
    setNumeroCda(c.numero_cda ?? "");
    setTransporte(c.transporte ?? "MARITIMO");
    setPaisOrigen(c.pais_origen ?? "");
    setPuerto1(c.puerto_embarque_1 ?? "");
    setPuerto2(c.puerto_embarque_2 ?? "");
    setPuertoDesembarque(c.puerto_desembarque ?? "");
    setMoneda(c.moneda ?? "DOLAR");
    setBl(c.bl ?? "");
    setProveedor(c.proveedor ?? "");
    setFactura(c.factura ?? "");
    setFechaFactura(c.fecha_factura ?? "");
    setValorGarantia(c.valor_garantia?.toString() ?? "");
    setGastosOrigen(c.gastos_origen?.toString() ?? "");
    setFlete(c.flete?.toString() ?? "");
    setSeguro(c.seguro?.toString() ?? "");
    setErrorMsg(null);

    const { data: itemsData } = await supabase
      .from("cda_items")
      .select("*")
      .eq("cda_id", c.id)
      .order("creado_en");

    setItems(
      itemsData && itemsData.length > 0
        ? itemsData.map((i) => ({
            id: i.id,
            partida_arancelaria: i.partida_arancelaria ?? "",
            modelo: i.modelo ?? "",
            descripcion: i.descripcion ?? "",
            unidad_comercial: i.unidad_comercial ?? "U",
            cantidad: i.cantidad?.toString() ?? "",
            precio_unitario_exw: i.precio_unitario_exw?.toString() ?? "",
          }))
        : [{ ...emptyItem }]
    );

    setShowForm(true);
  }

  function actualizarItem(idx: number, campo: keyof CdaItem, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }

  function agregarItem() {
    setItems((prev) => [...prev, { ...emptyItem }]);
  }

  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function guardar() {
    if (!clienteId) {
      setErrorMsg("Selecciona un cliente (importador).");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const payloadCda = {
      cliente_id: clienteId,
      numero_cda: numeroCda.trim() || null,
      transporte: transporte || null,
      pais_origen: paisOrigen.trim() || null,
      puerto_embarque_1: puerto1.trim() || null,
      puerto_embarque_2: puerto2.trim() || null,
      puerto_desembarque: puertoDesembarque.trim() || null,
      moneda: moneda || null,
      bl: bl.trim() || null,
      proveedor: proveedor.trim() || null,
      factura: factura.trim() || null,
      fecha_factura: fechaFactura.trim() || null,
      valor_garantia: valorGarantia ? Number(valorGarantia) : null,
      gastos_origen: gastosOrigen ? Number(gastosOrigen) : null,
      flete: flete ? Number(flete) : null,
      seguro: seguro ? Number(seguro) : null,
    };

    let cdaId = formId;

    if (formId) {
      const { error } = await supabase.from("cdas").update(payloadCda).eq("id", formId);
      if (error) {
        setSaving(false);
        setErrorMsg(
          error.message.includes("duplicate") ? "Ya existe un CDA con ese número." : error.message
        );
        return;
      }
      await supabase.from("cda_items").delete().eq("cda_id", formId);
    } else {
      const { data, error } = await supabase.from("cdas").insert(payloadCda).select().single();
      if (error) {
        setSaving(false);
        setErrorMsg(
          error.message.includes("duplicate") ? "Ya existe un CDA con ese número." : error.message
        );
        return;
      }
      cdaId = data.id;
    }

    const itemsValidos = items.filter((it) => it.modelo.trim() || it.descripcion.trim());
    if (itemsValidos.length > 0 && cdaId) {
      const itemsPayload = itemsValidos.map((it) => ({
        cda_id: cdaId,
        partida_arancelaria: it.partida_arancelaria.trim() || null,
        modelo: it.modelo.trim(),
        descripcion: it.descripcion.trim() || null,
        unidad_comercial: it.unidad_comercial || null,
        cantidad: it.cantidad ? Number(it.cantidad) : 0,
        precio_unitario_exw: it.precio_unitario_exw ? Number(it.precio_unitario_exw) : null,
        valor_exw_total:
          it.cantidad && it.precio_unitario_exw
            ? Number(it.cantidad) * Number(it.precio_unitario_exw)
            : null,
      }));
      const { error: itemsError } = await supabase.from("cda_items").insert(itemsPayload);
      if (itemsError) {
        setSaving(false);
        setErrorMsg(itemsError.message);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    setToast(formId ? "CDA actualizado correctamente." : "CDA creado exitosamente.");
    cargarDatos();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("cdas").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(
        error.message.includes("foreign key") || error.message.includes("violates")
          ? "No se puede eliminar: este CDA tiene órdenes DAP asociadas."
          : error.message
      );
      return;
    }
    setToast("CDA eliminado correctamente.");
    cargarDatos();
  }

  async function abrirSolicitud(c: Cda) {
    const { data: itemsData } = await supabase
      .from("cda_items")
      .select("*")
      .eq("cda_id", c.id)
      .order("creado_en");
    setCdaImprimir({
      ...c,
      itemsImpresion: (itemsData ?? []).map((i) => ({
        id: i.id,
        partida_arancelaria: i.partida_arancelaria ?? "",
        modelo: i.modelo ?? "",
        descripcion: i.descripcion ?? "",
        unidad_comercial: i.unidad_comercial ?? "",
        cantidad: i.cantidad?.toString() ?? "0",
        precio_unitario_exw: i.precio_unitario_exw?.toString() ?? "0",
      })),
    });
  }

  useEffect(() => {
    if (cdaImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [cdaImprimir]);

  const cdasFiltrados = cdas.filter(
    (c) =>
      (c.numero_cda ?? "").toLowerCase().includes(search.toLowerCase()) ||
      c.clientes?.nombre.toLowerCase().includes(search.toLowerCase()) ||
      (c.factura ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalFob = cdaImprimir?.itemsImpresion.reduce(
    (acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio_unitario_exw || 0),
    0
  );

  // Cálculos en vivo del formulario
  const subtotalItems = items.reduce(
    (acc, it) => acc + Number(it.cantidad || 0) * Number(it.precio_unitario_exw || 0),
    0
  );
  const totalFobForm = subtotalItems + Number(gastosOrigen || 0);
  const totalCifForm = totalFobForm + Number(flete || 0) + Number(seguro || 0);

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/cda" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">CDA</h1>
              <p className="text-[12.5px] text-text-faint">
                {cdas.length} contrato{cdas.length !== 1 ? "s" : ""} de aduana registrado
                {cdas.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              disabled={clientes.length === 0}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
            >
              <Plus size={15} /> Nuevo CDA
            </button>
          </div>

          {clientes.length === 0 && !loading && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber/10 border border-amber/20 text-[12.5px] text-[#fbbf24]">
              Todavía no hay clientes registrados. Crea uno primero en la pantalla de Clientes.
            </div>
          )}

          <input
            placeholder="Buscar por número de CDA, cliente o factura…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-[340px] card px-3 py-2 text-[12.5px] mb-4.5 outline-none focus:border-border-2 placeholder:text-text-faint"
          />

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          <div className="card overflow-hidden">
            <div className="grid grid-cols-[80px_1.5fr_1.3fr_1.2fr_1fr_130px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
              <span>Folio</span>
              <span>Cliente</span>
              <span>N° CDA</span>
              <span>Factura</span>
              <span>Transporte</span>
              <span></span>
            </div>

            {loading ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">Cargando CDA…</p>
            ) : cdasFiltrados.length === 0 ? (
              <p className="px-5 py-6 text-[13px] text-text-faint">
                No hay CDA {search ? "que coincidan con la búsqueda" : "registrados todavía"}.
              </p>
            ) : (
              cdasFiltrados.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[80px_1.5fr_1.3fr_1.2fr_1fr_130px] gap-3 px-5 py-3.5 items-center border-b border-border last:border-b-0 hover:bg-white/[0.02]"
                >
                  <span className="text-[12.5px] text-text-faint">#{c.folio}</span>
                  <span className="text-[12.5px] truncate">{c.clientes?.nombre ?? "—"}</span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full w-fit ${
                      c.numero_cda
                        ? "bg-green/[0.14] text-[#6ee7b7]"
                        : "bg-amber/[0.16] text-[#fbbf24]"
                    }`}
                  >
                    {c.numero_cda ?? "Pendiente"}
                  </span>
                  <span className="text-[12.5px] text-text-dim truncate">{c.factura || "—"}</span>
                  <span className="text-[12.5px] text-text-dim truncate">{c.transporte || "—"}</span>
                  <div className="flex gap-1.5 justify-end">
                    <button
                      onClick={() => abrirSolicitud(c)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Generar Solicitud Previa"
                      title="Generar Solicitud Previa (PDF)"
                    >
                      <FileText size={13} />
                    </button>
                    <button
                      onClick={() => abrirEditar(c)}
                      className="w-7 h-7 rounded-lg card flex items-center justify-center text-text-dim hover:text-text"
                      aria-label="Editar"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => setAEliminar(c.id)}
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

      {/* -------------------- MODAL DE CREAR/EDITAR -------------------- */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 print:hidden">
          <div className="card w-full max-w-[720px] p-6 relative max-h-[92vh] overflow-y-auto">
            <button
              onClick={() => setShowForm(false)}
              className="absolute top-4 right-4 text-text-faint hover:text-text"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
            <h2 className="text-[17px] font-semibold mb-4">{formId ? "Editar CDA" : "Nuevo CDA"}</h2>

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">1. Importador</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">Cliente *</label>
                <select
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="">Selecciona un cliente…</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} (RUC: {c.ruc_ci})
                    </option>
                  ))}
                </select>
              </div>
              {clienteSeleccionado && (
                <div className="col-span-2 text-[11.5px] text-text-faint px-1">
                  {clienteSeleccionado.direccion && <p>{clienteSeleccionado.direccion}</p>}
                  {clienteSeleccionado.telefono && <p>Tel: {clienteSeleccionado.telefono}</p>}
                </div>
              )}
            </div>

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              2. Datos de embarque y factura
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  N° de CDA (lo asigna Ecuapass)
                </label>
                <input
                  value={numeroCda}
                  onChange={(e) => setNumeroCda(e.target.value)}
                  placeholder="Se completa después"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Medio de transporte</label>
                <select
                  value={transporte}
                  onChange={(e) => setTransporte(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  <option value="MARITIMO">Marítimo</option>
                  <option value="AEREO">Aéreo</option>
                  <option value="TERRESTRE">Terrestre</option>
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">País de origen</label>
                <input
                  value={paisOrigen}
                  onChange={(e) => setPaisOrigen(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Moneda</label>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                >
                  {MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Puerto de embarque 1</label>
                <input
                  value={puerto1}
                  onChange={(e) => setPuerto1(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Puerto de embarque 2 (opcional)
                </label>
                <input
                  value={puerto2}
                  onChange={(e) => setPuerto2(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">Puerto de desembarque</label>
                <input
                  value={puertoDesembarque}
                  onChange={(e) => setPuertoDesembarque(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="text-[11.5px] text-text-faint block mb-1">
                  BL / Guía / Trazabilidad
                </label>
                <input
                  value={bl}
                  onChange={(e) => setBl(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Proveedor</label>
                <input
                  value={proveedor}
                  onChange={(e) => setProveedor(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Valor de garantía (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={valorGarantia}
                  onChange={(e) => setValorGarantia(e.target.value)}
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  N° de factura(s)
                </label>
                <input
                  value={factura}
                  onChange={(e) => setFactura(e.target.value)}
                  placeholder="800216; 800210"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">
                  Fecha(s) de factura
                </label>
                <input
                  value={fechaFactura}
                  onChange={(e) => setFechaFactura(e.target.value)}
                  placeholder="06/03/2026; 05/06/2026"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <p className="text-[11.5px] font-semibold text-text-dim">
                3. Ítems de mercancía (nota de pedido)
              </p>
              <div className="flex gap-1.5">
                <label className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer">
                  <Upload size={12} /> Cargar Excel
                  <input
                    type="file"
                    accept=".xls,.xlsx"
                    onChange={manejarExcel}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={agregarItem}
                  className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg"
                >
                  <Plus size={12} /> Fila
                </button>
              </div>
            </div>

            {avisoExcel && (
              <div className="mb-2 px-3 py-2 rounded-lg bg-accent/[0.1] border border-accent-2/20 text-[11.5px] text-text-dim">
                {avisoExcel}
              </div>
            )}
            <p className="text-[10.5px] text-text-faint mb-2">
              El Excel debe tener una fila de encabezados (Partida Arancelaria, Modelo,
              Descripción, Unidad Comercial, Cantidad, P. Unit. EXW) y una fila por ítem debajo.
            </p>

            <div className="flex flex-col gap-2 mb-4">
              {items.map((it, idx) => (
                <div key={idx} className="grid grid-cols-[1fr_1fr_1.4fr_70px_70px_90px_28px] gap-1.5">
                  <input
                    value={it.partida_arancelaria}
                    onChange={(e) => actualizarItem(idx, "partida_arancelaria", e.target.value)}
                    placeholder="Partida"
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <input
                    value={it.modelo}
                    onChange={(e) => actualizarItem(idx, "modelo", e.target.value)}
                    placeholder="Modelo"
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <input
                    value={it.descripcion}
                    onChange={(e) => actualizarItem(idx, "descripcion", e.target.value)}
                    placeholder="Descripción"
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <input
                    value={it.unidad_comercial}
                    onChange={(e) => actualizarItem(idx, "unidad_comercial", e.target.value)}
                    placeholder="U"
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <input
                    type="number"
                    value={it.cantidad}
                    onChange={(e) => actualizarItem(idx, "cantidad", e.target.value)}
                    placeholder="Cant."
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <input
                    type="number"
                    step="0.001"
                    value={it.precio_unitario_exw}
                    onChange={(e) => actualizarItem(idx, "precio_unitario_exw", e.target.value)}
                    placeholder="P. Unit"
                    className="card px-2 py-1.5 text-[11.5px] outline-none"
                  />
                  <button
                    onClick={() => quitarItem(idx)}
                    className="text-red-300 hover:bg-red/10 rounded-lg flex items-center justify-center"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              4. Costeo (opcional)
            </p>
            <div className="grid grid-cols-3 gap-3 mb-2">
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Gastos de origen</label>
                <input
                  type="number"
                  step="0.01"
                  value={gastosOrigen}
                  onChange={(e) => setGastosOrigen(e.target.value)}
                  placeholder="0.00"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Flete</label>
                <input
                  type="number"
                  step="0.01"
                  value={flete}
                  onChange={(e) => setFlete(e.target.value)}
                  placeholder="0.00"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
              <div>
                <label className="text-[11.5px] text-text-faint block mb-1">Seguro</label>
                <input
                  type="number"
                  step="0.01"
                  value={seguro}
                  onChange={(e) => setSeguro(e.target.value)}
                  placeholder="0.00"
                  className="w-full card px-3 py-2 text-[13px] outline-none"
                />
              </div>
            </div>

            <div className="card p-3 mb-4 bg-card-2 flex justify-between text-[12.5px]">
              <div className="flex gap-5">
                <span className="text-text-faint">
                  Subtotal ítems:{" "}
                  <b className="text-text">${subtotalItems.toFixed(2)}</b>
                </span>
                <span className="text-text-faint">
                  FOB: <b className="text-[#6ee7b7]">${totalFobForm.toFixed(2)}</b>
                </span>
              </div>
              <span className="text-text-faint">
                CIF: <b className="text-[#c4b8ff]">${totalCifForm.toFixed(2)}</b>
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={guardar}
                disabled={saving}
                className="btn-primary flex-1 text-[13px] font-semibold py-2 rounded-lg disabled:opacity-60"
              >
                {saving ? "Guardando…" : "Guardar CDA"}
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

      {/* -------------------- VISTA DE IMPRESIÓN: SOLICITUD PREVIA -------------------- */}
      {cdaImprimir && (
        <div className="print-area hidden print:block text-black bg-white p-8">
          <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
            <div>
              <p className="text-[20px] font-bold">ETYECU S.A.</p>
              <p className="text-[11px]">CONTRATO DE SOLICITUD PREVIA A DEPÓSITO ADUANERO PÚBLICO</p>
            </div>
            <p className="text-[11px] text-right">N° CDA: {cdaImprimir.numero_cda ?? "Pendiente"}</p>
          </div>

          <p className="text-[12px] font-bold mb-1">DATOS DEL IMPORTADOR</p>
          <div className="text-[11px] border border-black/40 p-2 mb-3">
            <p>Razón Social: {cdaImprimir.clientes?.nombre}</p>
            <p>RUC: {cdaImprimir.clientes?.ruc_ci}</p>
            <p>Dirección: {cdaImprimir.clientes?.direccion}</p>
            <p>Teléfono: {cdaImprimir.clientes?.telefono}</p>
          </div>

          <p className="text-[12px] font-bold mb-1">DATOS DEL EMBARQUE</p>
          <div className="text-[11px] border border-black/40 p-2 mb-3 grid grid-cols-2 gap-1">
            <p>Medio de Transporte: {cdaImprimir.transporte}</p>
            <p>País de Origen: {cdaImprimir.pais_origen}</p>
            <p>Puerto de Embarque 1: {cdaImprimir.puerto_embarque_1}</p>
            <p>Puerto de Embarque 2: {cdaImprimir.puerto_embarque_2 || "N/A"}</p>
            <p>Puerto Desembarque: {cdaImprimir.puerto_desembarque}</p>
            <p>Moneda: {cdaImprimir.moneda}</p>
            <p className="col-span-2">BL/Trazabilidad: {cdaImprimir.bl}</p>
            <p>Proveedor: {cdaImprimir.proveedor || "N/A"}</p>
            <p>N° Factura: {cdaImprimir.factura}</p>
            <p className="col-span-2">Fecha de Factura: {cdaImprimir.fecha_factura}</p>
          </div>

          <table className="w-full text-[10.5px] border-collapse mb-3">
            <thead>
              <tr className="border border-black/40">
                <th className="border border-black/40 p-1">N°</th>
                <th className="border border-black/40 p-1">Partida</th>
                <th className="border border-black/40 p-1">Modelo</th>
                <th className="border border-black/40 p-1">Descripción</th>
                <th className="border border-black/40 p-1">Unidad</th>
                <th className="border border-black/40 p-1">Cantidad</th>
                <th className="border border-black/40 p-1">P. Unit.</th>
                <th className="border border-black/40 p-1">Valor FOB</th>
              </tr>
            </thead>
            <tbody>
              {cdaImprimir.itemsImpresion.map((it, i) => (
                <tr key={i}>
                  <td className="border border-black/40 p-1 text-center">{i + 1}</td>
                  <td className="border border-black/40 p-1">{it.partida_arancelaria}</td>
                  <td className="border border-black/40 p-1">{it.modelo}</td>
                  <td className="border border-black/40 p-1">{it.descripcion}</td>
                  <td className="border border-black/40 p-1 text-center">{it.unidad_comercial}</td>
                  <td className="border border-black/40 p-1 text-right">{it.cantidad}</td>
                  <td className="border border-black/40 p-1 text-right">{it.precio_unitario_exw}</td>
                  <td className="border border-black/40 p-1 text-right">
                    {(Number(it.cantidad) * Number(it.precio_unitario_exw)).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end mb-8">
            <table className="text-[11px] border-collapse">
              <tbody>
                <tr>
                  <td className="border border-black/40 p-1 font-bold bg-gray-100">GASTOS DE ORIGEN</td>
                  <td className="border border-black/40 p-1 text-right w-[110px]">
                    ${(cdaImprimir.gastos_origen ?? 0).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1 font-bold bg-gray-100">TOTAL F.O.B.</td>
                  <td className="border border-black/40 p-1 text-right">
                    ${((totalFob ?? 0) + (cdaImprimir.gastos_origen ?? 0)).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1 font-bold bg-gray-100">FLETE</td>
                  <td className="border border-black/40 p-1 text-right">
                    ${(cdaImprimir.flete ?? 0).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1 font-bold bg-gray-100">SEGURO</td>
                  <td className="border border-black/40 p-1 text-right">
                    ${(cdaImprimir.seguro ?? 0).toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td className="border border-black/40 p-1 font-bold bg-gray-100">TOTAL C.I.F.</td>
                  <td className="border border-black/40 p-1 text-right font-bold">
                    ${(
                      (totalFob ?? 0) +
                      (cdaImprimir.gastos_origen ?? 0) +
                      (cdaImprimir.flete ?? 0) +
                      (cdaImprimir.seguro ?? 0)
                    ).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <p className="text-[10px] mb-10">
            Asumo toda la responsabilidad de lo declarado. Me comprometo a presentar para la
            nacionalización todas las autorizaciones exigidas por la ley.
          </p>

          <div className="flex justify-between text-[10px] mt-16">
            <p className="border-t border-black w-[220px] text-center pt-1">
              FIRMA Y SELLO DEL IMPORTADOR
            </p>
            <p className="border-t border-black w-[220px] text-center pt-1">FIRMA Y SELLO DE ETYECU S.A.</p>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar CDA?"
        mensaje="Se eliminará el CDA y todos sus ítems de mercancía. Esta acción no se puede deshacer."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
