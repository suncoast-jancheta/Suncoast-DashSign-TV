import React, { createContext, useContext, useState, ReactNode } from 'react';
import { generateId } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = generateId();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`min-w-[300px] max-w-[420px] flex items-center justify-between gap-3 p-4 rounded-none shadow-lg border font-mono text-xs tracking-wide bg-suncoast-charcoal ${
                t.type === 'success'
                  ? 'border-emerald-500/60 text-emerald-300'
                  : t.type === 'error'
                    ? 'border-red-500/60 text-red-300'
                    : 'border-suncoast-gold/60 text-suncoast-cream'
              }`}
            >
              <span>{t.message}</span>
              <button onClick={() => setToasts((prev) => prev.filter((toast) => toast.id !== t.id))} className="text-white/80 hover:text-white">
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
}
