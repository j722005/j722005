import React from 'react';
import { Inbox } from 'lucide-react';

export function EmptyState({
  icon: Icon = Inbox,
  title = 'No items found',
  description = 'There is currently no data available for this view.',
  actionText,
  onAction,
}) {
  return (
    <div className="card border-0 bg-light p-5 text-center my-4 rounded-4 shadow-sm">
      <div className="mx-auto mb-3 p-3 rounded-circle bg-white shadow-sm text-primary" style={{ width: 'fit-content' }}>
        <Icon size={36} strokeWidth={1.5} />
      </div>
      <h5 className="fw-bold text-dark mb-1">{title}</h5>
      <p className="text-muted small mx-auto mb-4" style={{ maxWidth: '420px' }}>
        {description}
      </p>
      {actionText && onAction && (
        <div>
          <button onClick={onAction} className="btn btn-primary px-4 py-2 rounded-3 shadow-sm">
            {actionText}
          </button>
        </div>
      )}
    </div>
  );
}

export default EmptyState;
