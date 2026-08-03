"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X, FileText, Upload } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

const EMPRESA = { nombre: "ETYECU S.A." };

const ITEM_VACIO = {
  unidad: "U",
  cajas: "",
  cantidad: "",
  codigo: "",
  descripcion: "",
  fobUnitario: "",
};

type Cliente = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  ruc_ci: string | null;
};

type ItemFac = {
  id?: string;
  unidad: string;         // UNIDAD/MED (ej. "U")
  cajas: string;          // CANTIDAD UNIDAD COMERCIAL (EGRESO) CAJAS — multiplica el FOB
  cantidad: string;       // CANTIDAD UNIDAD COMERCIAL (litros, etc.) — informativa
  codigo: string;         // CÓDIGO (ej. "S/R", opcional)
  descripcion: string;    // DESCRIPCIÓN de la mercadería
  fobUnitario: string;    // FOB UNIT.
};

type Factura = {
  id: string;
  numero: string;
  fecha: string;
  exportador: string | null;
  exportador_direccion: string | null;
  factura_comercial: string | null;
  pais_origen: string | null;
  importador: string | null;
  importador_direccion: string | null;
  importador_telefono: string | null;
  importador_ruc: string | null;
  consignatario: string | null;
  solicitud_previa: string | null;
  medio_transporte: string | null;
  declaracion_regimen70: string | null;
  puerto_embarque: string | null;
  nacionalizacion: string | null;
  conocimiento_embarque: string | null;
  referencia_cliente: string | null;
  valor_flete: number | null;
  valor_seguro: number | null;
  observaciones: string | null;
};

const CAMPOS: { key: keyof Factura; label: string; col?: number }[] = [
  { key: "exportador", label: "Exportador", col: 2 },
  { key: "exportador_direccion", label: "Dirección del exportador", col: 2 },
  { key: "pais_origen", label: "País de origen" },
  { key: "factura_comercial", label: "Factura comercial No." },
  { key: "importador", label: "Importador", col: 2 },
  { key: "importador_direccion", label: "Dirección del importador", col: 2 },
  { key: "importador_telefono", label: "Teléfono" },
  { key: "importador_ruc", label: "RUC" },
  { key: "consignatario", label: "Consignatario" },
  { key: "solicitud_previa", label: "Solicitud previa (N° CDA)" },
  { key: "medio_transporte", label: "Medio de transporte" },
  { key: "declaracion_regimen70", label: "Declaración Régimen 70 No." },
  { key: "puerto_embarque", label: "Puerto de embarque" },
  { key: "nacionalizacion", label: "Nacionalización No." },
  { key: "conocimiento_embarque", label: "Conocimiento de embarque (BL)" },
  { key: "referencia_cliente", label: "Referencia cliente" },
];

export default function FacturaInformativaPage() {
  const supabase = createClient();

  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  const [formId, setFormId] = useState<string | undefined>();
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [campos, setCampos] = useState<Record<string, string>>({});
  const [observaciones, setObservaciones] = useState("");
  const [flete, setFlete] = useState("");
  const [seguro, setSeguro] = useState("");
  const [avisoExcel, setAvisoExcel] = useState<string | null>(null);
  const [items, setItems] = useState<ItemFac[]>([{ ...ITEM_VACIO }]);

  const [facImprimir, setFacImprimir] = useState<Factura | null>(null);
  const [itemsImprimir, setItemsImprimir] = useState<ItemFac[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("facturas_informativas")
      .select("*")
      .order("creado_en", { ascending: false });
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist") || error.message.includes("relation")
          ? "Falta crear las tablas. ¿Corriste migracion_factura_cotizacion.sql en Supabase?"
          : error.message
      );
    } else {
      setFacturas((data as Factura[]) ?? []);
    }

    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, nombre, direccion, telefono, ruc_ci")
      .order("nombre");
    setClientes((clientesData as Cliente[]) ?? []);

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (facImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [facImprimir]);

  async function generarNumero() {
    const anio = new Date().getFullYear();
    const { data } = await supabase
      .from("facturas_informativas")
      .select("numero")
      .like("numero", `${anio}-%`)
      .order("numero", { ascending: false })
      .limit(1);
    let sig = 1;
    if (data && data.length > 0) {
      const partes = data[0].numero.split("-");
      const ult = parseInt(partes[1], 10);
      if (!isNaN(ult)) sig = ult + 1;
    }
    return `${anio}-${String(sig).padStart(3, "0")}`;
  }

  function seleccionarCliente(id: string) {
    setClienteId(id);
    const c = clientes.find((cl) => cl.id === id);
    if (c) {
      setCampos((prev) => ({
        ...prev,
        importador: c.nombre,
        importador_direccion: c.direccion ?? "",
        importador_telefono: c.telefono ?? "",
        importador_ruc: c.ruc_ci ?? "",
      }));
    }
  }

  function limpiar() {
    setFormId(undefined);
    setNumero("");
    setFecha(new Date().toISOString().slice(0, 10));
    setCampos({});
    setClienteId("");
    setObservaciones("");
    setFlete("");
    setSeguro("");
    setAvisoExcel(null);
    setItems([{ ...ITEM_VACIO }]);
    setErrorMsg(null);
  }

  async function abrirNuevo() {
    limpiar();
    setNumero(await generarNumero());
    setShowForm(true);
  }

  async function abrirEditar(f: Factura) {
    limpiar();
    setFormId(f.id);
    setNumero(f.numero);
    setFecha(f.fecha);
    const c: Record<string, string> = {};
    CAMPOS.forEach((campo) => {
      c[campo.key] = (f[campo.key] as string) ?? "";
    });
    setCampos(c);
    const clienteExistente = clientes.find((cl) => cl.nombre === (f.importador ?? ""));
    setClienteId(clienteExistente?.id ?? "");
    setObservaciones(f.observaciones ?? "");
    setFlete(f.valor_flete ? String(f.valor_flete) : "");
    setSeguro(f.valor_seguro ? String(f.valor_seguro) : "");

    const { data } = await supabase
      .from("factura_informativa_items")
      .select("*")
      .eq("factura_id", f.id)
      .order("orden");
    setItems(
      (data ?? []).map((it) => ({
        id: it.id,
        unidad: it.unidad_med ?? "U",
        cajas: it.cajas != null ? String(it.cajas) : "",
        cantidad: String(it.cantidad ?? ""),
        codigo: it.codigo ?? "",
        descripcion: it.descripcion ?? "",
        fobUnitario: it.fob_unitario != null ? String(it.fob_unitario) : "",
      }))
    );
    if (!data || data.length === 0) {
      setItems([{ ...ITEM_VACIO }]);
    }
    setShowForm(true);
  }

  function agregarItem() {
    setItems((prev) => [...prev, { ...ITEM_VACIO }]);
  }
  function actualizarItem(idx: number, campo: keyof ItemFac, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }
  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // Carga de plantilla Excel: detecta columnas por nombre normalizado
  function normalizar(s: string) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  async function cargarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvisoExcel(null);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      if (filas.length === 0) {
        setAvisoExcel("El archivo está vacío.");
        return;
      }

      // Mapear encabezados
      const headers = Object.keys(filas[0]);
      const mapa: Record<string, string> = {};
      headers.forEach((h) => {
        const n = normalizar(h);
        if (n.includes("descrip")) mapa.descripcion = h;
        else if (n.includes("fobunit") || n === "fob") mapa.fobUnitario = h;
        else if (n.includes("codigo")) mapa.codigo = h;
        // "cantidad unidad comercial" (litros, etc.) — la más específica primero
        else if (n.includes("cantidad") && n.includes("comercial")) mapa.cantidad = h;
        // "cantidad" a secas = cajas a egresar (multiplica el FOB)
        else if (n.includes("cantidad") || n.includes("caja")) mapa.cajas = h;
        else if (n.includes("unidad") || n.includes("med")) mapa.unidad = h;
      });

      if (!mapa.descripcion || !mapa.cajas) {
        setAvisoExcel(
          "No se reconocieron las columnas. La plantilla debe tener al menos DESCRIPCIÓN y CANTIDAD (cajas)."
        );
        return;
      }

      const nuevos: ItemFac[] = filas
        .filter((f) => String(f[mapa.descripcion] ?? "").trim())
        .map((f) => ({
          unidad: mapa.unidad ? String(f[mapa.unidad] ?? "U") : "U",
          cajas: String(f[mapa.cajas] ?? ""),
          cantidad: mapa.cantidad ? String(f[mapa.cantidad] ?? "") : "",
          codigo: mapa.codigo ? String(f[mapa.codigo] ?? "") : "",
          descripcion: String(f[mapa.descripcion] ?? ""),
          fobUnitario: mapa.fobUnitario ? String(f[mapa.fobUnitario] ?? "") : "",
        }));

      if (nuevos.length === 0) {
        setAvisoExcel("No se encontraron filas con descripción.");
        return;
      }
      setItems(nuevos);
      setAvisoExcel(`✓ Se cargaron ${nuevos.length} ítems desde la plantilla.`);
    } catch {
      setAvisoExcel("No se pudo leer el archivo. Verifica que sea un Excel válido.");
    } finally {
      e.target.value = "";
    }
  }

  // Cálculos de mercancía — FOB TOTAL = FOB Unit × Cajas
  const fobTotal = (it: ItemFac) => Number(it.cajas || 0) * Number(it.fobUnitario || 0);
  const totalCajas = items.reduce((a, it) => a + Number(it.cajas || 0), 0);
  const totalFob = items.reduce((a, it) => a + fobTotal(it), 0);
  const valorCfr = totalFob + Number(flete || 0);
  const valorCif = valorCfr + Number(seguro || 0);

  async function guardar() {
    if (!(campos.importador ?? "").trim() && !(campos.exportador ?? "").trim()) {
      setErrorMsg("Ingresa al menos el exportador o el importador.");
      return;
    }
    setSaving(true);
    setErrorMsg(null);

    const payload: Record<string, unknown> = {
      numero: numero.trim(),
      fecha,
      valor_flete: Number(flete || 0),
      valor_seguro: Number(seguro || 0),
      observaciones: observaciones.trim() || null,
      actualizado_en: new Date().toISOString(),
    };
    CAMPOS.forEach((campo) => {
      payload[campo.key] = (campos[campo.key] ?? "").trim() || null;
    });

    let facId = formId;
    if (formId) {
      const { error } = await supabase.from("facturas_informativas").update(payload).eq("id", formId);
      if (error) {
        setSaving(false);
        setErrorMsg(error.message);
        return;
      }
      await supabase.from("factura_informativa_items").delete().eq("factura_id", formId);
    } else {
      const { data, error } = await supabase
        .from("facturas_informativas")
        .insert(payload)
        .select()
        .single();
      if (error) {
        setSaving(false);
        setErrorMsg(error.message);
        return;
      }
      facId = data.id;
    }

    const itemsValidos = items.filter((it) => it.descripcion.trim());
    if (itemsValidos.length > 0) {
      const itemsPayload = itemsValidos.map((it, i) => ({
        factura_id: facId,
        orden: i,
        unidad_med: it.unidad.trim() || null,
        cajas: it.cajas ? Number(it.cajas) : null,
        cantidad: it.cantidad ? Number(it.cantidad) : null,
        codigo: it.codigo.trim() || null,
        descripcion: it.descripcion.trim(),
        fob_unitario: it.fobUnitario ? Number(it.fobUnitario) : null,
      }));
      const { error: itemsError } = await supabase
        .from("factura_informativa_items")
        .insert(itemsPayload);
      if (itemsError) {
        setSaving(false);
        setErrorMsg(itemsError.message);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    setToast(formId ? "Factura actualizada correctamente." : "Factura creada exitosamente.");
    cargar();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("facturas_informativas").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setToast("Factura eliminada correctamente.");
    cargar();
  }

  async function imprimir(f: Factura) {
    const { data } = await supabase
      .from("factura_informativa_items")
      .select("*")
      .eq("factura_id", f.id)
      .order("orden");
    setItemsImprimir(
      (data ?? []).map((it) => ({
        id: it.id,
        unidad: it.unidad_med ?? "U",
        cajas: it.cajas != null ? String(it.cajas) : "",
        cantidad: String(it.cantidad ?? ""),
        codigo: it.codigo ?? "",
        descripcion: it.descripcion ?? "",
        fobUnitario: it.fob_unitario != null ? String(it.fob_unitario) : "",
      }))
    );
    setFacImprimir(f);
  }

  // Cálculos para el PDF — FOB TOTAL = FOB Unit × Cajas
  const fobTotalImp = (it: ItemFac) => Number(it.cajas || 0) * Number(it.fobUnitario || 0);
  const totalCajasImp = itemsImprimir.reduce((a, it) => a + Number(it.cajas || 0), 0);
  const totalFobImp = itemsImprimir.reduce((a, it) => a + fobTotalImp(it), 0);
  const fleteImp = Number(facImprimir?.valor_flete ?? 0);
  const seguroImp = Number(facImprimir?.valor_seguro ?? 0);
  const cfrImp = totalFobImp + fleteImp;
  const cifImp = cfrImp + seguroImp;

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/factura-informativa" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Factura Informativa</h1>
              <p className="text-[12.5px] text-text-faint">
                {facturas.length} factura{facturas.length !== 1 ? "s" : ""} registrada
                {facturas.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Nueva factura
            </button>
          </div>

          {errorMsg && !showForm && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : facturas.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-[13px] text-text-faint">
                No hay facturas informativas todavía. Crea la primera con el botón de arriba.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[110px_1fr_1fr_120px_120px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                <span>N°</span>
                <span>Importador</span>
                <span>Solicitud previa</span>
                <span>Fecha</span>
                <span className="text-right">Acciones</span>
              </div>
              {facturas.map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[110px_1fr_1fr_120px_120px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]"
                >
                  <span className="font-medium">{f.numero}</span>
                  <span className="truncate">{f.importador ?? "—"}</span>
                  <span className="truncate text-text-dim">{f.solicitud_previa ?? "—"}</span>
                  <span className="text-text-dim">{new Date(f.fecha).toLocaleDateString("es-EC")}</span>
                  <div className="flex items-center justify-end gap-1.5">
                    <button onClick={() => imprimir(f)} className="text-text-faint hover:text-text" title="Imprimir / PDF">
                      <FileText size={15} />
                    </button>
                    <button onClick={() => abrirEditar(f)} className="text-text-faint hover:text-text" title="Editar">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => setAEliminar(f.id)} className="text-text-faint hover:text-red-300" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FORMULARIO */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto print:hidden">
            <div className="card w-full max-w-[820px] my-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold">
                  {formId ? "Editar factura informativa" : "Nueva factura informativa"}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-text-faint hover:text-text">
                  <X size={18} />
                </button>
              </div>

              {errorMsg && (
                <div className="mb-4 px-4 py-2.5 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                  {errorMsg}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">N° factura (auto)</label>
                  <input
                    value={numero}
                    readOnly
                    tabIndex={-1}
                    className="w-full card px-3 py-2 text-[13px] outline-none opacity-70 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Fecha</label>
                  <input
                    type="date"
                    value={fecha}
                    onChange={(e) => setFecha(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                {CAMPOS.map((campo) => {
                  // El campo "importador" se reemplaza por un selector de clientes
                  if (campo.key === "importador") {
                    return (
                      <div key={campo.key} className="col-span-2">
                        <label className="text-[11.5px] text-text-faint block mb-1">
                          Importador (cliente) *
                        </label>
                        <select
                          value={clienteId}
                          onChange={(e) => seleccionarCliente(e.target.value)}
                          className="w-full card px-3 py-2 text-[13px] outline-none"
                        >
                          <option value="">Selecciona un cliente…</option>
                          {clientes.map((cl) => (
                            <option key={cl.id} value={cl.id}>
                              {cl.nombre}
                            </option>
                          ))}
                        </select>
                        {clientes.length === 0 && (
                          <p className="text-[11px] text-amber mt-1">
                            No hay clientes. Créalos primero en la sección Clientes.
                          </p>
                        )}
                      </div>
                    );
                  }
                  const esAuto = ["importador_direccion", "importador_telefono", "importador_ruc"].includes(
                    campo.key
                  );
                  return (
                    <div key={campo.key} className={campo.col === 2 ? "col-span-2" : ""}>
                      <label className="text-[11.5px] text-text-faint block mb-1">
                        {campo.label}
                        {esAuto && <span className="text-text-faint"> (auto)</span>}
                      </label>
                      <input
                        value={campos[campo.key] ?? ""}
                        onChange={(e) => setCampos((prev) => ({ ...prev, [campo.key]: e.target.value }))}
                        className="w-full card px-3 py-2 text-[13px] outline-none"
                      />
                    </div>
                  );
                })}
              </div>

              {/* Ítems de mercancía */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11.5px] font-semibold text-text-dim">Mercancía</p>
                <div className="flex gap-2">
                  <label className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg cursor-pointer">
                    <Upload size={12} /> Cargar plantilla Excel
                    <input type="file" accept=".xlsx,.xls" onChange={cargarExcel} className="hidden" />
                  </label>
                  <button
                    onClick={agregarItem}
                    className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg"
                  >
                    <Plus size={12} /> Ítem
                  </button>
                </div>
              </div>

              {avisoExcel && (
                <div
                  className={`mb-2 px-3 py-2 rounded-lg text-[11.5px] ${
                    avisoExcel.startsWith("✓")
                      ? "bg-green/10 border border-green/20 text-[#6ee7b7]"
                      : "bg-amber/10 border border-amber/20 text-[#fbbf24]"
                  }`}
                >
                  {avisoExcel}
                </div>
              )}

              {/* Encabezado de columnas */}
              <div className="grid grid-cols-[40px_55px_75px_75px_60px_1fr_80px_85px_28px] gap-1.5 mb-1 px-1 text-[9.5px] uppercase text-text-faint">
                <span>Ítem</span>
                <span>Unid.</span>
                <span className="text-right">Cajas (egreso)</span>
                <span className="text-right">Cant. comercial</span>
                <span>Código</span>
                <span>Descripción</span>
                <span className="text-right">FOB unit.</span>
                <span className="text-right">FOB total</span>
                <span></span>
              </div>
              <div className="flex flex-col gap-1 mb-3">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[40px_55px_75px_75px_60px_1fr_80px_85px_28px] gap-1.5 items-center"
                  >
                    <span className="text-[11px] text-text-faint text-center">{idx + 1}</span>
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(idx, "unidad", e.target.value)}
                      placeholder="U"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none"
                    />
                    <input
                      value={it.cajas}
                      onChange={(e) => actualizarItem(idx, "cajas", e.target.value)}
                      type="number"
                      placeholder="0"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none text-right"
                    />
                    <input
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(idx, "cantidad", e.target.value)}
                      type="number"
                      placeholder="0"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none text-right"
                    />
                    <input
                      value={it.codigo}
                      onChange={(e) => actualizarItem(idx, "codigo", e.target.value)}
                      placeholder="S/R"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none"
                    />
                    <input
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(idx, "descripcion", e.target.value)}
                      placeholder="Descripción de la mercadería"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none"
                    />
                    <input
                      value={it.fobUnitario}
                      onChange={(e) => actualizarItem(idx, "fobUnitario", e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="card px-1.5 py-1.5 text-[11.5px] outline-none text-right"
                    />
                    <span className="text-[11px] text-right pr-1">${fobTotal(it).toFixed(2)}</span>
                    <button
                      onClick={() => quitarItem(idx)}
                      className="text-text-faint hover:text-red-300 flex items-center justify-center"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Costeo y totales */}
              <div className="card p-3.5 mb-4 bg-white/[0.02]">
                <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-text-dim">Total cajas</span>
                    <span>{totalCajas.toLocaleString("es-EC")}</span>
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-text-dim">FOB</span>
                    <span className="text-[#6ee7b7]">${totalFob.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-text-dim">Valor flete</span>
                    <input
                      value={flete}
                      onChange={(e) => setFlete(e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="card px-2 py-1 text-[11.5px] outline-none text-right w-[110px]"
                    />
                  </div>
                  <div className="flex justify-between text-[12px]">
                    <span className="text-text-dim">Valor CFR (FOB + flete)</span>
                    <span>${valorCfr.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center text-[12px]">
                    <span className="text-text-dim">Valor seguro</span>
                    <input
                      value={seguro}
                      onChange={(e) => setSeguro(e.target.value)}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="card px-2 py-1 text-[11.5px] outline-none text-right w-[110px]"
                    />
                  </div>
                  <div className="flex justify-between text-[13px] font-semibold pt-1 border-t border-border mt-1">
                    <span>Valor CIF</span>
                    <span className="text-[#c4b8ff]">${valorCif.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[11.5px] text-text-faint block mb-1">Observaciones</label>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowForm(false)}
                  className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardar}
                  disabled={saving}
                  className="btn-primary text-[13px] font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {saving ? "Guardando…" : formId ? "Guardar cambios" : "Crear factura"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* PDF */}
        {facImprimir && (
          <div className="print-area hidden print:block text-black bg-white p-8">
            <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
              <p className="text-[20px] font-bold">{EMPRESA.nombre}</p>
              <div className="text-right">
                <p className="text-[15px] font-bold">FACTURA INFORMATIVA</p>
                <p className="text-[11px]">N°: {facImprimir.numero}</p>
                <p className="text-[11px]">Fecha: {new Date(facImprimir.fecha).toLocaleDateString("es-EC")}</p>
              </div>
            </div>

            <table className="w-full text-[10.5px] border-collapse mb-4">
              <tbody>
                {CAMPOS.map((campo) =>
                  facImprimir[campo.key] ? (
                    <tr key={campo.key}>
                      <td className="border border-black/40 p-1.5 font-bold bg-gray-100 w-[210px]">
                        {campo.label.toUpperCase()}
                      </td>
                      <td className="border border-black/40 p-1.5">{facImprimir[campo.key]}</td>
                    </tr>
                  ) : null
                )}
              </tbody>
            </table>

            {itemsImprimir.length > 0 && (
              <table className="w-full text-[9px] border-collapse mb-3">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-black/40 p-1 text-center w-[30px]">ITEM</th>
                    <th className="border border-black/40 p-1 text-center w-[42px]">UNID./MED.</th>
                    <th className="border border-black/40 p-1 text-center w-[62px]">CANTIDAD UNIDAD COMERCIAL (EGRESO) CAJAS</th>
                    <th className="border border-black/40 p-1 text-center w-[62px]">CANTIDAD UNIDAD COMERCIAL</th>
                    <th className="border border-black/40 p-1 text-center w-[40px]">CÓDIGO</th>
                    <th className="border border-black/40 p-1 text-center">DESCRIPCIÓN</th>
                    <th className="border border-black/40 p-1 text-center w-[62px]">FOB UNIT.</th>
                    <th className="border border-black/40 p-1 text-center w-[72px]">FOB TOTAL</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsImprimir.map((it, i) => (
                    <tr key={i}>
                      <td className="border border-black/40 p-1 text-center">{i + 1}</td>
                      <td className="border border-black/40 p-1 text-center">{it.unidad}</td>
                      <td className="border border-black/40 p-1 text-right">
                        {Number(it.cajas || 0).toLocaleString("es-EC")}
                      </td>
                      <td className="border border-black/40 p-1 text-right">
                        {it.cantidad
                          ? Number(it.cantidad).toLocaleString("es-EC", { maximumFractionDigits: 2 })
                          : ""}
                      </td>
                      <td className="border border-black/40 p-1 text-center">{it.codigo || "S/R"}</td>
                      <td className="border border-black/40 p-1">{it.descripcion}</td>
                      <td className="border border-black/40 p-1 text-right">
                        $ {Number(it.fobUnitario || 0).toFixed(2)}
                      </td>
                      <td className="border border-black/40 p-1 text-right">
                        $ {fobTotalImp(it).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="border border-black/40 p-1 text-right bg-gray-100" colSpan={2}>
                      TOTALES
                    </td>
                    <td className="border border-black/40 p-1 text-right">
                      {totalCajasImp.toLocaleString("es-EC")}
                    </td>
                    <td className="border-0" colSpan={3}></td>
                    <td className="border border-black/40 p-1 text-right bg-gray-100">FOB</td>
                    <td className="border border-black/40 p-1 text-right">
                      $ {totalFobImp.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border-0" colSpan={6}></td>
                    <td className="border border-black/40 p-1 text-right bg-gray-100">VALOR FLETE</td>
                    <td className="border border-black/40 p-1 text-right">
                      $ {fleteImp.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border-0" colSpan={6}></td>
                    <td className="border border-black/40 p-1 text-right bg-gray-100">VALOR CFR</td>
                    <td className="border border-black/40 p-1 text-right">
                      $ {cfrImp.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border-0" colSpan={6}></td>
                    <td className="border border-black/40 p-1 text-right bg-gray-100">VALOR SEGURO</td>
                    <td className="border border-black/40 p-1 text-right">
                      $ {seguroImp.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                  <tr className="font-bold">
                    <td className="border-0" colSpan={6}></td>
                    <td className="border border-black/40 p-1 text-right bg-gray-100">VALOR CIF</td>
                    <td className="border border-black/40 p-1 text-right">
                      $ {cifImp.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}

            {facImprimir.observaciones && (
              <div className="text-[10px] border-t border-black/30 pt-2 mb-6">
                <p className="font-bold mb-0.5">Observaciones:</p>
                <p className="whitespace-pre-wrap">{facImprimir.observaciones}</p>
              </div>
            )}

            <div className="flex justify-between mt-16">
              <p className="border-t border-black w-[220px] text-center pt-1 text-[10px]">
                FIRMA Y SELLO
              </p>
              <p className="border-t border-black w-[220px] text-center pt-1 text-[10px]">
                {EMPRESA.nombre}
              </p>
            </div>
          </div>
        )}
      </main>

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar factura informativa?"
        mensaje="Esta acción no se puede deshacer. Se eliminará la factura y sus ítems."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
