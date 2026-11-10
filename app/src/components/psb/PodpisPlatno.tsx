import { useEffect, useRef, useState } from "react";

import { C, mix } from "../../lib/psb/theme";

/**
 * PLOCHA NA PODPIS — prst, Apple Pencil aj myš (Jerry, 10. 11. 2026: „musí
 * tam byť okno, do ktorého môžem kresliť perom na podpis, samozrejme musí to
 * fungovať prstom").
 *
 * Udalosti sú NATÍVNE a nepúšťajú sa ďalej (`stopPropagation`): Workspace
 * prepína karty vodorovným ťahom prsta a podpis je vodorovný ťah — bez toho
 * by sa pri podpise prepla karta. `touch-action: none` zastaví rolovanie
 * stránky pod perom.
 *
 * Výsledok je PNG na bielom pozadí (data URL), hrúbka čiary podľa prítlaku
 * pera; prst a myš majú strednú.
 */
export function PodpisPlatno({ onZmena, vyska = 200, predvolba }: {
  /** Aktuálny podpis ako data URL, alebo `null`, keď je plocha prázdna. */
  onZmena: (png: string | null) => void;
  vyska?: number;
  /** Hotový podpis na začiatok (napr. „použiť minulý“). */
  predvolba?: string | null;
}) {
  const obal = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tahy = useRef(0);
  const [prazdne, setPrazdne] = useState(true);
  const zmenaRef = useRef(onZmena);
  zmenaRef.current = onZmena;

  useEffect(() => {
    const c = cv.current, o = obal.current;
    if (!c || !o) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const d = window.devicePixelRatio || 1;
    const pripravit = () => {
      const r = o.getBoundingClientRect();
      c.width = Math.round(r.width * d);
      c.height = Math.round(r.height * d);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.setTransform(d, 0, 0, d, 0, 0);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#14241B";
      ctx.fillStyle = "#14241B";
    };
    pripravit();
    let kreslim = false;
    let posl = { x: 0, y: 0, p: 0.5 };
    const bod = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, p: e.pointerType === "pen" && e.pressure ? e.pressure : 0.5 };
    };
    const stop = (e: Event) => e.stopPropagation();
    const dole = (e: PointerEvent) => {
      e.preventDefault(); e.stopPropagation();
      kreslim = true;
      posl = bod(e);
      try { c.setPointerCapture(e.pointerId); } catch { /* staršie Safari */ }
      ctx.beginPath(); ctx.arc(posl.x, posl.y, 1.2, 0, Math.PI * 2); ctx.fill();
    };
    const pohyb = (e: PointerEvent) => {
      e.stopPropagation();
      if (!kreslim) return;
      e.preventDefault();
      const evs = typeof e.getCoalescedEvents === "function" ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const b = bod(ev);
        ctx.lineWidth = 1.4 + b.p * 2.6;
        ctx.beginPath(); ctx.moveTo(posl.x, posl.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        posl = b;
      }
    };
    const hore = (e: PointerEvent) => {
      e.stopPropagation();
      if (!kreslim) return;
      kreslim = false;
      tahy.current++;
      setPrazdne(false);
      zmenaRef.current(c.toDataURL("image/png"));
    };
    c.addEventListener("pointerdown", dole);
    c.addEventListener("pointermove", pohyb);
    c.addEventListener("pointerup", hore);
    c.addEventListener("pointercancel", hore);
    for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) c.addEventListener(t, stop, { passive: true });
    return () => {
      c.removeEventListener("pointerdown", dole);
      c.removeEventListener("pointermove", pohyb);
      c.removeEventListener("pointerup", hore);
      c.removeEventListener("pointercancel", hore);
      for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) c.removeEventListener(t, stop);
    };
  }, []);

  // Predvoľba (minulý podpis) sa vykreslí cez plochu, akoby bol nakreslený.
  useEffect(() => {
    const c = cv.current;
    if (!c || !predvolba) return;
    const ctx = c.getContext("2d");
    const im = new Image();
    im.onload = () => {
      if (!ctx) return;
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
      const m = Math.min(c.width / im.width, c.height / im.height);
      ctx.drawImage(im, (c.width - im.width * m) / 2, (c.height - im.height * m) / 2, im.width * m, im.height * m);
      ctx.restore();
      tahy.current = 1;
      setPrazdne(false);
      zmenaRef.current(c.toDataURL("image/png"));
    };
    im.src = predvolba;
  }, [predvolba]);

  const zmaz = () => {
    const c = cv.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    tahy.current = 0;
    setPrazdne(true);
    onZmena(null);
  };

  return (
    <div>
      <div
        ref={obal}
        style={{ position: "relative", height: vyska, borderRadius: 12, border: `1.5px dashed ${mix(C.green, 60)}`, background: "#FFFFFF", touchAction: "none", overflow: "hidden" }}
      >
        <div style={{ position: "absolute", left: 20, right: 20, bottom: 40, borderBottom: "1px solid #C9D4CC", pointerEvents: "none" }} />
        {prazdne && (
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 14, textAlign: "center", fontSize: 12, color: "#8A9A90", pointerEvents: "none" }}>
            podpíš sa prstom alebo perom
          </div>
        )}
        <canvas ref={cv} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", touchAction: "none", cursor: "crosshair" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
        <button
          type="button"
          onClick={zmaz}
          style={{ padding: "5px 11px", borderRadius: 7, fontSize: 12, cursor: "pointer", fontFamily: "inherit", border: `1px solid ${C.border}`, background: "transparent", color: C.textMuted }}
        >Zmazať podpis</button>
      </div>
    </div>
  );
}
