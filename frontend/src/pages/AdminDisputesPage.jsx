import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Search,
  Filter,
  CheckCircle,
  XCircle,
  Clock,
  Send,
  Paperclip,
  User,
  Shield,
  MessageSquare,
  Lock,
  ChevronRight,
  X,
  RefreshCw,
  Link as LinkIcon
} from 'lucide-react';
import { refundService } from '../services/refundService';

export default function AdminDisputesPage() {
  const [loading, setLoading] = useState(true);
  const [disputes, setDisputes] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [activeDispute, setActiveDispute] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Conversation & Reply states
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Status & Resolution states
  const [statusAction, setStatusAction] = useState('');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [linkedRefundId, setLinkedRefundId] = useState('');
  const [submittingStatus, setSubmittingStatus] = useState(false);

  useEffect(() => {
    loadDisputes();
    loadSummary();
  }, [statusFilter, categoryFilter]);

  const loadDisputes = async () => {
    setLoading(true);
    try {
      const res = await refundService.getAdminDisputes({
        status: statusFilter,
        category: categoryFilter,
        search,
      });
      setDisputes(res.results || res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await refundService.getAdminDisputeSummary();
      setSummary(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDetail = async (disputeId) => {
    setLoadingDetail(true);
    setReplyText('');
    setIsInternalNote(false);
    setReplyAttachment(null);
    setStatusAction('');
    setResolutionSummary('');
    setLinkedRefundId('');
    try {
      const res = await refundService.getDisputeDetail(disputeId);
      setActiveDispute(res);
      setStatusAction(res.status);
    } catch (err) {
      alert('Failed to load dispute details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSubmittingReply(true);
    try {
      const res = await refundService.replyDispute(activeDispute.dispute_id, {
        message: replyText,
        attachment: replyAttachment,
        is_internal_note: isInternalNote,
      });
      setActiveDispute(res);
      setReplyText('');
      setIsInternalNote(false);
      setReplyAttachment(null);
      loadDisputes();
      loadSummary();
    } catch (err) {
      alert(err.response?.data?.message || 'Error sending reply.');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleUpdateStatus = async (e) => {
    e.preventDefault();
    if (!statusAction) return;

    setSubmittingStatus(true);
    try {
      const res = await refundService.adminDisputeStatus(activeDispute.dispute_id, {
        status: statusAction,
        resolution_summary: resolutionSummary,
        linked_refund_id: linkedRefundId,
      });
      setActiveDispute(res);
      alert(`Dispute status updated to ${statusAction.toUpperCase()}.`);
      loadDisputes();
      loadSummary();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update dispute status.');
    } finally {
      setSubmittingStatus(false);
    }
  };

  const getStatusBadge = (st) => {
    const map = {
      opened: 'bg-amber-100 text-amber-800 border-amber-300',
      under_investigation: 'bg-blue-100 text-blue-800 border-blue-300',
      info_requested: 'bg-purple-100 text-purple-800 border-purple-300',
      resolved: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      rejected: 'bg-rose-100 text-rose-800 border-rose-300',
      closed: 'bg-slate-100 text-slate-700 border-slate-300',
    };
    return (
      <span className={`px-2 py-0.5 text-2xs font-bold rounded-full border ${map[st] || 'bg-slate-100 text-slate-700'}`}>
        {st?.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <AlertTriangle size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Payment Dispute Resolution Desk</h1>
              <p className="text-xs text-slate-500">
                Investigate disputed charges, double deductions, and payment chargeback claims.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { loadDisputes(); loadSummary(); }}
          className="btn btn-outline-secondary btn-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Counters */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Open Disputes</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{summary.opened}</div>
            <div className="text-2xs text-slate-400 mt-1">Requires immediate review</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Under Investigation</div>
            <div className="text-2xl font-bold text-blue-600 mt-1">{summary.under_investigation}</div>
            <div className="text-2xs text-slate-400 mt-1">{summary.info_requested} awaiting user info</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Resolved Disputes</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.resolved}</div>
            <div className="text-2xs text-emerald-700 font-semibold mt-1">Settled successfully</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Unassigned</div>
            <div className="text-2xl font-bold text-rose-600 mt-1">{summary.unassigned}</div>
            <div className="text-2xs text-slate-400 mt-1">Total disputes: {summary.total}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search dispute ID, subject, customer, UPI reference..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadDisputes()}
            className="form-control ps-5 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-select text-sm w-auto"
        >
          <option value="all">All Statuses</option>
          <option value="opened">Opened</option>
          <option value="under_investigation">Under Investigation</option>
          <option value="info_requested">Info Requested</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
          <option value="closed">Closed</option>
        </select>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="form-select text-sm w-auto"
        >
          <option value="all">All Categories</option>
          <option value="payment_deducted_no_booking">Payment Deducted No Booking</option>
          <option value="duplicate_payment">Duplicate Payment</option>
          <option value="incorrect_amount">Incorrect Amount</option>
          <option value="refund_not_received">Refund Not Received</option>
          <option value="payment_marked_failed">Payment Marked Failed</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Disputes Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading disputes...</div>
        ) : disputes.length === 0 ? (
          <div className="text-center py-16 text-slate-400">No payment disputes found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Dispute ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Disputed (₹)</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Assigned To</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {disputes.map((dsp) => (
                  <tr key={dsp.dispute_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{dsp.dispute_id}</td>
                    <td className="py-3 px-4 font-medium">{dsp.user_name}</td>
                    <td className="py-3 px-4">{dsp.category_display}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900">{dsp.subject}</td>
                    <td className="py-3 px-4 font-bold">
                      {dsp.disputed_amount ? `₹${parseFloat(dsp.disputed_amount).toFixed(2)}` : 'N/A'}
                    </td>
                    <td className="py-3 px-4">{getStatusBadge(dsp.status)}</td>
                    <td className="py-3 px-4 text-slate-500">{dsp.assigned_to_name}</td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenDetail(dsp.dispute_id)}
                        className="btn btn-sm btn-outline-primary py-1 px-3 text-2xs"
                      >
                        Inspect Thread
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DRAWER: Dispute Conversation & Resolution */}
      {/* ========================================================================= */}
      {activeDispute && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl overflow-y-auto p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-slate-500">{activeDispute.dispute_id}</span>
                  <h3 className="text-lg font-bold text-slate-900">{activeDispute.subject}</h3>
                </div>
                <button onClick={() => setActiveDispute(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22} />
                </button>
              </div>

              {/* Dispute Metadata */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-4 text-xs space-y-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-700">{activeDispute.category_display}</span>
                  {getStatusBadge(activeDispute.status)}
                </div>
                <div>Customer: <span className="font-semibold">{activeDispute.user?.name} ({activeDispute.user?.email})</span></div>
                {activeDispute.disputed_amount && (
                  <div>Claimed Amount: <span className="font-bold text-rose-700">₹{activeDispute.disputed_amount}</span></div>
                )}
                {activeDispute.payment_reference && (
                  <div>Bank / UPI Ref: <span className="font-mono">{activeDispute.payment_reference}</span></div>
                )}
                {activeDispute.refund_request_id && (
                  <div className="text-indigo-700 font-semibold flex items-center gap-1">
                    <LinkIcon size={12} /> Linked Refund Request: #{activeDispute.refund_request_id}
                  </div>
                )}
                <div className="pt-2 border-t border-slate-200 mt-2 text-slate-800">
                  {activeDispute.description}
                </div>
                {activeDispute.attachment_url && (
                  <div className="pt-2">
                    <a
                      href={activeDispute.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-outline-secondary btn-sm text-2xs inline-flex items-center gap-1"
                    >
                      <Paperclip size={12} /> View Customer Attachment
                    </a>
                  </div>
                )}
              </div>

              {/* Status Update Form */}
              <div className="bg-white border border-slate-200 p-4 rounded-xl mb-4 shadow-sm space-y-3">
                <h4 className="text-xs font-bold text-slate-700">Lifecycle &amp; Resolution Management</h4>
                <form onSubmit={handleUpdateStatus} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="form-label text-2xs font-semibold text-slate-600">Dispute Status</label>
                      <select
                        value={statusAction}
                        onChange={(e) => setStatusAction(e.target.value)}
                        className="form-select text-xs"
                      >
                        <option value="opened">Opened</option>
                        <option value="under_investigation">Under Investigation</option>
                        <option value="info_requested">Information Requested</option>
                        <option value="resolved">Resolved</option>
                        <option value="rejected">Rejected</option>
                        <option value="closed">Closed</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label text-2xs font-semibold text-slate-600">Link Refund Request ID</label>
                      <input
                        type="text"
                        placeholder="REF-YYYYMMDD-XXXX"
                        value={linkedRefundId}
                        onChange={(e) => setLinkedRefundId(e.target.value)}
                        className="form-control text-xs font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="form-label text-2xs font-semibold text-slate-600">Resolution Summary</label>
                    <textarea
                      rows="2"
                      placeholder="Explain findings, outcome, or justification..."
                      value={resolutionSummary}
                      onChange={(e) => setResolutionSummary(e.target.value)}
                      className="form-control text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submittingStatus}
                    className="btn btn-primary btn-sm text-xs w-full"
                  >
                    {submittingStatus ? 'Updating...' : 'Update Dispute Status'}
                  </button>
                </form>
              </div>

              {/* Messages Thread */}
              <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Message History &amp; Internal Notes</h4>
              <div className="space-y-3 mb-6 max-h-72 overflow-y-auto p-1">
                {activeDispute.messages?.length === 0 ? (
                  <div className="text-xs text-slate-400 text-center py-6">No messages recorded.</div>
                ) : (
                  activeDispute.messages.map((m) => {
                    if (m.is_internal_note) {
                      return (
                        <div key={m.id} className="bg-amber-50 border border-amber-300 p-3 rounded-xl text-xs text-amber-900">
                          <div className="flex items-center gap-1.5 font-bold text-2xs text-amber-800 uppercase tracking-wider mb-1">
                            <Lock size={12} /> Internal Staff Note &bull; by {m.sender_name}
                          </div>
                          <div>{m.message}</div>
                          <div className="text-3xs text-amber-600 text-right mt-1">
                            {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      );
                    }

                    const isStaff = m.sender_role === 'staff' || m.sender_role === 'admin';
                    return (
                      <div
                        key={m.id}
                        className={`p-3 rounded-xl text-xs max-w-[85%] ${
                          isStaff
                            ? 'bg-blue-600 text-white ms-auto rounded-tr-none'
                            : 'bg-slate-100 text-slate-800 me-auto rounded-tl-none border border-slate-200'
                        }`}
                      >
                        <div className="font-semibold text-2xs mb-1 opacity-80">
                          {m.sender_name} ({m.sender_role.toUpperCase()})
                        </div>
                        <div>{m.message}</div>
                        {m.attachment_url && (
                          <div className="mt-1.5 pt-1.5 border-t border-white/20">
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className={`underline font-semibold ${isStaff ? 'text-white' : 'text-primary'}`}
                            >
                              Attachment
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

            {/* Staff Reply Box */}
            <form onSubmit={handleSendReply} className="border-t border-slate-200 pt-4 space-y-2">
              <div className="flex items-center justify-between mb-1">
                <span className="text-2xs font-bold text-slate-500 uppercase">Post Message or Note</span>
                <label className="flex items-center gap-1.5 text-2xs font-bold text-amber-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isInternalNote}
                    onChange={(e) => setIsInternalNote(e.target.checked)}
                    className="form-check-input"
                  />
                  <span>Post as Private Internal Note</span>
                </label>
              </div>

              <textarea
                rows="2"
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder={isInternalNote ? "Write staff-only note (never shown to customer)..." : "Write customer-visible reply..."}
                className={`form-control text-xs ${isInternalNote ? 'border-amber-400 bg-amber-50/50' : ''}`}
                required
              />

              <div className="flex items-center justify-between">
                <input
                  type="file"
                  id="admin-dispute-file"
                  className="hidden"
                  onChange={(e) => setReplyAttachment(e.target.files[0])}
                />
                <label
                  htmlFor="admin-dispute-file"
                  className="cursor-pointer text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1"
                >
                  <Paperclip size={14} />
                  {replyAttachment ? replyAttachment.name : 'Attach file'}
                </label>

                <button
                  type="submit"
                  disabled={submittingReply || !replyText.trim()}
                  className={`btn btn-sm text-xs flex items-center gap-1.5 ${isInternalNote ? 'btn-warning text-slate-900' : 'btn-primary'}`}
                >
                  <Send size={14} /> {isInternalNote ? 'Save Note' : 'Send Reply'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

