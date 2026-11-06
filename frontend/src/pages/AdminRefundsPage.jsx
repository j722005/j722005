import React, { useState, useEffect } from 'react';
import {
  RotateCcw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  FileText,
  User,
  Building,
  Calendar,
  ChevronRight,
  X,
  Paperclip,
  Check,
  ShieldCheck,
  HelpCircle,
  RefreshCw
} from 'lucide-react';
import { refundService } from '../services/refundService';

export default function AdminRefundsPage() {
  const [loading, setLoading] = useState(true);
  const [refunds, setRefunds] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [reasonFilter, setReasonFilter] = useState('all');

  const [activeRefund, setActiveRefund] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Action states
  const [actionType, setActionType] = useState(null); // 'review' | 'request_info' | 'approve' | 'reject' | 'process'
  const [actionNotes, setActionNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvedAmount, setApprovedAmount] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  useEffect(() => {
    loadRefunds();
    loadSummary();
  }, [statusFilter, reasonFilter]);

  const loadRefunds = async () => {
    setLoading(true);
    try {
      const res = await refundService.getAdminRefunds({
        status: statusFilter,
        reason: reasonFilter,
        search,
      });
      setRefunds(res.results || res);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await refundService.getAdminRefundSummary();
      setSummary(res);
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDetail = async (refundId) => {
    setLoadingDetail(true);
    setActionType(null);
    setActionNotes('');
    setRejectionReason('');
    setApprovedAmount('');
    try {
      const res = await refundService.getRefundDetail(refundId);
      setActiveRefund(res);
      setApprovedAmount(res.amount);
    } catch (err) {
      alert('Failed to load refund details.');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleExecuteAction = async (e) => {
    e.preventDefault();
    if (!actionType) return;

    if (actionType === 'reject' && !rejectionReason.trim()) {
      alert('A rejection reason is strictly mandatory.');
      return;
    }

    setSubmittingAction(true);
    try {
      const payload = {
        action: actionType,
        notes: actionNotes,
        rejection_reason: rejectionReason,
        approved_amount: approvedAmount || undefined,
      };

      const res = await refundService.adminRefundAction(activeRefund.refund_id, payload);
      setActiveRefund(res);
      setActionSuccess(`Action "${actionType.toUpperCase()}" applied successfully.`);
      setActionType(null);
      loadRefunds();
      loadSummary();
    } catch (err) {
      alert(err.response?.data?.message || 'Error executing refund action.');
    } finally {
      setSubmittingAction(false);
    }
  };

  const getStatusBadge = (st) => {
    const map = {
      requested: 'bg-amber-100 text-amber-800 border-amber-300',
      under_review: 'bg-blue-100 text-blue-800 border-blue-300',
      info_required: 'bg-purple-100 text-purple-800 border-purple-300',
      approved: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      processing: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      completed: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      rejected: 'bg-rose-100 text-rose-800 border-rose-300',
      failed: 'bg-red-100 text-red-800 border-red-300',
      cancelled: 'bg-slate-100 text-slate-700 border-slate-300',
    };
    return (
      <span className={`px-2 py-0.5 text-2xs font-bold rounded-full border ${map[st] || 'bg-slate-100 text-slate-700'}`}>
        {st?.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <RotateCcw size={24} />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Refund Management Portal</h1>
              <p className="text-xs text-slate-500">
                Staff administration for customer refund requests, approval decisions, and simulated disbursement.
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={() => { loadRefunds(); loadSummary(); }}
          className="btn btn-outline-secondary btn-sm flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* KPI Counters */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Pending Review</div>
            <div className="text-2xl font-bold text-amber-600 mt-1">{summary.pending_approval}</div>
            <div className="text-2xs text-slate-400 mt-1">Requires staff decision</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Approved / Processing</div>
            <div className="text-2xl font-bold text-indigo-600 mt-1">{summary.approved + summary.processing}</div>
            <div className="text-2xs text-slate-400 mt-1">Queued for execution</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Completed Refunds</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{summary.completed}</div>
            <div className="text-2xs text-emerald-700 font-semibold mt-1">₹{summary.total_refunded_amount.toFixed(2)} refunded</div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase">Total Requests</div>
            <div className="text-2xl font-bold text-slate-900 mt-1">{summary.total}</div>
            <div className="text-2xs text-slate-400 mt-1">{summary.rejected} rejected &bull; {summary.cancelled} cancelled</div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search refund ID, customer, booking ID, payment ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadRefunds()}
            className="form-control ps-5 text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="form-select text-sm w-auto"
        >
          <option value="all">All Statuses</option>
          <option value="requested">Requested</option>
          <option value="under_review">Under Review</option>
          <option value="info_required">Info Required</option>
          <option value="approved">Approved</option>
          <option value="processing">Processing</option>
          <option value="completed">Completed</option>
          <option value="rejected">Rejected</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="form-select text-sm w-auto"
        >
          <option value="all">All Reasons</option>
          <option value="booking_cancelled">Booking Cancelled</option>
          <option value="duplicate_payment">Duplicate Payment</option>
          <option value="incorrect_amount">Incorrect Amount</option>
          <option value="service_unavailable">Service Unavailable</option>
          <option value="technical_issue">Technical Issue</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-slate-500">Loading refund requests...</div>
        ) : refunds.length === 0 ? (
          <div className="text-center py-16 text-slate-400">No refund requests matching current filter.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Refund ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Lot / Booking</th>
                  <th className="py-3 px-4">Amount (₹)</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Requested At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {refunds.map((rf) => (
                  <tr key={rf.refund_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">{rf.refund_id}</td>
                    <td className="py-3 px-4 font-medium">{rf.user_name}</td>
                    <td className="py-3 px-4">
                      <div>{rf.lot_name}</div>
                      <span className="text-2xs text-slate-400 font-mono">#{rf.booking_id?.slice(0, 8)}</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">
                      ₹{parseFloat(rf.approved_amount || rf.amount).toFixed(2)}
                    </td>
                    <td className="py-3 px-4">{rf.reason_display}</td>
                    <td className="py-3 px-4">{getStatusBadge(rf.status)}</td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(rf.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleOpenDetail(rf.refund_id)}
                        className="btn btn-sm btn-outline-primary py-1 px-3 text-2xs"
                      >
                        Inspect &bull; Action
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
      {/* DRAWER: Staff Inspect & Action Panel */}
      {/* ========================================================================= */}
      {activeRefund && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl overflow-y-auto p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
                <div>
                  <span className="font-mono text-xs font-bold text-slate-500">{activeRefund.refund_id}</span>
                  <h3 className="text-lg font-bold text-slate-900">Refund Administration</h3>
                </div>
                <button onClick={() => setActiveRefund(null)} className="text-slate-400 hover:text-slate-600">
                  <X size={22} />
                </button>
              </div>

              {actionSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs mb-4 flex items-center justify-between">
                  <span>{actionSuccess}</span>
                  <button onClick={() => setActionSuccess('')}><X size={14} /></button>
                </div>
              )}

              {/* Status Header */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-5 flex items-center justify-between">
                <div>
                  <div className="text-2xs text-slate-500 uppercase font-bold">Lifecycle State</div>
                  <div className="mt-1">{getStatusBadge(activeRefund.status)}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xs text-slate-500 uppercase font-bold">Requested / Approved</div>
                  <div className="text-lg font-bold text-slate-900">₹{activeRefund.amount}</div>
                  {activeRefund.approved_amount && (
                    <div className="text-xs text-indigo-700 font-bold">
                      Approved: ₹{activeRefund.approved_amount}
                    </div>
                  )}
                </div>
              </div>

              {/* Customer & Booking Details */}
              <div className="space-y-4 mb-5">
                <div>
                  <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer &amp; Booking Info</h4>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-600">
                    <div>Customer: <span className="font-semibold text-slate-800">{activeRefund.user?.name} ({activeRefund.user?.email})</span></div>
                    <div>Lot: <span className="font-semibold text-slate-800">{activeRefund.booking?.lot_name} (Slot {activeRefund.booking?.slot_number})</span></div>
                    <div>Vehicle: <span className="font-mono text-slate-800">{activeRefund.booking?.vehicle_number}</span></div>
                    <div>Booking Status: <span className="font-semibold">{activeRefund.booking?.status_display}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Original Payment Info</h4>
                  <div className="bg-white border border-slate-200 rounded-lg p-3 text-xs space-y-1 text-slate-600">
                    <div>Payment Txn: <span className="font-mono text-slate-800">{activeRefund.payment?.transaction_id}</span></div>
                    <div>Amount Paid: ₹{activeRefund.payment?.amount} via {activeRefund.payment?.method_display}</div>
                  </div>
                </div>

                {/* Customer Explanation & Evidence */}
                <div>
                  <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Customer Reason &amp; Explanation</h4>
                  <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-2 border border-slate-200">
                    <div>Reason: <span className="font-semibold text-slate-800">{activeRefund.reason_display}</span></div>
                    {activeRefund.explanation && <div>Explanation: {activeRefund.explanation}</div>}
                    {activeRefund.customer_notes && (
                      <div className="bg-purple-50 p-2 rounded text-purple-900">
                        <span className="font-bold">Customer Clarification:</span> {activeRefund.customer_notes}
                      </div>
                    )}
                    {activeRefund.attachment_url && (
                      <div>
                        <a
                          href={activeRefund.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-outline-secondary btn-sm text-2xs inline-flex items-center gap-1"
                        >
                          <Paperclip size={12} /> View Customer Document
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Simulated Refund Execution Receipt */}
                {activeRefund.transaction && (
                  <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl text-xs space-y-1 text-emerald-900">
                    <div className="font-bold text-sm text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle size={16} /> Refund Executed
                    </div>
                    <div>Transaction Ref: <span className="font-mono font-bold">{activeRefund.transaction.transaction_reference}</span></div>
                    <div>Amount: ₹{activeRefund.transaction.amount} ({activeRefund.transaction.is_simulation ? 'Simulated Transfer' : 'Gateway'})</div>
                    <div>Channel: <span className="uppercase">{activeRefund.transaction.payment_channel}</span></div>
                    <div className="text-2xs text-emerald-700 italic pt-1">{activeRefund.transaction.gateway_provider}</div>
                  </div>
                )}

                {/* Administrative Action Selection */}
                {!activeRefund.is_terminal && activeRefund.status !== 'completed' && (
                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm space-y-3">
                    <h4 className="text-xs font-bold text-slate-800">Administrative Decision</h4>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActionType('review')}
                        className={`btn btn-sm text-xs ${actionType === 'review' ? 'btn-primary' : 'btn-outline-primary'}`}
                      >
                        Start Review
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionType('request_info')}
                        className={`btn btn-sm text-xs ${actionType === 'request_info' ? 'btn-purple bg-purple-600 text-white' : 'btn-outline-secondary'}`}
                      >
                        Request More Info
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionType('approve')}
                        className={`btn btn-sm text-xs ${actionType === 'approve' ? 'btn-success' : 'btn-outline-success'}`}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionType('process')}
                        className={`btn btn-sm text-xs ${actionType === 'process' ? 'btn-info text-white' : 'btn-outline-info'}`}
                      >
                        Execute Refund
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionType('reject')}
                        className={`btn btn-sm text-xs ${actionType === 'reject' ? 'btn-danger' : 'btn-outline-danger'}`}
                      >
                        Reject
                      </button>
                    </div>

                    {actionType && (
                      <form onSubmit={handleExecuteAction} className="pt-3 border-t border-slate-100 space-y-3">
                        {actionType === 'approve' && (
                          <div>
                            <label className="form-label text-2xs font-bold text-slate-600">Approved Amount (₹)</label>
                            <input
                              type="number"
                              step="0.01"
                              max={activeRefund.amount}
                              value={approvedAmount}
                              onChange={(e) => setApprovedAmount(e.target.value)}
                              className="form-control text-xs font-bold"
                              required
                            />
                            <span className="text-3xs text-slate-400">Can be full (₹{activeRefund.amount}) or partial.</span>
                          </div>
                        )}

                        {actionType === 'reject' && (
                          <div>
                            <label className="form-label text-2xs font-bold text-rose-700">Mandatory Rejection Reason *</label>
                            <textarea
                              rows="2"
                              value={rejectionReason}
                              onChange={(e) => setRejectionReason(e.target.value)}
                              placeholder="State explicit reason for declining this request..."
                              className="form-control text-xs border-rose-300"
                              required
                            />
                          </div>
                        )}

                        {actionType === 'process' && (
                          <div className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded text-2xs">
                            <span className="font-bold">Sandbox Execution Notice:</span> This executes a documented simulated refund transaction and records the financial reference.
                          </div>
                        )}

                        <div>
                          <label className="form-label text-2xs font-bold text-slate-600">Internal Audit / Decision Notes</label>
                          <textarea
                            rows="2"
                            value={actionNotes}
                            onChange={(e) => setActionNotes(e.target.value)}
                            placeholder="Add notes for this administrative action..."
                            className="form-control text-xs"
                          />
                        </div>

                        <button
                          type="submit"
                          disabled={submittingAction}
                          className="btn btn-primary btn-sm text-xs w-full"
                        >
                          {submittingAction ? 'Applying Action...' : `Confirm & Apply ${actionType.toUpperCase()}`}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* Audit Trail */}
                {activeRefund.audit_logs?.length > 0 && (
                  <div>
                    <h4 className="text-2xs font-bold text-slate-400 uppercase tracking-wider mb-2">Audit Trail</h4>
                    <div className="space-y-1.5">
                      {activeRefund.audit_logs.map((log) => (
                        <div key={log.id} className="text-2xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100 flex items-start justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">{log.action.replace('_', ' ')}</span> by {log.performed_by_name}
                            {log.notes && <div className="text-slate-500 mt-0.5">{log.notes}</div>}
                          </div>
                          <span className="text-slate-400 shrink-0">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3 text-right">
              <button
                onClick={() => setActiveRefund(null)}
                className="btn btn-secondary btn-sm text-xs"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

