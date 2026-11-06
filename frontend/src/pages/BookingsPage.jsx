import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarCheck,
  Search,
  QrCode,
  AlertTriangle,
  Clock,
  ArrowRight,
  CreditCard,
  XCircle,
  RotateCw,
  AlertCircle,
  MapPin,
  CheckCircle2,
  X,
  FileText,
  ShieldCheck,
} from 'lucide-react';
import bookingService from '../services/bookingService';
import { useNotification } from '../context/NotificationContext';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import Modal from '../components/Modal';
import PrintableTicketModal from '../components/PrintableTicketModal';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function BookingsPage() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [cancelModalBooking, setCancelModalBooking] = useState(null);

  // Pay Pending Modal State
  const [payingBooking, setPayingBooking] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');

  const { showSuccess, showError } = useNotification();

  const loadBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bookingService.getMyBookings();
      setBookings(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load booking history.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          b.lot_name?.toLowerCase().includes(q) ||
          b.vehicle_number?.toLowerCase().includes(q) ||
          b.booking_id?.toLowerCase().includes(q) ||
          String(b.slot_number)?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [bookings, statusFilter, search]);

  const handleConfirmCancel = async () => {
    if (!cancelModalBooking) return;
    const bookingId = cancelModalBooking.booking_id;
    setCancellingId(bookingId);
    try {
      await bookingService.cancelBooking(bookingId);
      showSuccess(`Booking #${bookingId.substring(0, 8)} cancelled successfully. Slot has been released.`);
      setCancelModalBooking(null);
      await loadBookings();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to cancel booking.';
      showError(msg);
    } finally {
      setCancellingId(null);
    }
  };

  const handlePayPendingSubmit = async (e) => {
    e.preventDefault();
    if (!payingBooking) return;
    setSubmittingPayment(true);
    setPaymentError('');
    try {
      await bookingService.processPayment(payingBooking.booking_id, {
        method: paymentMethod,
      });
      showSuccess('Payment confirmed! Your slot reservation is now active.');
      setPayingBooking(null);
      await loadBookings();
    } catch (err) {
      setPaymentError(err?.response?.data?.message || err?.message || 'Payment failed.');
    } finally {
      setSubmittingPayment(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Fetching your real-time parking reservations from Django..." />;
  }

  return (
    <div className="bookings-page container-fluid px-0">
      {/* Page Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">My Bookings & Gate Passes</h2>
          <p className="text-muted small mb-0">
            View booking status, active gate entry passes, cancellation options, and payment receipts.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2 d-print-none">
          <button
            onClick={loadBookings}
            className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
            title="Refresh bookings from server"
          >
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <Link
            to="/lots"
            className="btn btn-primary rounded-3 px-3.5 py-2 text-xs d-flex align-items-center gap-2 shadow-xs"
          >
            <CalendarCheck size={15} /> Find & Reserve Parking
          </Link>
        </div>
      </div>

      {/* API Error Alert */}
      {error && (
        <div className="alert alert-danger shadow-sm rounded-4 p-4 mb-4 d-flex align-items-start gap-3" role="alert">
          <AlertCircle size={22} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-grow-1">
            <h6 className="fw-bold mb-1">Could Not Load Booking History</h6>
            <p className="text-xs mb-2">{error}</p>
            <button
              onClick={loadBookings}
              className="btn btn-sm btn-outline-danger rounded-3 px-3 py-1.5 text-xs d-inline-flex align-items-center gap-1"
            >
              <RotateCw size={13} /> Retry Loading Bookings
            </button>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white d-print-none">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-lg-5">
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                <Search size={15} />
              </span>
              <input
                type="text"
                className="form-control border-slate-300 shadow-none ps-2 text-xs"
                placeholder="Search by hub name, vehicle license plate, or booking ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="btn btn-light border-slate-300 text-muted"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="col-12 col-lg-7 d-flex flex-wrap justify-content-lg-end gap-1.5">
            {[
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active Now' },
              { id: 'confirmed', label: 'Confirmed' },
              { id: 'pending', label: 'Pending Hold' },
              { id: 'completed', label: 'Completed' },
              { id: 'cancelled', label: 'Cancelled' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
                  statusFilter === tab.id
                    ? 'btn-primary shadow-xs'
                    : 'btn-light border text-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bookings List Table */}
      {filteredBookings.length > 0 ? (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="bg-light">
                <tr className="text-muted text-2xs text-uppercase border-bottom">
                  <th className="ps-4">Parking Hub & Slot</th>
                  <th>Vehicle Number</th>
                  <th>Arrival & Departure Window</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th className="text-end pe-4 d-print-none">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => {
                  const now = new Date();
                  const startTime = new Date(b.start_time);
                  const isCancellable =
                    (b.status === 'confirmed' || b.status === 'pending') && startTime > now;

                  return (
                    <tr key={b.id || b.booking_id}>
                      <td className="ps-4">
                        <div className="fw-semibold text-dark">{b.lot_name}</div>
                        <div className="d-flex align-items-center gap-1.5 mt-0.5">
                          <span className="badge bg-primary text-white text-2xs font-monospace">
                            Slot {b.slot_number}
                          </span>
                          <span className="badge bg-light text-muted border text-3xs text-uppercase">
                            {b.slot_type}
                          </span>
                          <span className="text-muted text-3xs">
                            Ref: {b.booking_id?.substring(0, 8)}...
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className="font-monospace fw-bold text-dark text-xs px-2.5 py-1 bg-light border rounded-2 d-inline-block">
                          {b.vehicle_number}
                        </span>
                      </td>

                      <td>
                        <div className="text-xs text-dark fw-medium">
                          {formatDateTime(b.start_time)}
                        </div>
                        <div className="text-2xs text-muted">
                          until {formatDateTime(b.end_time)} ({b.duration_hours || 0} hrs)
                        </div>
                      </td>

                      <td>
                        <StatusBadge type="booking" status={b.status} />
                      </td>

                      <td>
                        <div className="fw-bold text-dark">{formatCurrency(b.amount)}</div>
                        {b.payment ? (
                          <div className="text-3xs text-success d-flex align-items-center gap-1">
                            ● Paid via {b.payment.method?.toUpperCase()}
                          </div>
                        ) : b.status === 'pending' ? (
                          <div className="text-3xs text-warning-emphasis fw-semibold">
                            Hold Pending
                          </div>
                        ) : null}
                      </td>

                      <td className="text-end pe-4 d-print-none">
                        <div className="d-flex align-items-center justify-content-end gap-1.5">
                          {/* QR Entry Pass Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedBooking(b)}
                            className="btn btn-sm btn-outline-dark rounded-3 px-2.5 py-1 text-xs d-inline-flex align-items-center gap-1"
                            title="View Gate Pass QR code"
                          >
                            <QrCode size={13} /> Pass
                          </button>

                          {/* Complete Payment Button if Pending */}
                          {b.status === 'pending' && !b.is_hold_expired && (
                            <button
                              type="button"
                              onClick={() => {
                                setPayingBooking(b);
                                setPaymentError('');
                              }}
                              className="btn btn-sm btn-success rounded-3 px-2.5 py-1 text-xs d-inline-flex align-items-center gap-1 shadow-xs"
                              title="Pay hold amount"
                            >
                              <CreditCard size={13} /> Pay Now
                            </button>
                          )}

                          {/* Cancel Booking Action */}
                          {isCancellable && (
                            <button
                              type="button"
                              onClick={() => setCancelModalBooking(b)}
                              disabled={cancellingId === b.booking_id}
                              className="btn btn-sm btn-outline-danger rounded-3 px-2.5 py-1 text-xs d-inline-flex align-items-center gap-1"
                              title="Cancel parking reservation"
                            >
                              <XCircle size={13} /> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CalendarCheck}
          title="No reservations match your filter"
          description={
            statusFilter !== 'all' || search.trim() !== ''
              ? 'No bookings match your active status or search query. Try resetting your search.'
              : 'You have not made any parking reservations yet. Find an available slot in seconds!'
          }
          actionText={
            statusFilter !== 'all' || search.trim() !== ''
              ? 'Reset Filters'
              : 'Find Parking Hub'
          }
          onAction={() => {
            setStatusFilter('all');
            setSearch('');
          }}
        />
      )}

      {/* Cancellation Confirmation Modal with Rules (Requirement 6) */}
      {cancelModalBooking && (
        <Modal
          isOpen={!!cancelModalBooking}
          onClose={() => setCancelModalBooking(null)}
          title="Confirm Cancellation"
          subtitle={`Booking Reference: ${cancelModalBooking.booking_id}`}
        >
          <div className="py-2">
            <div className="alert alert-warning py-2.5 px-3 small rounded-3 mb-3 d-flex align-items-center gap-2">
              <AlertTriangle size={18} className="flex-shrink-0 text-warning-emphasis" />
              <div>
                Are you sure you want to cancel your reservation for <strong>Slot {cancelModalBooking.slot_number}</strong> at <strong>{cancelModalBooking.lot_name}</strong>?
              </div>
            </div>

            <div className="card bg-slate-50 border p-3 rounded-3 mb-3 text-xs">
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Vehicle License Plate</span>
                <span className="font-monospace text-dark fw-bold">{cancelModalBooking.vehicle_number}</span>
              </div>
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Reserved Time</span>
                <span className="text-dark">{formatDateTime(cancelModalBooking.start_time)}</span>
              </div>
              <div className="d-flex justify-content-between py-1">
                <span className="text-muted">Refund Amount</span>
                <strong className="text-success">{formatCurrency(cancelModalBooking.amount)}</strong>
              </div>
            </div>

            <div className="alert alert-info py-2 px-3 small rounded-3 mb-4 text-3xs">
              <ShieldCheck size={14} className="me-1 text-primary d-inline" />
              <strong>Policy:</strong> As your scheduled arrival time has not commenced, your slot will be immediately freed for other drivers and full refund credited.
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                onClick={() => setCancelModalBooking(null)}
                disabled={cancellingId === cancelModalBooking.booking_id}
                className="btn btn-outline-secondary w-50 py-2 rounded-3 text-xs"
              >
                Keep Reservation
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancellingId === cancelModalBooking.booking_id}
                className="btn btn-danger w-50 py-2 rounded-3 text-xs fw-medium shadow-xs d-flex align-items-center justify-content-center gap-1.5"
              >
                {cancellingId === cancelModalBooking.booking_id ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Cancelling...
                  </>
                ) : (
                  <>
                    <XCircle size={14} /> Yes, Cancel Booking
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Pay Pending Hold Modal */}
      {payingBooking && (
        <Modal
          isOpen={!!payingBooking}
          onClose={() => setPayingBooking(null)}
          title="Complete Slot Payment"
          subtitle={`Slot ${payingBooking.slot_number} · ${payingBooking.lot_name}`}
        >
          <form onSubmit={handlePayPendingSubmit} className="py-2">
            {paymentError && (
              <div className="alert alert-danger py-2 px-3 small rounded-3 mb-3">
                {paymentError}
              </div>
            )}

            <div className="card bg-slate-50 border p-3 rounded-3 mb-3 text-xs">
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Parking Hub</span>
                <strong className="text-dark">{payingBooking.lot_name}</strong>
              </div>
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Vehicle License Plate</span>
                <span className="font-monospace text-dark">{payingBooking.vehicle_number}</span>
              </div>
              <div className="d-flex justify-content-between py-1">
                <span className="text-muted">Amount Due</span>
                <strong className="text-primary fs-6">{formatCurrency(payingBooking.amount)}</strong>
              </div>
            </div>

            <div className="mb-4">
              <label className="form-label small fw-semibold text-dark mb-2">Select Payment Method</label>
              <div className="d-grid gap-2">
                {[
                  { id: 'upi', label: 'UPI / Instant QR' },
                  { id: 'card', label: 'Credit / Debit Card' },
                  { id: 'netbanking', label: 'Net Banking' },
                ].map((m) => (
                  <label
                    key={m.id}
                    className={`form-check p-2.5 border rounded-3 d-flex align-items-center gap-2 cursor-pointer ${
                      paymentMethod === m.id ? 'border-primary bg-primary-subtle' : 'bg-white'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pendingPaymentMethod"
                      className="form-check-input ms-1 me-2"
                      checked={paymentMethod === m.id}
                      onChange={() => setPaymentMethod(m.id)}
                    />
                    <span className="small fw-medium text-dark">{m.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="d-flex gap-2">
              <button
                type="button"
                onClick={() => setPayingBooking(null)}
                className="btn btn-outline-secondary w-50 py-2 rounded-3 text-xs"
              >
                Close
              </button>
              <button
                type="submit"
                disabled={submittingPayment}
                className="btn btn-success w-50 py-2 rounded-3 text-xs fw-medium shadow-xs d-flex align-items-center justify-content-center gap-1.5"
              >
                {submittingPayment ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} /> Confirm & Pay {formatCurrency(payingBooking.amount)}
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Booking QR & Printable Pass Modal (Feature A) */}
      <PrintableTicketModal
        isOpen={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        booking={selectedBooking}
      />
    </div>
  );
}

export default BookingsPage;
