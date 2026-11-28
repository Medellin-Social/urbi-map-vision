import { useState } from "react";
import { useT, useLang } from "@/lib/i18n";
import { C } from "./_kit";
import { useVistasGuardadas, useActualizarVista, useEliminarVista } from "@/hooks/useRealtorDashboard";
import type { VistaGuardada } from "@/lib/realtorApi";

// Tabla bajo la comparación/simulación: dos segmentos — ⭐ Guardados y 🕘 Historial.
// El historial se registra solo en cada corrida (ver auto-log en los tabs). "Guardar"
// promueve una fila del historial a guardada (con nombre). Borrar pide confirmación
// (no un ✕ suelto). Todo es/en vía useT.
export function VistasTabla({ tipo, onOpen, filterModo }: {
  tipo: "comparador" | "simulador";
  onOpen: (v: VistaGuardada) => void;
  filterModo?: string;
}) {
  const t = useT();
  const { lang } = useLang();
  const { data: all = [] } = useVistasGuardadas(tipo);
  const actualizar = useActualizarVista(tipo);
  const eliminar = useEliminarVista(tipo);
  const [editId, setEditId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");

  const vistas = filterModo ? all.filter((v) => (v.payload as { modo?: string }).modo === filterModo) : all;
  const guardados = vistas.filter((v) => v.guardado);
  const historial = vistas.filter((v) => !v.guardado);

  const fechaStr = (iso: string) =>
    new Date(iso).toLocaleString(lang === "en" ? "en-US" : "es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  const abrirEdicion = (v: VistaGuardada) => { setEditId(v.id); setNombre(v.nombre ?? ""); };
  const confirmarGuardar = () => {
    const n = nombre.trim();
    if (!n || !editId) return;
    actualizar.mutate({ id: editId, patch: { guardado: true, nombre: n } }, { onSuccess: () => { setEditId(null); setNombre(""); } });
  };
  const borrar = (v: VistaGuardada) => {
    const etiqueta = v.nombre || t("esta vista", "this view");
    if (window.confirm(t(`¿Eliminar "${etiqueta}"? No se puede deshacer.`, `Delete "${etiqueta}"? This can't be undone.`))) {
      eliminar.mutate(v.id);
    }
  };

  const act = "inline-flex min-h-[30px] items-center rounded-lg px-2.5 text-[11.5px] font-semibold transition hover:opacity-85 disabled:opacity-50";

  const Fila = ({ v }: { v: VistaGuardada }) => (
    <tr style={{ borderTop: `1px solid ${C.line}` }}>
      <td className="py-2.5 pl-3 pr-2 align-middle">
        {editId === v.id ? (
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus value={nombre} maxLength={120}
              onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmarGuardar(); if (e.key === "Escape") { setEditId(null); setNombre(""); } }}
              placeholder={t("Ponle un nombre…", "Give it a name…")} aria-label={t("Nombre", "Name")}
              className="min-h-[32px] w-48 rounded-lg border px-2.5 text-[12.5px] outline-none focus:ring-2 focus:ring-primary/25"
              style={{ borderColor: C.line, color: C.ink, background: "#fff" }}
            />
            <button onClick={confirmarGuardar} disabled={!nombre.trim() || actualizar.isPending} className={`${act} text-white`} style={{ background: C.brand }}>
              {t("Guardar", "Save")}
            </button>
            <button onClick={() => { setEditId(null); setNombre(""); }} className={act} style={{ border: `1px solid ${C.line}`, color: C.sub }}>
              {t("Cancelar", "Cancel")}
            </button>
          </div>
        ) : (
          <button onClick={() => onOpen(v)} className="text-left text-[13px] font-semibold hover:underline" style={{ color: C.ink }} data-i18n-skip title={t("Abrir", "Open")}>
            {v.nombre || t("(sin nombre)", "(no name)")}
          </button>
        )}
      </td>
      <td className="py-2.5 px-2 align-middle text-[11.5px] tabular-nums whitespace-nowrap" style={{ color: C.muted }} data-i18n-skip>{fechaStr(v.created_at)}</td>
      <td className="py-2.5 pr-3 pl-2 align-middle">
        {editId === v.id ? null : (
          <div className="flex flex-wrap justify-end gap-1.5">
            <button onClick={() => onOpen(v)} className={act} style={{ border: `1px solid ${C.line}`, color: C.ink }}>{t("Abrir", "Open")}</button>
            {!v.guardado && (
              <button onClick={() => abrirEdicion(v)} className={`${act} text-white`} style={{ background: C.brand }}>⭐ {t("Guardar", "Save")}</button>
            )}
            <button onClick={() => borrar(v)} disabled={eliminar.isPending} className={act} style={{ border: `1px solid ${C.line}`, color: C.muted }}>{t("Eliminar", "Delete")}</button>
          </div>
        )}
      </td>
    </tr>
  );

  const Seccion = ({ titulo, rows }: { titulo: string; rows: VistaGuardada[] }) => (
    <div>
      <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: C.muted, background: C.soft, borderTop: `1px solid ${C.line}` }}>{titulo}</div>
      <table className="w-full border-collapse">
        <tbody>{rows.map((v) => <Fila key={v.id} v={v} />)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="overflow-hidden rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="px-3 pt-3 text-[13px] font-bold tracking-tight" style={{ color: C.ink }}>
        {t("Historial y guardados", "History & saved")}
      </div>
      {vistas.length === 0 ? (
        <p className="px-3 py-4 text-[12.5px]" style={{ color: C.muted }}>
          {tipo === "comparador"
            ? t("Aún no hay comparaciones. Las que hagas aparecerán aquí.", "No comparisons yet. The ones you run will show up here.")
            : t("Aún no hay simulaciones. Las que corras aparecerán aquí.", "No simulations yet. The ones you run will show up here.")}
        </p>
      ) : (
        <div className="mt-2">
          {guardados.length > 0 && <Seccion titulo={`⭐ ${t("Guardados", "Saved")}`} rows={guardados} />}
          {historial.length > 0 && <Seccion titulo={`🕘 ${t("Historial", "History")}`} rows={historial} />}
        </div>
      )}
    </div>
  );
}
