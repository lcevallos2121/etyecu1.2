"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Plus, Pencil, Trash2, X, FileText } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";

export const dynamic = "force-dynamic";

const EMPRESA = {
  nombre: "ETYECU S.A.",
  direccion: "Km 11,5 Vía Daule",
  ciudad: "Guayaquil",
  web: "www.mdcobos.com",
  telefono: "04-2 100 894",
};

const BANCO = {
  razon: "Etyecu S.A.",
  ruc: "0993023116001",
  banco: "Banco Pichincha",
  cuenta: "Cuenta Corriente # 2100230002",
  email: "contabilidad@etyecu.ec",
};

const CONDICIONES_DEFAULT = `INFORMACIÓN GENERAL DE LA OFERTA
· Etyecu S.A. se encargará de almacenar la mercadería del cliente y realizar la recepción y el despacho en nuestro Depósito Aduanero con nuestro personal operativo y equipos de manipuleo. No se permite el ingreso del personal del cliente para manipular la carga.
· Horario de recepción de la carga es de lunes a viernes de 8:30 – 17:30 PM. Para otros horarios con coordinación previa.
· Horario de corte de pedidos.
· Horario de atención de lunes a viernes de 8:30 am a 05h00 pm.
· El almacenamiento se realizará en nuestro Depósito Aduanero ubicado en Bodegas San Antonio Km 11.5 Vía a Daule.
· La mercadería almacenada se encuentra asegurada a costo de reposición de producto, no a precio de venta. Este costo deberá ser notificado a Etyecu S.A. previo al ingreso de mercadería, para que esté amparado en nuestra póliza.
· Los pedidos a despachar y las recepciones se deben planificar con 24 horas de anticipación.
· La atención para recepción y despachos se realizará por turnos; en caso de no contar con turnos dentro del horario regular de operación, se consultará al cliente si desea cancelar el valor acordado por sobretiempo.
· Todo requerimiento deberá realizarse al correo de mrugeldap@etyecu.ec`;

type Cliente = {
  id: string;
  nombre: string;
  direccion: string | null;
  telefono: string | null;
};

type ItemCot = {
  id?: string;
  descripcion: string;
  cantidad: string;
  valor: string;
  nota: string;
};

type Cotizacion = {
  id: string;
  numero: string;
  fecha: string;
  cliente_nombre: string;
  cliente_direccion: string | null;
  cliente_ciudad: string | null;
  cliente_telefono: string | null;
  aplica_iva: boolean;
  iva_porcentaje: number;
  aplica_ret_fuente: boolean;
  ret_fuente_porcentaje: number;
  aplica_ret_iva: boolean;
  ret_iva_porcentaje: number;
  observacion_general: string | null;
  condiciones_generales: string | null;
};

export default function CotizacionesPage() {
  const supabase = createClient();

  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState("");
  const [serviciosCatalogo, setServiciosCatalogo] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [aEliminar, setAEliminar] = useState<string | null>(null);

  // Formulario
  const [formId, setFormId] = useState<string | undefined>();
  const [numero, setNumero] = useState("");
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteDireccion, setClienteDireccion] = useState("");
  const [clienteCiudad, setClienteCiudad] = useState("GUAYAQUIL");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [aplicaIva, setAplicaIva] = useState(false);
  const [ivaPct, setIvaPct] = useState("15");
  const [aplicaRetFuente, setAplicaRetFuente] = useState(false);
  const [retFuentePct, setRetFuentePct] = useState("1");
  const [aplicaRetIva, setAplicaRetIva] = useState(false);
  const [retIvaPct, setRetIvaPct] = useState("30");
  const [observacion, setObservacion] = useState("");
  const [condiciones, setCondiciones] = useState(CONDICIONES_DEFAULT);
  const [items, setItems] = useState<ItemCot[]>([{ descripcion: "", cantidad: "1", valor: "", nota: "" }]);

  // Impresión
  const [cotImprimir, setCotImprimir] = useState<Cotizacion | null>(null);
  const [itemsImprimir, setItemsImprimir] = useState<ItemCot[]>([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cotizaciones")
      .select("*")
      .order("creado_en", { ascending: false });
    if (error) {
      setErrorMsg(
        error.message.includes("does not exist") || error.message.includes("relation")
          ? "Falta crear las tablas. ¿Corriste migracion_factura_cotizacion.sql en Supabase?"
          : error.message
      );
    } else {
      setCotizaciones((data as Cotizacion[]) ?? []);
    }

    const { data: clientesData } = await supabase
      .from("clientes")
      .select("id, nombre, direccion, telefono")
      .order("nombre");
    setClientes((clientesData as Cliente[]) ?? []);

    const { data: servData } = await supabase
      .from("catalogo_servicios")
      .select("nombre")
      .order("categoria")
      .order("nombre");
    setServiciosCatalogo((servData ?? []).map((s) => s.nombre));

    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (cotImprimir) {
      const t = setTimeout(() => window.print(), 300);
      return () => clearTimeout(t);
    }
  }, [cotImprimir]);

  async function generarNumero() {
    const anio = new Date().getFullYear();
    const { data } = await supabase
      .from("cotizaciones")
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
      setClienteNombre(c.nombre);
      setClienteDireccion(c.direccion ?? "");
      setClienteTelefono(c.telefono ?? "");
    }
  }

  function limpiar() {
    setFormId(undefined);
    setNumero("");
    setFecha(new Date().toISOString().slice(0, 10));
    setClienteNombre("");
    setClienteId("");
    setClienteDireccion("");
    setClienteCiudad("GUAYAQUIL");
    setClienteTelefono("");
    setAplicaIva(false);
    setIvaPct("15");
    setAplicaRetFuente(false);
    setRetFuentePct("1");
    setAplicaRetIva(false);
    setRetIvaPct("30");
    setObservacion("");
    setCondiciones(CONDICIONES_DEFAULT);
    setItems([{ descripcion: "", cantidad: "1", valor: "", nota: "" }]);
    setErrorMsg(null);
  }

  async function abrirNuevo() {
    limpiar();
    setNumero(await generarNumero());
    setShowForm(true);
  }

  async function abrirEditar(c: Cotizacion) {
    limpiar();
    setFormId(c.id);
    setNumero(c.numero);
    setFecha(c.fecha);
    setClienteNombre(c.cliente_nombre);
    const clienteExistente = clientes.find((cl) => cl.nombre === c.cliente_nombre);
    setClienteId(clienteExistente?.id ?? "");
    setClienteDireccion(c.cliente_direccion ?? "");
    setClienteCiudad(c.cliente_ciudad ?? "GUAYAQUIL");
    setClienteTelefono(c.cliente_telefono ?? "");
    setAplicaIva(c.aplica_iva);
    setIvaPct(String(c.iva_porcentaje ?? 15));
    setAplicaRetFuente(c.aplica_ret_fuente);
    setRetFuentePct(String(c.ret_fuente_porcentaje ?? 0));
    setAplicaRetIva(c.aplica_ret_iva);
    setRetIvaPct(String(c.ret_iva_porcentaje ?? 0));
    setObservacion(c.observacion_general ?? "");
    setCondiciones(c.condiciones_generales ?? CONDICIONES_DEFAULT);

    const { data } = await supabase
      .from("cotizacion_items")
      .select("*")
      .eq("cotizacion_id", c.id)
      .order("orden");
    setItems(
      (data ?? []).map((it) => ({
        id: it.id,
        descripcion: it.descripcion,
        cantidad: String(it.cantidad ?? 1),
        valor: String(it.valor ?? 0),
        nota: it.nota ?? "",
      }))
    );
    if (!data || data.length === 0) {
      setItems([{ descripcion: "", cantidad: "1", valor: "", nota: "" }]);
    }
    setShowForm(true);
  }

  function agregarItem() {
    setItems((prev) => [...prev, { descripcion: "", cantidad: "1", valor: "", nota: "" }]);
  }
  function actualizarItem(idx: number, campo: keyof ItemCot, valor: string) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [campo]: valor } : it)));
  }
  function quitarItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // Cálculos
  function calcular(
    its: ItemCot[],
    ivaOn: boolean,
    ivaP: number,
    rfOn: boolean,
    rfP: number,
    riOn: boolean,
    riP: number
  ) {
    const subtotal = its.reduce((a, it) => a + Number(it.cantidad || 0) * Number(it.valor || 0), 0);
    const iva = ivaOn ? subtotal * (ivaP / 100) : 0;
    const retFuente = rfOn ? subtotal * (rfP / 100) : 0;
    const retIva = riOn ? iva * (riP / 100) : 0;
    const total = subtotal + iva - retFuente - retIva;
    return { subtotal, iva, retFuente, retIva, total };
  }

  const calc = calcular(
    items,
    aplicaIva,
    Number(ivaPct || 0),
    aplicaRetFuente,
    Number(retFuentePct || 0),
    aplicaRetIva,
    Number(retIvaPct || 0)
  );

  async function guardar() {
    if (!clienteNombre.trim()) {
      setErrorMsg("El nombre del cliente es obligatorio.");
      return;
    }
    const itemsValidos = items.filter((it) => it.descripcion.trim());
    if (itemsValidos.length === 0) {
      setErrorMsg("Agrega al menos un servicio con descripción.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);

    const payload = {
      numero: numero.trim(),
      fecha,
      cliente_nombre: clienteNombre.trim(),
      cliente_direccion: clienteDireccion.trim() || null,
      cliente_ciudad: clienteCiudad.trim() || null,
      cliente_telefono: clienteTelefono.trim() || null,
      aplica_iva: aplicaIva,
      iva_porcentaje: Number(ivaPct || 0),
      aplica_ret_fuente: aplicaRetFuente,
      ret_fuente_porcentaje: Number(retFuentePct || 0),
      aplica_ret_iva: aplicaRetIva,
      ret_iva_porcentaje: Number(retIvaPct || 0),
      observacion_general: observacion.trim() || null,
      condiciones_generales: condiciones.trim() || null,
      actualizado_en: new Date().toISOString(),
    };

    let cotId = formId;
    if (formId) {
      const { error } = await supabase.from("cotizaciones").update(payload).eq("id", formId);
      if (error) {
        setSaving(false);
        setErrorMsg(error.message);
        return;
      }
      await supabase.from("cotizacion_items").delete().eq("cotizacion_id", formId);
    } else {
      const { data, error } = await supabase.from("cotizaciones").insert(payload).select().single();
      if (error) {
        setSaving(false);
        setErrorMsg(error.message);
        return;
      }
      cotId = data.id;
    }

    const itemsPayload = itemsValidos.map((it, i) => ({
      cotizacion_id: cotId,
      orden: i,
      descripcion: it.descripcion.trim(),
      cantidad: Number(it.cantidad || 1),
      valor: Number(it.valor || 0),
      nota: it.nota.trim() || null,
    }));
    const { error: itemsError } = await supabase.from("cotizacion_items").insert(itemsPayload);

    setSaving(false);
    if (itemsError) {
      setErrorMsg(itemsError.message);
      return;
    }

    setShowForm(false);
    setToast(formId ? "Cotización actualizada correctamente." : "Cotización creada exitosamente.");
    cargar();
  }

  async function confirmarEliminar() {
    if (!aEliminar) return;
    const { error } = await supabase.from("cotizaciones").delete().eq("id", aEliminar);
    setAEliminar(null);
    if (error) {
      setErrorMsg(error.message);
      return;
    }
    setToast("Cotización eliminada correctamente.");
    cargar();
  }

  async function imprimir(c: Cotizacion) {
    const { data } = await supabase
      .from("cotizacion_items")
      .select("*")
      .eq("cotizacion_id", c.id)
      .order("orden");
    setItemsImprimir(
      (data ?? []).map((it) => ({
        id: it.id,
        descripcion: it.descripcion,
        cantidad: String(it.cantidad ?? 1),
        valor: String(it.valor ?? 0),
        nota: it.nota ?? "",
      }))
    );
    setCotImprimir(c);
  }

  const calcImp = cotImprimir
    ? calcular(
        itemsImprimir,
        cotImprimir.aplica_iva,
        cotImprimir.iva_porcentaje,
        cotImprimir.aplica_ret_fuente,
        cotImprimir.ret_fuente_porcentaje,
        cotImprimir.aplica_ret_iva,
        cotImprimir.ret_iva_porcentaje
      )
    : null;

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/cotizaciones" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="px-6.5 pt-5.5 pb-10 print:hidden">
          <div className="flex items-center justify-between mb-4.5">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Cotizaciones</h1>
              <p className="text-[12.5px] text-text-faint">
                {cotizaciones.length} cotización{cotizaciones.length !== 1 ? "es" : ""} registrada
                {cotizaciones.length !== 1 ? "s" : ""}
              </p>
            </div>
            <button
              onClick={abrirNuevo}
              className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
            >
              <Plus size={15} /> Nueva cotización
            </button>
          </div>

          {errorMsg && !showForm && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : cotizaciones.length === 0 ? (
            <div className="card p-8 text-center">
              <p className="text-[13px] text-text-faint">
                No hay cotizaciones todavía. Crea la primera con el botón de arriba.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="grid grid-cols-[110px_1fr_120px_110px_120px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                <span>N°</span>
                <span>Cliente</span>
                <span>Fecha</span>
                <span className="text-right">Total</span>
                <span className="text-right">Acciones</span>
              </div>
              {cotizaciones.map((c) => (
                <CotizacionFila
                  key={c.id}
                  cot={c}
                  supabase={supabase}
                  onEditar={() => abrirEditar(c)}
                  onEliminar={() => setAEliminar(c.id)}
                  onImprimir={() => imprimir(c)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ====== FORMULARIO ====== */}
        {showForm && (
          <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 overflow-y-auto print:hidden">
            <div className="card w-full max-w-[820px] my-6 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[16px] font-semibold">
                  {formId ? "Editar cotización" : "Nueva cotización"}
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

              {/* Cabecera */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">N° cotización (auto)</label>
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
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Ciudad</label>
                  <input
                    value={clienteCiudad}
                    onChange={(e) => setClienteCiudad(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[11.5px] text-text-faint block mb-1">Cliente *</label>
                  <select
                    value={clienteId}
                    onChange={(e) => seleccionarCliente(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  >
                    <option value="">Selecciona un cliente…</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11.5px] text-text-faint block mb-1">Teléfono (auto)</label>
                  <input
                    value={clienteTelefono}
                    onChange={(e) => setClienteTelefono(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
                <div className="col-span-3">
                  <label className="text-[11.5px] text-text-faint block mb-1">Dirección del cliente (auto)</label>
                  <input
                    value={clienteDireccion}
                    onChange={(e) => setClienteDireccion(e.target.value)}
                    className="w-full card px-3 py-2 text-[13px] outline-none"
                  />
                </div>
              </div>

              {clientes.length === 0 && (
                <p className="text-[11.5px] text-amber mb-4 -mt-2">
                  No hay clientes registrados. Crea primero el cliente en la sección Clientes.
                </p>
              )}

              {/* Servicios */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11.5px] font-semibold text-text-dim">Servicios cotizados</p>
                <button
                  onClick={agregarItem}
                  className="btn-secondary flex items-center gap-1 text-[11.5px] font-semibold px-2.5 py-1 rounded-lg"
                >
                  <Plus size={12} /> Servicio
                </button>
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {items.map((it, idx) => {
                  const enCatalogo = serviciosCatalogo.includes(it.descripcion);
                  const modoLibre = it.descripcion !== "" && !enCatalogo;
                  return (
                  <div key={idx} className="card p-2.5 bg-white/[0.02]">
                    <div className="grid grid-cols-[1fr_70px_90px_28px] gap-2 mb-1.5">
                      <select
                        value={modoLibre ? "__otro__" : it.descripcion}
                        onChange={(e) => {
                          if (e.target.value === "__otro__") {
                            actualizarItem(idx, "descripcion", " ");
                          } else {
                            actualizarItem(idx, "descripcion", e.target.value);
                          }
                        }}
                        className="card px-2 py-1.5 text-[12px] outline-none"
                      >
                        <option value="">Selecciona un servicio…</option>
                        {serviciosCatalogo.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                        <option value="__otro__">✏️ Otro (escribir)</option>
                      </select>
                      <input
                        value={it.cantidad}
                        onChange={(e) => actualizarItem(idx, "cantidad", e.target.value)}
                        type="number"
                        placeholder="Cant."
                        className="card px-2 py-1.5 text-[12px] outline-none text-right"
                      />
                      <input
                        value={it.valor}
                        onChange={(e) => actualizarItem(idx, "valor", e.target.value)}
                        type="number"
                        step="0.01"
                        placeholder="Valor $"
                        className="card px-2 py-1.5 text-[12px] outline-none text-right"
                      />
                      <button
                        onClick={() => quitarItem(idx)}
                        className="text-text-faint hover:text-red-300 flex items-center justify-center"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {modoLibre && (
                      <input
                        value={it.descripcion === " " ? "" : it.descripcion}
                        onChange={(e) => actualizarItem(idx, "descripcion", e.target.value || " ")}
                        placeholder="Escribe el nombre del servicio"
                        autoFocus
                        className="w-full card px-2 py-1.5 text-[12px] outline-none mb-1.5"
                      />
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        value={it.nota}
                        onChange={(e) => actualizarItem(idx, "nota", e.target.value)}
                        placeholder="Nota de este servicio (opcional)"
                        className="flex-1 card px-2 py-1 text-[11px] outline-none text-text-dim"
                      />
                      <span className="text-[11px] text-text-faint whitespace-nowrap">
                        Subtotal: ${(Number(it.cantidad || 0) * Number(it.valor || 0)).toFixed(2)}
                      </span>
                    </div>
                  </div>
                  );
                })}
              </div>

              {/* Impuestos y retenciones */}
              <p className="text-[11.5px] font-semibold text-text-dim mb-2">Impuestos y retenciones</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <ImpuestoBox
                  label="IVA"
                  activo={aplicaIva}
                  setActivo={setAplicaIva}
                  pct={ivaPct}
                  setPct={setIvaPct}
                />
                <ImpuestoBox
                  label="Retención a la fuente"
                  activo={aplicaRetFuente}
                  setActivo={setAplicaRetFuente}
                  pct={retFuentePct}
                  setPct={setRetFuentePct}
                />
                <ImpuestoBox
                  label="Retención de IVA"
                  activo={aplicaRetIva}
                  setActivo={setAplicaRetIva}
                  pct={retIvaPct}
                  setPct={setRetIvaPct}
                />
              </div>

              {/* Totales en vivo */}
              <div className="card p-3.5 mb-4 bg-white/[0.02]">
                <div className="flex justify-between text-[12.5px] py-0.5">
                  <span className="text-text-dim">Subtotal</span>
                  <span>${calc.subtotal.toFixed(2)}</span>
                </div>
                {aplicaIva && (
                  <div className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-text-dim">IVA ({ivaPct}%)</span>
                    <span className="text-[#6ee7b7]">+${calc.iva.toFixed(2)}</span>
                  </div>
                )}
                {aplicaRetFuente && (
                  <div className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-text-dim">Ret. fuente ({retFuentePct}%)</span>
                    <span className="text-[#fca5a5]">-${calc.retFuente.toFixed(2)}</span>
                  </div>
                )}
                {aplicaRetIva && (
                  <div className="flex justify-between text-[12.5px] py-0.5">
                    <span className="text-text-dim">Ret. IVA ({retIvaPct}%)</span>
                    <span className="text-[#fca5a5]">-${calc.retIva.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-[15px] font-semibold pt-2 mt-1 border-t border-border">
                  <span>Total</span>
                  <span className="text-[#c4b8ff]">${calc.total.toFixed(2)}</span>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[11.5px] text-text-faint block mb-1">Observación general</label>
                <textarea
                  value={observacion}
                  onChange={(e) => setObservacion(e.target.value)}
                  rows={2}
                  placeholder="Ej. Todos los servicios facturados incluyen… / Tiempo de entrega…"
                  className="w-full card px-3 py-2 text-[13px] outline-none resize-none"
                />
              </div>

              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11.5px] text-text-faint">Condiciones generales</label>
                  <button
                    type="button"
                    onClick={() => setCondiciones(CONDICIONES_DEFAULT)}
                    className="text-[10.5px] text-text-faint hover:text-text underline"
                  >
                    Restaurar texto por defecto
                  </button>
                </div>
                <textarea
                  value={condiciones}
                  onChange={(e) => setCondiciones(e.target.value)}
                  rows={8}
                  className="w-full card px-3 py-2 text-[12px] outline-none resize-y leading-relaxed"
                />
                <p className="text-[10.5px] text-text-faint mt-1">
                  Este texto ya viene pre-cargado. Edítalo solo si esta cotización necesita condiciones distintas.
                </p>
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
                  {saving ? "Guardando…" : formId ? "Guardar cambios" : "Crear cotización"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ====== PDF ====== */}
        {cotImprimir && calcImp && (
          <div className="print-area hidden print:block text-black bg-white p-8">
            <div className="flex justify-between items-start border-b-2 border-black pb-3 mb-4">
              <div>
                <p className="text-[20px] font-bold">{EMPRESA.nombre}</p>
                <p className="text-[10px]">{EMPRESA.direccion} · {EMPRESA.ciudad}</p>
                <p className="text-[10px]">{EMPRESA.web} · Tel: {EMPRESA.telefono}</p>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-bold">COTIZACIÓN</p>
                <p className="text-[11px]">N°: {cotImprimir.numero}</p>
                <p className="text-[11px]">Fecha: {new Date(cotImprimir.fecha).toLocaleDateString("es-EC")}</p>
              </div>
            </div>

            <p className="text-[12px] font-bold mb-1">CLIENTE</p>
            <div className="text-[11px] border border-black/40 p-2 mb-4">
              <p>Nombre: {cotImprimir.cliente_nombre}</p>
              {cotImprimir.cliente_direccion && <p>Dirección: {cotImprimir.cliente_direccion}</p>}
              <p>Ciudad: {cotImprimir.cliente_ciudad}</p>
              {cotImprimir.cliente_telefono && <p>Teléfono: {cotImprimir.cliente_telefono}</p>}
            </div>

            <table className="w-full text-[11px] border-collapse mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-black/40 p-1.5 text-left">DESCRIPCIÓN</th>
                  <th className="border border-black/40 p-1.5 text-right w-[60px]">CANT.</th>
                  <th className="border border-black/40 p-1.5 text-right w-[90px]">V. UNIT.</th>
                  <th className="border border-black/40 p-1.5 text-right w-[90px]">VALOR</th>
                </tr>
              </thead>
              <tbody>
                {itemsImprimir.map((it, i) => (
                  <tr key={i}>
                    <td className="border border-black/40 p-1.5">
                      {it.descripcion}
                      {it.nota && <span className="block text-[9px] text-gray-600">{it.nota}</span>}
                    </td>
                    <td className="border border-black/40 p-1.5 text-right">{it.cantidad}</td>
                    <td className="border border-black/40 p-1.5 text-right">${Number(it.valor).toFixed(2)}</td>
                    <td className="border border-black/40 p-1.5 text-right">
                      ${(Number(it.cantidad) * Number(it.valor)).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex justify-end mb-4">
              <table className="text-[11px] w-[280px]">
                <tbody>
                  <tr>
                    <td className="py-0.5">Subtotal</td>
                    <td className="py-0.5 text-right font-semibold">${calcImp.subtotal.toFixed(2)}</td>
                  </tr>
                  {cotImprimir.aplica_iva && (
                    <tr>
                      <td className="py-0.5">IVA ({cotImprimir.iva_porcentaje}%)</td>
                      <td className="py-0.5 text-right">${calcImp.iva.toFixed(2)}</td>
                    </tr>
                  )}
                  {cotImprimir.aplica_ret_fuente && (
                    <tr>
                      <td className="py-0.5">Retención fuente ({cotImprimir.ret_fuente_porcentaje}%)</td>
                      <td className="py-0.5 text-right">-${calcImp.retFuente.toFixed(2)}</td>
                    </tr>
                  )}
                  {cotImprimir.aplica_ret_iva && (
                    <tr>
                      <td className="py-0.5">Retención IVA ({cotImprimir.ret_iva_porcentaje}%)</td>
                      <td className="py-0.5 text-right">-${calcImp.retIva.toFixed(2)}</td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-black">
                    <td className="py-1 font-bold text-[13px]">TOTAL</td>
                    <td className="py-1 text-right font-bold text-[13px]">${calcImp.total.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {cotImprimir.observacion_general && (
              <div className="text-[10px] border-t border-black/30 pt-2">
                <p className="font-bold mb-0.5">Nota:</p>
                <p className="whitespace-pre-wrap">{cotImprimir.observacion_general}</p>
              </div>
            )}

            {cotImprimir.condiciones_generales && (
              <div className="text-[9px] border-t border-black/30 pt-2 mt-2 leading-relaxed">
                <p className="whitespace-pre-wrap">{cotImprimir.condiciones_generales}</p>
              </div>
            )}

            <div className="text-[9.5px] border border-black/40 mt-3 p-2">
              <p className="font-bold mb-0.5">CUENTAS BANCARIAS</p>
              <p>{BANCO.razon} · RUC {BANCO.ruc}</p>
              <p>{BANCO.banco} — {BANCO.cuenta}</p>
              <p>Email: {BANCO.email}</p>
            </div>
          </div>
        )}
      </main>

      <ConfirmModal
        abierto={aEliminar !== null}
        titulo="¿Eliminar cotización?"
        mensaje="Esta acción no se puede deshacer. Se eliminará la cotización y sus servicios."
        onConfirmar={confirmarEliminar}
        onCancelar={() => setAEliminar(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}

function ImpuestoBox({
  label,
  activo,
  setActivo,
  pct,
  setPct,
}: {
  label: string;
  activo: boolean;
  setActivo: (v: boolean) => void;
  pct: string;
  setPct: (v: string) => void;
}) {
  return (
    <div className={`card p-3 ${activo ? "border-accent-2/30" : ""}`}>
      <label className="flex items-center gap-2 cursor-pointer mb-2">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) => setActivo(e.target.checked)}
          className="w-4 h-4 accent-[#7c6cf0]"
        />
        <span className="text-[12px] font-medium">{label}</span>
      </label>
      <div className="flex items-center gap-1.5">
        <input
          value={pct}
          onChange={(e) => setPct(e.target.value)}
          disabled={!activo}
          type="number"
          step="0.01"
          className="w-full card px-2 py-1 text-[12px] outline-none text-right disabled:opacity-40"
        />
        <span className="text-[12px] text-text-faint">%</span>
      </div>
    </div>
  );
}

function CotizacionFila({
  cot,
  supabase,
  onEditar,
  onEliminar,
  onImprimir,
}: {
  cot: Cotizacion;
  supabase: ReturnType<typeof createClient>;
  onEditar: () => void;
  onEliminar: () => void;
  onImprimir: () => void;
}) {
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cotizacion_items")
        .select("cantidad, valor")
        .eq("cotizacion_id", cot.id);
      const sub = (data ?? []).reduce(
        (a, it) => a + Number(it.cantidad ?? 0) * Number(it.valor ?? 0),
        0
      );
      const iva = cot.aplica_iva ? sub * (cot.iva_porcentaje / 100) : 0;
      const rf = cot.aplica_ret_fuente ? sub * (cot.ret_fuente_porcentaje / 100) : 0;
      const ri = cot.aplica_ret_iva ? iva * (cot.ret_iva_porcentaje / 100) : 0;
      setTotal(sub + iva - rf - ri);
    })();
  }, [cot, supabase]);

  return (
    <div className="grid grid-cols-[110px_1fr_120px_110px_120px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]">
      <span className="font-medium">{cot.numero}</span>
      <span className="truncate">{cot.cliente_nombre}</span>
      <span className="text-text-dim">{new Date(cot.fecha).toLocaleDateString("es-EC")}</span>
      <span className="text-right font-semibold">
        {total === null ? "…" : `$${total.toFixed(2)}`}
      </span>
      <div className="flex items-center justify-end gap-1.5">
        <button onClick={onImprimir} className="text-text-faint hover:text-text" title="Imprimir / PDF">
          <FileText size={15} />
        </button>
        <button onClick={onEditar} className="text-text-faint hover:text-text" title="Editar">
          <Pencil size={15} />
        </button>
        <button onClick={onEliminar} className="text-text-faint hover:text-red-300" title="Eliminar">
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
