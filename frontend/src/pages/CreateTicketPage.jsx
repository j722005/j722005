import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  LifeBuoy,
  CalendarCheck,
  CreditCard,
  MapPin,
  QrCode,
  DollarSign,
  User,
  HelpCircle,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Clock,
  Car,
} from 'lucide-react';
import supportService from '../services/supportService';
import { useNotification } from '../context/NotificationContext';
import { formatDateTime, formatCurrency } from '../utils/formatters';

const CATEGORIES = [
  { id: 'booking_issue', label: 'Booking Issue', icon: CalendarCheck, desc: 'Overlap, wrong time, or cancellation issues' },
  { id: 'payment_issue', label: 'Payment Issue', icon: CreditCard, desc: 'UPI failures, double deductions, or hold issues' },
  { id: 'slot_availability', label: 'Slot Availability', icon: MapPin, desc: 'Assigned bay blocked or occupied by another car' },
  { id: 'qr_ticket', label: 'QR Ticket & Gate Pass', icon: QrCode, desc: 'Barcode / QR scanner failure at barrier' },
  { id: 'refund_request', label: 'Refund Request', icon: DollarSign, desc: 'Cancelled reservations or excess payments' },
  { id: 'account_issue', label: 'Account Issue', icon: User, desc: 'Profile details, vehicle management, credentials' },
  { id: 'other', label: 'Other Inquiry', icon: HelpCircle, desc: 'General queries or suggestions' },
];

const PRIORITIES = [
  { id: 'low', label: 'Low', desc: 'General questions or minor inquiries', color: 'border-slate-300 text-slate-700' },
  { id: 'medium', label: 'Medium', desc: 'Standard support requirement', color: 'border-amber-400 text-amber-800' },
  { id: 'high', label: 'High', desc: 'Urgent gate access or payment failure', color: 'border-danger text-danger' },
];

export function CreateTicketPage() {
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [category, setCategory] = useState('booking_issue');
  const [priority, setPriority] = useState('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');

  const [eligibleBookings, setEligibleBookings] = useState([]);
  const [loadingBookings, setLoadingBookings] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Load user's bookings to optionally link
  useEffect(() => {
    async function fetchBookings() {
      try {
        const data = await supportService.getEligibleBookings();
        setEligibleBookings(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('Failed to load eligible bookings:', err);
      } finally {
        setLoadingBookings(false);
      }
    }
    fetchBookings();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setAttachmentError('');
    if (!file) return;

    // Client-side validation: max 5MB
    const maxBytes = 5 * 1024 * 1024;
    if (file.size > maxBytes) {
      setAttachmentError('Attachment exceeds the 5MB size limit.');
      return;
    }

    // Check extension
    const name = file.name.toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.gif'];
    const hasValidExt = allowed.some((ext) => name.endsWith(ext));
    if (!hasValidExt) {
      setAttachmentError('Allowed file types: JPG, PNG, WEBP, PDF, GIF.');
      return;
    }

    setAttachment(file);
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    setAttachmentError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!subject.trim()) {
      setErrorMsg('Please enter a ticket subject.');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('Please provide details in the ticket description.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        booking_id: selectedBookingId || '',
        attachment: attachment || null,
      };

      const result = await supportService.createTicket(payload);
      showSuccess(`Support ticket #${result.ticket_id} created successfully!`);
      navigate(`/support/${result.ticket_id}`);
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        (err?.response?.data && typeof err.response.data === 'object'
          ? Object.values(err.response.data).flat().join(' ')
          : null) ||
        err?.message ||
        'Failed to submit support ticket.';
      setErrorMsg(msg);
      showError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="create-ticket-page container-fluid px-0 max-w-4xl">
      {/* Page Header */}
      <div className="mb-4">
        <Link
          to="/support"
          className="text-muted text-xs text-decoration-none d-inline-flex align-items-center gap-1.5 mb-2 hover-text-dark"
        >
          <ArrowLeft size={14} /> Back to My Support Tickets
        </Link>
        <div className="d-flex align-items-center gap-2.5">
          <div className="p-2.5 rounded-3 bg-primary-subtle text-primary">
            <LifeBuoy size={24} />
          </div>
          <div>
            <h2 className="fw-bold tracking-tight text-dark mb-0.5">Submit Support Ticket</h2>
            <p className="text-muted small mb-0">
              Need assistance with a booking, payment, slot availability, or gate pass? We are here to help.
            </p>
          </div>
        </div>
      </div>

      {/* Form Card */}
      <div className="card border-0 shadow-sm rounded-4 bg-white p-4 p-md-5 mb-5">
        {errorMsg && (
          <div className="alert alert-danger shadow-xs rounded-3 p-3 mb-4 d-flex align-items-start gap-2.5 text-xs">
            <AlertCircle size={18} className="text-danger flex-shrink-0 mt-0.5" />
            <div>
              <strong>Submission Error:</strong> {errorMsg}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Select Category */}
          <div className="mb-4">
            <label className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider">
              1. Issue Category <span className="text-danger">*</span>
            </label>
            <div className="row g-2.5">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <div key={cat.id} className="col-12 col-sm-6 col-md-4">
                    <div
                      onClick={() => setCategory(cat.id)}
                      className={`p-3 rounded-3 border h-100 cursor-pointer transition-all d-flex flex-column justify-content-between ${
                        isSelected
                          ? 'border-primary bg-primary-subtle text-primary shadow-xs'
                          : 'border-slate-200 bg-light text-slate-700 hover-bg-slate-100'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="d-flex align-items-center gap-2 mb-1.5">
                        <Icon size={18} className={isSelected ? 'text-primary' : 'text-slate-500'} />
                        <span className="fw-bold text-xs">{cat.label}</span>
                      </div>
                      <p className="text-3xs text-muted mb-0">{cat.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 2: Priority Selection */}
          <div className="mb-4">
            <label className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider">
              2. Urgency Level / Priority <span className="text-danger">*</span>
            </label>
            <div className="row g-2">
              {PRIORITIES.map((p) => {
                const isSelected = priority === p.id;
                return (
                  <div key={p.id} className="col-12 col-sm-4">
                    <div
                      onClick={() => setPriority(p.id)}
                      className={`p-2.5 rounded-3 border text-center transition-all ${
                        isSelected
                          ? 'border-2 border-primary bg-white shadow-xs'
                          : 'border-slate-200 bg-light text-muted'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="fw-bold text-xs text-dark">{p.label} Priority</div>
                      <div className="text-3xs text-muted mt-0.5">{p.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step 3: Optional Related Booking Link */}
          <div className="mb-4">
            <label className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider d-flex justify-content-between">
              <span>3. Related Reservation (Optional)</span>
              <span className="text-muted fw-normal text-3xs">Only your own bookings can be linked</span>
            </label>
            <select
              className="form-select text-xs rounded-3 border-slate-300 py-2.5"
              value={selectedBookingId}
              onChange={(e) => setSelectedBookingId(e.target.value)}
              disabled={loadingBookings}
            >
              <option value="">-- None / General Inquiry --</option>
              {eligibleBookings.map((b) => (
                <option key={b.booking_id} value={b.booking_id}>
                  {b.lot_name} (Slot {b.slot_number}) • {b.vehicle_number} • Ref #{b.booking_id.substring(0, 8)}... [{b.status.toUpperCase()}]
                </option>
              ))}
            </select>
          </div>

          {/* Step 4: Subject */}
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-1">
              <label htmlFor="ticketSubject" className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider mb-0">
                4. Subject <span className="text-danger">*</span>
              </label>
              <span className="text-3xs text-muted font-monospace">{subject.length}/160</span>
            </div>
            <input
              id="ticketSubject"
              type="text"
              maxLength={160}
              className="form-control text-sm rounded-3 border-slate-300 py-2.5"
              placeholder="e.g. Assigned Slot P-04 was occupied upon arrival"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
            />
          </div>

          {/* Step 5: Detailed Description */}
          <div className="mb-4">
            <label htmlFor="ticketDescription" className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider">
              5. Detailed Description <span className="text-danger">*</span>
            </label>
            <textarea
              id="ticketDescription"
              rows={5}
              className="form-control text-sm rounded-3 border-slate-300 p-3"
              placeholder="Please describe the issue clearly. Mention what happened, gate/barrier location, or error messages encountered..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
            />
          </div>

          {/* Step 6: Attachment Upload */}
          <div className="mb-4">
            <label className="form-label text-xs fw-bold text-slate-700 text-uppercase tracking-wider d-flex justify-content-between">
              <span>6. Screenshot / Proof of Payment (Optional)</span>
              <span className="text-muted fw-normal text-3xs">JPG, PNG, WEBP, PDF up to 5MB</span>
            </label>

            {attachment ? (
              <div className="p-3 rounded-3 bg-light border border-slate-300 d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2 overflow-hidden">
                  <FileText size={20} className="text-primary flex-shrink-0" />
                  <div className="overflow-hidden">
                    <div className="text-xs fw-semibold text-dark text-truncate">{attachment.name}</div>
                    <div className="text-3xs text-muted">{(attachment.size / 1024).toFixed(1)} KB</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveAttachment}
                  className="btn btn-sm btn-outline-danger rounded-circle p-1"
                  title="Remove attachment"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div>
                <label
                  htmlFor="ticketAttachmentInput"
                  className="p-4 border-2 border-dashed border-slate-300 rounded-3 text-center d-block bg-slate-50 hover-bg-slate-100 transition-all cursor-pointer"
                  style={{ cursor: 'pointer' }}
                >
                  <Upload size={24} className="text-slate-400 mb-2" />
                  <div className="text-xs fw-semibold text-dark">Click to upload image or PDF proof</div>
                  <div className="text-3xs text-muted mt-0.5">Safe files only. Executables are rejected by server security.</div>
                  <input
                    id="ticketAttachmentInput"
                    type="file"
                    className="d-none"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.gif"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
            )}
            {attachmentError && (
              <div className="text-danger text-2xs mt-1.5 d-flex align-items-center gap-1">
                <AlertCircle size={13} /> {attachmentError}
              </div>
            )}
          </div>

          {/* Form Submit Controls */}
          <div className="d-flex justify-content-end align-items-center gap-2.5 pt-3 border-top">
            <Link to="/support" className="btn btn-light border text-slate-700 text-xs px-4 py-2.5 rounded-3">
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary text-xs px-5 py-2.5 rounded-3 fw-medium shadow-xs d-flex align-items-center gap-2"
            >
              {submitting ? (
                <>
                  <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                  Submitting Ticket...
                </>
              ) : (
                <>
                  <LifeBuoy size={15} /> Submit Support Ticket
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTicketPage;
