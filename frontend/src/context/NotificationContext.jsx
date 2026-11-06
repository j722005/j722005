import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const newNotif = { id, message, type };

    setNotifications((prev) => [...prev, newNotif]);

    if (duration > 0) {
      setTimeout(() => {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
      }, duration);
    }
    return id;
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const showSuccess = useCallback((msg) => addNotification(msg, 'success'), [addNotification]);
  const showError = useCallback((msg) => addNotification(msg, 'danger'), [addNotification]);
  const showWarning = useCallback((msg) => addNotification(msg, 'warning'), [addNotification]);
  const showInfo = useCallback((msg) => addNotification(msg, 'info'), [addNotification]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        showSuccess,
        showError,
        showWarning,
        showInfo,
      }}
    >
      {children}
      {/* Toast Notification Container */}
      <div
        className="toast-container position-fixed top-0 end-0 p-3"
        style={{ zIndex: 9999, maxWidth: '420px', width: '100%' }}
      >
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`alert alert-${n.type === 'error' ? 'danger' : n.type} alert-dismissible fade show shadow-sm border-0 d-flex align-items-center mb-2`}
            role="alert"
          >
            <div className="flex-grow-1 text-break pe-2">{n.message}</div>
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={() => removeNotification(n.id)}
            />
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
}

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
}
