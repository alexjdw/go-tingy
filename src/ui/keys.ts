import { useEffect } from 'react';
import { Platform } from 'react-native';

interface KeyEvt {
  key: string;
  target?: { tagName?: string } | null;
  preventDefault?: () => void;
}
interface KeyTarget {
  addEventListener(type: 'keydown', fn: (e: KeyEvt) => void): void;
  removeEventListener(type: 'keydown', fn: (e: KeyEvt) => void): void;
}

export interface ArrowKeys {
  onLeft: () => void;
  onRight: () => void;
}

/**
 * The left and right arrow keys, on the web (a phone has no keys). Pass null to turn them off. Typing in a text field
 * is left alone. The handlers should be stable (`useCallback`), or the listener is replaced on every render.
 */
export function useArrowKeys(keys: ArrowKeys | null) {
  const onLeft = keys?.onLeft;
  const onRight = keys?.onRight;
  useEffect(() => {
    if (Platform.OS !== 'web' || !onLeft || !onRight) return;
    const doc = (globalThis as unknown as { document?: KeyTarget }).document;
    if (!doc) return;
    const onKey = (e: KeyEvt) => {
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') onLeft();
      else if (e.key === 'ArrowRight') onRight();
      else return;
      e.preventDefault?.(); // the page must not scroll sideways as well
    };
    doc.addEventListener('keydown', onKey);
    return () => doc.removeEventListener('keydown', onKey);
  }, [onLeft, onRight]);
}
