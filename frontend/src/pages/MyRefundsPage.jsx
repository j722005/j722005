import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Search,
  Filter,
  ArrowRight,
  Plus,
  Send,
  Paperclip,
  Info,
  Calendar,
  CreditCard,
  Building,
  ShieldAlert,
  ChevronRight,
  X
} from 'lucide-react';
import { refundService } from '../services/refundService';

export default function MyRefundsPage() {
  const [activeTab, setActiveTab] = useState('refunds'); // 'refunds' | 'disputes' | 'eligible'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // Data states
  const [refunds, setRefunds] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [eligibleBookings, setEligibleBookings] = useState([]);

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Modals & Drawers
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [selectedBookingForRefund, setSelectedBookingForRefund] = useState(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [activeRefundDetail, setActiveRefundDetail] = useState(null);
  const [activeDisputeDetail, setActiveDisputeDetail] = useState(null);

  // Form states - Refund Request
  const [refundForm, setRefundForm] = useState({
    booking_id: '',
    amount: '',
    reason: 'booking_cancelled',
    explanation: '',
    attachment: null,
  });
  const [submittingRefund, setSubmittingRefund] = useState(false);

  // Form states - Additional info
  const [infoFormNotes, setInfoFormNotes] = useState('');
  const [infoFormAttachment, setInfoFormAttachment] = useState(null);
  const [submittingInfo, setSubmittingInfo] = useState(false);

  // Form states - Dispute Raise
  const [disputeForm, setDisputeForm] = useState({
    category: 'payment_deducted_no_booking',
    subject: '',
    description: '',
    booking_id: '',
    payment_reference: '',
    disputed_amount: '',
    attachment: null,
  });
  const [submittingDispute, setSubmittingDispute] = useState(false);

  // Form states - Dispute Reply
  const [replyText, setReplyText] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'refunds') {
        const res = await refundService.getMyRefunds({ status: statusFilter, search: searchTerm });
        setRefunds(res.results || res);
      } else if (activeTab === 'disputes') {
        const res = await refundService.getMyDisputes({ status: statusFilter, search: searchTerm });
        setDisputes(res.results || res);
      } else if (activeTab === 'eligible') {
        const res = await refundService.getEligibleBookings();
        setEligibleBookings(res);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load records. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const openRequestModal = (booking = null) => {
    if (booking) {
      setSelectedBookingForRefund(booking);
      setRefundForm({
        booking_id: booking.booking_id,
        amount: booking.remaining_refundable,
        reason: booking.booking_status === 'cancelled' ? 'booking_cancelled' : 'service_unavailable',
        explanation: '',
        attachment: null,
      });
    } else {
      setSelectedBookingForRefund(null);
      setRefundForm({
        booking_id: '',
        amount: '',
        reason: 'booking_cancelled',
        explanation: '',
        attachment: null,
      });
      // Also fetch eligible bookings if not already loaded
      refundService.getEligibleBookings().then(setEligibleBookings).catch(console.error);
    }
    setShowRequestModal(true);
  };

  const handleBookingSelectChange = (bId) => {
    const found = eligibleBookings.find((b) => b.booking_id === bId);
    if (found) {
      setSelectedBookingForRefund(found);
      setRefundForm((prev) => ({
        ...prev,
        booking_id: found.booking_id,
        amount: found.remaining_refundable,
      }));
    } else {
      setSelectedBookingForRefund(null);
      setRefundForm((prev) => ({ ...prev, booking_id: bId, amount: '' }));
    }
  };

  const handleSubmitRefund = async (e) => {
    e.preventDefault();
    if (!refundForm.booking_id) {
      alert('Please select an eligible booking.');
      return;
    }
    if (!refundForm.amount || parseFloat(refundForm.amount) <= 0) {
      alert('Please enter a valid refund amount.');
      return;
    }

    setSubmittingRefund(true);
    try {
      const res = await refundService.createRefundRequest(refundForm);
      setSuccessMsg(`Refund request #${res.refund_id} submitted successfully!`);
      setShowRequestModal(false);
      setActiveTab('refunds');
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting refund request.');
    } finally {
      setSubmittingRefund(false);
    }
  };

  const handleCancelRefund = async (refundId) => {
    if (!window.confirm('Are you sure you want to cancel this refund request?')) return;
    try {
      await refundService.cancelRefundRequest(refundId);
      setSuccessMsg('Refund request cancelled.');
      if (activeRefundDetail) {
        const updated = await refundService.getRefundDetail(refundId);
        setActiveRefundDetail(updated);
      }
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to cancel refund.');
    }
  };

  const handleProvideInfo = async (e) => {
    e.preventDefault();
    if (!infoFormNotes.trim()) {
      alert('Please provide explanation notes.');
      return;
    }
    setSubmittingInfo(true);
    try {
      const res = await refundService.provideAdditionalInfo(activeRefundDetail.refund_id, {
        notes: infoFormNotes,
        attachment: infoFormAttachment,
      });
      setActiveRefundDetail(res);
      setInfoFormNotes('');
      setInfoFormAttachment(null);
      setSuccessMsg('Additional information provided successfully.');
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error providing information.');
    } finally {
      setSubmittingInfo(false);
    }
  };

  const handleSubmitDispute = async (e) => {
    e.preventDefault();
    if (!disputeForm.subject.trim() || !disputeForm.description.trim()) {
      alert('Please fill in subject and description.');
      return;
    }

    setSubmittingDispute(true);
    try {
      const res = await refundService.raiseDispute(disputeForm);
      setSuccessMsg(`Payment dispute #${res.dispute_id} registered successfully.`);
      setShowDisputeModal(false);
      setDisputeForm({
        category: 'payment_deducted_no_booking',
        subject: '',
        description: '',
        booking_id: '',
        payment_reference: '',
        disputed_amount: '',
        attachment: null,
      });
      setActiveTab('disputes');
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error submitting dispute.');
    } finally {
      setSubmittingDispute(false);
    }
  };

  const handleReplyDispute = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const res = await refundService.replyDispute(activeDisputeDetail.dispute_id, {
        message: replyText,
        attachment: replyAttachment,
      });
      setActiveDisputeDetail(res);
      setReplyText('');
      setReplyAttachment(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.message || 'Error sending reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      requested: 'bg-amber-100 text-amber-800 border-amber-200',
      under_review: 'bg-blue-100 text-blue-800 border-blue-200',
      info_required: 'bg-purple-100 text-purple-800 border-purple-200',
      approved: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      processing: 'bg-cyan-100 text-cyan-800 border-cyan-200',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rejected: 'bg-rose-100 text-rose-800 border-rose-200',
      failed: 'bg-red-100 text-red-800 border-red-200',
      cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
      opened: 'bg-amber-100 text-amber-800 border-amber-200',
      under_investigation: 'bg-blue-100 text-blue-800 border-blue-200',
      resolved: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      closed: 'bg-slate-100 text-slate-700 border-slate-200',
    };
    return (
      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${styles[status] || 'bg-slate-100 text-slate-700'}`}>
        {status?.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <RotateCcw className="text-primary" size={28} />
            Refund &amp; Dispute Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Track refund requests, resolve billing discrepancies, and raise payment disputes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              refundService.getEligibleBookings().then(setEligibleBookings);
              setShowDisputeModal(true);
            }}
            className="btn btn-outline-secondary d-flex align-items-center gap-2"
          >
            <AlertTriangle size={16} className="text-amber-500" /> Raise Dispute
          </button>
          <button
            onClick={() => openRequestModal()}
            className="btn btn-primary d-flex align-items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Request Refund
          </button>
        </div>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={18} className="text-emerald-600" />
            <span className="text-sm font-medium">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg('')} className="text-emerald-700 hover:text-emerald-900">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-8">
        <button
          onClick={() => { setActiveTab('refunds'); setSearchTerm(''); setStatusFilter(''); }}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'refunds'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          My Refund Requests
        </button>
        <button
          onClick={() => { setActiveTab('disputes'); setSearchTerm(''); setStatusFilter(''); }}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'disputes'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Payment Disputes
        </button>
        <button
          onClick={() => { setActiveTab('eligible'); }}
          className={`pb-3 font-semibold text-sm transition-colors border-b-2 ${
            activeTab === 'eligible'
              ? 'border-primary text-primary'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Refund-Eligible Bookings
        </button>
      </div>

      {/* Tab Content: Refund Requests */}
      {activeTab === 'refunds' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by refund ID, booking ID, reason..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && loadData()}
                className="form-control ps-5"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setTimeout(loadData, 0); }}
              className="form-select w-auto"
            >
              <option value="">All Statuses</option>
              <option value="requested">Requested</option>
              <option value="under_review">Under Review</option>
              <option value="info_required">Info Required</option>
              <option value="approved">Approved</option>
              <option value="processing">Processing</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500">Loading refund history...</div>
          ) : refunds.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center">
              <RotateCcw className="mx-auto text-slate-300 mb-3" size={40} />
              <h3 className="text-base font-semibold text-slate-700">No Refund Requests Found</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                You haven't requested any refunds yet. View your eligible bookings to request a cancellation or refund.
              </p>
              <button onClick={() => setActiveTab('eligible')} className="btn btn-outline-primary btn-sm">
                View Eligible Bookings
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {refunds.map((rf) => (
                <div
                  key={rf.refund_id}
                  onClick={async () => {
                    const detail = await refundService.getRefundDetail(rf.refund_id);
                    setActiveRefundDetail(detail);
                  }}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-slate-600">{rf.refund_id}</span>
                      {getStatusBadge(rf.status)}
                    </div>
                    <div className="text-xl font-bold text-slate-900 mb-1">
                      ₹{parseFloat(rf.approved_amount || rf.amount).toFixed(2)}
                    </div>
                    <div className="text-sm text-slate-600 mb-2">
                      Reason: <span className="font-medium text-slate-800">{rf.reason_display}</span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-1">
                      <Building size={14} /> {rf.lot_name} &bull; Booking: #{rf.booking_id?.slice(0, 8)}
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{new Date(rf.created_at).toLocaleDateString()}</span>
                    <span className="text-primary font-medium flex items-center gap-0.5">
                      View details <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Payment Disputes */}
      {activeTab === 'disputes' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-slate-500">Loading disputes...</div>
          ) : disputes.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center">
              <AlertTriangle className="mx-auto text-slate-300 mb-3" size={40} />
              <h3 className="text-base font-semibold text-slate-700">No Payment Disputes</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
                If you experienced an unauthorized deduction or double charge, you can raise a dispute directly.
              </p>
              <button onClick={() => setShowDisputeModal(true)} className="btn btn-outline-primary btn-sm">
                Raise Dispute
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {disputes.map((dsp) => (
                <div
                  key={dsp.dispute_id}
                  onClick={async () => {
                    const detail = await refundService.getDisputeDetail(dsp.dispute_id);
                    setActiveDisputeDetail(detail);
                  }}
                  className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-xs font-bold text-slate-600">{dsp.dispute_id}</span>
                      {getStatusBadge(dsp.status)}
                    </div>
                    <h4 className="text-base font-bold text-slate-900 mb-1">{dsp.subject}</h4>
                    <div className="text-xs text-primary font-medium mb-2">{dsp.category_display}</div>
                    {dsp.disputed_amount && (
                      <div className="text-sm font-semibold text-slate-700 mb-2">
                        Amount: ₹{parseFloat(dsp.disputed_amount).toFixed(2)}
                      </div>
                    )}
                  </div>
                  <div className="border-t border-slate-100 pt-3 mt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>{dsp.messages_count} messages</span>
                    <span className="text-primary font-medium flex items-center gap-0.5">
                      Open conversation <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab Content: Eligible Bookings */}
      {activeTab === 'eligible' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 text-blue-800 p-4 rounded-xl text-sm flex items-start gap-3">
            <Info size={18} className="text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Refund Policy Notice:</span> Only bookings with completed payments and positive remaining balances are eligible. Cancelled bookings or bookings experiencing verified service issues can be refunded.
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-slate-500">Scanning eligible bookings...</div>
          ) : eligibleBookings.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-12 text-center text-slate-500">
              No refund-eligible bookings available on your account.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {eligibleBookings.map((b) => (
                <div key={b.booking_id} className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between shadow-sm">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-500">{b.lot_name} (Slot {b.slot_number})</span>
                      <span className="px-2 py-0.5 text-2xs font-semibold rounded bg-slate-100 text-slate-700">
                        {b.booking_status_display}
                      </span>
                    </div>
                    <div className="text-lg font-bold text-slate-900 mb-1">
                      ₹{b.remaining_refundable.toFixed(2)}{' '}
                      <span className="text-xs font-normal text-slate-500">refundable</span>
                    </div>
                    <div className="text-xs text-slate-600 mb-1">
                      Vehicle: <span className="font-medium text-slate-800">{b.vehicle_number}</span>
                    </div>
                    <div className="text-xs text-slate-500">
                      Paid: ₹{b.paid_amount.toFixed(2)} via {b.payment_method_display}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-2xs text-slate-400 font-mono">#{b.booking_id.slice(0, 8)}</span>
                    <button
                      onClick={() => openRequestModal(b)}
                      className="btn btn-sm btn-primary py-1 px-3"
                    >
                      Request Refund
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Request Refund */}
      {/* ========================================================================= */}
      {showRequestModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw size={20} className="text-primary" /> Request Refund
              </h3>
              <button onClick={() => setShowRequestModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitRefund} className="space-y-4">
              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Select Booking</label>
                <select
                  value={refundForm.booking_id}
                  onChange={(e) => handleBookingSelectChange(e.target.value)}
                  className="form-select text-sm"
                  required
                >
                  <option value="">-- Choose Eligible Booking --</option>
                  {eligibleBookings.map((b) => (
                    <option key={b.booking_id} value={b.booking_id}>
                      {b.lot_name} ({b.slot_number}) - ₹{b.remaining_refundable} refundable (#{b.booking_id.slice(0, 8)})
                    </option>
                  ))}
                </select>
              </div>

              {selectedBookingForRefund && (
                <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 text-slate-600 border border-slate-200">
                  <div>Paid Amount: <span className="font-semibold text-slate-800">₹{selectedBookingForRefund.paid_amount}</span></div>
                  <div>Remaining Refundable: <span className="font-semibold text-emerald-700">₹{selectedBookingForRefund.remaining_refundable}</span></div>
                  <div>Payment Txn: <span className="font-mono text-slate-700">{selectedBookingForRefund.payment_transaction_id}</span></div>
                </div>
              )}

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Refund Amount (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={selectedBookingForRefund?.remaining_refundable || 10000}
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                  className="form-control text-sm font-semibold"
                  required
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Reason</label>
                <select
                  value={refundForm.reason}
                  onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                  className="form-select text-sm"
                  required
                >
                  <option value="booking_cancelled">Booking Cancelled</option>
                  <option value="duplicate_payment">Duplicate Payment</option>
                  <option value="incorrect_amount">Incorrect Payment Amount</option>
                  <option value="service_unavailable">Parking Service Unavailable</option>
                  <option value="technical_issue">Technical / App Issue</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Explanation (Optional)</label>
                <textarea
                  rows="3"
                  value={refundForm.explanation}
                  onChange={(e) => setRefundForm({ ...refundForm, explanation: e.target.value })}
                  placeholder="Provide any additional details or context..."
                  className="form-control text-sm"
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Supporting Evidence (Optional)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                  onChange={(e) => setRefundForm({ ...refundForm, attachment: e.target.files[0] })}
                  className="form-control text-sm"
                />
                <span className="text-2xs text-slate-400 mt-1 d-block">JPG, PNG, WEBP, PDF up to 5MB</span>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  {submittingRefund ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: Refund Details */}
      {/* ========================================================================= */}
      {activeRefundDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl overflow-y-auto p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-5">
                <div>
                  <span className="font-mono text-xs font-bold text-slate-500">{activeRefundDetail.refund_id}</span>
                  <h3 className="text-lg font-bold text-slate-900">Refund Request Details</h3>
                </div>
                <button onClick={() => setActiveRefundDetail(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22} />
                </button>
              </div>

              {/* Status Header */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Current Status</div>
                  <div className="mt-1">{getStatusBadge(activeRefundDetail.status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Requested Amount</div>
                  <div className="text-lg font-bold text-slate-900">₹{parseFloat(activeRefundDetail.amount).toFixed(2)}</div>
                  {activeRefundDetail.approved_amount && (
                    <div className="text-xs text-emerald-700 font-semibold">
                      Approved: ₹{parseFloat(activeRefundDetail.approved_amount).toFixed(2)}
                    </div>
                  )}
                </div>
              </div>

              {/* Booking & Payment Details */}
              <div className="space-y-4 mb-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Booking Info</h4>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-600">
                    <div>Lot: <span className="font-semibold text-slate-800">{activeRefundDetail.booking?.lot_name} (Slot {activeRefundDetail.booking?.slot_number})</span></div>
                    <div>Vehicle: <span className="font-mono text-slate-800">{activeRefundDetail.booking?.vehicle_number}</span></div>
                    <div>Booking Status: <span className="font-semibold">{activeRefundDetail.booking?.status_display}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Original Payment Info</h4>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-600">
                    <div>Original Txn ID: <span className="font-mono text-slate-800">{activeRefundDetail.payment?.transaction_id}</span></div>
                    <div>Paid: ₹{activeRefundDetail.payment?.amount} via {activeRefundDetail.payment?.method_display}</div>
                  </div>
                </div>

                {/* Reason & Explanation */}
                <div>
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Reason &amp; Explanation</h4>
                  <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-2 border border-slate-200">
                    <div>Reason: <span className="font-semibold text-slate-800">{activeRefundDetail.reason_display}</span></div>
                    {activeRefundDetail.explanation && (
                      <div>Explanation: <span className="text-slate-700">{activeRefundDetail.explanation}</span></div>
                    )}
                    {activeRefundDetail.attachment_url && (
                      <div className="pt-2">
                        <a
                          href={activeRefundDetail.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline-primary btn-sm text-xs inline-flex items-center gap-1"
                        >
                          <Paperclip size={14} /> View Attached Evidence
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulated Refund Execution Receipt */}
                {activeRefundDetail.transaction && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs space-y-1.5 text-emerald-900">
                    <div className="font-bold text-sm flex items-center gap-1.5 text-emerald-800">
                      <CheckCircle size={16} /> Refund Executed ({activeRefundDetail.transaction.is_simulation ? 'Simulated Transfer' : 'Live Gateway'})
                    </div>
                    <div>Transaction Reference: <span className="font-mono font-bold">{activeRefundDetail.transaction.transaction_reference}</span></div>
                    <div>Amount Refunded: <span className="font-bold">₹{activeRefundDetail.transaction.amount}</span></div>
                    <div>Channel: <span className="uppercase">{activeRefundDetail.transaction.payment_channel}</span></div>
                    <div className="text-2xs text-emerald-700 italic pt-1">
                      {activeRefundDetail.transaction.gateway_provider}
                    </div>
                  </div>
                )}

                {/* If Info Required -> Show input form */}
                {activeRefundDetail.status === 'info_required' && (
                  <form onSubmit={handleProvideInfo} className="bg-purple-50 border border-purple-200 p-4 rounded-xl space-y-3">
                    <div className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                      <AlertTriangle size={16} /> Additional Information Requested by Support
                    </div>
                    <p className="text-xs text-purple-800">
                      Please supply the requested details or bank statement screenshot to proceed with your refund.
                    </p>
                    <textarea
                      rows="3"
                      value={infoFormNotes}
                      onChange={(e) => setInfoFormNotes(e.target.value)}
                      placeholder="Enter explanation notes..."
                      className="form-control text-xs"
                      required
                    />
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,.webp"
                      onChange={(e) => setInfoFormAttachment(e.target.files[0])}
                      className="form-control text-xs"
                    />
                    <button
                      type="submit"
                      disabled={submittingInfo}
                      className="btn btn-primary btn-sm text-xs w-full"
                    >
                      {submittingInfo ? 'Submitting...' : 'Submit Requested Info'}
                    </button>
                  </form>
                )}

                {/* Rejection notice */}
                {activeRefundDetail.rejection_reason && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-xs">
                    <div className="font-bold mb-1">Rejection Reason:</div>
                    <div>{activeRefundDetail.rejection_reason}</div>
                  </div>
                )}

                {/* Audit trail */}
                {activeRefundDetail.audit_logs?.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Audit History</h4>
                    <div className="space-y-2">
                      {activeRefundDetail.audit_logs.map((log) => (
                        <div key={log.id} className="text-2xs text-slate-500 bg-slate-50 p-2.5 rounded border border-slate-100 flex items-start justify-between">
                          <div>
                            <span className="font-semibold text-slate-700">{log.action.replace('_', ' ')}</span> by {log.performed_by_name}
                            {log.notes && <div className="text-slate-600 mt-0.5">{log.notes}</div>}
                          </div>
                          <span className="text-slate-400 shrink-0">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="border-t border-slate-200 pt-4 flex items-center justify-between">
              {(activeRefundDetail.status === 'requested' || activeRefundDetail.status === 'info_required') && (
                <button
                  onClick={() => handleCancelRefund(activeRefundDetail.refund_id)}
                  className="btn btn-outline-danger btn-sm text-xs"
                >
                  Cancel Request
                </button>
              )}
              <button
                onClick={() => setActiveRefundDetail(null)}
                className="btn btn-secondary btn-sm text-xs ms-auto"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DRAWER: Dispute Conversation */}
      {/* ========================================================================= */}
      {activeDisputeDetail && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl overflow-y-auto p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-slate-500">{activeDisputeDetail.dispute_id}</span>
                  <h3 className="text-lg font-bold text-slate-900">{activeDisputeDetail.subject}</h3>
                </div>
                <button onClick={() => setActiveDisputeDetail(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22} />
                </button>
              </div>

              {/* Dispute Metadata */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 text-xs space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500 font-semibold">{activeDisputeDetail.category_display}</span>
                  {getStatusBadge(activeDisputeDetail.status)}
                </div>
                {activeDisputeDetail.disputed_amount && (
                  <div>Disputed Amount: <span className="font-bold text-slate-800">₹{activeDisputeDetail.disputed_amount}</span></div>
                )}
                {activeDisputeDetail.payment_reference && (
                  <div>Bank / UPI Ref: <span className="font-mono text-slate-700">{activeDisputeDetail.payment_reference}</span></div>
                )}
                <div className="text-slate-700 pt-2 border-t border-slate-200 mt-2">
                  {activeDisputeDetail.description}
                </div>
              </div>

              {/* Resolution Summary */}
              {activeDisputeDetail.resolution_summary && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-xs mb-4">
                  <span className="font-bold">Resolution Summary:</span> {activeDisputeDetail.resolution_summary}
                </div>
              )}

              {/* Conversation Messages */}
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conversation Thread</h4>
              <div className="space-y-3 mb-6 max-h-80 overflow-y-auto p-1">
                {activeDisputeDetail.messages?.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6">No messages yet. Support team will review shortly.</div>
                ) : (
                  activeDisputeDetail.messages.map((m) => {
                    const isMe = m.sender_role === 'customer';
                    return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl text-xs max-w-[85%] ${
                          isMe
                            ? 'bg-blue-600 text-white ms-auto rounded-tr-none'
                            : 'bg-slate-100 text-slate-800 me-auto rounded-tl-none border border-slate-200'
                        }`}
                      >
                        <div className="font-semibold text-2xs mb-1 opacity-80">
                          {m.sender_name} ({m.sender_role.toUpperCase()})
                        </div>
                        <div>{m.message}</div>
                        {m.attachment_url && (
                          <div className="mt-2 pt-2 border-t border-white/20">
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className={`inline-flex items-center gap-1 font-semibold underline ${isMe ? 'text-white' : 'text-primary'}`}
                            >
                              <Paperclip size={12} /> Attachment
                            </a>
                          </div>
                        )}
                        <div className="text-3xs text-right mt-1 opacity-70">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Reply Input Box */}
            <form onSubmit={handleReplyDispute} className="border-t border-slate-200 pt-4 space-y-2">
              <textarea
                rows="2"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your message or reply..."
                className="form-control text-xs"
                required
              />
              <div className="flex items-center justify-between">
                <input
                  type="file"
                  id="dispute-file"
                  className="hidden"
                  onChange={(e) => setReplyAttachment(e.target.files[0])}
                />
                <label
                  htmlFor="dispute-file"
                  className="cursor-pointer text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <Paperclip size={14} />
                  {replyAttachment ? replyAttachment.name : 'Attach file'}
                </label>

                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  className="btn btn-primary btn-sm text-xs flex items-center gap-1.5"
                >
                  <Send size={14} /> Send Reply
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Raise Payment Dispute */}
      {/* ========================================================================= */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <AlertTriangle size={20} className="text-amber-500" /> Raise Payment Dispute
              </h3>
              <button onClick={() => setShowDisputeModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="space-y-4">
              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Dispute Category</label>
                <select
                  value={disputeForm.category}
                  onChange={(e) => setDisputeForm({ ...disputeForm, category: e.target.value })}
                  className="form-select text-sm"
                  required
                >
                  <option value="payment_deducted_no_booking">Payment Deducted But Booking Not Confirmed</option>
                  <option value="duplicate_payment">Duplicate Payment</option>
                  <option value="incorrect_amount">Incorrect Amount Deducted</option>
                  <option value="refund_not_received">Refund Not Received</option>
                  <option value="payment_marked_failed">Payment Marked Failed in App</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Subject</label>
                <input
                  type="text"
                  placeholder="e.g. UPI deducted ₹100 but slot not reserved"
                  value={disputeForm.subject}
                  onChange={(e) => setDisputeForm({ ...disputeForm, subject: e.target.value })}
                  className="form-control text-sm"
                  required
                />
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Description</label>
                <textarea
                  rows="3"
                  placeholder="Explain what happened with date, time, and payment details..."
                  value={disputeForm.description}
                  onChange={(e) => setDisputeForm({ ...disputeForm, description: e.target.value })}
                  className="form-control text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700">Disputed Amount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="100.00"
                    value={disputeForm.disputed_amount}
                    onChange={(e) => setDisputeForm({ ...disputeForm, disputed_amount: e.target.value })}
                    className="form-control text-sm"
                  />
                </div>
                <div>
                  <label className="form-label text-xs font-semibold text-slate-700">Bank / UPI Ref</label>
                  <input
                    type="text"
                    placeholder="UPI-123456789"
                    value={disputeForm.payment_reference}
                    onChange={(e) => setDisputeForm({ ...disputeForm, payment_reference: e.target.value })}
                    className="form-control text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="form-label text-xs font-semibold text-slate-700">Supporting Evidence (Screenshot / PDF)</label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,.webp"
                  onChange={(e) => setDisputeForm({ ...disputeForm, attachment: e.target.files[0] })}
                  className="form-control text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDisputeModal(false)}
                  className="btn btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingDispute}
                  className="btn btn-primary text-sm flex items-center gap-2"
                >
                  {submittingDispute ? 'Registering...' : 'Raise Dispute'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

