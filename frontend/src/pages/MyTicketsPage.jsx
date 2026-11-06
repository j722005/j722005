import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  LifeBuoy,
  PlusCircle,
  Search,
  RotateCw,
  X,
  AlertCircle,
  MessageSquare,
  Clock,
  ArrowRight,
  Filter,
  CheckCircle2,
  Paperclip,
  Calendar,
} from 'lucide-react';
import supportService from '../services/supportService';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDateTime, getTicketCategoryLabel } from '../utils/formatters';

const STATUS_TABS = [
  { id: 'all', label: 'All Tickets' },
  { id: 'active', label: 'Active / In Progress' },
  { id: 'waiting_user', label: 'Needs My Reply' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'closed', label: 'Closed' },
];

export function MyTicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supportService.getTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load support tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') {
          if (!['open', 'assigned', 'in_progress', 'waiting_user'].includes(t.status)) return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      // Priority filter
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) {
        return false;
      }
      // Category filter
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }
      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          t.ticket_id?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.booking_id?.toLowerCase().includes(q) ||
          t.lot_name?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, priorityFilter, categoryFilter, search]);

  if (loading) {
    return <LoadingSpinner message="Fetching your support tickets and complaint status..." />;
  }

  return (
    <div className="my-tickets-page container-fluid px-0">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">My Support Tickets & Inquiries</h2>
          <p className="text-muted small mb-0">
            Track customer complaints, gate access requests, refund tracking, and operator conversation history.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={loadTickets}
            className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
            title="Refresh tickets"
          >
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <Link
            to="/support/new"
            className="btn btn-primary rounded-3 px-3.5 py-2 text-xs d-flex align-items-center gap-2 shadow-xs"
          >
            <PlusCircle size={15} /> Create Support Ticket
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="alert alert-danger shadow-xs rounded-4 p-3.5 mb-4 d-flex align-items-center gap-2.5 text-xs">
          <AlertCircle size={18} className="text-danger flex-shrink-0" />
          <div className="flex-grow-1">{error}</div>
          <button onClick={loadTickets} className="btn btn-sm btn-outline-danger text-xs py-1 px-2.5 rounded-2">
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
        <div className="row g-2.5 align-items-center">
          {/* Search */}
          <div className="col-12 col-lg-4">
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                <Search size={15} />
              </span>
              <input
                type="text"
                className="form-control border-slate-300 shadow-none ps-2 text-xs py-2"
                placeholder="Search ticket ID, subject, or reservation..."
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

          {/* Category Filter */}
          <div className="col-6 col-sm-4 col-lg-2">
            <select
              className="form-select form-select-sm text-xs rounded-3 border-slate-300 py-2"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All Categories</option>
              <option value="booking_issue">Booking Issue</option>
              <option value="payment_issue">Payment Issue</option>
              <option value="slot_availability">Slot Availability</option>
              <option value="qr_ticket">QR Ticket</option>
              <option value="refund_request">Refund Request</option>
              <option value="account_issue">Account Issue</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Priority Filter */}
          <div className="col-6 col-sm-4 col-lg-2">
            <select
              className="form-select form-select-sm text-xs rounded-3 border-slate-300 py-2"
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
            >
              <option value="all">All Priorities</option>
              <option value="high">High Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="low">Low Priority</option>
            </select>
          </div>

          {/* Status Tabs */}
          <div className="col-12 col-lg-4 d-flex flex-wrap justify-content-lg-end gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`btn btn-sm rounded-pill text-xs px-2.5 py-1 transition-all ${
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

      {/* Tickets Table / List */}
      {filteredTickets.length > 0 ? (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="bg-light">
                <tr className="text-muted text-2xs text-uppercase border-bottom">
                  <th className="ps-4">Ticket ID & Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Associated Booking</th>
                  <th>Latest Activity</th>
                  <th className="text-end pe-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => (
                  <tr key={t.id || t.ticket_id}>
                    <td className="ps-4" style={{ maxWidth: '320px' }}>
                      <div className="d-flex align-items-center gap-1.5 mb-0.5">
                        <span className="badge bg-slate-900 text-white font-monospace text-2xs px-2 py-0.5 rounded-2">
                          {t.ticket_id}
                        </span>
                        {t.has_attachment && (
                          <span title="Contains attachment" className="text-muted">
                            <Paperclip size={12} />
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/support/${t.ticket_id}`}
                        className="fw-bold text-dark text-xs text-decoration-none hover-text-primary text-truncate d-block"
                        title={t.subject}
                      >
                        {t.subject}
                      </Link>
                      {t.latest_message && (
                        <div className="text-3xs text-muted text-truncate mt-0.5">
                          <span className="fw-semibold">@{t.latest_message.sender_username}:</span>{' '}
                          {t.latest_message.message}
                        </div>
                      )}
                    </td>

                    <td>
                      <span className="badge bg-light text-slate-700 border text-3xs px-2 py-1 text-capitalize">
                        {t.category_display || getTicketCategoryLabel(t.category)}
                      </span>
                    </td>

                    <td>
                      <StatusBadge type="priority" status={t.priority} />
                    </td>

                    <td>
                      <StatusBadge type="ticket" status={t.status} />
                    </td>

                    <td>
                      {t.booking_id ? (
                        <div className="text-xs">
                          <div className="font-monospace text-primary text-2xs fw-semibold">
                            Ref #{t.booking_id.substring(0, 8)}...
                          </div>
                          {t.lot_name && <div className="text-3xs text-muted">{t.lot_name}</div>}
                        </div>
                      ) : (
                        <span className="text-muted text-3xs">—</span>
                      )}
                    </td>

                    <td>
                      <div className="text-xs text-dark">{formatDateTime(t.updated_at || t.created_at)}</div>
                      <div className="text-3xs text-muted d-flex align-items-center gap-1">
                        <MessageSquare size={11} /> {t.messages_count || 0} message{t.messages_count === 1 ? '' : 's'}
                      </div>
                    </td>

                    <td className="text-end pe-4">
                      <Link
                        to={`/support/${t.ticket_id}`}
                        className="btn btn-sm btn-outline-primary rounded-3 px-3 py-1 text-xs d-inline-flex align-items-center gap-1"
                      >
                        View <ArrowRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={LifeBuoy}
          title={
            statusFilter !== 'all' || search.trim() || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? 'No tickets match your filters'
              : 'No Support Tickets Found'
          }
          description={
            statusFilter !== 'all' || search.trim() || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? 'Try clearing your search keyword or relaxing category and priority filters.'
              : 'You do not have any open customer complaints or tickets. Need help with a booking or gate pass?'
          }
          actionText={
            statusFilter !== 'all' || search.trim() || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? 'Reset All Filters'
              : 'Create New Support Ticket'
          }
          onAction={
            statusFilter !== 'all' || search.trim() || priorityFilter !== 'all' || categoryFilter !== 'all'
              ? () => {
                  setStatusFilter('all');
                  setPriorityFilter('all');
                  setCategoryFilter('all');
                  setSearch('');
                }
              : () => (window.location.href = '/support/new')
          }
        />
      )}
    </div>
  );
}

export default MyTicketsPage;
