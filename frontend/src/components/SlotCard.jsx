import React from 'react';
import {
  Car,
  Bike,
  Zap,
  Wrench,
  Clock,
  CheckCircle,
  Shield,
  Sun,
  Layers,
} from 'lucide-react';
import StatusBadge from './StatusBadge';

export function SlotCard({ slot, onSelect, isSelected = false }) {
  const getVehicleIcon = () => {
    switch (slot.slot_type) {
      case 'bike':
        return <Bike size={16} className="text-muted" aria-hidden="true" />;
      case 'ev':
        return <Zap size={16} className="text-warning" aria-hidden="true" />;
      case 'car':
      default:
        return <Car size={16} className="text-primary" aria-hidden="true" />;
    }
  };

  const getSlotTypeLabel = () => {
    switch (slot.slot_type) {
      case 'bike':
        return 'Bike';
      case 'ev':
        return 'EV Rapid';
      default:
        return 'Car';
    }
  };

  const isAvailable = slot.status === 'available' && slot.is_active;
  const isMaintenance = slot.status === 'maintenance' || !slot.is_active;
  const isOccupied = slot.status === 'occupied';
  const isReserved = slot.status === 'reserved';

  let borderClass = 'border-slate-200';
  let bgClass = 'bg-white';

  if (isSelected) {
    borderClass = 'border-primary ring-2 ring-primary ring-opacity-50 shadow-md';
    bgClass = 'bg-primary-subtle bg-opacity-20';
  } else if (isAvailable) {
    borderClass = 'border-emerald-subtle hover-border-emerald hover-shadow-sm';
  } else if (isOccupied) {
    borderClass = 'border-danger-subtle bg-danger-subtle/15';
  } else if (isReserved) {
    borderClass = 'border-warning-subtle bg-warning-subtle/15';
  } else if (isMaintenance) {
    borderClass = 'border-secondary-subtle bg-light text-muted opacity-75';
  }

  const accessibleLabel = `Slot ${slot.slot_number}, ${getSlotTypeLabel()} bay, Floor ${slot.floor || 'Ground'}, ${
    slot.is_covered ? 'Covered' : 'Open Air'
  }, Status: ${slot.status}${isSelected ? ', Selected' : ''}`;

  return (
    <div
      role="region"
      aria-label={accessibleLabel}
      className={`card rounded-4 p-3 transition-all slot-card-item position-relative d-flex flex-column h-100 ${borderClass} ${bgClass}`}
      style={{ minHeight: '160px' }}
    >
      {/* Top row: vehicle type and status badge */}
      <div className="d-flex align-items-center justify-content-between mb-2">
        <div className="d-flex align-items-center gap-1.5">
          {getVehicleIcon()}
          <span className="fw-semibold text-uppercase text-2xs text-muted">
            {getSlotTypeLabel()}
          </span>
        </div>
        <StatusBadge type="slot" status={slot.status} />
      </div>

      {/* Middle: Slot Number and Floor / Covered tags */}
      <div className="my-auto text-center py-1">
        <h4 className="fw-bold tracking-tight mb-1 text-dark font-monospace">
          {slot.slot_number}
        </h4>

        {/* Floor and Covered indicators when supported by backend data */}
        <div className="d-flex flex-wrap justify-content-center gap-1 mb-1">
          {slot.floor && (
            <span
              className="badge bg-light text-slate-700 border text-3xs py-0.5 px-1.5 d-inline-flex align-items-center gap-1"
              title={`Floor: ${slot.floor}`}
            >
              <Layers size={10} aria-hidden="true" /> {slot.floor}
            </span>
          )}
          {slot.is_covered !== undefined && (
            <span
              className={`badge text-3xs py-0.5 px-1.5 border d-inline-flex align-items-center gap-1 ${
                slot.is_covered
                  ? 'bg-primary-subtle text-primary border-primary-subtle'
                  : 'bg-amber-subtle text-amber-800 border-amber-subtle'
              }`}
              title={slot.is_covered ? 'Covered sheltered bay' : 'Open outdoor bay'}
            >
              {slot.is_covered ? (
                <>
                  <Shield size={10} aria-hidden="true" /> Covered
                </>
              ) : (
                <>
                  <Sun size={10} aria-hidden="true" /> Open
                </>
              )}
            </span>
          )}
        </div>

        {isOccupied && slot.current_booking && (
          <span className="text-3xs text-danger d-flex align-items-center justify-content-center gap-1 mt-1">
            <Clock size={11} aria-hidden="true" />
            Until {new Date(slot.current_booking.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>

      {/* Bottom CTA button */}
      <div className="mt-auto pt-2 border-top border-light">
        {isMaintenance ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary w-100 disabled text-xs py-1.5 rounded-3 d-flex align-items-center justify-content-center gap-1"
            disabled
            aria-disabled="true"
          >
            <Wrench size={13} aria-hidden="true" /> Out of Service
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelect(slot)}
            aria-pressed={isSelected}
            aria-label={`Select slot ${slot.slot_number} for reservation`}
            className={`btn btn-sm w-100 text-xs py-1.5 rounded-3 fw-medium d-flex align-items-center justify-content-center gap-1 shadow-none ${
              isSelected
                ? 'btn-dark'
                : isAvailable
                ? 'btn-primary'
                : 'btn-outline-primary'
            }`}
          >
            {isSelected ? (
              <>
                <CheckCircle size={13} aria-hidden="true" /> Selected Bay
              </>
            ) : isAvailable ? (
              <>
                <CheckCircle size={13} aria-hidden="true" /> Select Slot
              </>
            ) : (
              <>
                <Clock size={13} aria-hidden="true" /> Select Slot
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export default SlotCard;
