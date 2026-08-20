"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Printer } from "lucide-react";
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

type OrdenEtq = {
  id: string;
  numero_etq: string;
  origen: "etyecu" | "externo";
  cliente_nombre: string | null;
  tipo_producto: string | null;
  estado: string;
  fecha: string;
  creado_en: string;
};

type ItemEtq = {
  orden_id: string;
  palet: string | null;
  cajas: string | null;
  codigo: string | null;
  descripcion: string | null;
  cantidad_contada: number;
  cantidad_factura: number;
  tallas_detalle: Record<string, number> | null;
  composicion: string | null;
  pais: string | null;
};

type Movimiento = {
  orden_id: string;
  mesa_id: string | null;
  cantidad: number;
  creado_en: string;
};

type Mesa = {
  id: string;
  orden_id: string;
  nombre: string;
};

const COLORES = ["#7c6cf0", "#6ee7b7", "#fbbf24", "#fca5a5", "#93c5fd", "#c4b8ff"];

const tabs = [
  { id: "resumen", label: "Resumen" },
  { id: "ordenes", label: "Órdenes" },
  { id: "produccion", label: "Producción por mesa" },
  { id: "inventario", label: "Inventario" },
] as const;

export default function ReportesEtiquetadoPage() {
  const supabase = createClient();

  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("resumen");
  const [ordenes, setOrdenes] = useState<OrdenEtq[]>([]);
  const [items, setItems] = useState<ItemEtq[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "etyecu" | "externo">("todos");
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState<string>("");
  const [busquedaInventario, setBusquedaInventario] = useState("");
  const [tipoBusqueda, setTipoBusqueda] = useState<
    "todos" | "palet" | "codigo" | "descripcion" | "tallas" | "composicion" | "pais"
  >("todos");

  const cargar = useCallback(async () => {
    setLoading(true);
    const [ordRes, itemsRes, movRes, mesasRes] = await Promise.all([
      supabase
        .from("etq_ordenes")
        .select("id, numero_etq, origen, cliente_nombre, tipo_producto, estado, fecha, creado_en"),
      supabase
        .from("etq_items")
        .select(
          "orden_id, palet, cajas, codigo, descripcion, cantidad_contada, cantidad_factura, tallas_detalle, composicion, pais"
        ),
      supabase.from("etq_movimientos").select("orden_id, mesa_id, cantidad, creado_en"),
      supabase.from("etq_mesas").select("id, orden_id, nombre"),
    ]);

    if (ordRes.error) {
      setErrorMsg(
        ordRes.error.message.includes("does not exist") || ordRes.error.message.includes("relation")
          ? "Falta crear las tablas de etiquetado. ¿Corriste etiquetado_schema.sql en Supabase?"
          : ordRes.error.message
      );
    } else {
      setErrorMsg(null);
    }

    setOrdenes((ordRes.data as OrdenEtq[]) ?? []);
    setItems((itemsRes.data as ItemEtq[]) ?? []);
    setMovimientos((movRes.data as Movimiento[]) ?? []);
    setMesas((mesasRes.data as Mesa[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Órdenes filtradas por fecha y origen
  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((o) => {
      const f = new Date(o.fecha).getTime();
      if (fechaDesde && f < new Date(fechaDesde).getTime()) return false;
      if (fechaHasta && f > new Date(fechaHasta + "T23:59:59").getTime()) return false;
      if (filtroOrigen !== "todos" && o.origen !== filtroOrigen) return false;
      return true;
    });
  }, [ordenes, fechaDesde, fechaHasta, filtroOrigen]);

  const idsFiltrados = useMemo(() => new Set(ordenesFiltradas.map((o) => o.id)), [ordenesFiltradas]);

  const itemsFiltrados = useMemo(
    () => items.filter((it) => idsFiltrados.has(it.orden_id)),
    [items, idsFiltrados]
  );

  const movimientosFiltrados = useMemo(
    () => movimientos.filter((m) => idsFiltrados.has(m.orden_id)),
    [movimientos, idsFiltrados]
  );

  const mesasFiltradas = useMemo(
    () => mesas.filter((m) => idsFiltrados.has(m.orden_id)),
    [mesas, idsFiltrados]
  );

  // KPIs de resumen
  const resumen = useMemo(() => {
    const totalContado = itemsFiltrados.reduce((a, it) => a + Number(it.cantidad_contada || 0), 0);
    const totalFactura = itemsFiltrados.reduce((a, it) => a + Number(it.cantidad_factura || 0), 0);
    const completos = itemsFiltrados.filter(
      (it) => it.cantidad_factura > 0 && it.cantidad_contada === it.cantidad_factura
    ).length;
    const conProblema = itemsFiltrados.filter(
      (it) => it.cantidad_factura > 0 && it.cantidad_contada !== it.cantidad_factura
    ).length;
    const totalCodigos = itemsFiltrados.filter((it) => it.cantidad_factura > 0).length;
    const pctCompletos = totalCodigos > 0 ? Math.round((completos / totalCodigos) * 100) : 0;
    return {
      totalOrdenes: ordenesFiltradas.length,
      totalContado,
      totalFactura,
      pctCompletos,
      conProblema,
    };
  }, [itemsFiltrados, ordenesFiltradas]);

  // Órdenes por cliente (barras, para ver quién trae más)
  const porCliente = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenesFiltradas.forEach((o) => {
      const c = o.cliente_nombre ?? "Sin cliente";
      conteo[c] = (conteo[c] ?? 0) + 1;
    });
    return Object.entries(conteo)
      .map(([nombre, ordenes]) => ({ nombre, ordenes }))
      .sort((a, b) => b.ordenes - a.ordenes)
      .slice(0, 8);
  }, [ordenesFiltradas]);

  // Órdenes por tipo de producto
  const porProducto = useMemo(() => {
    const conteo: Record<string, number> = {};
    ordenesFiltradas.forEach((o) => {
      const p = o.tipo_producto ?? "otro";
      conteo[p] = (conteo[p] ?? 0) + 1;
    });
    return Object.entries(conteo).map(([name, value]) => ({ name, value }));
  }, [ordenesFiltradas]);

  // Producción por mesa (unidades totales)
  const produccionPorMesa = useMemo(() => {
    return mesasFiltradas
      .map((m) => {
        const movs = movimientosFiltrados.filter((mv) => mv.mesa_id === m.id);
        const unidades = movs.reduce((a, mv) => a + Number(mv.cantidad || 0), 0);
        return { nombre: m.nombre, unidades };
      })
      .filter((m) => m.unidades > 0)
      .sort((a, b) => b.unidades - a.unidades);
  }, [mesasFiltradas, movimientosFiltrados]);

  // Inventario de la orden seleccionada (para el tab "Inventario", por orden)
  const itemsOrdenSeleccionada = useMemo(
    () => items.filter((it) => it.orden_id === ordenSeleccionadaId),
    [items, ordenSeleccionadaId]
  );

  // Texto legible de las tallas: {"S":24,"M":48} -> "S:24 M:48"
  function formatoTallas(detalle: Record<string, number> | null): string {
    if (!detalle || Object.keys(detalle).length === 0) return "—";
    return Object.entries(detalle)
      .map(([talla, cant]) => `${talla}:${cant}`)
      .join(" ");
  }

  // Filtro de búsqueda: código, descripción o tallas
  const itemsInventarioFiltrados = useMemo(() => {
    const q = busquedaInventario.trim().toLowerCase();
    if (!q) return itemsOrdenSeleccionada;
    return itemsOrdenSeleccionada.filter((it) => {
      const palet = (it.palet ?? "").toLowerCase();
      const codigo = (it.codigo ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      const tallas = formatoTallas(it.tallas_detalle).toLowerCase();
      const composicion = (it.composicion ?? "").toLowerCase();
      const pais = (it.pais ?? "").toLowerCase();

      // Palet: coincidencia EXACTA (si no, "1" traería también "11", "12"...)
      if (tipoBusqueda === "palet") return palet === q;
      if (tipoBusqueda === "codigo") return codigo.includes(q);
      if (tipoBusqueda === "descripcion") return descripcion.includes(q);
      if (tipoBusqueda === "tallas") return tallas.includes(q);
      if (tipoBusqueda === "composicion") return composicion.includes(q);
      if (tipoBusqueda === "pais") return pais.includes(q);

      // "todos los campos": palet sigue siendo exacto para no traer resultados
      // mezclados (1 no debe traer 11), el resto por coincidencia parcial
      return (
        palet === q ||
        codigo.includes(q) ||
        descripcion.includes(q) ||
        tallas.includes(q) ||
        composicion.includes(q) ||
        pais.includes(q)
      );
    });
  }, [itemsOrdenSeleccionada, busquedaInventario, tipoBusqueda]);

  const totalesOrdenSeleccionada = itemsOrdenSeleccionada.reduce(
    (acc, it) => ({
      factura: acc.factura + Number(it.cantidad_factura || 0),
      contado: acc.contado + Number(it.cantidad_contada || 0),
    }),
    { factura: 0, contado: 0 }
  );

  function exportarCSV() {
    const filas = [
      ["N° Etiquetado", "Origen", "Cliente", "Producto", "Estado", "Fecha"],
      ...ordenesFiltradas.map((o) => [
        o.numero_etq,
        o.origen === "etyecu" ? "ETYECU" : "Cliente externo",
        o.cliente_nombre ?? "",
        o.tipo_producto ?? "",
        o.estado,
        new Date(o.fecha).toLocaleDateString("es-EC"),
      ]),
    ];
    const csv = filas.map((f) => f.map((c) => `"${c}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reportes_etiquetado_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar activePath="/etiquetado/reportes" />

      <main className="flex-1 min-w-0">
        <Topbar />

        <div className="px-6.5 pt-5.5 pb-10">
          <div className="flex items-center justify-between mb-4.5 print:hidden">
            <div>
              <h1 className="text-[21px] font-semibold mb-0.5">Reportes de etiquetado</h1>
              <p className="text-[12.5px] text-text-faint">
                Indicadores y métricas del módulo de etiquetado
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={exportarCSV}
                className="btn-secondary flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg"
              >
                Exportar CSV
              </button>
              <button
                onClick={() => window.print()}
                className="btn-secondary flex items-center gap-1.5 text-[12.5px] font-semibold px-3.5 py-2 rounded-lg"
              >
                <Printer size={14} /> Imprimir
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-red/10 border border-red/20 text-[12.5px] text-[#fca5a5]">
              {errorMsg}
            </div>
          )}

          {/* Tabs */}
          <div className="flex gap-2 mb-4 print:hidden">
            {tabs.map((t) => (
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

          {/* Filtros */}
          <div className="flex gap-3 mb-4.5 print:hidden flex-wrap items-end card p-3">
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
            <div>
              <label className="text-[10.5px] text-text-faint block mb-1">Origen</label>
              <select
                value={filtroOrigen}
                onChange={(e) => setFiltroOrigen(e.target.value as typeof filtroOrigen)}
                className="card px-3 py-1.5 text-[12px] outline-none"
              >
                <option value="todos">Todos</option>
                <option value="etyecu">ETYECU</option>
                <option value="externo">Cliente externo</option>
              </select>
            </div>
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

          {loading ? (
            <p className="text-[13px] text-text-faint">Cargando…</p>
          ) : (
            <>
              {tab === "resumen" && (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {[
                      { label: "Órdenes en el período", value: resumen.totalOrdenes },
                      { label: "Unidades etiquetadas", value: resumen.totalContado.toLocaleString("es-EC") },
                      { label: "% Completos vs factura", value: `${resumen.pctCompletos}%` },
                      { label: "Códigos con inconsistencia", value: resumen.conProblema },
                    ].map((k) => (
                      <div key={k.label} className="card p-3.5">
                        <p className="text-[11px] text-text-faint">{k.label}</p>
                        <p className="text-[22px] font-semibold mt-1">{k.value}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por cliente (top 8)</p>
                      {porCliente.length === 0 ? (
                        <p className="text-[12px] text-text-faint">Sin datos en el período.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={porCliente} layout="vertical" margin={{ left: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                            <XAxis type="number" allowDecimals={false} />
                            <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 10.5 }} />
                            <Tooltip />
                            <Bar dataKey="ordenes" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                    <div className="card p-4">
                      <p className="text-[12.5px] font-semibold mb-3">Órdenes por tipo de producto</p>
                      {porProducto.length === 0 ? (
                        <p className="text-[12px] text-text-faint">Sin datos en el período.</p>
                      ) : (
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={porProducto} dataKey="value" nameKey="name" outerRadius={80} label>
                              {porProducto.map((_, i) => (
                                <Cell key={i} fill={COLORES[i % COLORES.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </>
              )}

              {tab === "ordenes" && (
                <div className="card overflow-hidden">
                  <div className="grid grid-cols-[120px_1fr_100px_120px_100px_100px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                    <span>N° Etiquetado</span>
                    <span>Cliente</span>
                    <span>Origen</span>
                    <span>Producto</span>
                    <span>Estado</span>
                    <span className="text-right">Fecha</span>
                  </div>
                  {ordenesFiltradas.length === 0 ? (
                    <p className="text-[12.5px] text-text-faint p-5">No hay órdenes en el período.</p>
                  ) : (
                    ordenesFiltradas.map((o) => (
                      <div
                        key={o.id}
                        className="grid grid-cols-[120px_1fr_100px_120px_100px_100px] gap-3 px-5 py-3 items-center border-b border-border last:border-b-0 text-[12.5px]"
                      >
                        <span className="font-medium">{o.numero_etq}</span>
                        <span className="truncate">{o.cliente_nombre ?? "—"}</span>
                        <span className="text-text-dim">{o.origen === "etyecu" ? "ETYECU" : "Externo"}</span>
                        <span className="text-text-dim capitalize">{o.tipo_producto ?? "—"}</span>
                        <span className="text-text-dim capitalize">{o.estado}</span>
                        <span className="text-right text-text-dim">
                          {new Date(o.fecha).toLocaleDateString("es-EC")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "produccion" && (
                <div className="card p-4">
                  <p className="text-[12.5px] font-semibold mb-3">Unidades procesadas por mesa</p>
                  {produccionPorMesa.length === 0 ? (
                    <p className="text-[12px] text-text-faint">No hay movimientos registrados en el período.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={produccionPorMesa} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="nombre" width={90} />
                        <Tooltip />
                        <Bar dataKey="unidades" fill="#7c6cf0" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}

              {tab === "inventario" && (
                <>
                  <div className="card p-3 mb-4 flex items-center gap-3 flex-wrap">
                    <label className="text-[11.5px] text-text-faint">Orden:</label>
                    <select
                      value={ordenSeleccionadaId}
                      onChange={(e) => {
                        setOrdenSeleccionadaId(e.target.value);
                        setBusquedaInventario("");
                      }}
                      className="card px-3 py-1.5 text-[12.5px] outline-none min-w-[280px]"
                    >
                      <option value="">Selecciona una orden…</option>
                      {ordenesFiltradas.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.numero_etq} · {o.cliente_nombre ?? "—"}
                        </option>
                      ))}
                    </select>
                    {ordenSeleccionadaId && (
                      <Link
                        href={`/etiquetado/${ordenSeleccionadaId}`}
                        className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg ml-auto"
                      >
                        Abrir orden / generar informe final
                      </Link>
                    )}
                  </div>

                  {!ordenSeleccionadaId ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        Elige una orden arriba para ver su inventario completo.
                      </p>
                    </div>
                  ) : itemsOrdenSeleccionada.length === 0 ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">Esta orden aún no tiene inventario cargado.</p>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-3 mb-4">
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Total declarado (factura)</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {totalesOrdenSeleccionada.factura.toLocaleString("es-EC")}
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Total contado (etiquetas)</p>
                          <p className="text-[22px] font-semibold mt-1">
                            {totalesOrdenSeleccionada.contado.toLocaleString("es-EC")}
                          </p>
                        </div>
                        <div className="card p-3.5">
                          <p className="text-[11px] text-text-faint">Diferencia neta</p>
                          <p
                            className={`text-[22px] font-semibold mt-1 ${
                              totalesOrdenSeleccionada.contado - totalesOrdenSeleccionada.factura === 0
                                ? "text-[#6ee7b7]"
                                : "text-[#fbbf24]"
                            }`}
                          >
                            {(
                              totalesOrdenSeleccionada.contado - totalesOrdenSeleccionada.factura
                            ).toLocaleString("es-EC")}
                          </p>
                        </div>
                      </div>

                      <div className="card p-3 mb-4 flex gap-2">
                        <select
                          value={tipoBusqueda}
                          onChange={(e) => setTipoBusqueda(e.target.value as typeof tipoBusqueda)}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[170px] shrink-0"
                        >
                          <option value="todos">Todos los campos</option>
                          <option value="palet">Palet (exacto)</option>
                          <option value="codigo">Código</option>
                          <option value="descripcion">Descripción</option>
                          <option value="tallas">Talla</option>
                          <option value="composicion">Composición</option>
                          <option value="pais">País</option>
                        </select>
                        <input
                          value={busquedaInventario}
                          onChange={(e) => setBusquedaInventario(e.target.value)}
                          placeholder={
                            tipoBusqueda === "palet"
                              ? "Escribe el número de palet exacto, ej. 1…"
                              : "Escribe el texto a buscar…"
                          }
                          className="w-full card px-3 py-2 text-[12.5px] outline-none"
                        />
                      </div>

                      <div className="card overflow-hidden">
                        <div className="grid grid-cols-[70px_100px_110px_180px_170px_190px_100px_90px_90px_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                          <span>Palet</span>
                          <span>Cajas</span>
                          <span>Código</span>
                          <span>Descripción</span>
                          <span>Tallas</span>
                          <span>Composición</span>
                          <span>País</span>
                          <span className="text-right">Factura</span>
                          <span className="text-right">Contado</span>
                          <span className="text-right">Diferencia</span>
                        </div>
                        {itemsInventarioFiltrados.length === 0 ? (
                          <p className="text-[12.5px] text-text-faint p-5">
                            Ningún código coincide con la búsqueda.
                          </p>
                        ) : (
                          itemsInventarioFiltrados.map((it, i) => {
                            const dif = it.cantidad_contada - it.cantidad_factura;
                            return (
                              <div
                                key={i}
                                className="grid grid-cols-[70px_100px_110px_180px_170px_190px_100px_90px_90px_90px] gap-3 px-5 py-2.5 items-start border-b border-border last:border-b-0 text-[12.5px]"
                              >
                                <span className="text-text-dim pt-0.5">{it.palet ?? "—"}</span>
                                <span className="text-text-dim leading-snug font-mono text-[11px]">
                                  {it.cajas ?? "—"}
                                </span>
                                <span className="font-medium pt-0.5">{it.codigo ?? "—"}</span>
                                <span className="text-text-dim pt-0.5">{it.descripcion ?? "—"}</span>
                                <span className="text-text-dim text-[11px] font-mono leading-snug">
                                  {formatoTallas(it.tallas_detalle)}
                                </span>
                                <span className="text-text-dim leading-snug">{it.composicion ?? "—"}</span>
                                <span className="text-text-dim pt-0.5">{it.pais ?? "—"}</span>
                                <span className="text-right pt-0.5">{it.cantidad_factura}</span>
                                <span className="text-right pt-0.5">{it.cantidad_contada}</span>
                                <span
                                  className={`text-right font-medium pt-0.5 ${
                                    dif === 0 ? "text-[#6ee7b7]" : dif < 0 ? "text-[#fca5a5]" : "text-[#fbbf24]"
                                  }`}
                                >
                                  {dif > 0 ? `+${dif}` : dif}
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
