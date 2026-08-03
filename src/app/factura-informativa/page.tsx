"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X, FileText } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

const EMPRESA = { nombre: "ETYECU S.A." };

type Cliente = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
  ruc_ci: string | null;
};

type ItemFac = {
  id?: string;
  descripcion: string;
  cantidad: string;
  unidad: string;
  observacion: string;
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
  const [items, setItems] = useState<ItemFac[]>([{ descripcion: "", cantidad: "", unidad: "", observacion: "" }]);

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
    setItems([{ descripcion: "", cantidad: "", unidad: "", observacion: "" }]);
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

    const { data } = await supabase
      .from("factura_informativa_items")
      .select("*")
      .eq("factura_id", f.id)
      .order("orden");
    setItems(
      (data ?? []).map((it) => ({
        id: it.id,
        descripcion: it.descripcion ?? "",
        cantidad: String(it.cantidad ?? ""),
        unidad: it.unidad ?? "",
        observacion: it.observacion ?? "",
      }))
    );
    if (!data || data.length === 0) {
      setItems([{ descripcion: "", cantidad: "", unidad: "", observacion: "" }]);
    }
    setShowForm(true);
  }

  function agregarItem() {
    setItems((prev) => [...prev, { descripcion: "", cantidad: "", unidad: "", observacion: "" }]);
  }
  function actualizarItem(idx: number, campo: keyof ItemFac, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }
  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

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
        descripcion: it.descripcion.trim(),
        cantidad: it.cantidad ? Number(it.cantidad) : null,
        unidad: it.unidad.trim() || null,
        observacion: it.observacion.trim() || null,
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
        descripcion: it.descripcion ?? "",
        cantidad: String(it.cantidad ?? ""),
        unidad: it.unidad ?? "",
        observacion: it.observacion ?? "",
      }))
    );
    setFacImprimir(f);
  }

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
                <p className="text-[11.5px] font-semibold text-text-dim">Mercancía (opcional)</p>
                <button
                  onClick={agregarItem}
                  className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg"
                >
                  <Plus size={12} /> Ítem
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_80px_90px_1fr_28px] gap-2">
                    <input
                      value={it.descripcion}
                      onChange={(e) => actualizarItem(idx, "descripcion", e.target.value)}
                      placeholder="Descripción"
                      className="card px-2 py-1.5 text-[12px] outline-none"
                    />
                    <input
                      value={it.cantidad}
                      onChange={(e) => actualizarItem(idx, "cantidad", e.target.value)}
                      type="number"
                      placeholder="Cant."
                      className="card px-2 py-1.5 text-[12px] outline-none text-right"
                    />
                    <input
                      value={it.unidad}
                      onChange={(e) => actualizarItem(idx, "unidad", e.target.value)}
                      placeholder="Unidad"
                      className="card px-2 py-1.5 text-[12px] outline-none"
                    />
                    <input
                      value={it.observacion}
                      onChange={(e) => actualizarItem(idx, "observacion", e.target.value)}
                      placeholder="Observación"
                      className="card px-2 py-1.5 text-[12px] outline-none"
                    />
                    <button
                      onClick={() => quitarItem(idx)}
                      className="text-text-faint hover:text-red-300 flex items-center justify-center"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
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
              <>
                <p className="text-[12px] font-bold mb-1">MERCANCÍA</p>
                <table className="w-full text-[10.5px] border-collapse mb-4">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="border border-black/40 p-1.5 text-left">DESCRIPCIÓN</th>
                      <th className="border border-black/40 p-1.5 text-right w-[80px]">CANTIDAD</th>
                      <th className="border border-black/40 p-1.5 text-left w-[90px]">UNIDAD</th>
                      <th className="border border-black/40 p-1.5 text-left">OBSERVACIÓN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itemsImprimir.map((it, i) => (
                      <tr key={i}>
                        <td className="border border-black/40 p-1.5">{it.descripcion}</td>
                        <td className="border border-black/40 p-1.5 text-right">{it.cantidad}</td>
                        <td className="border border-black/40 p-1.5">{it.unidad}</td>
                        <td className="border border-black/40 p-1.5">{it.observacion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
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
