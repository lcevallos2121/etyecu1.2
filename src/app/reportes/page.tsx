"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Printer, Download } from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

export const dynamic = "force-dynamic";

type Orden = {
  id: string;
  numero_dap: string;
  regimen: string;
  tipo_espacio: string | null;
  cantidad_ingresada: number;
  cantidad_actual: number;
  total_pallets: number | null;
  peso_total_kg: number | null;
  creado_en: string;
  cdas: { numero_cda: string | null; clientes: { nombre: string } | null } | null;
};

type Egreso = {
  id: string;
  cantidad: number;
  salida_parcial: boolean;
  creado_en: string;
  ordenes_dap: { numero_dap: string; cdas: { clientes: { nombre: string } | null } | null } | null;
};

type Novedad = {
  id: string;
  tipo: string;
  resuelto: boolean;
  creado_en: string;
  ordenes_dap: { numero_dap: string } | null;
};

type Cda = {
  id: string;
  folio: number;
  numero_cda: string | null;
  factura: string | null;
  transporte: string | null;
  creado_en: string;
  clientes: { nombre: string } | null;
};

type Cliente = { nombre: string; ruc_ci: string; correo: string | null; telefono: string | null };

type Tab =
  | "resumen"
  | "inventario"
  | "ingresos"
  | "egresos"
  | "egresadas"
  | "novedades"
  | "cdas"
  | "clientes";

const tabsInfo: { id: Tab; label: string; conFecha?: boolean }[] = [
  { id: "resumen", label: "Resumen ejecutivo" },
  { id: "inventario", label: "En depósito" },
  { id: "ingresos", label: "Ingresos", conFecha: true },
  { id: "egresos", label: "Egresos", conFecha: true },
  { id: "egresadas", label: "Egresadas totalmente" },
  { id: "novedades", label: "Novedades" },
  { id: "cdas", label: "CDAs", conFecha: true },
  { id: "clientes", label: "Clientes" },
];

const PALETA = ["#7c6cf0", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#60a5fa"];
const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export default function ReportesPage() {
  const supabase = createClient();

  const [ordenes, setOrdenes] = useState<Orden[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [novedades, setNovedades] = useState<Novedad[]>([]);
  const [cdas, setCdas] = useState<Cda[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("resumen");

  // Filtros
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroEspacio, setFiltroEspacio] = useState<"todos" | "deposito_aduanero_publico" | "bodega_simple">("todos");
  const [filtroNovedad, setFiltroNovedad] = useState<"todas" | "pendientes" | "resueltas">("todas");

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    const [ordenesRes, egresosRes, novedadesRes, cdasRes, clientesRes] = await Promise.all([
      supabase
        .from("ordenes_dap")
        .select("id, numero_dap, regimen, tipo_espacio, cantidad_ingresada, cantidad_actual, total_pallets, peso_total_kg, creado_en, cdas(numero_cda, clientes(nombre))")
        .order("creado_en", { ascending: false }),
      supabase
        .from("egreso_transacciones")
        .select("id, cantidad, salida_parcial, creado_en, ordenes_dap(numero_dap, cdas(clientes(nombre)))")
        .order("creado_en", { ascending: false }),
      supabase
        .from("novedades")
        .select("id, tipo, resuelto, creado_en, ordenes_dap(numero_dap)")
        .order("creado_en", { ascending: false }),
      supabase
        .from("cdas")
        .select("id, folio, numero_cda, factura, transporte, creado_en, clientes(nombre)")
        .order("folio", { ascending: false }),
      supabase.from("clientes").select("nombre, ruc_ci, correo, telefono").order("nombre"),
    ]);

    if (ordenesRes.error) setErrorMsg(ordenesRes.error.message);
    else setOrdenes((ordenesRes.data as unknown as Orden[]) ?? []);
    setEgresos((egresosRes.data as unknown as Egreso[]) ?? []);
    setNovedades((novedadesRes.data as unknown as Novedad[]) ?? []);
    setCdas((cdasRes.data as unknown as Cda[]) ?? []);
    setClientes(clientesRes.data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Aplica filtro de fecha a cualquier registro con creado_en
  const enRango = useCallback(
    (fecha: string) => {
      const f = new Date(fecha).getTime();
      if (fechaDesde && f < new Date(fechaDesde).getTime()) return false;
      if (fechaHasta && f > new Date(fechaHasta + "T23:59:59").getTime()) return false;
      return true;
    },
    [fechaDesde, fechaHasta]
  );

  // -------- Datos filtrados por pestaña --------
  const ordenesFiltradas = useMemo(
    () =>
      ordenes.filter(
        (o) =>
          (filtroEspacio === "todos" || o.tipo_espacio === filtroEspacio) &&
          enRango(o.creado_en)
      ),
    [ordenes, filtroEspacio, enRango]
  );

  const enDeposito = useMemo(
    () => ordenes.filter((o) => o.cantidad_actual > 0 && (filtroEspacio === "todos" || o.tipo_espacio === filtroEspacio)),
    [ordenes, filtroEspacio]
  );

  const egresadas = useMemo(
    () => ordenes.filter((o) => o.cantidad_actual === 0),
    [ordenes]
  );

  const egresosFiltrados = useMemo(
    () => egresos.filter((e) => enRango(e.creado_en)),
    [egresos, enRango]
  );

  const novedadesFiltradas = useMemo(
    () =>
      novedades.filter((n) =>
        filtroNovedad === "todas"
          ? true
          : filtroNovedad === "pendientes"
          ? !n.resuelto
          : n.resuelto
      ),
    [novedades, filtroNovedad]
  );

  const cdasFiltrados = useMemo(() => cdas.filter((c) => enRango(c.creado_en)), [cdas, enRango]);

  // -------- Datos para gráficas --------
  const resumen = useMemo(() => {
    const totalIngresado = ordenes.reduce((a, o) => a + o.cantidad_ingresada, 0);
    const totalActual = ordenes.reduce((a, o) => a + o.cantidad_actual, 0);
    return {
      totalIngresado,
      totalActual,
      totalEgresado: totalIngresado - totalActual,
      enDeposito: ordenes.filter((o) => o.cantidad_actual > 0).length,
      egresadasTotal: ordenes.filter((o) => o.cantidad_actual === 0).length,
      novedadesPend: novedades.filter((n) => !n.resuelto).length,
      pctOcupacion: totalIngresado > 0 ? Math.round((totalActual / totalIngresado) * 100) : 0,
    };
  }, [ordenes, novedades]);

  const datosPorEspacio = useMemo(() => {
    const dap = ordenes.filter((o) => o.tipo_espacio === "deposito_aduanero_publico").length;
    const bodega = ordenes.filter((o) => o.tipo_espacio === "bodega_simple").length;
    return [
      { name: "Dep. Aduanero", value: dap },
      { name: "Bodega Simple", value: bodega },
    ].filter((d) => d.value > 0);
  }, [ordenes]);

  const datosPorRegimen = useMemo(() => {
    const r70 = ordenes.filter((o) => o.regimen === "70").length;
    const r10 = ordenes.filter((o) => o.regimen === "10").length;
    return [
      { name: "Régimen 70", value: r70 },
      { name: "Régimen 10", value: r10 },
    ].filter((d) => d.value > 0);
  }, [ordenes]);

  const egresosPorMes = useMemo(() => {
    const conteo: Record<string, number> = {};
    egresos.forEach((e) => {
      const d = new Date(e.creado_en);
      const key = `${MESES[d.getMonth()]} ${d.getFullYear().toString().slice(2)}`;
      conteo[key] = (conteo[key] ?? 0) + e.cantidad;
    });
    return Object.entries(conteo)
      .map(([mes, cantidad]) => ({ mes, cantidad }))
      .slice(-6);
  }, [egresos]);

  const topClientes = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenes.forEach((o) => {
      const nombre = o.cdas?.clientes?.nombre ?? "Sin cliente";
      conteo[nombre] = (conteo[nombre] ?? 0) + o.cantidad_actual;
    });
    return Object.entries(conteo)
      .map(([cliente, cantidad]) => ({ cliente: cliente.slice(0, 18), cantidad }))
      .filter((d) => d.cantidad > 0)
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [ordenes]);

  function imprimir() {
    window.print();
  }

  function descargarCSV(nombre: string, filas: (string | number)[][]) {
    const csv = filas
      .map((fila) => fila.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportarCSV() {
    if (tab === "inventario" || tab === "resumen") {
      descargarCSV("inventario_en_deposito", [
        ["N° DAP", "Cliente", "Régimen", "Espacio", "Ingresado", "Actual", "% Egresado", "Fecha ingreso"],
        ...enDeposito.map((o) => [
          o.numero_dap,
          o.cdas?.clientes?.nombre ?? "",
          o.regimen,
          o.tipo_espacio === "bodega_simple" ? "Bodega Simple" : "Depósito Aduanero",
          o.cantidad_ingresada,
          o.cantidad_actual,
          o.cantidad_ingresada > 0
            ? `${(((o.cantidad_ingresada - o.cantidad_actual) / o.cantidad_ingresada) * 100).toFixed(0)}%`
            : "0%",
          new Date(o.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "ingresos") {
      descargarCSV("ingresos", [
        ["N° DAP", "Cliente", "Régimen", "Espacio", "Pallets", "Cantidad", "Peso Kg", "Fecha"],
        ...ordenesFiltradas.map((o) => [
          o.numero_dap,
          o.cdas?.clientes?.nombre ?? "",
          o.regimen,
          o.tipo_espacio === "bodega_simple" ? "Bodega Simple" : "Depósito Aduanero",
          o.total_pallets ?? "",
          o.cantidad_ingresada,
          o.peso_total_kg ?? "",
          new Date(o.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "egresos") {
      descargarCSV("egresos", [
        ["N° DAP", "Cliente", "Cantidad", "Tipo", "Fecha"],
        ...egresosFiltrados.map((e) => [
          e.ordenes_dap?.numero_dap ?? "",
          e.ordenes_dap?.cdas?.clientes?.nombre ?? "",
          e.cantidad,
          e.salida_parcial ? "Parcial" : "Total",
          new Date(e.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "egresadas") {
      descargarCSV("egresadas_totalmente", [
        ["N° DAP", "Cliente", "Régimen", "Cantidad original", "Fecha ingreso"],
        ...egresadas.map((o) => [
          o.numero_dap,
          o.cdas?.clientes?.nombre ?? "",
          o.regimen,
          o.cantidad_ingresada,
          new Date(o.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "novedades") {
      descargarCSV("novedades", [
        ["N° DAP", "Tipo", "Estado", "Fecha"],
        ...novedadesFiltradas.map((n) => [
          n.ordenes_dap?.numero_dap ?? "",
          n.tipo,
          n.resuelto ? "Resuelto" : "Pendiente",
          new Date(n.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "cdas") {
      descargarCSV("cdas", [
        ["Folio", "N° CDA", "Cliente", "Factura", "Transporte", "Fecha"],
        ...cdasFiltrados.map((c) => [
          c.folio,
          c.numero_cda ?? "Pendiente",
          c.clientes?.nombre ?? "",
          c.factura ?? "",
          c.transporte ?? "",
          new Date(c.creado_en).toLocaleDateString("es-EC"),
        ]),
      ]);
    } else if (tab === "clientes") {
      descargarCSV("clientes", [
        ["Nombre", "RUC/CI", "Correo", "Teléfono"],
        ...clientes.map((c) => [c.nombre, c.ruc_ci, c.correo ?? "", c.telefono ?? ""]),
      ]);
    }
  }

  const fechaHoy = new Date().toLocaleDateString("es-EC", { day: "numeric", month: "long", year: "numeric" });
  const tabActual = tabsInfo.find((t) => t.id === tab);
  const mostrarFiltroFecha = tabActual?.conFecha;
  const mostrarFiltroEspacio = tab === "inventario" || tab === "ingresos" || tab === "resumen";

  return (
    <div className="flex min-h-screen">
      <div className="print:hidden">
        <Sidebar activePath="/reportes" />
      </div>

      <main className="flex-1 min-w-0">
        <div className="print:hidden">
          <Topbar />
        </div>

        <div className="print-area px-6.5 pt-5.5 pb-10 print:p-0">
          <div className="flex items-center justify-between mb-4.5 print:mb-6">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5 print:text-[24px]">Reportes gerenciales</h1>
              <p className="text-[12.5px] text-text-faint print:text-black">Generado el {fechaHoy}</p>
            </div>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={exportarCSV}
                className="btn-secondary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
              >
                <Download size={15} /> Excel (CSV)
              </button>
              <button
                onClick={imprimir}
                className="btn-primary flex items-center gap-1.5 text-[12.5px] font-semibold px-4 py-2 rounded-lg"
              >
                <Printer size={15} /> Imprimir / PDF
              </button>
            </div>
          </div>

          <div className="flex gap-2 mb-4 print:hidden flex-wrap">
            {tabsInfo.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-[12px] font-medium px-3 py-1.5 rounded-lg ${
                  tab === t.id ? "bg-accent/[0.18] text-[#c4b8ff]" : "card text-text-dim"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Barra de filtros */}
          {(mostrarFiltroFecha || mostrarFiltroEspacio || tab === "novedades") && (
            <div className="flex gap-3 mb-4.5 print:hidden flex-wrap items-end card p-3">
              {mostrarFiltroFecha && (
                <>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Desde</label>
                    <input
                      type="date"
                      value={fechaDesde}
                      onChange={(e) => setFechaDesde(e.target.value)}
                      className="card px-3 py-1.5 text-[12px] outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10.5px] text-text-faint block mb-1">Hasta</label>
                    <input
                      type="date"
                      value={fechaHasta}
                      onChange={(e) => setFechaHasta(e.target.value)}
                      className="card px-3 py-1.5 text-[12px] outline-none"
                    />
                  </div>
                </>
              )}
              {mostrarFiltroEspacio && (
                <div>
                  <label className="text-[10.5px] text-text-faint block mb-1">Espacio</label>
                  <select
                    value={filtroEspacio}
                    onChange={(e) => setFiltroEspacio(e.target.value as typeof filtroEspacio)}
                    className="card px-3 py-1.5 text-[12px] outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="deposito_aduanero_publico">Depósito Aduanero</option>
                    <option value="bodega_simple">Bodega Simple</option>
                  </select>
                </div>
              )}
              {tab === "novedades" && (
                <div>
                  <label className="text-[10.5px] text-text-faint block mb-1">Estado</label>
                  <select
                    value={filtroNovedad}
                    onChange={(e) => setFiltroNovedad(e.target.value as typeof filtroNovedad)}
                    className="card px-3 py-1.5 text-[12px] outline-none"
                  >
                    <option value="todas">Todas</option>
                    <option value="pendientes">Pendientes</option>
                    <option value="resueltas">Resueltas</option>
                  </select>
                </div>
              )}
              {(fechaDesde || fechaHasta) && (
                <button
                  onClick={() => {
                    setFechaDesde("");
                    setFechaHasta("");
                  }}
                  className="text-[11.5px] text-text-faint hover:text-text underline py-1.5"
                >
                  Limpiar fechas
                </button>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5] print:hidden">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando datos…</p>
          ) : (
            <>
              {/* ============ RESUMEN CON GRÁFICAS ============ */}
              {tab === "resumen" && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Órdenes en depósito", value: resumen.enDeposito },
                      { label: "Unidades en depósito", value: resumen.totalActual.toLocaleString("es-EC") },
                      { label: "Ocupación", value: `${resumen.pctOcupacion}%` },
                      { label: "Novedades pendientes", value: resumen.novedadesPend },
                    ].map((k) => (
                      <div key={k.label} className="card p-3.5">
                        <p className="text-[11px] text-text-faint">{k.label}</p>
                        <p className="text-[22px] font-semibold mt-1">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Unidades en depósito por cliente (top 5)</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={topClientes} layout="vertical" margin={{ left: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis type="number" tick={{ fill: "#9a9fae", fontSize: 11 }} />
                          <YAxis
                            type="category"
                            dataKey="cliente"
                            tick={{ fill: "#9a9fae", fontSize: 10 }}
                            width={110}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#161a23",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="cantidad" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Egresos por mes</p>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={egresosPorMes}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="mes" tick={{ fill: "#9a9fae", fontSize: 11 }} />
                          <YAxis tick={{ fill: "#9a9fae", fontSize: 11 }} />
                          <Tooltip
                            contentStyle={{
                              background: "#161a23",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                          <Bar dataKey="cantidad" fill="#34d399" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por tipo de espacio</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={datosPorEspacio}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            label={(e) => `${e.name}: ${e.value}`}
                            labelLine={false}
                            style={{ fontSize: 11 }}
                          >
                            {datosPorEspacio.map((_, i) => (
                              <Cell key={i} fill={PALETA[i % PALETA.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "#161a23",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por régimen</p>
                      <ResponsiveContainer width="100%" height={200}>
                        <PieChart>
                          <Pie
                            data={datosPorRegimen}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={70}
                            label={(e) => `${e.name}: ${e.value}`}
                            labelLine={false}
                            style={{ fontSize: 11 }}
                          >
                            {datosPorRegimen.map((_, i) => (
                              <Cell key={i} fill={PALETA[(i + 2) % PALETA.length]} />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "#161a23",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}

              {/* ============ TABLAS ============ */}
              {tab === "inventario" && (
                <ReportTable
                  headers={["N° DAP", "Cliente", "Régimen", "Espacio", "Ingresado", "Actual", "% Egr."]}
                  rows={enDeposito.map((o) => [
                    o.numero_dap,
                    o.cdas?.clientes?.nombre ?? "—",
                    o.regimen,
                    o.tipo_espacio === "bodega_simple" ? "Bodega" : "Depósito",
                    o.cantidad_ingresada.toLocaleString("es-EC"),
                    o.cantidad_actual.toLocaleString("es-EC"),
                    o.cantidad_ingresada > 0
                      ? `${(((o.cantidad_ingresada - o.cantidad_actual) / o.cantidad_ingresada) * 100).toFixed(0)}%`
                      : "—",
                  ])}
                />
              )}

              {tab === "ingresos" && (
                <ReportTable
                  headers={["N° DAP", "Cliente", "Régimen", "Pallets", "Cantidad", "Peso Kg", "Fecha"]}
                  rows={ordenesFiltradas.map((o) => [
                    o.numero_dap,
                    o.cdas?.clientes?.nombre ?? "—",
                    o.regimen,
                    o.total_pallets?.toString() ?? "—",
                    o.cantidad_ingresada.toLocaleString("es-EC"),
                    o.peso_total_kg?.toLocaleString("es-EC") ?? "—",
                    new Date(o.creado_en).toLocaleDateString("es-EC"),
                  ])}
                />
              )}

              {tab === "egresos" && (
                <ReportTable
                  headers={["N° DAP", "Cliente", "Cantidad", "Tipo", "Fecha"]}
                  rows={egresosFiltrados.map((e) => [
                    e.ordenes_dap?.numero_dap ?? "—",
                    e.ordenes_dap?.cdas?.clientes?.nombre ?? "—",
                    e.cantidad.toLocaleString("es-EC"),
                    e.salida_parcial ? "Parcial" : "Total",
                    new Date(e.creado_en).toLocaleDateString("es-EC"),
                  ])}
                />
              )}

              {tab === "egresadas" && (
                <ReportTable
                  headers={["N° DAP", "Cliente", "Régimen", "Cantidad original", "Fecha ingreso"]}
                  rows={egresadas.map((o) => [
                    o.numero_dap,
                    o.cdas?.clientes?.nombre ?? "—",
                    o.regimen,
                    o.cantidad_ingresada.toLocaleString("es-EC"),
                    new Date(o.creado_en).toLocaleDateString("es-EC"),
                  ])}
                />
              )}

              {tab === "novedades" && (
                <ReportTable
                  headers={["N° DAP", "Tipo", "Estado", "Fecha"]}
                  rows={novedadesFiltradas.map((n) => [
                    n.ordenes_dap?.numero_dap ?? "—",
                    n.tipo,
                    n.resuelto ? "Resuelto" : "Pendiente",
                    new Date(n.creado_en).toLocaleDateString("es-EC"),
                  ])}
                />
              )}

              {tab === "cdas" && (
                <ReportTable
                  headers={["Folio", "N° CDA", "Cliente", "Factura", "Transporte", "Fecha"]}
                  rows={cdasFiltrados.map((c) => [
                    `#${c.folio}`,
                    c.numero_cda ?? "Pendiente",
                    c.clientes?.nombre ?? "—",
                    c.factura ?? "—",
                    c.transporte ?? "—",
                    new Date(c.creado_en).toLocaleDateString("es-EC"),
                  ])}
                />
              )}

              {tab === "clientes" && (
                <ReportTable
                  headers={["Nombre", "RUC / CI", "Correo", "Teléfono"]}
                  rows={clientes.map((c) => [c.nombre, c.ruc_ci, c.correo ?? "—", c.telefono ?? "—"])}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="card overflow-hidden print:border print:border-black/20 print:bg-white">
      <div
        className="grid gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border print:text-black/60 print:border-black/20"
        style={{ gridTemplateColumns: `repeat(${headers.length}, 1fr)` }}
      >
        {headers.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-text-faint print:text-black/60">
          Sin datos para este filtro.
        </p>
      ) : (
        rows.map((row, i) => (
          <div
            key={i}
            className="grid gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px] print:text-black print:border-black/10"
            style={{ gridTemplateColumns: `repeat(${headers.length}, 1fr)` }}
          >
            {row.map((cell, j) => (
              <span key={j} className="truncate">
                {cell}
              </span>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
