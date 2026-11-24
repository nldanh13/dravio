/**
 * Sự kiện vòng đời trang (GDD 3.1 trang 18; ADR 0010).
 * `onHide`: tab ẩn, cửa sổ thu nhỏ (visibilitychange → hidden), trang bị đóng băng (`freeze`) hoặc sắp đóng (`pagehide`).
 * `onShow`: tab hiện lại, trang được khôi phục (`resume`, `pageshow` từ bfcache).
 */
export function onPageLifecycle(
  handlers: { onHide: () => void; onShow: () => void },
  doc: Document = document,
  win: Window = window,
): () => void {
  const vis = () => (doc.visibilityState === 'hidden' ? handlers.onHide() : handlers.onShow());
  const hide = () => handlers.onHide();
  const show = () => {
    if (doc.visibilityState === 'visible') handlers.onShow();
  };
  doc.addEventListener('visibilitychange', vis);
  doc.addEventListener('freeze', hide);
  doc.addEventListener('resume', show);
  win.addEventListener('pagehide', hide);
  win.addEventListener('pageshow', show);
  return () => {
    doc.removeEventListener('visibilitychange', vis);
    doc.removeEventListener('freeze', hide);
    doc.removeEventListener('resume', show);
    win.removeEventListener('pagehide', hide);
    win.removeEventListener('pageshow', show);
  };
}

export function isPageVisible(doc: Document = document): boolean {
  return doc.visibilityState === 'visible';
}
