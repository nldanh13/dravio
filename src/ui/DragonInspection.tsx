import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '../i18n';
import { createInspectionRenderer, type InspectionRenderer } from '../rendering/inspection/inspectionRenderer';
import { wrapYaw } from '../rendering/inspection/emberlingMesh';
import fallbackUrl from '../assets/g0/emberling/baby_normal.svg?url';
import './dragonInspection.css';

/** Separate, read-only model viewer. No GameState commands, camera or save changes. */
export function DragonInspection() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<InspectionRenderer | null>(null);
  const currentYaw = useRef(0);
  const gesture = useRef<{ id: number; x: number; yaw: number } | null>(null);
  const [angle, setAngle] = useState(0);
  const [failed, setFailed] = useState(false);

  function rotate(value: number) {
    const next = wrapYaw(value);
    currentYaw.current = next;
    setAngle(next);
    renderer.current?.draw(next);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let active = true;
    let frame = 0;
    const fail = () => {
      if (active) setFailed(true);
    };
    const draw = () => renderer.current?.draw(currentYaw.current);
    const init = () => {
      if (!active) return;
      try {
        renderer.current?.dispose();
        renderer.current = createInspectionRenderer(canvas);
        draw();
        setFailed(false);
      } catch {
        renderer.current?.dispose();
        renderer.current = null;
        fail();
      }
    };
    const lost = (event: Event) => {
      event.preventDefault();
      renderer.current?.dispose();
      renderer.current = null;
      fail();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', init);
    frame = requestAnimationFrame(init);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw);
    observer?.observe(canvas);
    window.addEventListener('resize', draw);
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', draw);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', init);
      renderer.current?.dispose();
      renderer.current = null;
    };
  }, []);

  return (
    <section className="dragon-inspection" aria-label={t('inspect3d.title')}>
      <h4>{t('inspect3d.title')}</h4>
      <p className="muted">{t('inspect3d.prototype')}</p>
      <div className="inspection-stage">
        <canvas
          ref={canvasRef}
          data-testid="emberling-3d"
          aria-label={t('inspect3d.canvas')}
          className={failed ? 'inspection-canvas inspection-hidden' : 'inspection-canvas'}
          onPointerDown={(e) => {
            if (failed || !e.isPrimary || e.button !== 0) return;
            gesture.current = { id: e.pointerId, x: e.clientX, yaw: currentYaw.current };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const g = gesture.current;
            if (g && g.id === e.pointerId) rotate(g.yaw + (e.clientX - g.x) * 1.2);
          }}
          onPointerUp={() => { gesture.current = null; }}
          onPointerCancel={() => { gesture.current = null; }}
          onLostPointerCapture={() => { gesture.current = null; }}
        />
        {failed && <div className="inspection-fallback"><img src={fallbackUrl} alt={t('species.emberling')} width={240} height={200} /><p role="status">{t('inspect3d.unavailable')}</p></div>}
      </div>
      <div className="inspection-controls">
        <button type="button" disabled={failed} aria-label={t('inspect3d.left')} onClick={() => rotate(angle - 30)}>−30°</button>
        <label>{t('inspect3d.angle', { n: Math.round(angle) })}
          <input type="range" min={0} max={359} step={1} value={Math.floor(angle)} disabled={failed} onChange={(e) => rotate(Number(e.target.value))} />
        </label>
        <button type="button" disabled={failed} aria-label={t('inspect3d.right')} onClick={() => rotate(angle + 30)}>+30°</button>
        <button type="button" disabled={failed} onClick={() => rotate(0)}>{t('inspect3d.reset')}</button>
      </div>
    </section>
  );
}
