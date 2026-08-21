"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { createClient } from "@/lib/supabase-browser";
import { Printer, X } from "lucide-react";
import { ConfirmModal, Toast } from "@/components/Feedback";
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
  tallas: string[] | null;
};

type ItemEtq = {
  id: string;
  orden_id: string;
  palet: string | null;
  cajas: string | null;
  codigo: string | null;
  descripcion: string | null;
  marca: string | null;
  cantidad_contada: number;
  cantidad_factura: number;
  tallas_detalle: Record<string, number> | null;
  composicion: string | null;
  pais: string | null;
};

type VarianteEtq = {
  item_id: string;
  color: string | null;
  composicion: string | null;
  cajas: string | null;
  cantidad: number;
  tallas_detalle: Record<string, number> | null;
};

type TallasPorCaja = {
  id: string;
  item_id: string;
  variante_id: string | null;
  caja: string;
  numero_caja: string | null;
  tallas_detalle: Record<string, number> | null;
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
  { id: "inconsistencias", label: "Inconsistencias" },
] as const;

export default function ReportesEtiquetadoPage() {
  const supabase = createClient();

  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("resumen");
  const [ordenes, setOrdenes] = useState<OrdenEtq[]>([]);
  const [items, setItems] = useState<ItemEtq[]>([]);
  const [variantesTodas, setVariantesTodas] = useState<VarianteEtq[]>([]);
  const [tallasPorCajaTodas, setTallasPorCajaTodas] = useState<TallasPorCaja[]>([]);
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [mesas, setMesas] = useState<Mesa[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState<"todos" | "etyecu" | "externo">("todos");
  const [ordenSeleccionadaId, setOrdenSeleccionadaId] = useState<string>("");
  const [paletSeleccionado, setPaletSeleccionado] = useState<string>("todos");
  const [cajaFiltro, setCajaFiltro] = useState("");

  // Módulo de Inconsistencias
  const [tipoInconsistencia, setTipoInconsistencia] = useState<
    "todas" | "completo" | "faltante" | "sobrante"
  >(
    "todas"
  );
  const [busquedaInconsistencias, setBusquedaInconsistencias] = useState("");
  const [itemRevisarId, setItemRevisarId] = useState<string | null>(null);
  const [cajaEditId, setCajaEditId] = useState<string | null>(null);
  const [cajaEditTexto, setCajaEditTexto] = useState("");
  const [cajaEditTallas, setCajaEditTallas] = useState<Record<string, number>>({});
  const [cajaAEliminarId, setCajaAEliminarId] = useState<string | null>(null);
  const [busquedaInventario, setBusquedaInventario] = useState("");
  const [tipoBusqueda, setTipoBusqueda] = useState<
    "todos" | "codigo" | "descripcion" | "tallas" | "composicion" | "pais"
  >("todos");

  const cargar = useCallback(async () => {
    setLoading(true);
    const [ordRes, itemsRes, movRes, mesasRes, varRes, tallasCajaRes] = await Promise.all([
      supabase
        .from("etq_ordenes")
        .select("id, numero_etq, origen, cliente_nombre, tipo_producto, estado, fecha, creado_en, tallas"),
      supabase
        .from("etq_items")
        .select(
          "id, orden_id, palet, cajas, codigo, descripcion, marca, cantidad_contada, cantidad_factura, tallas_detalle, composicion, pais"
        ),
      supabase.from("etq_movimientos").select("orden_id, mesa_id, cantidad, creado_en"),
      supabase.from("etq_mesas").select("id, orden_id, nombre"),
      supabase.from("etq_variantes").select("item_id, color, composicion, cajas, cantidad, tallas_detalle"),
      supabase
        .from("etq_tallas_por_caja")
        .select("id, item_id, variante_id, caja, numero_caja, tallas_detalle"),
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
    setVariantesTodas((varRes.data as VarianteEtq[]) ?? []);
    setTallasPorCajaTodas((tallasCajaRes.data as TallasPorCaja[]) ?? []);
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

  // Total de etiquetas a imprimir: suma de las cantidades dentro de cada talla
  function sumarTallasDetalle(detalle: Record<string, number> | null): number {
    if (!detalle) return 0;
    return Object.values(detalle).reduce((a, n) => a + Number(n || 0), 0);
  }

  // ¿El texto de cajas ("164(24) 165(24)" o "179 A 182(96)") contiene ese
  // número de caja exacto, suelto o dentro de un rango "A"?
  function textoContieneCaja(cajasTexto: string | null, numeroCaja: string): boolean {
    if (!cajasTexto || !numeroCaja) return false;
    const objetivo = Number(numeroCaja);
    if (Number.isNaN(objetivo)) return false;

    // Rango: "179 A 182(96)" -> caja 179,180,181,182
    const regexRango = /(\d+)\s*A\s*(\d+)\s*\(/gi;
    let match;
    while ((match = regexRango.exec(cajasTexto)) !== null) {
      const desde = Number(match[1]);
      const hasta = Number(match[2]);
      if (objetivo >= desde && objetivo <= hasta) return true;
    }

    // Números sueltos: "164(24) 165(24)" -> caja 164, 165
    const regexSuelto = /(\d+)\s*\(/g;
    while ((match = regexSuelto.exec(cajasTexto)) !== null) {
      if (Number(match[1]) === objetivo) return true;
    }
    return false;
  }

  // Filtro de búsqueda: código, descripción o tallas
  // Lista de palets disponibles en la orden (para el selector)
  const paletsDisponibles = useMemo(() => {
    const set = new Set(
      itemsOrdenSeleccionada.map((it) => (it.palet ?? "").trim()).filter(Boolean)
    );
    return Array.from(set).sort((a, b) => {
      const na = Number(a), nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [itemsOrdenSeleccionada]);

  // Paso 1: filtrar por el palet elegido
  const itemsDelPalet = useMemo(() => {
    if (paletSeleccionado === "todos") return itemsOrdenSeleccionada;
    return itemsOrdenSeleccionada.filter((it) => (it.palet ?? "").trim() === paletSeleccionado);
  }, [itemsOrdenSeleccionada, paletSeleccionado]);

  // Paso 2: dentro del palet, filtrar por número de caja exacto (tipo Excel)
  const itemsDeLaCaja = useMemo(() => {
    const caja = cajaFiltro.trim();
    if (!caja) return itemsDelPalet;
    return itemsDelPalet.filter((it) => textoContieneCaja(it.cajas, caja));
  }, [itemsDelPalet, cajaFiltro]);

  // Paso 3: búsqueda de texto libre (código, descripción, tallas, etc.)
  const itemsInventarioFiltrados = useMemo(() => {
    const q = busquedaInventario.trim().toLowerCase();
    if (!q) return itemsDeLaCaja;
    return itemsDeLaCaja.filter((it) => {
      const codigo = (it.codigo ?? "").toLowerCase();
      const marca = (it.marca ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      const tallas = formatoTallas(it.tallas_detalle).toLowerCase();
      const composicion = (it.composicion ?? "").toLowerCase();
      const pais = (it.pais ?? "").toLowerCase();

      if (tipoBusqueda === "codigo") return codigo.includes(q);
      if (tipoBusqueda === "descripcion") return descripcion.includes(q);
      if (tipoBusqueda === "tallas") return tallas.includes(q);
      if (tipoBusqueda === "composicion") return composicion.includes(q);
      if (tipoBusqueda === "pais") return pais.includes(q);

      return (
        codigo.includes(q) ||
        marca.includes(q) ||
        descripcion.includes(q) ||
        tallas.includes(q) ||
        composicion.includes(q) ||
        pais.includes(q)
      );
    });
  }, [itemsDeLaCaja, busquedaInventario, tipoBusqueda]);

  // Extrae SOLO la caja buscada del texto completo: "164(24) 165(24)" + "165"
  // -> "165(24)". Si no hay filtro de caja activo, muestra el texto completo.
  function textoCajaFiltrada(cajasTexto: string | null): string {
    if (!cajasTexto) return "—";
    const caja = cajaFiltro.trim();
    if (!caja) return cajasTexto;
    const objetivo = Number(caja);
    if (Number.isNaN(objetivo)) return cajasTexto;

    // Si viene de un rango "179 A 182(96)", se muestra el rango completo
    // (no se puede aislar solo un número dentro del rango).
    const regexRango = /(\d+)\s*A\s*(\d+)\s*\((\d+)\)/gi;
    let match;
    while ((match = regexRango.exec(cajasTexto)) !== null) {
      const desde = Number(match[1]);
      const hasta = Number(match[2]);
      if (objetivo >= desde && objetivo <= hasta) return match[0];
    }

    // Número suelto: extraer solo "165(24)"
    const regexSuelto = new RegExp(`\\b${objetivo}\\s*\\(\\d+\\)`, "g");
    const encontrado = cajasTexto.match(regexSuelto);
    return encontrado ? encontrado[0] : cajasTexto;
  }


  // tiene variantes). Así Isabel ve por separado cada color/composición con
  // su propio desglose de tallas, listo para saber qué imprimir de cada uno.
  type FilaInventario = {
    key: string;
    palet: string | null;
    codigo: string | null;
    marca: string | null;
    descripcion: string | null;
    color: string | null;
    composicion: string | null;
    pais: string | null;
    cajas: string | null;
    cantidad: number;
    tallasTexto: string;
    totalTallas: number;
    esVariante: boolean;
    sinDesgloseDeCaja: boolean; // true si hay filtro de caja pero no hay historial para esa caja
  };

  const filasInventario: FilaInventario[] = useMemo(() => {
    const filas: FilaInventario[] = [];
    const cajaActiva = cajaFiltro.trim();

    itemsInventarioFiltrados.forEach((it) => {
      const variantesDelItem = variantesTodas.filter((v) => v.item_id === it.id);
      if (variantesDelItem.length === 0) {
        // ¿Hay filtro de caja? Buscar el desglose específico de esa caja.
        // Si no existe (código capturado antes de tener este historial), se
        // muestra el TOTAL del código como respaldo — no es exacto de esa
        // caja puntual, pero es un número real y utilizable para imprimir.
        let tallasAMostrar = it.tallas_detalle;
        let sinDesglose = false;
        if (cajaActiva) {
          const registro = tallasPorCajaTodas.find(
            (t) => t.item_id === it.id && t.variante_id === null && t.numero_caja === cajaActiva
          );
          if (registro) {
            tallasAMostrar = registro.tallas_detalle;
          } else {
            sinDesglose = true; // se queda con el total del código (it.tallas_detalle)
          }
        }
        filas.push({
          key: it.id,
          palet: it.palet,
          codigo: it.codigo,
          marca: it.marca,
          descripcion: it.descripcion,
          color: null,
          composicion: it.composicion,
          pais: it.pais,
          cajas: it.cajas,
          cantidad: it.cantidad_contada,
          tallasTexto: formatoTallas(tallasAMostrar),
          totalTallas: sumarTallasDetalle(tallasAMostrar),
          esVariante: false,
          sinDesgloseDeCaja: sinDesglose,
        });
      } else {
        variantesDelItem.forEach((v, i) => {
          let tallasAMostrar = v.tallas_detalle;
          let sinDesglose = false;
          if (cajaActiva) {
            // Nota: como no guardamos el id real de la variante en este listado
            // (solo item_id + color), buscamos por item_id y comparamos la caja
            // de la variante para asociar el registro correcto.
            const registro = tallasPorCajaTodas.find(
              (t) =>
                t.item_id === it.id &&
                t.numero_caja === cajaActiva &&
                t.caja.trim() === (v.cajas ?? "").trim()
            );
            if (registro) {
              tallasAMostrar = registro.tallas_detalle;
            } else {
              sinDesglose = true; // se queda con el total de la variante (v.tallas_detalle)
            }
          }
          filas.push({
            key: `${it.id}-${i}`,
            palet: it.palet,
            codigo: it.codigo,
            marca: it.marca,
            descripcion: it.descripcion,
            color: v.color,
            composicion: v.composicion ?? it.composicion,
            pais: it.pais,
            cajas: v.cajas,
            cantidad: v.cantidad,
            tallasTexto: formatoTallas(tallasAMostrar),
            totalTallas: sumarTallasDetalle(tallasAMostrar),
            esVariante: true,
            sinDesgloseDeCaja: sinDesglose,
          });
        });
      }
    });
    return filas;
  }, [itemsInventarioFiltrados, variantesTodas, tallasPorCajaTodas, cajaFiltro]);

  const totalesOrdenSeleccionada = itemsOrdenSeleccionada.reduce(
    (acc, it) => ({
      factura: acc.factura + Number(it.cantidad_factura || 0),
      contado: acc.contado + Number(it.cantidad_contada || 0),
    }),
    { factura: 0, contado: 0 }
  );

  // ---- Módulo de Inconsistencias ----

  // Códigos de la orden seleccionada con diferencia contra factura
  // Todos los códigos con factura de la orden (completos e inconsistentes),
  // para que el filtro pueda mostrar cualquiera de los tres estados.
  const inconsistencias = useMemo(() => {
    return itemsOrdenSeleccionada
      .map((it) => ({ ...it, diferencia: it.cantidad_contada - it.cantidad_factura }))
      .filter((it) => it.cantidad_factura > 0);
  }, [itemsOrdenSeleccionada]);

  const inconsistenciasFiltradas = useMemo(() => {
    const q = busquedaInconsistencias.trim().toLowerCase();
    return inconsistencias.filter((it) => {
      if (tipoInconsistencia === "completo" && it.diferencia !== 0) return false;
      if (tipoInconsistencia === "faltante" && it.diferencia >= 0) return false;
      if (tipoInconsistencia === "sobrante" && it.diferencia <= 0) return false;
      if (!q) return true;
      const codigo = (it.codigo ?? "").toLowerCase();
      const descripcion = (it.descripcion ?? "").toLowerCase();
      const marca = (it.marca ?? "").toLowerCase();
      return codigo.includes(q) || descripcion.includes(q) || marca.includes(q);
    });
  }, [inconsistencias, tipoInconsistencia, busquedaInconsistencias]);

  const itemEnRevision = items.find((it) => it.id === itemRevisarId) ?? null;
  const tallasOrdenDeLaOrdenSeleccionada =
    ordenes.find((o) => o.id === ordenSeleccionadaId)?.tallas ?? [];

  // Todas las cajas registradas de ese código (del código simple Y de sus variantes)
  const cajasDelItemEnRevision: TallasPorCaja[] = useMemo(() => {
    if (!itemRevisarId) return [];
    return tallasPorCajaTodas.filter((t) => t.item_id === itemRevisarId);
  }, [itemRevisarId, tallasPorCajaTodas]);

  async function abrirRevisarCajas(itemId: string) {
    setItemRevisarId(itemId);
    setCajaEditId(null);
  }

  function abrirEditarCaja(reg: TallasPorCaja) {
    setCajaEditId(reg.id);
    setCajaEditTexto(reg.caja);
    setCajaEditTallas(reg.tallas_detalle ?? {});
  }

  // Recalcula y guarda el total del código (o variante) a partir de TODAS
  // sus cajas registradas, después de editar o eliminar una de ellas.
  async function recalcularTotalDesdeRegistros(itemId: string, varianteId: string | null) {
    const query = supabase
      .from("etq_tallas_por_caja")
      .select("caja, tallas_detalle")
      .eq("item_id", itemId);
    const { data: registros } = varianteId
      ? await query.eq("variante_id", varianteId)
      : await query.is("variante_id", null);

    const regs = (registros as { caja: string; tallas_detalle: Record<string, number> }[]) ?? [];
    const cajasTexto = regs.map((r) => r.caja).join(" ").trim();
    const tallasCombinadas: Record<string, number> = {};
    regs.forEach((r) => {
      Object.entries(r.tallas_detalle ?? {}).forEach(([talla, cant]) => {
        tallasCombinadas[talla] = (tallasCombinadas[talla] ?? 0) + Number(cant || 0);
      });
    });
    const nuevaCantidad = sumarCajasTexto(cajasTexto);

    if (varianteId) {
      await supabase
        .from("etq_variantes")
        .update({ cajas: cajasTexto || null, cantidad: nuevaCantidad, tallas_detalle: tallasCombinadas })
        .eq("id", varianteId);
    } else {
      await supabase
        .from("etq_items")
        .update({
          cajas: cajasTexto || null,
          cantidad_contada: nuevaCantidad,
          tallas_detalle: tallasCombinadas,
        })
        .eq("id", itemId);
    }
  }

  function sumarCajasTexto(texto: string): number {
    if (!texto) return 0;
    const nums = texto.match(/\((\d+)\)/g);
    if (!nums) return 0;
    return nums.reduce((a, n) => a + Number(n.replace(/[()]/g, "")), 0);
  }

  async function guardarEdicionCaja() {
    if (!cajaEditId || !itemRevisarId) return;
    const reg = cajasDelItemEnRevision.find((r) => r.id === cajaEditId);

    const { error } = await supabase
      .from("etq_tallas_por_caja")
      .update({ caja: cajaEditTexto.trim(), tallas_detalle: cajaEditTallas })
      .eq("id", cajaEditId);
    if (error) {
      setErrorMsg(error.message);
      return;
    }

    await recalcularTotalDesdeRegistros(itemRevisarId, reg?.variante_id ?? null);
    setCajaEditId(null);
    setToast("Caja actualizada.");
    cargar();
  }

  async function confirmarEliminarCaja() {
    if (!cajaAEliminarId || !itemRevisarId) return;
    const reg = cajasDelItemEnRevision.find(
      (r) => r.id === cajaAEliminarId
    );

    await supabase.from("etq_tallas_por_caja").delete().eq("id", cajaAEliminarId);
    await recalcularTotalDesdeRegistros(itemRevisarId, reg?.variante_id ?? null);
    setCajaAEliminarId(null);
    setToast("Caja eliminada y total recalculado.");
    cargar();
  }

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
                        setPaletSeleccionado("todos");
                        setCajaFiltro("");
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

                      {/* Selector de PALET + filtro de CAJA (para imprimir caja por caja) */}
                      <div className="card p-3 mb-3 flex items-center gap-3 flex-wrap">
                        <div>
                          <label className="text-[11px] text-text-faint block mb-1">Palet</label>
                          <select
                            value={paletSeleccionado}
                            onChange={(e) => {
                              setPaletSeleccionado(e.target.value);
                              setCajaFiltro("");
                            }}
                            className="card px-3 py-2 text-[12.5px] outline-none min-w-[140px]"
                          >
                            <option value="todos">Todos los palets</option>
                            {paletsDisponibles.map((p) => (
                              <option key={p} value={p}>
                                Palet {p}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[11px] text-text-faint block mb-1">
                            Caja (dentro del palet)
                          </label>
                          <input
                            value={cajaFiltro}
                            onChange={(e) => setCajaFiltro(e.target.value)}
                            placeholder="Ej. 1, 12…"
                            className="card px-3 py-2 text-[12.5px] outline-none w-[160px] font-mono"
                          />
                        </div>
                        {(paletSeleccionado !== "todos" || cajaFiltro) && (
                          <button
                            onClick={() => {
                              setPaletSeleccionado("todos");
                              setCajaFiltro("");
                            }}
                            className="text-[11.5px] text-text-faint hover:text-text underline self-end pb-2"
                          >
                            Limpiar palet/caja
                          </button>
                        )}
                        {cajaFiltro && (
                          <span className="text-[11px] text-[#fbbf24] self-end pb-2">
                            Mostrando la caja {cajaFiltro}. Donde dice <b>(total)</b> junto a las tallas,
                            ese código aún no tiene desglose exacto de esta caja y se muestra el total
                            completo del código.
                          </span>
                        )}
                      </div>

                      <div className="card p-3 mb-4 flex gap-2">
                        <select
                          value={tipoBusqueda}
                          onChange={(e) => setTipoBusqueda(e.target.value as typeof tipoBusqueda)}
                          className="card px-3 py-2 text-[12.5px] outline-none w-[170px] shrink-0"
                        >
                          <option value="todos">Todos los campos</option>
                          <option value="codigo">Código</option>
                          <option value="descripcion">Descripción</option>
                          <option value="tallas">Talla</option>
                          <option value="composicion">Composición</option>
                          <option value="pais">País</option>
                        </select>
                        <input
                          value={busquedaInventario}
                          onChange={(e) => setBusquedaInventario(e.target.value)}
                          placeholder="Escribe el texto a buscar (código, descripción, talla...)…"
                          className="w-full card px-3 py-2 text-[12.5px] outline-none"
                        />
                      </div>

                      <div className="card overflow-x-auto">
                        <div className="min-w-[1560px]">
                            <div className="grid grid-cols-[70px_100px_110px_90px_150px_90px_150px_170px_90px_90px_90px_120px_90px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                              <span>Palet</span>
                              <span>Cajas</span>
                              <span>Código</span>
                              <span>Marca</span>
                              <span>Descripción</span>
                              <span>Color</span>
                              <span>Tallas</span>
                              <span>Composición</span>
                              <span>País</span>
                              <span className="text-right">Factura</span>
                              <span className="text-right">Contado</span>
                              <span className="text-right">Total etiquetas</span>
                              <span className="text-right">Diferencia</span>
                            </div>
                            {filasInventario.length === 0 ? (
                              <p className="text-[12.5px] text-text-faint p-5">
                                Ningún código coincide con la búsqueda.
                              </p>
                            ) : (
                              filasInventario.map((f) => (
                                <div
                                  key={f.key}
                                  className={`grid grid-cols-[70px_100px_110px_90px_150px_90px_150px_170px_90px_90px_90px_120px_90px] gap-3 px-5 py-2.5 items-start border-b border-border last:border-b-0 text-[12.5px] ${
                                    f.esVariante ? "bg-amber/[0.03]" : ""
                                  }`}
                                >
                                  <span className="text-text-dim pt-0.5">{f.palet ?? "—"}</span>
                                  <span className="text-text-dim leading-snug font-mono text-[11px]">
                                    {textoCajaFiltrada(f.cajas)}
                                  </span>
                                  <span className="font-medium pt-0.5">{f.codigo ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.marca ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.descripcion ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">
                                    {f.esVariante ? (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber/[0.18] text-[#fbbf24]">
                                        {f.color ?? "—"}
                                      </span>
                                    ) : (
                                      "—"
                                    )}
                                  </span>
                                  <span
                                    className="text-text-dim text-[11px] font-mono leading-snug"
                                    title={
                                      f.sinDesgloseDeCaja
                                        ? "Total del código completo (aún no hay desglose exacto de esta caja)"
                                        : undefined
                                    }
                                  >
                                    {f.tallasTexto}
                                    {f.sinDesgloseDeCaja && (
                                      <span className="text-[9px] text-[#fbbf24] ml-1">(total)</span>
                                    )}
                                  </span>
                                  <span className="text-text-dim leading-snug">{f.composicion ?? "—"}</span>
                                  <span className="text-text-dim pt-0.5">{f.pais ?? "—"}</span>
                                  <span className="text-right pt-0.5 text-text-faint">
                                    {f.esVariante ? "—" : itemsInventarioFiltrados.find((it) => it.id === f.key)?.cantidad_factura}
                                  </span>
                                  <span className="text-right pt-0.5 font-medium">{f.cantidad}</span>
                                  <span className="text-right pt-0.5 font-semibold text-[#c4b8ff]">
                                    {f.totalTallas}
                                  </span>
                                  <span className="text-right pt-0.5">
                                    {f.esVariante ? (
                                      <span className="text-text-faint">—</span>
                                    ) : (
                                      (() => {
                                        const original = itemsInventarioFiltrados.find((it) => it.id === f.key);
                                        if (!original) return <span className="text-text-faint">—</span>;
                                        const dif = original.cantidad_contada - original.cantidad_factura;
                                        return (
                                          <span
                                            className={`font-medium ${
                                              dif === 0
                                                ? "text-[#6ee7b7]"
                                                : dif < 0
                                                ? "text-[#fca5a5]"
                                                : "text-[#fbbf24]"
                                            }`}
                                          >
                                            {dif > 0 ? `+${dif}` : dif}
                                          </span>
                                        );
                                      })()
                                    )}
                                  </span>
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      {variantesTodas.length > 0 && (
                        <p className="text-[11px] text-text-faint mt-2">
                          Las filas resaltadas son variantes de color/composición de un mismo código. Su
                          suma es la que cuadra contra la factura del código.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}

              {tab === "inconsistencias" && (
                <>
                  <div className="card p-3 mb-3">
                    <label className="text-[11px] text-text-faint block mb-1">Orden</label>
                    <select
                      value={ordenSeleccionadaId}
                      onChange={(e) => {
                        setOrdenSeleccionadaId(e.target.value);
                        setItemRevisarId(null);
                      }}
                      className="card px-3 py-2 text-[12.5px] outline-none min-w-[280px]"
                    >
                      <option value="">Selecciona una orden…</option>
                      {ordenesFiltradas.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.numero_etq} · {o.cliente_nombre ?? "—"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {!ordenSeleccionadaId ? (
                    <div className="card p-8 text-center">
                      <p className="text-[13px] text-text-faint">
                        Elige una orden arriba para ver sus inconsistencias.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="card p-3 mb-4 flex items-center gap-2 flex-wrap">
                        <select
                          value={tipoInconsistencia}
                          onChange={(e) =>
                            setTipoInconsistencia(e.target.value as typeof tipoInconsistencia)
                          }
                          className="card px-3 py-2 text-[12.5px] outline-none w-[160px] shrink-0"
                        >
                          <option value="todas">Todas</option>
                          <option value="completo">Solo completos</option>
                          <option value="faltante">Solo faltantes</option>
                          <option value="sobrante">Solo sobrantes</option>
                        </select>
                        <input
                          value={busquedaInconsistencias}
                          onChange={(e) => setBusquedaInconsistencias(e.target.value)}
                          placeholder="Buscar por código, descripción o marca…"
                          className="w-full card px-3 py-2 text-[12.5px] outline-none"
                        />
                      </div>

                      {inconsistenciasFiltradas.length === 0 ? (
                        <div className="card p-8 text-center">
                          <p className="text-[13px] text-text-faint">
                            {inconsistencias.length === 0
                              ? "Esta orden aún no tiene códigos con cantidad de factura registrada."
                              : "Ningún código coincide con el filtro."}
                          </p>
                        </div>
                      ) : (
                        <div className="card overflow-hidden">
                          <div className="grid grid-cols-[110px_1fr_100px_80px_80px_80px_120px] gap-3 px-5 py-3 text-[11px] uppercase tracking-wide text-text-faint border-b border-border">
                            <span>Código</span>
                            <span>Descripción</span>
                            <span>Marca</span>
                            <span className="text-right">Factura</span>
                            <span className="text-right">Contado</span>
                            <span className="text-right">Diferencia</span>
                            <span className="text-right">Acción</span>
                          </div>
                          {inconsistenciasFiltradas.map((it) => (
                            <div
                              key={it.id}
                              className="grid grid-cols-[110px_1fr_100px_80px_80px_80px_120px] gap-3 px-5 py-2.5 items-center border-b border-border last:border-b-0 text-[12.5px]"
                            >
                              <span className="font-medium">{it.codigo ?? "—"}</span>
                              <span className="text-text-dim truncate">{it.descripcion ?? "—"}</span>
                              <span className="text-text-dim truncate">{it.marca ?? "—"}</span>
                              <span className="text-right">{it.cantidad_factura}</span>
                              <span className="text-right">{it.cantidad_contada}</span>
                              <span
                                className={`text-right font-semibold ${
                                  it.diferencia === 0
                                    ? "text-[#6ee7b7]"
                                    : it.diferencia < 0
                                    ? "text-[#fca5a5]"
                                    : "text-[#fbbf24]"
                                }`}
                              >
                                {it.diferencia === 0
                                  ? "Completo"
                                  : it.diferencia > 0
                                  ? `+${it.diferencia}`
                                  : it.diferencia}
                              </span>
                              <span className="text-right">
                                <button
                                  onClick={() => abrirRevisarCajas(it.id)}
                                  className="text-[11.5px] text-[#c4b8ff] hover:underline"
                                >
                                  Revisar cajas →
                                </button>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Modal: Revisar cajas de un código con inconsistencia */}
      {itemRevisarId && itemEnRevision && (
        <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-[60] p-4 overflow-y-auto">
          <div className="card w-full max-w-[680px] my-6 p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-[16px] font-semibold">{itemEnRevision.codigo}</h2>
                <p className="text-[12px] text-text-dim">{itemEnRevision.descripcion}</p>
              </div>
              <button onClick={() => setItemRevisarId(null)} className="text-text-faint hover:text-text">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Factura</p>
                <p className="text-[16px] font-semibold">{itemEnRevision.cantidad_factura}</p>
              </div>
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Contado (total)</p>
                <p className="text-[16px] font-semibold">{itemEnRevision.cantidad_contada}</p>
              </div>
              <div className="card p-2.5 bg-white/[0.02]">
                <p className="text-[10px] text-text-faint">Diferencia</p>
                <p
                  className={`text-[16px] font-semibold ${
                    itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura < 0
                      ? "text-[#fca5a5]"
                      : "text-[#fbbf24]"
                  }`}
                >
                  {itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura > 0 ? "+" : ""}
                  {itemEnRevision.cantidad_contada - itemEnRevision.cantidad_factura}
                </p>
              </div>
            </div>

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red/10 border border-red/20 text-[12px] text-[#fca5a5]">
                {errorMsg}
              </div>
            )}

            <p className="text-[11.5px] font-semibold text-text-dim mb-2">
              Todas las cajas capturadas de este código ({cajasDelItemEnRevision.length})
            </p>

            {cajasDelItemEnRevision.length === 0 ? (
              <p className="text-[12px] text-amber mb-2">
                Este código no tiene historial de cajas individuales (se capturó antes de que
                existiera este detalle). Solo se puede editar el total desde el módulo de Inventario.
              </p>
            ) : (
              <div className="flex flex-col gap-2 mb-2">
                {cajasDelItemEnRevision.map((reg) =>
                  cajaEditId === reg.id ? (
                    <div key={reg.id} className="card p-3 border-accent-2/40">
                      <div className="mb-2">
                        <label className="text-[10.5px] text-text-faint block mb-1">Caja</label>
                        <input
                          value={cajaEditTexto}
                          onChange={(e) => setCajaEditTexto(e.target.value)}
                          className="w-full card px-2.5 py-1.5 text-[12.5px] outline-none font-mono"
                        />
                      </div>
                      <label className="text-[10.5px] text-text-faint block mb-1">Tallas</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {tallasOrdenDeLaOrdenSeleccionada.map((t) => (
                          <div key={t} className="flex flex-col items-center">
                            <span className="text-[9.5px] text-text-faint mb-0.5">{t}</span>
                            <input
                              value={cajaEditTallas[t] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setCajaEditTallas((prev) => {
                                  const nuevo = { ...prev };
                                  if (v === "" || Number(v) === 0) delete nuevo[t];
                                  else nuevo[t] = Number(v);
                                  return nuevo;
                                });
                              }}
                              type="number"
                              className="w-[48px] card px-1 py-1 text-[11.5px] outline-none text-center"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button
                          onClick={() => setCajaEditId(null)}
                          className="btn-secondary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={guardarEdicionCaja}
                          className="btn-primary text-[11.5px] font-semibold px-3 py-1.5 rounded-lg"
                        >
                          Guardar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={reg.id}
                      className="grid grid-cols-[110px_1fr_130px] gap-2 px-3 py-2 rounded-md bg-white/[0.03] items-center text-[12px]"
                    >
                      <span className="font-mono">{reg.caja}</span>
                      <span className="text-text-dim font-mono text-[11.5px]">
                        {formatoTallas(reg.tallas_detalle)}
                      </span>
                      <span className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => abrirEditarCaja(reg)}
                          className="text-[11px] px-2 py-1 rounded-md bg-accent/[0.15] text-[#c4b8ff] hover:bg-accent/[0.25]"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setCajaAEliminarId(reg.id)}
                          className="text-[11px] px-2 py-1 rounded-md bg-red/[0.15] text-[#fca5a5] hover:bg-red/[0.25]"
                        >
                          Eliminar
                        </button>
                      </span>
                    </div>
                  )
                )}
              </div>
            )}

            <p className="text-[10.5px] text-text-faint mt-2">
              Al editar o eliminar una caja, el total del código se recalcula automáticamente.
            </p>

            <div className="flex justify-end mt-3">
              <button
                onClick={() => setItemRevisarId(null)}
                className="btn-secondary text-[13px] font-semibold px-4 py-2 rounded-lg"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        abierto={cajaAEliminarId !== null}
        titulo="¿Eliminar esta caja?"
        mensaje="Se eliminará el registro de esta caja y el total del código se recalculará sin ella."
        onConfirmar={confirmarEliminarCaja}
        onCancelar={() => setCajaAEliminarId(null)}
      />
      <Toast mensaje={toast} onCerrar={() => setToast(null)} />
    </div>
  );
}
