import { useState, createContext, useContext, useCallback, type ReactNode } from 'react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextValue {
  showToast: (message: string, type?: Toast['type']) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div style={{ position: 'fixed', bottom: 'var(--sp-6)', right: 'var(--sp-6)', zIndex: 200, display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
        {toasts.map(t => (
          <div
            key={t.id}
            className="toast animate-fade-in"
            style={{
              borderColor: t.type === 'error' ? 'rgba(107,20,20,1)' : t.type === 'success' ? 'var(--hp-full)' : 'var(--c-gold-bdr)',
              boxShadow: t.type === 'error' ? 'var(--shadow-crimson)' : 'var(--shadow-gold)',
            }}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
