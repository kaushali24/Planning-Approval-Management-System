import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

const NotificationContext = createContext(null);

const typeConfig = {
  success: {
    icon: CheckCircle2,
    className: 'border-green-200 bg-green-50 text-green-900',
    iconClass: 'text-green-600',
    defaultTitle: 'Success',
  },
  error: {
    icon: AlertCircle,
    className: 'border-red-200 bg-red-50 text-red-900',
    iconClass: 'text-red-600',
    defaultTitle: 'Error',
  },
  warning: {
    icon: AlertTriangle,
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    iconClass: 'text-amber-600',
    defaultTitle: 'Warning',
  },
  info: {
    icon: Info,
    className: 'border-blue-200 bg-blue-50 text-blue-900',
    iconClass: 'text-blue-600',
    defaultTitle: 'Info',
  },
};

const ToastStack = ({ toasts, onClose }) => (
  <div
    aria-live="polite"
    aria-atomic="false"
    className="pointer-events-none fixed right-4 top-4 z-[100] flex w-full max-w-sm flex-col gap-3"
  >
    {toasts.map((toast) => {
      const cfg = typeConfig[toast.type] || typeConfig.info;
      const Icon = cfg.icon;
      return (
        <div
          key={toast.id}
          role={toast.type === 'error' ? 'alert' : 'status'}
          className={`pointer-events-auto rounded-xl border p-4 shadow-lg ${cfg.className}`}
        >
          <div className="flex items-start gap-3">
            <Icon className={`mt-0.5 h-5 w-5 ${cfg.iconClass}`} aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{toast.title || cfg.defaultTitle}</p>
              <p className="mt-1 text-sm break-words">{toast.message}</p>
            </div>
            <button
              type="button"
              onClick={() => onClose(toast.id)}
              className="rounded-md p-1 text-slate-500 hover:bg-white/60 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              aria-label="Dismiss notification"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      );
    })}
  </div>
);

export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const closeNotification = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((message, options = {}) => {
    if (!message) return;
    const {
      type = 'info',
      title,
      duration = type === 'error' ? 7000 : 4500,
    } = options;

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const toast = { id, type, title, message };

    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, duration);
    }
  }, []);

  const value = useMemo(() => ({
    notify,
    success: (message, options = {}) => notify(message, { ...options, type: 'success' }),
    error: (message, options = {}) => notify(message, { ...options, type: 'error' }),
    warning: (message, options = {}) => notify(message, { ...options, type: 'warning' }),
    info: (message, options = {}) => notify(message, { ...options, type: 'info' }),
  }), [notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <ToastStack toasts={toasts} onClose={closeNotification} />
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
};
