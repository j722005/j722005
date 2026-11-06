import React from 'react';

export function LoadingSpinner({ message = 'Loading...', size = 'default' }) {
  const spinnerClass = size === 'sm' ? 'spinner-border-sm' : '';

  return (
    <div className="d-flex flex-column align-items-center justify-content-center p-5 text-muted">
      <div className={`spinner-border text-primary ${spinnerClass}`} role="status">
        <span className="visually-hidden">Loading...</span>
      </div>
      {message && <p className="mt-3 mb-0 small fw-medium">{message}</p>}
    </div>
  );
}

export default LoadingSpinner;
