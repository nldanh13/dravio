/** Gọi `onHide` khi tab bị ẩn hoặc trang sắp đóng, để autosave flush (GDD 3.1 trang 18). */
export function onPageHide(onHide: () => void, doc: Document = document, win: Window = window): () => void {
  const vis = () => {
    if (doc.visibilityState === 'hidden') onHide();
  };
  doc.addEventListener('visibilitychange', vis);
  win.addEventListener('pagehide', onHide);
  return () => {
    doc.removeEventListener('visibilitychange', vis);
    win.removeEventListener('pagehide', onHide);
  };
}
