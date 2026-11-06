import React from 'react';

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'primary',
  badgeText,
  badgeType = 'success',
}) {
  return (
    <div className="card border-0 shadow-sm rounded-4 h-100 p-3 stat-card-hover transition-all">
      <div className="card-body p-2 d-flex align-items-start justify-content-between">
        <div>
          <span className="text-muted text-uppercase fw-semibold" style={{ fontSize: '0.75rem', letterSpacing: '0.5px' }}>
            {title}
          </span>
          <h3 className="fw-bold text-dark mt-1 mb-1 tracking-tight">{value}</h3>
          {subtitle && <p className="text-muted small mb-0">{subtitle}</p>}
        </div>
        {Icon && (
          <div
            className={`p-3 rounded-4 bg-${color}-subtle text-${color} d-flex align-items-center justify-content-center shadow-xs`}
            style={{ width: '48px', height: '48px' }}
          >
            <Icon size={22} />
          </div>
        )}
      </div>
      {badgeText && (
        <div className="mt-2 pt-2 border-top border-light d-flex align-items-center justify-content-between">
          <span className={`badge bg-${badgeType}-subtle text-${badgeType} small fw-medium`}>
            {badgeText}
          </span>
        </div>
      )}
    </div>
  );
}

export default StatsCard;
