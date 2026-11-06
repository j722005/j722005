import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  LifeBuoy,
  ArrowLeft,
  CalendarCheck,
  Clock,
  User,
  Paperclip,
  Send,
  Lock,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  FileText,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Car,
  MapPin,
} from 'lucide-react';
import supportService from '../services/supportService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import {
  formatDateTime,
  formatCurrency,
  getTicketCategoryLabel,
} from '../utils/formatters';

export function TicketDetailPage() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const isStaffOrAdmin = user?.role === 'staff' || user?.role === 'admin';

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Reply Composer State
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [replyStatus, setReplyStatus] = useState('');
  const [replyAttachment, setReplyAttachment] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [replyError, setReplyError] = useState('');

  // Reopen Modal State
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Status Change State (Staff Panel)
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Assignment State (Staff Panel)
  const [staffList, setStaffList] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Priority Change State
  const [updatingPriority, setUpdatingPriority] = useState(false);

  // Audit Logs Accordion Toggle
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  const loadTicket = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supportService.getTicketDetail(ticketId);
      setTicket(data);
      setAssigneeId(data.assigned_to ? String(data.assigned_to) : '');
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to load ticket details.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadTicket();
  }, [loadTicket]);

  // Load staff list if user is staff/admin
  useEffect(() => {
    if (isStaffOrAdmin) {
      supportService
        .getStaffList()
        .then((res) => setStaffList(Array.isArray(res) ? res : []))
        .catch((err) => console.error('Failed to load staff list:', err));
    }
  }, [isStaffOrAdmin]);

  const handleSendReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim()) return;

    setSendingReply(true);
    setReplyError('');
    try {
      const payload = {
        message: replyText.trim(),
        attachment: replyAttachment || null,
        is_internal_note: isStaffOrAdmin ? isInternalNote : false,
        status: isStaffOrAdmin && replyStatus ? replyStatus : undefined,
      };

      await supportService.replyTicket(ticketId, payload);
      showSuccess(isInternalNote ? 'Internal staff note recorded.' : 'Reply posted successfully.');
      setReplyText('');
      setReplyAttachment(null);
      setIsInternalNote(false);
      setReplyStatus('');
      await loadTicket();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Failed to post reply.';
      setReplyError(msg);
      showError(msg);
    } finally {
      setSendingReply(false);
    }
  };

  const handleReopenTicket = async (e) => {
    e.preventDefault();
    setReopening(true);
    try {
      await supportService.reopenTicket(ticketId, reopenReason);
      showSuccess('Ticket reopened successfully. Status returned to In Progress.');
      setReopenModalOpen(false);
      setReopenReason('');
      await loadTicket();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to reopen ticket.');
    } finally {
      setReopening(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!window.confirm('Are you sure you want to permanently close this support ticket?')) return;
    try {
      await supportService.closeTicket(ticketId);
      showSuccess('Ticket closed.');
      await loadTicket();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to close ticket.');
    }
  };

  const handleStatusUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!newStatus) return;
    setUpdatingStatus(true);
    try {
      await supportService.updateStatus(ticketId, newStatus, resolutionNotes);
      showSuccess(`Ticket status updated to ${newStatus}.`);
      setStatusModalOpen(false);
      setNewStatus('');
      setResolutionNotes('');
      await loadTicket();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAssignChange = async (e) => {
    const targetId = e.target.value;
    setAssigneeId(targetId);
    setAssigning(true);
    try {
      await supportService.assignTicket(ticketId, targetId || null);
      showSuccess('Ticket assignment updated.');
      await loadTicket();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to assign ticket.');
    } finally {
      setAssigning(false);
    }
  };

  const handlePriorityChange = async (e) => {
    const prio = e.target.value;
    setUpdatingPriority(true);
    try {
      await supportService.updatePriority(ticketId, prio);
      showSuccess(`Priority updated to ${prio.toUpperCase()}.`);
      await loadTicket();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to update priority.');
    } finally {
      setUpdatingPriority(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading support ticket and conversation thread..." />;
  }

  if (error || !ticket) {
    return (
      <div className="container-fluid px-0 max-w-4xl py-5 text-center">
        <AlertCircle size={48} className="text-danger mb-3" />
        <h4 className="fw-bold text-dark mb-1">Ticket Not Accessible</h4>
        <p className="text-muted small mb-4">{error || 'The requested ticket could not be found or access is restricted.'}</p>
        <Link to="/support" className="btn btn-primary rounded-3 text-xs px-4 py-2">
          Return to Support Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="ticket-detail-page container-fluid px-0 max-w-5xl">
      {/* Back Link */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <Link
          to={isStaffOrAdmin ? '/staff/tickets' : '/support'}
          className="text-muted text-xs text-decoration-none d-inline-flex align-items-center gap-1.5 hover-text-dark"
        >
          <ArrowLeft size={14} /> Back to {isStaffOrAdmin ? 'Staff Queue' : 'My Support Tickets'}
        </Link>
        <button
          onClick={loadTicket}
          className="btn btn-sm btn-outline-secondary rounded-3 text-xs d-flex align-items-center gap-1"
          title="Refresh ticket thread"
        >
          <RotateCw size={13} className={loading ? 'spin' : ''} /> Refresh Thread
        </button>
      </div>

      {/* Ticket Header Card */}
      <div className="card border-0 shadow-sm rounded-4 bg-white p-4 mb-4">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
          <div className="flex-grow-1">
            <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
              <span className="badge bg-slate-900 text-white font-monospace text-xs px-2.5 py-1 rounded-2 shadow-xs">
                {ticket.ticket_id}
              </span>
              <span className="badge bg-light text-slate-700 border text-3xs px-2.5 py-1 text-uppercase">
                {ticket.category_display || getTicketCategoryLabel(ticket.category)}
              </span>
              <StatusBadge type="priority" status={ticket.priority} />
              <StatusBadge type="ticket" status={ticket.status} />
            </div>
            <h3 className="fw-black tracking-tight text-slate-900 mb-1">{ticket.subject}</h3>
            <div className="d-flex flex-wrap align-items-center gap-3 text-xs text-muted">
              <span className="d-flex align-items-center gap-1">
                <User size={13} className="text-slate-400" /> Submitted by @{ticket.user_username} ({ticket.user_name})
              </span>
              <span>•</span>
              <span className="d-flex align-items-center gap-1">
                <Clock size={13} className="text-slate-400" /> Opened {formatDateTime(ticket.created_at)}
              </span>
              {ticket.assigned_to_username && (
                <>
                  <span>•</span>
                  <span className="d-flex align-items-center gap-1 text-primary fw-medium">
                    <ShieldCheck size={14} /> Assigned to @{ticket.assigned_to_username}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Customer Lifecycle Controls */}
          <div className="d-flex flex-wrap align-items-center gap-2 flex-shrink-0">
            {ticket.is_reopenable && (
              <button
                type="button"
                onClick={() => setReopenModalOpen(true)}
                className="btn btn-sm btn-warning text-dark text-xs px-3 py-1.5 rounded-3 fw-medium shadow-xs d-flex align-items-center gap-1.5"
              >
                <RotateCw size={13} /> Reopen Ticket
              </button>
            )}

            {ticket.status !== 'closed' && (
              <button
                type="button"
                onClick={handleCloseTicket}
                className="btn btn-sm btn-outline-secondary text-xs px-3 py-1.5 rounded-3 d-flex align-items-center gap-1"
                title="Mark ticket as closed"
              >
                <XCircle size={13} /> Close Ticket
              </button>
            )}
          </div>
        </div>

        {/* Original Issue Description */}
        <div className="mt-4 pt-3 border-top border-slate-100">
          <div className="text-3xs text-uppercase fw-bold text-slate-500 tracking-wider mb-1.5">
            Original Issue Description
          </div>
          <div className="p-3 bg-slate-50 rounded-3 text-xs text-dark whitespace-pre-wrap leading-relaxed">
            {ticket.description}
          </div>

          {/* Original Attachment */}
          {ticket.attachment_url && (
            <div className="mt-2.5 d-flex align-items-center gap-2">
              <a
                href={ticket.attachment_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-light border text-xs px-3 py-1.5 rounded-3 d-inline-flex align-items-center gap-1.5 text-primary text-decoration-none shadow-xs"
              >
                <Paperclip size={13} /> View Attachment ({ticket.attachment_name || 'Proof File'})
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Linked Booking Card (if present) */}
      {ticket.booking_details && (
        <div className="card border-0 shadow-sm rounded-4 bg-white p-3.5 mb-4 border-start border-4 border-primary">
          <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2">
            <div>
              <div className="d-flex align-items-center gap-2 mb-1">
                <span className="badge bg-primary text-white text-3xs font-monospace">ASSOCIATED RESERVATION</span>
                <span className="font-monospace text-xs fw-bold text-dark">Ref #{ticket.booking_details.booking_id}</span>
              </div>
              <div className="text-xs text-muted d-flex flex-wrap gap-2">
                <span>📍 {ticket.booking_details.lot_name} (Slot {ticket.booking_details.slot_number})</span>
                <span>•</span>
                <span>🚗 {ticket.booking_details.vehicle_number}</span>
                <span>•</span>
                <span>💰 {formatCurrency(ticket.booking_details.amount)}</span>
              </div>
            </div>
            <Link
              to="/bookings"
              className="btn btn-sm btn-outline-primary text-xs px-3 py-1 rounded-3 align-self-start align-self-sm-center"
            >
              View in My Bookings
            </Link>
          </div>
        </div>
      )}

      {/* Resolution Notes Banner (if resolved or closed) */}
      {(ticket.status === 'resolved' || ticket.status === 'closed') && ticket.resolution_notes && (
        <div className="alert alert-success border-0 shadow-sm rounded-4 p-4 mb-4 d-flex align-items-start gap-3">
          <CheckCircle2 size={22} className="text-success flex-shrink-0 mt-0.5" />
          <div className="flex-grow-1">
            <h6 className="fw-bold text-success mb-1">Official Support Resolution</h6>
            <p className="text-xs text-slate-800 mb-1 leading-relaxed whitespace-pre-wrap">{ticket.resolution_notes}</p>
            {ticket.resolved_at && (
              <div className="text-3xs text-muted">Resolved on {formatDateTime(ticket.resolved_at)}</div>
            )}
          </div>
        </div>
      )}

      {/* STAFF / ADMIN MANAGEMENT CONTROLS PANEL */}
      {isStaffOrAdmin && (
        <div className="card border-0 shadow-sm rounded-4 bg-slate-900 text-white p-4 mb-4">
          <div className="d-flex align-items-center justify-content-between mb-3 pb-2 border-bottom border-slate-700">
            <div className="d-flex align-items-center gap-2">
              <ShieldCheck size={18} className="text-warning" />
              <span className="fw-bold text-xs tracking-wider text-uppercase">Operator & Admin Control Center</span>
            </div>
            <button
              type="button"
              onClick={() => setShowAuditLogs((prev) => !prev)}
              className="btn btn-sm btn-outline-light border-slate-600 text-2xs px-2.5 py-1 rounded-2 d-flex align-items-center gap-1"
            >
              {showAuditLogs ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Audit History (
              {ticket.audit_logs?.length || 0})
            </button>
          </div>

          <div className="row g-3 text-xs">
            {/* Quick Status Action */}
            <div className="col-12 col-sm-4">
              <label className="text-3xs text-uppercase text-slate-400 fw-bold mb-1 d-block">Change Status</label>
              <button
                type="button"
                onClick={() => {
                  setNewStatus(ticket.status);
                  setResolutionNotes(ticket.resolution_notes || '');
                  setStatusModalOpen(true);
                }}
                className="btn btn-sm btn-primary w-100 rounded-3 text-xs py-2 d-flex align-items-center justify-content-center gap-1.5 shadow-xs"
              >
                Update Status ({ticket.status.toUpperCase()})
              </button>
            </div>

            {/* Quick Assign Action */}
            <div className="col-12 col-sm-4">
              <label className="text-3xs text-uppercase text-slate-400 fw-bold mb-1 d-block">Assign Staff Member</label>
              <select
                className="form-select form-select-sm text-xs rounded-3 bg-slate-800 text-white border-slate-700 py-2"
                value={assigneeId}
                onChange={handleAssignChange}
                disabled={assigning}
              >
                <option value="">-- Unassigned --</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    @{s.username} ({s.name}) [{s.role}]
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Adjustment */}
            <div className="col-12 col-sm-4">
              <label className="text-3xs text-uppercase text-slate-400 fw-bold mb-1 d-block">Adjust Priority</label>
              <select
                className="form-select form-select-sm text-xs rounded-3 bg-slate-800 text-white border-slate-700 py-2"
                value={ticket.priority}
                onChange={handlePriorityChange}
                disabled={updatingPriority}
              >
                <option value="low">Low Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="high">High Priority</option>
              </select>
            </div>
          </div>

          {/* Collapsible Audit History Trail */}
          {showAuditLogs && (
            <div className="mt-3 pt-3 border-top border-slate-700">
              <div className="text-3xs text-uppercase text-slate-400 fw-bold mb-2">Audit Transition Log</div>
              {ticket.audit_logs && ticket.audit_logs.length > 0 ? (
                <div className="table-responsive">
                  <table className="table table-dark table-sm table-borderless text-2xs mb-0">
                    <thead>
                      <tr className="text-slate-400 border-bottom border-slate-700">
                        <th>Timestamp</th>
                        <th>Action</th>
                        <th>Performed By</th>
                        <th>Change Details</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ticket.audit_logs.map((log) => (
                        <tr key={log.id}>
                          <td className="font-monospace text-slate-400">{formatDateTime(log.created_at)}</td>
                          <td>
                            <span className="badge bg-slate-800 text-white font-monospace">{log.action}</span>
                          </td>
                          <td className="text-slate-300">@{log.performed_by_username || 'System'}</td>
                          <td className="text-slate-300">
                            {log.old_value && log.new_value
                              ? `${log.old_value} → ${log.new_value}`
                              : log.new_value || '—'}
                          </td>
                          <td className="text-slate-400 text-truncate" style={{ maxWidth: '200px' }}>
                            {log.notes || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-3xs text-slate-500">No audit log records found yet.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CONVERSATION THREAD */}
      <div className="card border-0 shadow-sm rounded-4 bg-white p-4 mb-4">
        <h5 className="fw-bold tracking-tight text-dark mb-3 d-flex align-items-center gap-2">
          <span>Conversation History</span>
          <span className="badge bg-light text-slate-600 border text-3xs rounded-pill">
            {ticket.messages?.length || 0} messages
          </span>
        </h5>

        {/* Message Items */}
        <div className="d-flex flex-column gap-3 mb-4">
          {ticket.messages && ticket.messages.length > 0 ? (
            ticket.messages.map((msg) => {
              const isStaffMsg = msg.sender_role === 'staff' || msg.sender_role === 'admin';
              const isInternal = msg.is_internal_note;

              return (
                <div
                  key={msg.id}
                  className={`p-3.5 rounded-4 transition-all ${
                    isInternal
                      ? 'bg-amber-50 border-2 border-warning shadow-xs'
                      : isStaffMsg
                      ? 'bg-blue-50/50 border border-blue-200'
                      : 'bg-light border border-slate-200'
                  }`}
                >
                  <div className="d-flex justify-content-between align-items-center mb-1.5">
                    <div className="d-flex align-items-center gap-2">
                      <span className="fw-bold text-xs text-dark">
                        {msg.sender_name} (@{msg.sender_username})
                      </span>
                      {isInternal ? (
                        <span className="badge bg-warning text-dark text-3xs d-flex align-items-center gap-1 font-monospace">
                          <Lock size={10} /> STAFF INTERNAL NOTE
                        </span>
                      ) : isStaffMsg ? (
                        <span className="badge bg-primary text-white text-3xs">
                          {msg.sender_role === 'admin' ? 'SYSTEM ADMIN' : 'SUPPORT AGENT'}
                        </span>
                      ) : (
                        <span className="badge bg-secondary-subtle text-secondary border text-3xs">CUSTOMER</span>
                      )}
                    </div>
                    <span className="text-3xs text-muted font-monospace">{formatDateTime(msg.created_at)}</span>
                  </div>

                  <div className="text-xs text-dark whitespace-pre-wrap leading-relaxed">{msg.message}</div>

                  {msg.attachment_url && (
                    <div className="mt-2.5 pt-2 border-top border-slate-200/60">
                      <a
                        href={msg.attachment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-white border bg-white text-xs px-2.5 py-1 rounded-2 d-inline-flex align-items-center gap-1.5 text-primary text-decoration-none shadow-xs"
                      >
                        <Paperclip size={12} /> {msg.attachment_name || 'View Attachment'}
                      </a>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-center py-4 bg-light rounded-3 text-muted text-xs">
              No replies yet. Use the response composer below to send a message.
            </div>
          )}
        </div>

        {/* REPLY COMPOSER BOX */}
        {ticket.status !== 'closed' ? (
          <form onSubmit={handleSendReply} className="pt-3 border-top">
            <h6 className="fw-bold text-dark text-xs mb-2">Write a Response</h6>

            {replyError && (
              <div className="alert alert-danger p-2.5 rounded-3 mb-2.5 text-xs d-flex align-items-center gap-1.5">
                <AlertCircle size={14} className="text-danger flex-shrink-0" /> {replyError}
              </div>
            )}

            <div className="mb-2.5">
              <textarea
                rows={4}
                className={`form-control text-xs rounded-3 p-3 border-slate-300 ${
                  isInternalNote ? 'bg-amber-50/50 border-warning' : ''
                }`}
                placeholder={
                  isInternalNote
                    ? 'Write internal staff note (visible exclusively to staff and admins)...'
                    : 'Type your message or update here...'
                }
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                required
              />
            </div>

            {/* Composer Options */}
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2.5 mb-2">
              <div className="d-flex flex-wrap align-items-center gap-3">
                {/* File Attachment */}
                <label className="btn btn-sm btn-light border text-xs px-2.5 py-1.5 rounded-3 d-inline-flex align-items-center gap-1 text-muted cursor-pointer mb-0">
                  <Paperclip size={13} />
                  <span>{replyAttachment ? replyAttachment.name.substring(0, 20) + '...' : 'Attach Proof'}</span>
                  <input
                    type="file"
                    className="d-none"
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.gif"
                    onChange={(e) => setReplyAttachment(e.target.files?.[0] || null)}
                  />
                </label>
                {replyAttachment && (
                  <button
                    type="button"
                    onClick={() => setReplyAttachment(null)}
                    className="btn btn-sm btn-link text-danger p-0 text-3xs text-decoration-none"
                  >
                    Remove
                  </button>
                )}

                {/* Staff-Only: Private Internal Note Toggle */}
                {isStaffOrAdmin && (
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input cursor-pointer"
                      type="checkbox"
                      id="internalNoteSwitch"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                    />
                    <label
                      className="form-check-label text-xs fw-semibold text-slate-700 cursor-pointer d-flex align-items-center gap-1"
                      htmlFor="internalNoteSwitch"
                    >
                      <Lock size={12} className={isInternalNote ? 'text-warning' : 'text-slate-400'} />
                      Private Staff Note
                    </label>
                  </div>
                )}
              </div>

              {/* Staff-Only: Optional Status Quick-Change with Reply */}
              {isStaffOrAdmin && !isInternalNote && (
                <div className="d-flex align-items-center gap-1.5">
                  <span className="text-3xs text-muted">Update Status To:</span>
                  <select
                    className="form-select form-select-sm text-xs rounded-2 py-1 pe-4 border-slate-300"
                    value={replyStatus}
                    onChange={(e) => setReplyStatus(e.target.value)}
                  >
                    <option value="">(Keep Current)</option>
                    <option value="waiting_user">Waiting for User</option>
                    <option value="in_progress">In Progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                </div>
              )}
            </div>

            {/* Send Button */}
            <div className="d-flex justify-content-end">
              <button
                type="submit"
                disabled={sendingReply}
                className={`btn text-xs px-4 py-2 rounded-3 fw-medium shadow-xs d-flex align-items-center gap-1.5 ${
                  isInternalNote ? 'btn-warning text-dark' : 'btn-primary'
                }`}
              >
                {sendingReply ? (
                  <>
                    <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send size={14} /> {isInternalNote ? 'Post Internal Staff Note' : 'Send Message'}
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="p-3 bg-light rounded-3 text-center text-muted text-xs">
            <Lock size={14} className="d-inline me-1" /> This support ticket is closed and archived.
          </div>
        )}
      </div>

      {/* REOPEN MODAL */}
      <Modal
        isOpen={reopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        title="Reopen Support Ticket"
      >
        <form onSubmit={handleReopenTicket}>
          <p className="text-xs text-muted mb-3">
            Please indicate why the issue requires further assistance so our staff can follow up immediately.
          </p>
          <div className="mb-3">
            <label className="form-label text-xs fw-bold text-dark">Reason for Reopening</label>
            <textarea
              rows={3}
              className="form-control text-xs rounded-3 border-slate-300"
              placeholder="e.g. The barrier code is still returning invalid session, or issue still persists..."
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              required
            />
          </div>
          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light border text-xs"
              onClick={() => setReopenModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={reopening}
              className="btn btn-sm btn-warning text-dark text-xs px-3 shadow-xs"
            >
              {reopening ? 'Reopening...' : 'Confirm Reopen'}
            </button>
          </div>
        </form>
      </Modal>

      {/* STATUS UPDATE MODAL (STAFF) */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        title="Update Ticket Lifecycle Status"
      >
        <form onSubmit={handleStatusUpdateSubmit}>
          <div className="mb-3">
            <label className="form-label text-xs fw-bold text-dark">Select Status</label>
            <select
              className="form-select text-xs rounded-3 border-slate-300"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              required
            >
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_user">Waiting for User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          {(newStatus === 'resolved' || newStatus === 'closed') && (
            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-dark">Resolution Details / Explanation</label>
              <textarea
                rows={3}
                className="form-control text-xs rounded-3 border-slate-300"
                placeholder="Explain the solution provided to the customer..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                required={newStatus === 'resolved'}
              />
            </div>
          )}

          <div className="d-flex justify-content-end gap-2">
            <button
              type="button"
              className="btn btn-sm btn-light border text-xs"
              onClick={() => setStatusModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={updatingStatus}
              className="btn btn-sm btn-primary text-xs px-4 shadow-xs"
            >
              {updatingStatus ? 'Updating...' : 'Save Status'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TicketDetailPage;
