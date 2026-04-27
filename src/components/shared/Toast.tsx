import React, { useEffect } from 'react';
import { create } from 'zustand';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: ToastItem[];
  add: (message: string, type?: ToastType) => void;
  remove: (id: number) => void;
}

let toastId = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  add: (message, type = 'success') => {
    const id = ++toastId;
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 3500);
  },
  remove: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

export const toast = {
  success: (msg: string) => useToastStore.getState().add(msg, 'success'),
  error:   (msg: string) => useToastStore.getState().add(msg, 'error'),
  warning: (msg: string) => useToastStore.getState().add(msg, 'warning'),
  info:    (msg: string) => useToastStore.getState().add(msg, 'info'),
};

const COLORS: Record<ToastType, { bg: string; border: string; color: string; icon: string }> = {
  success: { bg: 'rgba(0,212,160,0.12)',  border: 'rgba(0,212,160,0.3)',   color: '#00d4a0', icon: '✓' },
  error:   { bg: 'rgba(255,79,110,0.12)', border: 'rgba(255,79,110,0.3)',  color: '#ff4f6e', icon: '✕' },
  warning: { bg: 'rgba(245,197,66,0.12)', border: 'rgba(245,197,66,0.3)',  color: '#f5c542', icon: '⚠' },
  info:    { bg: 'rgba(91,141,238,0.12)', border: 'rgba(91,141,238,0.3)',  color: '#5b8dee', icon: 'i' },
};

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore(s => s.toasts);
  const remove = useToastStore(s => s.remove);

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 256, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none',
    }}>
      {toasts.map(t => {
        const c = COLORS[t.type];
        return (
          <div
            key={t.id}
            style={{
              background: 'var(--bg-overlay)', border: `1px solid ${c.border}`,
              borderLeft: `3px solid ${c.color}`, borderRadius: 'var(--r-md)',
              padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font-display)', fontSize: 13,
              boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
              animation: 'toastIn 0.2s ease',
              pointerEvents: 'all', minWidth: 260, maxWidth: 380,
            }}
          >
            <span style={{ color: c.color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{c.icon}</span>
            <span style={{ color: 'var(--text-primary)', flex: 1 }}>{t.message}</span>
            <button
              onClick={() => remove(t.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 0, flexShrink: 0 }}
            >×</button>
          </div>
        );
      })}
    </div>
  );
};
