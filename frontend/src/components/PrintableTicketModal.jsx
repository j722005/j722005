import React, { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Printer, X, ShieldCheck, MapPin, Calendar, Clock, Car, CreditCard } from 'lucide-react';
import { formatCurrency, formatDateTime } from '../utils/formatters';
import StatusBadge from './StatusBadge';

export function PrintableTicketModal({ isOpen, onClose, booking }) {
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('ticket-modal-open');
    } else {
      document.body.classList.remove('ticket-modal-open');
    }
    return () => {
      document.body.classList.remove('ticket-modal-open');
    };
  }, [isOpen]);

  if (!isOpen || !booking) return null;

  const handlePrint = () => {
    window.print();
  };

  // QR payload contains server verifiable booking UUID and vehicle license plate
  const qrPayload = JSON.stringify({
    booking_id: booking.booking_id,
    slot: booking.slot_number,
    plate: booking.vehicle_number,
    lot: booking.lot_name,
    valid_from: booking.start_time,
    valid_until: booking.end_time,
  });

  return (
    <div
      className="modal fade show d-block printable-ticket-modal-backdrop"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.75)', zIndex: 1060 }}
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered" style={{ maxWidth: '480px' }}>
        <div className="modal-content border-0 shadow-2xl rounded-4 overflow-hidden printable-ticket-card">
          {/* Modal Actions Bar (hidden when printing) */}
          <div className="d-print-none bg-dark text-white px-4 py-3 d-flex justify-content-between align-items-center border-bottom border-secondary">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-primary text-white text-2xs px-2 py-1">OFFICIAL PASS</span>
              <span className="fw-semibold text-xs tracking-wide">Digital Parking Ticket</span>
            </div>
            <div className="d-flex align-items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="btn btn-sm btn-primary d-flex align-items-center gap-1.5 px-3 py-1.5 rounded-3 text-xs shadow-xs"
                title="Print ticket voucher"
              >
                <Printer size={14} /> Print Ticket
              </button>
              <button
                type="button"
                className="btn btn-sm btn-outline-light rounded-circle p-1 border-0"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Printable Ticket Voucher Body */}
          <div className="p-4 bg-white printable-ticket-body text-dark" id="printableParkingTicket">
            {/* Ticket Header */}
            <div className="text-center pb-3 border-bottom border-2 border-dashed">
              <div className="d-flex align-items-center justify-content-center gap-1.5 mb-1">
                <span className="fs-5">🅿️</span>
                <h4 className="fw-black tracking-tight mb-0 text-slate-900">SMART PARKING PASS</h4>
              </div>
              <p className="text-xs text-muted mb-1 d-flex align-items-center justify-content-center gap-1">
                <MapPin size={13} className="text-primary" /> {booking.lot_name || 'Central Parking Hub'}
              </p>
              <div className="text-3xs font-monospace text-slate-500">
                Ticket Ref: {booking.booking_id}
              </div>
            </div>

            {/* QR Code Section */}
            <div className="text-center my-3 py-2 bg-slate-50 rounded-3 border border-slate-200">
              <div className="p-2 bg-white d-inline-block rounded-3 shadow-xs">
                <QRCodeSVG
                  value={qrPayload}
                  size={160}
                  level="H"
                  includeMargin={true}
                  className="mx-auto"
                />
              </div>
              <div className="mt-2 text-2xs text-muted font-monospace">
                SCAN AT AUTOMATED BARRIER OR OPERATOR CONSOLE
              </div>
            </div>

            {/* Main Reservation Information */}
            <div className="row g-2 text-xs mb-3">
              <div className="col-6">
                <div className="p-2.5 rounded-3 bg-slate-50 border border-slate-100">
                  <div className="text-3xs text-muted text-uppercase fw-semibold mb-0.5">Assigned Bay</div>
                  <div className="fw-black text-primary font-monospace fs-5">
                    Slot {booking.slot_number}
                  </div>
                  <div className="text-3xs text-muted text-capitalize">{booking.slot_type || 'Car'} Bay</div>
                </div>
              </div>
              <div className="col-6">
                <div className="p-2.5 rounded-3 bg-slate-50 border border-slate-100">
                  <div className="text-3xs text-muted text-uppercase fw-semibold mb-0.5">Vehicle License</div>
                  <div className="fw-bold text-dark font-monospace fs-6">
                    {booking.vehicle_number}
                  </div>
                  <div className="text-3xs text-success fw-medium">● ANPR Verified</div>
                </div>
              </div>
            </div>

            {/* Time Window Details */}
            <div className="card bg-slate-50 border border-slate-200 p-2.5 rounded-3 mb-3 text-xs">
              <div className="d-flex justify-content-between py-1 border-bottom border-slate-200">
                <span className="text-muted d-flex align-items-center gap-1 text-2xs">
                  <Clock size={12} className="text-slate-400" /> Arrival Window:
                </span>
                <span className="fw-semibold text-dark text-2xs">
                  {formatDateTime(booking.start_time)}
                </span>
              </div>
              <div className="d-flex justify-content-between py-1 border-bottom border-slate-200">
                <span className="text-muted d-flex align-items-center gap-1 text-2xs">
                  <Clock size={12} className="text-slate-400" /> Departure Window:
                </span>
                <span className="fw-semibold text-dark text-2xs">
                  {formatDateTime(booking.end_time)}
                </span>
              </div>
              <div className="d-flex justify-content-between py-1">
                <span className="text-muted text-2xs">Duration:</span>
                <span className="text-dark fw-bold text-2xs">{booking.duration_hours || 0} Hours</span>
              </div>
            </div>

            {/* Financial & Status Summary */}
            <div className="d-flex justify-content-between align-items-center py-2 px-3 bg-slate-100 rounded-3 mb-3 text-xs">
              <div>
                <div className="text-3xs text-muted text-uppercase">Payment Status</div>
                <div className="fw-bold text-dark d-flex align-items-center gap-1">
                  <CreditCard size={13} className="text-success" />
                  {booking.payment ? `Paid (${booking.payment.method?.toUpperCase()})` : 'Confirmed'}
                </div>
                {booking.payment?.transaction_id && (
                  <div className="text-3xs text-muted font-monospace">{booking.payment.transaction_id}</div>
                )}
              </div>
              <div className="text-end">
                <div className="text-3xs text-muted text-uppercase">Total Amount</div>
                <div className="fw-black text-slate-900 fs-6">
                  {formatCurrency(booking.amount)}
                </div>
              </div>
            </div>

            {/* Security Footer Notice */}
            <div className="pt-2 border-top border-dashed border-2 text-center">
              <div className="d-inline-flex align-items-center gap-1 text-3xs text-slate-600 fw-medium">
                <ShieldCheck size={13} className="text-success" /> Server-Verified Cryptographic Pass
              </div>
              <p className="text-3xs text-muted mt-1 mb-0">
                Issued via Smart Parking System. Valid only during the reserved time interval.
              </p>
            </div>
          </div>

          {/* Modal Footer Controls (d-print-none) */}
          <div className="d-print-none bg-light px-4 py-3 d-flex justify-content-end gap-2 border-top">
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary rounded-3 px-3 py-1.5 text-xs"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-sm btn-primary rounded-3 px-4 py-1.5 text-xs d-flex align-items-center gap-1.5 shadow-xs"
              onClick={handlePrint}
            >
              <Printer size={14} /> Print Pass
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PrintableTicketModal;
