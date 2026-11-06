import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export function AlertMessage({
  type = 'danger',
  title = 'Something went wrong',
  message,
  onRetry,
}) {
  return (
    <div className={`alert alert-${type} d-flex align-items-start gap-3 shadow-sm border-0`} role="alert">
      <AlertCircle className="flex-shrink-0 mt-1" size={20} />
      <div className="flex-grow-1">
        {title && <h6 className="alert-heading fw-bold mb-1">{title}</h6>}
        {message && <div className="small mb-0">{message}</div>}
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn btn-sm btn-outline-dark d-flex align-items-center gap-1 flex-shrink-0"
        >
          <RefreshCw size={14} /> Retry
        </button>
      )}
    </div>
  );
}

export default AlertMessage;
