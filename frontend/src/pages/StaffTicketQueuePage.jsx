import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  Search,
  RotateCw,
  X,
  AlertCircle,
  Clock,
  User,
  ShieldCheck,
  ArrowRight,
  Filter,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  UserPlus,
  BarChart2,
} from 'lucide-react';
import supportService from '../services/supportService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatDateTime, getTicketCategoryLabel } from '../utils/formatters';

export function StaffTicketQueuePage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [assignmentTab, setAssignmentTab] = useState('all'); // 'all', 'me', 'unassigned'
  const [statusFilter, setStatusFilter] = useState('active');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [claimingId, setClaimingId] = useState(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await supportService.getTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load support queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Quick action: Claim / Assign to current staff user
  const handleClaimTicket = async (ticketId) => {
    setClaimingId(ticketId);
    try {
      await supportService.assignTicket(ticketId, user.id);
      showSuccess(`Ticket #${ticketId} assigned to you.`);
      await loadQueue();
    } catch (err) {
      showError(err?.response?.data?.message || 'Failed to claim ticket.');
    } finally {
      setClaimingId(null);
    }
  };

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Assignment tab
      if (assignmentTab === 'me') {
        if (t.assigned_to !== user?.id && t.assigned_to_username !== user?.username) return false;
      } else if (assignmentTab === 'unassigned') {
        if (t.assigned_to) return false;
      }

      // Status
      if (statusFilter !== 'all') {
        if (statusFilter === 'active') {
          if (!['open', 'assigned', 'in_progress', 'waiting_user'].includes(t.status)) return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }

      // Priority
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) {
        return false;
      }

      // Category
      if (categoryFilter !== 'all' && t.category !== categoryFilter) {
        return false;
      }

      // Search
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        return (
          t.ticket_id?.toLowerCase().includes(q) ||
          t.subject?.toLowerCase().includes(q) ||
          t.user_username?.toLowerCase().includes(q) ||
          t.booking_id?.toLowerCase().includes(q) ||
          t.lot_name?.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [tickets, assignmentTab, statusFilter, priorityFilter, categoryFilter, search, user]);

  // Metric counts
  const stats = useMemo(() => {
    const active = tickets.filter((t) => ['open', 'assigned', 'in_progress', 'waiting_user'].includes(t.status));
    const assignedToMe = active.filter((t) => t.assigned_to === user?.id || t.assigned_to_username === user?.username);
    const unassigned = active.filter((t) => !t.assigned_to);
    const highPrio = active.filter((t) => t.priority === 'high');
    return {
      activeCount: active.length,
      assignedToMeCount: assignedToMe.length,
      unassignedCount: unassigned.length,
      highPrioCount: highPrio.length,
    };
  }, [tickets, user]);

  if (loading) {
    return <LoadingSpinner message="Loading operator ticket queue from database..." />;
  }

  return (
    <div className="staff-ticket-queue-page container-fluid px-0">
      {/* Page Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="badge bg-slate-900 text-white text-3xs px-2 py-1">STAFF OPERATIONS</span>
            <span className="text-muted text-2xs">Service Level Agreement (SLA) Queue</span>
          </div>
          <h2 className="fw-bold tracking-tight text-dark mb-0.5">Customer Support Ticket Queue</h2>
          <p className="text-muted small mb-0">
            Monitor real-time customer complaints, slot discrepancies, gate issues, and resolution assignments.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={loadQueue}
            className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
            title="Refresh queue"
          >
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh Queue
          </button>
          {user?.role === 'admin' && (
            <Link
              to="/admin/tickets"
              className="btn btn-outline-primary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
            >
              <BarChart2 size={15} /> Support Analytics
            </Link>
          )}
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="row g-3 mb-4">
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Active Tickets</div>
            <div className="fs-4 fw-black text-dark">{stats.activeCount}</div>
            <div className="text-3xs text-primary mt-0.5">Awaiting staff completion</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Assigned to Me</div>
            <div className="fs-4 fw-black text-indigo">{stats.assignedToMeCount}</div>
            <div className="text-3xs text-muted mt-0.5">Your personal task queue</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Unassigned Queue</div>
            <div className="fs-4 fw-black text-warning-emphasis">{stats.unassignedCount}</div>
            <div className="text-3xs text-warning-emphasis mt-0.5">Needs operator claiming</div>
          </div>
        </div>
        <div className="col-6 col-md-3">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">High Priority</div>
            <div className="fs-4 fw-black text-danger">{stats.highPrioCount}</div>
            <div className="text-3xs text-danger mt-0.5">Urgent attention required</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
        <div className="row g-2.5 align-items-center">
          {/* Assignment Tabs */}
          <div className="col-12 col-md-4 d-flex gap-1">
            <button
              type="button"
              onClick={() => setAssignmentTab('all')}
              className={`btn btn-sm rounded-3 text-xs px-3 py-1.5 transition-all ${
                assignmentTab === 'all' ? 'btn-dark' : 'btn-light border text-muted'
              }`}
            >
              All Tickets
            </button>
            <button
              type="button"
              onClick={() => setAssignmentTab('me')}
              className={`btn btn-sm rounded-3 text-xs px-3 py-1.5 transition-all d-flex align-items-center gap-1 ${
                assignmentTab === 'me' ? 'btn-primary' : 'btn-light border text-muted'
              }`}
            >
              <UserCheck size={13} /> Assigned to Me ({stats.assignedToMeCount})
            </button>
            <button
              type="button"
              onClick={() => setAssignmentTab('unassigned')}
              className={`btn btn-sm rounded-3 text-xs px-3 py-1.5 transition-all d-flex align-items-center gap-1 ${
                assignmentTab === 'unassigned' ? 'btn-warning text-dark' : 'btn-light border text-muted'
              }`}
            >
              <UserPlus size={13} /> Unassigned ({stats.unassignedCount})
            </button>
          </div>

          {/* Search Input */}
          <div className="col-12 col-md-4">
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="form-control form-control-sm border-slate-300 shadow-none ps-2 text-xs py-2"
                placeholder="Search ticket #, subject, driver, lot..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="btn btn-light border-slate-300 text-muted"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Dropdown Filters */}
          <div className="col-6 col-md-2">
            <select
              className="form-select form-select-sm text-xs rounded-3 border-slate-300 py-2"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="active">Active Only</option>
              <option value="all">All Statuses</option>
              <option value="open">Open</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="waiting_user">Waiting for User</option>
              <option value="resolved">Resolved</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div className="col-6 col-md-2">
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
        </div>
      </div>

      {/* Queue Table */}
      {filteredTickets.length > 0 ? (
        <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="bg-light">
                <tr className="text-muted text-2xs text-uppercase border-bottom">
                  <th className="ps-4">Ticket Reference</th>
                  <th>Customer</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assignee</th>
                  <th>Age / Created</th>
                  <th className="text-end pe-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map((t) => {
                  const isAssignedToMe = t.assigned_to === user?.id || t.assigned_to_username === user?.username;
                  const isUnassigned = !t.assigned_to;

                  return (
                    <tr key={t.id || t.ticket_id}>
                      <td className="ps-4" style={{ maxWidth: '300px' }}>
                        <div className="d-flex align-items-center gap-1.5 mb-0.5">
                          <span className="badge bg-slate-900 text-white font-monospace text-2xs px-2 py-0.5 rounded-2">
                            {t.ticket_id}
                          </span>
                        </div>
                        <Link
                          to={`/support/${t.ticket_id}`}
                          className="fw-bold text-dark text-xs text-decoration-none hover-text-primary text-truncate d-block"
                          title={t.subject}
                        >
                          {t.subject}
                        </Link>
                        {t.booking_id && (
                          <div className="text-3xs text-muted font-monospace mt-0.5">
                            Reservation: #{t.booking_id.substring(0, 8)}... ({t.lot_name})
                          </div>
                        )}
                      </td>

                      <td>
                        <div className="text-xs fw-semibold text-dark">@{t.user_username}</div>
                        <div className="text-3xs text-muted">{t.user_name}</div>
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
                        {t.assigned_to_username ? (
                          <span
                            className={`badge text-3xs px-2 py-1 rounded-2 ${
                              isAssignedToMe
                                ? 'bg-primary text-white'
                                : 'bg-light text-slate-700 border'
                            }`}
                          >
                            @{t.assigned_to_username}
                          </span>
                        ) : (
                          <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle text-3xs">
                            Unassigned
                          </span>
                        )}
                      </td>

                      <td>
                        <div className="text-xs text-dark">{formatDateTime(t.created_at)}</div>
                        <div className="text-3xs text-muted d-flex align-items-center gap-1">
                          <Clock size={11} /> {t.messages_count || 0} messages
                        </div>
                      </td>

                      <td className="text-end pe-4">
                        <div className="d-flex align-items-center justify-content-end gap-1.5">
                          {isUnassigned && t.status !== 'closed' && (
                            <button
                              type="button"
                              onClick={() => handleClaimTicket(t.ticket_id)}
                              disabled={claimingId === t.ticket_id}
                              className="btn btn-sm btn-outline-warning text-dark text-xs px-2.5 py-1 rounded-3 d-inline-flex align-items-center gap-1"
                              title="Assign this ticket to me"
                            >
                              <UserCheck size={13} /> {claimingId === t.ticket_id ? 'Claiming...' : 'Claim'}
                            </button>
                          )}
                          <Link
                            to={`/support/${t.ticket_id}`}
                            className="btn btn-sm btn-outline-primary rounded-3 px-2.5 py-1 text-xs d-inline-flex align-items-center gap-1"
                          >
                            Manage <ArrowRight size={13} />
                          </Link>
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
          icon={Briefcase}
          title="No tickets in current queue"
          description="There are currently no tickets matching the active assignment, status, or search filters."
          actionText="Reset Queue Filters"
          onAction={() => {
            setAssignmentTab('all');
            setStatusFilter('all');
            setPriorityFilter('all');
            setCategoryFilter('all');
            setSearch('');
          }}
        />
      )}
    </div>
  );
}

export default StaffTicketQueuePage;
