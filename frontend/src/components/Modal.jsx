import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = '550px',
}) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-backdrop-custom d-flex align-items-center justify-content-center p-3 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="card border-0 shadow-lg rounded-4 overflow-hidden w-100 modal-card-custom animate-scale-up"
        style={{ maxWidth }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className="card-header bg-white border-bottom border-light px-4 py-3 d-flex align-items-center justify-content-between">
          <div>
            <h5 className="modal-title fw-bold text-dark mb-0" id="modal-title">
              {title}
            </h5>
            {subtitle && <p className="text-muted small mb-0 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="btn btn-sm btn-light rounded-circle p-1.5 text-muted hover-dark"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="card-body px-4 py-3 modal-body-custom max-h-75vh overflow-y-auto">
          {children}
        </div>

        {footer && (
          <div className="card-footer bg-light border-top border-light px-4 py-3 d-flex align-items-center justify-content-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export default Modal;
