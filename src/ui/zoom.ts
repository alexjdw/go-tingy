import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Point } from '../sgf/parser';
import type { Viewport } from '../go/viewport';

/** Width/height (in intersections) of the zoomed window. */
export const ZOOM_SPAN = 9;

type Mode = 'off' | 'armed' | 'zoomed';

/**
 * One-shot click-to-zoom. Press "z" (web) or the Zoom button -> "armed"; the next tap picks the area ->
 * "zoomed"; the tap after that places a stone and returns to the full view.
 */
export function useZoom(base: Viewport) {
  const [mode, setMode] = useState<Mode>('off');
  const [zoomView, setZoomView] = useState<Viewport | null>(null);

  const canZoom = base.x1 - base.x0 + 1 > ZOOM_SPAN || base.y1 - base.y0 + 1 > ZOOM_SPAN;

  const reset = useCallback(() => {
    setMode('off');
    setZoomView(null);
  }, []);

  const toggle = useCallback(() => {
    setMode((m) => (m === 'off' ? 'armed' : 'off'));
    setZoomView(null);
  }, []);

  const zoomTo = useCallback(
    (p: Point) => {
      const w = Math.min(ZOOM_SPAN, base.x1 - base.x0 + 1);
      const h = Math.min(ZOOM_SPAN, base.y1 - base.y0 + 1);
      const x0 = Math.max(base.x0, Math.min(p.x - (w >> 1), base.x1 - w + 1));
      const y0 = Math.max(base.y0, Math.min(p.y - (h >> 1), base.y1 - h + 1));
      setZoomView({ x0, x1: x0 + w - 1, y0, y1: y0 + h - 1 });
      setMode('zoomed');
    },
    [base],
  );

  useEffect(() => {
    if (Platform.OS !== 'web' || !canZoom) return;
    const doc = (globalThis as unknown as { document?: KeyTarget }).document;
    if (!doc) return;
    const onKey = (e: KeyEvt) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'z' || e.key === 'Z') toggle();
      else if (e.key === 'Escape') reset();
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [canZoom, toggle, reset]);

  return { view: mode === 'zoomed' && zoomView ? zoomView : base, mode, canZoom, toggle, zoomTo, reset };
}

export type Zoom = ReturnType<typeof useZoom>;

// The slice of the DOM used for the "z" shortcut (this file also loads on native, where there is no DOM).
interface KeyEvt {
  key: string;
  target?: { tagName?: string } | null;
}
interface KeyTarget {
  addEventListener(type: 'keydown', fn: (e: KeyEvt) => void): void;
  removeEventListener(type: 'keydown', fn: (e: KeyEvt) => void): void;
}

/**
 * Handle a board tap: while armed, the tap chooses the zoom area (and does nothing else); while zoomed,
 * the tap goes through to `onPlay` and the view returns to normal. Call this from the tap handler.
 */
export function zoomedTap(zoom: Zoom, p: Point, onPlay: (p: Point) => void) {
  if (zoom.mode === 'armed') {
    zoom.zoomTo(p);
    return;
  }
  const wasZoomed = zoom.mode === 'zoomed';
  onPlay(p);
  if (wasZoomed) zoom.reset();
}
