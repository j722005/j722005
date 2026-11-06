import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Check, Clock, AlertTriangle, Info, CheckCircle2, X,
  Trash2, Archive, Filter, Search, RefreshCw, CheckCheck,
  Send, Megaphone, Mail, ShieldAlert, ArrowLeft, ChevronLeft, ChevronRight,
  ExternalLink, Calendar, CreditCard, Ticket, Award, LifeBuoy, Shield
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import notificationService from '../services/notificationService';
import { formatDateTime } from '../utils/formatters';

const CATEGORIES = [
  { key: 'all', label: 'All Categories' },
  { key: 'booking', label: 'Bookings' },
  { key: 'payment', label: 'Payments' },
  { key: 'hold_expiry', label: 'Hold Expiries' },
  { key: 'gate_pass', label: 'Gate Passes / QR' },
  { key: 'membership', label: 'Memberships' },
  { key: 'monthly_pass', label: 'Monthly Passes' },
  { key: 'loyalty', label: 'Loyalty Rewards' },
  { key: 'support_ticket', label: 'Support Tickets' },
  { key: 'announcement', label: 'Announcements' },
  { key: 'system', label: 'System Alerts' },
];

const CATEGORY_ICONS = {
  booking: Calendar,
  payment: CreditCard,
  hold_expiry: Clock,
  gate_pass: CheckCircle2,
  membership: Shield,
  monthly_pass: Ticket,
  loyalty: Award,
  support_ticket: LifeBuoy,
  announcement: Megaphone,
  system: Info,
};

const CATEGORY_COLORS = {
  booking: 'primary',
  payment: 'success',
  hold_expiry: 'warning',
  gate_pass: 'info',
  membership: 'primary',
  monthly_pass: 'info',
  loyalty: 'warning',
  support_ticket: 'danger',
  announcement: 'danger',
  system: 'secondary',
};

export function NotificationHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Pagination
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [readFilter, setReadFilter] = useState('all'); // 'all', 'unread', 'read'
  const [includeArchived, setIncludeArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Email status state
  const [emailStatus, setEmailStatus] = useState(null);

  // Announcement state (Admin only)
  const [showAnnounceModal, setShowAnnounceModal] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [announceTitle, setAnnounceTitle] = useState('');
  const [announceMessage, setAnnounceMessage] = useState('');
  const [announceTargetRole, setAnnounceTargetRole] = useState('all');
  const [announceSendEmail, setAnnounceSendEmail] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  const [announceSuccess, setAnnounceSuccess] = useState('');
  const [announceError, setAnnounceError] = useState('');

  // Maintenance state
  const [runningMaintenance, setRunningMaintenance] = useState(false);
  const [maintenanceResult, setMaintenanceResult] = useState(null);

  const isAdmin = user?.role === 'admin' || user?.is_superuser;
  const isStaff = user?.role === 'staff' || user?.is_staff || isAdmin;

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        page: currentPage,
        page_size: 15,
        archived: includeArchived,
      };

      if (selectedCategory && selectedCategory !== 'all') {
        params.category = selectedCategory;
      }
      if (readFilter === 'unread') {
        params.is_read = 'false';
      } else if (readFilter === 'read') {
        params.is_read = 'true';
      }
      if (searchQuery.trim()) {
        params.search = searchQuery.trim();
      }

      const res = await notificationService.getNotifications(params);
      if (res && res.results) {
        setNotifications(res.results);
        setTotalCount(res.count || 0);
        setTotalPages(Math.ceil((res.count || 0) / 15) || 1);
      } else if (Array.isArray(res)) {
        setNotifications(res);
        setTotalCount(res.length);
        setTotalPages(1);
      } else {
        setNotifications([]);
        setTotalCount(0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
      setError('Unable to load notification history. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, selectedCategory, readFilter, includeArchived, searchQuery]);

  const loadEmailStatus = async () => {
    try {
      const data = await notificationService.getEmailStatus();
      setEmailStatus(data);
    } catch (err) {
      console.warn('Could not query email status:', err);
    }
  };

  const loadPastAnnouncements = async () => {
    if (isAdmin) {
      try {
        const list = await notificationService.getAdminAnnouncements();
        setAnnouncements(list);
      } catch (err) {
        console.warn('Could not load announcements:', err);
      }
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    loadEmailStatus();
    if (isAdmin) {
      loadPastAnnouncements();
    }
  }, [isAdmin]);

  const handleMarkAsRead = async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const categoryParam = selectedCategory !== 'all' ? selectedCategory : null;
      await notificationService.markAllAsRead(categoryParam);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const handleArchive = async (id) => {
    try {
      await notificationService.archiveNotification(id);
      if (!includeArchived) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotalCount((prev) => Math.max(0, prev - 1));
      } else {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, is_archived: true } : n))
        );
      }
    } catch (err) {
      console.error('Failed to archive notification:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notification permanently?')) return;
    try {
      await notificationService.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      setTotalCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleClearAllRead = async () => {
    if (!window.confirm('Archive all read notifications?')) return;
    try {
      await notificationService.clearAllRead('archive');
      fetchNotifications();
    } catch (err) {
      console.error('Failed to clear read notifications:', err);
    }
  };

  const handleSendAnnouncement = async (e) => {
    e.preventDefault();
    if (!announceTitle.trim() || !announceMessage.trim()) {
      setAnnounceError('Please provide both title and announcement body.');
      return;
    }
    setAnnouncing(true);
    setAnnounceError('');
    setAnnounceSuccess('');
    try {
      const res = await notificationService.createAnnouncement({
        title: announceTitle.trim(),
        message: announceMessage.trim(),
        target_role: announceTargetRole,
        send_email: announceSendEmail,
      });
      setAnnounceSuccess(
        `Announcement sent successfully to ${res?.delivery_stats?.total_recipients || 0} user(s).`
      );
      setAnnounceTitle('');
      setAnnounceMessage('');
      loadPastAnnouncements();
      fetchNotifications();
    } catch (err) {
      setAnnounceError(err.response?.data?.message || 'Failed to dispatch announcement.');
    } finally {
      setAnnouncing(false);
    }
  };

  const handleRunExpiryCheck = async () => {
    setRunningMaintenance(true);
    setMaintenanceResult(null);
    try {
      const res = await notificationService.runExpiryCheck();
      setMaintenanceResult(res?.results);
      fetchNotifications();
    } catch (err) {
      console.error('Maintenance error:', err);
    } finally {
      setRunningMaintenance(false);
    }
  };

  return (
    <div className="container-fluid py-4 px-3 px-lg-4 max-w-7xl">
      {/* Breadcrumb & Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/customer" className="text-decoration-none text-muted small d-inline-flex align-items-center gap-1 hover-text-primary">
              <ArrowLeft size={14} /> Dashboard
            </Link>
            <span className="text-muted small">/</span>
            <span className="text-slate-800 small fw-medium">Notification Center</span>
          </div>
          <h2 className="h4 fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <Bell className="text-primary" size={24} /> Notification & Alert Center
          </h2>
          <p className="text-muted small m-0 mt-1">
            Live centralized event updates, booking alerts, payment receipts, and administrative broadcasts.
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            onClick={fetchNotifications}
            disabled={loading}
            className="btn btn-sm btn-outline-secondary rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
            title="Refresh alerts"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>

          <button
            type="button"
            onClick={handleMarkAllAsRead}
            className="btn btn-sm btn-outline-primary rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
          >
            <CheckCheck size={14} /> Mark All Read
          </button>

          <button
            type="button"
            onClick={handleClearAllRead}
            className="btn btn-sm btn-outline-secondary rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
            title="Archive all read notifications"
          >
            <Archive size={14} /> Clean Read
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowAnnounceModal(!showAnnounceModal)}
              className="btn btn-sm btn-danger rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs text-white"
            >
              <Megaphone size={14} /> {showAnnounceModal ? 'Hide Announcement Panel' : 'Broadcast Announcement'}
            </button>
          )}

          {isStaff && (
            <button
              type="button"
              onClick={handleRunExpiryCheck}
              disabled={runningMaintenance}
              className="btn btn-sm btn-warning rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs text-dark"
              title="Expire overdue holds, passes, and memberships"
            >
              <Clock size={14} /> {runningMaintenance ? 'Checking...' : 'Check Expiries'}
            </button>
          )}
        </div>
      </div>

      {/* Maintenance Feedback Alert */}
      {maintenanceResult && (
        <div className="alert alert-info border-0 rounded-3 shadow-xs mb-4 d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <Clock size={16} />
            <span className="small">
              <strong>Maintenance Results:</strong> Cancelled {maintenanceResult.expired_bookings_cancelled} expired hold(s), marked {maintenanceResult.expired_memberships} expired membership(s), and {maintenanceResult.expired_passes} expired pass(es).
            </span>
          </div>
          <button type="button" className="btn-close" onClick={() => setMaintenanceResult(null)}></button>
        </div>
      )}

      {/* Admin Broadcast Announcement Panel */}
      {isAdmin && showAnnounceModal && (
        <div className="card border-0 shadow-sm rounded-4 mb-4 bg-light border border-danger border-opacity-25">
          <div className="card-header bg-danger text-white rounded-top-4 py-2.5 px-3 d-flex justify-content-between align-items-center">
            <span className="fw-semibold text-sm d-flex align-items-center gap-2">
              <Megaphone size={16} /> Admin Announcement Broadcaster
            </span>
            <span className="badge bg-white text-danger text-2xs">Admin Controlled</span>
          </div>
          <div className="card-body p-3 p-md-4">
            {announceSuccess && (
              <div className="alert alert-success border-0 rounded-3 py-2 px-3 small mb-3">
                {announceSuccess}
              </div>
            )}
            {announceError && (
              <div className="alert alert-danger border-0 rounded-3 py-2 px-3 small mb-3">
                {announceError}
              </div>
            )}

            <form onSubmit={handleSendAnnouncement}>
              <div className="row g-3">
                <div className="col-12 col-md-8">
                  <label className="form-label text-xs fw-semibold text-dark">Announcement Title *</label>
                  <input
                    type="text"
                    required
                    value={announceTitle}
                    onChange={(e) => setAnnounceTitle(e.target.value)}
                    placeholder="e.g., Scheduled Bay Maintenance at City Mall this Sunday"
                    className="form-control form-control-sm rounded-3"
                  />
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label text-xs fw-semibold text-dark">Target Role *</label>
                  <select
                    value={announceTargetRole}
                    onChange={(e) => setAnnounceTargetRole(e.target.value)}
                    className="form-select form-select-sm rounded-3"
                  >
                    <option value="all">All Users</option>
                    <option value="customer">Customers Only</option>
                    <option value="staff">Staff Only</option>
                    <option value="admin">Administrators Only</option>
                  </select>
                </div>
                <div className="col-12">
                  <label className="form-label text-xs fw-semibold text-dark">Message Content *</label>
                  <textarea
                    required
                    rows={3}
                    value={announceMessage}
                    onChange={(e) => setAnnounceMessage(e.target.value)}
                    placeholder="Enter detailed message to broadcast to all eligible user inboxes..."
                    className="form-control form-control-sm rounded-3"
                  />
                </div>
                <div className="col-12 d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <div className="form-check form-switch mb-0">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="sendEmailSwitch"
                      checked={announceSendEmail}
                      onChange={(e) => setAnnounceSendEmail(e.target.checked)}
                    />
                    <label className="form-check-label text-xs fw-medium text-dark" htmlFor="sendEmailSwitch">
                      Also dispatch SMTP Email alert {emailStatus?.is_configured ? '(SMTP Active)' : '(SMTP Disabled on host)'}
                    </label>
                  </div>
                  <button
                    type="submit"
                    disabled={announcing}
                    className="btn btn-sm btn-danger rounded-pill px-3 py-1.5 d-inline-flex align-items-center gap-1.5 shadow-xs"
                  >
                    <Send size={14} /> {announcing ? 'Broadcasting...' : 'Broadcast Announcement Now'}
                  </button>
                </div>
              </div>
            </form>

            {/* Past Announcements History */}
            {announcements.length > 0 && (
              <div className="mt-4 pt-3 border-top">
                <h6 className="fw-bold text-xs text-muted text-uppercase mb-2">Recent Broadcast Announcements</h6>
                <div className="table-responsive">
                  <table className="table table-sm table-hover align-middle mb-0 text-xs">
                    <thead className="table-light">
                      <tr>
                        <th>Date</th>
                        <th>Title</th>
                        <th>Target</th>
                        <th>Recipients</th>
                        <th>Email Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      {announcements.slice(0, 5).map((a) => (
                        <tr key={a.id}>
                          <td>{formatDateTime(a.created_at)}</td>
                          <td className="fw-semibold text-dark">{a.title}</td>
                          <td>
                            <span className="badge bg-secondary text-2xs text-capitalize">
                              {a.target_role_display || a.target_role}
                            </span>
                          </td>
                          <td>{a.total_recipients} users</td>
                          <td>
                            {a.send_email ? (
                              <span className="badge bg-success bg-opacity-10 text-success">
                                {a.emails_sent} sent / {a.emails_failed} failed
                              </span>
                            ) : (
                              <span className="text-muted">In-app only</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Email Status & Delivery Transparency Bar */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-md-6 col-lg-4">
          <div className="card border-0 shadow-xs rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center gap-2 mb-1">
              <Mail size={16} className={emailStatus?.is_configured ? 'text-success' : 'text-amber-500'} />
              <strong className="text-xs text-dark">Email Dispatch Engine</strong>
            </div>
            <p className="text-2xs text-muted mb-2">
              {emailStatus?.status_message || 'Checking SMTP status...'}
            </p>
            <div className="d-flex align-items-center justify-content-between text-3xs pt-1 border-top border-light">
              <span className="text-muted">Status:</span>
              <span className={`badge ${emailStatus?.is_configured ? 'bg-success' : 'bg-warning text-dark'}`}>
                {emailStatus?.is_configured ? 'SMTP Configured' : 'In-App Delivery Active'}
              </span>
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-lg-4">
          <div className="card border-0 shadow-xs rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center gap-2 mb-1">
              <RefreshCw size={16} className="text-primary" />
              <strong className="text-xs text-dark">Real-Time Sync Protocol</strong>
            </div>
            <p className="text-2xs text-muted mb-2">
              Active polling every 12 seconds with unread aggregate badges and automatic hold expiration checks.
            </p>
            <div className="d-flex align-items-center justify-content-between text-3xs pt-1 border-top border-light">
              <span className="text-muted">Protocol:</span>
              <span className="badge bg-primary-subtle text-primary border border-primary-subtle">
                Reliable HTTP Polling (12s)
              </span>
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card border-0 shadow-xs rounded-3 p-3 bg-white h-100">
            <div className="d-flex align-items-center gap-2 mb-1">
              <ShieldAlert size={16} className="text-info" />
              <strong className="text-xs text-dark">Duplicate Event Prevention</strong>
            </div>
            <p className="text-2xs text-muted mb-2">
              All payment and gate pass alerts use cryptographic idempotency keys to strictly avoid duplicate alerts.
            </p>
            <div className="d-flex align-items-center justify-content-between text-3xs pt-1 border-top border-light">
              <span className="text-muted">Protection:</span>
              <span className="badge bg-success-subtle text-success border border-success-subtle">
                Atomic Idempotency Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card border-0 shadow-sm rounded-4 mb-4">
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            {/* Search Input */}
            <div className="col-12 col-md-4">
              <div className="input-group input-group-sm">
                <span className="input-group-text bg-white border-end-0">
                  <Search size={14} className="text-muted" />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search notification subject or body..."
                  className="form-control form-control-sm border-start-0 ps-0 rounded-end-3"
                />
              </div>
            </div>

            {/* Category Filter */}
            <div className="col-6 col-md-3">
              <select
                value={selectedCategory}
                onChange={(e) => {
                  setSelectedCategory(e.target.value);
                  setCurrentPage(1);
                }}
                className="form-select form-select-sm rounded-3"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Read/Unread Filter */}
            <div className="col-6 col-md-2">
              <select
                value={readFilter}
                onChange={(e) => {
                  setReadFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="form-select form-select-sm rounded-3"
              >
                <option value="all">All Read Status</option>
                <option value="unread">Unread Only</option>
                <option value="read">Read Only</option>
              </select>
            </div>

            {/* Include Archived Checkbox */}
            <div className="col-12 col-md-3 d-flex justify-content-md-end align-items-center gap-2">
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="includeArchivedSwitch"
                  checked={includeArchived}
                  onChange={(e) => {
                    setIncludeArchived(e.target.checked);
                    setCurrentPage(1);
                  }}
                />
                <label className="form-check-label text-xs text-muted" htmlFor="includeArchivedSwitch">
                  Show Archived
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications List View */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4">
        <div className="card-header bg-white py-3 px-3 px-md-4 border-bottom d-flex justify-content-between align-items-center">
          <div className="d-flex align-items-center gap-2">
            <span className="fw-bold text-dark text-sm">Notifications</span>
            <span className="badge bg-slate-100 text-slate-700 rounded-pill px-2.5 py-1 text-2xs">
              {totalCount} total alert(s)
            </span>
          </div>
          <span className="text-3xs text-muted">
            Page {currentPage} of {totalPages}
          </span>
        </div>

        <div className="card-body p-0">
          {loading ? (
            <div className="p-5 text-center text-muted">
              <RefreshCw size={28} className="text-primary animate-spin mx-auto mb-2" />
              <div className="text-sm fw-medium">Loading notification records...</div>
            </div>
          ) : error ? (
            <div className="p-5 text-center text-danger">
              <AlertTriangle size={32} className="mx-auto mb-2" />
              <div className="text-sm fw-semibold mb-2">{error}</div>
              <button
                type="button"
                onClick={fetchNotifications}
                className="btn btn-sm btn-outline-danger rounded-pill px-3"
              >
                Retry
              </button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-5 text-center text-muted">
              <CheckCircle2 size={40} className="text-slate-300 mx-auto mb-3" />
              <h6 className="fw-bold text-slate-700 text-sm">No Notifications Found</h6>
              <p className="text-3xs text-muted max-w-sm mx-auto mb-0">
                {searchQuery || selectedCategory !== 'all' || readFilter !== 'all'
                  ? 'No notifications match your current filter parameters. Try clearing your filters.'
                  : 'You are all caught up! You will be notified when your bookings, gate passes, or payments update.'}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => {
                const IconComp = CATEGORY_ICONS[n.category] || Info;
                const color = CATEGORY_COLORS[n.category] || 'primary';
                return (
                  <div
                    key={n.id}
                    className={`p-3 p-md-4 transition-all border-bottom ${
                      n.is_read ? 'bg-white hover-bg-slate-50' : 'bg-blue-50 bg-opacity-60'
                    }`}
                  >
                    <div className="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
                      <div className="d-flex align-items-start gap-3 flex-grow-1">
                        {/* Category Icon Badge */}
                        <div
                          className={`p-2 rounded-3 bg-${color} bg-opacity-10 text-${color} flex-shrink-0 mt-0.5`}
                        >
                          <IconComp size={18} />
                        </div>

                        {/* Title, Content & Links */}
                        <div className="flex-grow-1">
                          <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                            {!n.is_read && (
                              <span
                                className="rounded-circle bg-primary d-inline-block"
                                style={{ width: '8px', height: '8px' }}
                                title="Unread"
                              />
                            )}
                            <h6
                              className={`m-0 text-sm ${
                                n.is_read ? 'fw-semibold text-slate-800' : 'fw-bold text-dark'
                              }`}
                            >
                              {n.title}
                            </h6>
                            <span className="badge bg-light text-muted border text-3xs text-capitalize">
                              {n.category_display || n.category.replace('_', ' ')}
                            </span>
                            {n.is_archived && (
                              <span className="badge bg-secondary text-white text-3xs">
                                Archived
                              </span>
                            )}
                            {n.email_sent && (
                              <span
                                className="badge bg-success bg-opacity-10 text-success text-3xs d-inline-flex align-items-center gap-1"
                                title="Email alert was delivered to your registered email"
                              >
                                <Mail size={10} /> Email Delivered
                              </span>
                            )}
                          </div>

                          <p className="text-xs text-slate-600 mb-2 leading-relaxed">
                            {n.message}
                          </p>

                          <div className="d-flex flex-wrap align-items-center gap-3 text-3xs text-slate-400">
                            <span>{formatDateTime(n.created_at)}</span>
                            {n.read_at && (
                              <span>• Read at {formatDateTime(n.read_at)}</span>
                            )}
                            {n.link && (
                              <Link
                                to={n.link}
                                className="text-primary fw-medium text-decoration-none d-inline-flex align-items-center gap-1 hover-underline"
                              >
                                View Related Page <ExternalLink size={10} />
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Item Actions */}
                      <div className="d-flex align-items-center gap-1.5 flex-shrink-0 ms-auto ms-md-0">
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => handleMarkAsRead(n.id)}
                            className="btn btn-xs btn-outline-primary rounded-pill px-2.5 py-1 text-3xs d-inline-flex align-items-center gap-1"
                            title="Mark as Read"
                          >
                            <Check size={12} /> Mark Read
                          </button>
                        )}
                        {!n.is_archived && (
                          <button
                            type="button"
                            onClick={() => handleArchive(n.id)}
                            className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-1 text-3xs d-inline-flex align-items-center gap-1"
                            title="Archive"
                          >
                            <Archive size={12} /> Archive
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDelete(n.id)}
                          className="btn btn-xs btn-outline-danger rounded-pill px-2 py-1 text-3xs d-inline-flex align-items-center gap-1"
                          title="Delete Permanently"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="card-footer bg-white py-2.5 px-3 px-md-4 border-top d-flex justify-content-between align-items-center">
            <span className="text-3xs text-muted">
              Showing page {currentPage} of {totalPages}
            </span>
            <div className="d-flex align-items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="btn btn-xs btn-outline-secondary rounded-3 p-1 px-2 text-3xs d-inline-flex align-items-center gap-1"
              >
                <ChevronLeft size={13} /> Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="btn btn-xs btn-outline-secondary rounded-3 p-1 px-2 text-3xs d-inline-flex align-items-center gap-1"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default NotificationHistoryPage;

