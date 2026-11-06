import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bell, Check, Clock, AlertTriangle, Info, CheckCircle2, X,
  ExternalLink, CheckCheck, RefreshCw, Megaphone, CreditCard,
  Calendar, Ticket, Award, LifeBuoy, Shield
} from 'lucide-react';
import notificationService from '../services/notificationService';
import bookingService from '../services/bookingService';
import { formatDateTime } from '../utils/formatters';

const CATEGORY_META = {
  booking: { label: 'Booking', color: 'primary', icon: Calendar },
  payment: { label: 'Payment', color: 'success', icon: CreditCard },
  hold_expiry: { label: 'Hold Expiry', color: 'warning', icon: Clock },
  gate_pass: { label: 'Gate Pass', color: 'info', icon: CheckCircle2 },
  membership: { label: 'Membership', color: 'primary', icon: Shield },
  monthly_pass: { label: 'Monthly Pass', color: 'teal', icon: Ticket },
  loyalty: { label: 'Loyalty Rewards', color: 'warning', icon: Award },
  support_ticket: { label: 'Support Ticket', color: 'danger', icon: LifeBuoy },
  announcement: { label: 'Announcement', color: 'danger', icon: Megaphone },
  system: { label: 'System Alert', color: 'secondary', icon: Info },
};

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingExpiries, setPendingExpiries] = useState([]);
  const [markingId, setMarkingId] = useState(null);
  const [lastSync, setLastSync] = useState(null);

  const navigate = useNavigate();

  // Fast lightweight poll for unread count
  const pollUnreadCount = useCallback(async () => {
    try {
      const data = await notificationService.getUnreadCount();
      setUnreadCount(data?.unread_count || 0);
      setLastSync(new Date());
    } catch (err) {
      console.warn('Failed to poll unread count:', err);
    }
  }, []);

  // Full fetch when dropdown opens
  const fetchFullNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationService.getNotifications({ page_size: 15, archived: false });
      const notifList = Array.isArray(res) ? res : (res?.results || []);
      setNotifications(notifList);
      const unread = notifList.filter((n) => !n.is_read).length;
      setUnreadCount((prev) => Math.max(prev, unread));

      // Calculate upcoming hold expiries
      const bookings = await bookingService.getMyBookings();
      if (Array.isArray(bookings)) {
        const now = new Date();
        const expiries = bookings
          .filter((b) => b.status === 'pending' && b.hold_expires_at)
          .map((b) => {
            const expDate = new Date(b.hold_expires_at);
            const remainingMinutes = Math.max(0, Math.round((expDate - now) / 60000));
            return {
              ...b,
              remainingMinutes,
              isExpired: remainingMinutes <= 0,
            };
          })
          .filter((b) => !b.isExpired);
        setPendingExpiries(expiries);
      }
    } catch (err) {
      console.warn('NotificationCenter full fetch error:', err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Polling every 12 seconds
  useEffect(() => {
    pollUnreadCount();
    const interval = setInterval(pollUnreadCount, 12000);
    return () => clearInterval(interval);
  }, [pollUnreadCount]);

  // When dropdown opens, fetch full data
  useEffect(() => {
    if (isOpen) {
      fetchFullNotifications();
    }
  }, [isOpen, fetchFullNotifications]);

  const handleMarkAsRead = async (notificationId, e) => {
    if (e) e.stopPropagation();
    setMarkingId(notificationId);
    try {
      await notificationService.markAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    } finally {
      setMarkingId(null);
    }
  };

  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      await notificationService.markAllAsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  const handleNotificationClick = async (notif) => {
    if (!notif.is_read) {
      await handleMarkAsRead(notif.id);
    }
    setIsOpen(false);
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const totalBadges = unreadCount + pendingExpiries.length;

  return (
    <div className="position-relative notification-center-wrapper">
      {/* Bell Trigger Button */}
      <button
        type="button"
        className="btn btn-sm btn-outline-light rounded-circle p-2 position-relative border-0 bg-navy-light text-slate-200 hover-text-white"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="View notifications and reminders"
        title="Notifications & Alerts Center"
      >
        <Bell size={18} />
        {totalBadges > 0 && (
          <span
            className="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-2 border-dark text-3xs animate-pulse"
            style={{ fontSize: '10px', padding: '3px 6px' }}
          >
            {totalBadges > 99 ? '99+' : totalBadges}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {isOpen && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100"
            style={{ zIndex: 1045 }}
            onClick={() => setIsOpen(false)}
          />
          <div
            className="dropdown-menu dropdown-menu-end show shadow-2xl border-0 rounded-4 mt-2 p-0 position-absolute end-0 overflow-hidden"
            style={{ width: '420px', maxWidth: '94vw', zIndex: 1050 }}
          >
            {/* Header */}
            <div className="p-3 bg-slate-900 text-white d-flex justify-content-between align-items-center border-bottom border-slate-800">
              <div>
                <h6 className="fw-bold mb-0 text-white text-sm d-flex align-items-center gap-2">
                  <Bell size={16} className="text-primary" /> Notifications & Alerts
                </h6>
                <div className="text-3xs text-slate-400 mt-0.5 d-flex align-items-center gap-1.5">
                  <span className="badge bg-primary bg-opacity-25 text-primary text-3xs border border-primary border-opacity-25">
                    {unreadCount} unread
                  </span>
                  <span>• Reliable polling (12s)</span>
                </div>
              </div>
              <div className="d-flex align-items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    disabled={markingAll}
                    className="btn btn-xs btn-outline-light rounded-pill px-2 py-1 text-3xs d-flex align-items-center gap-1"
                    title="Mark all as read"
                  >
                    <CheckCheck size={12} /> {markingAll ? 'Marking...' : 'Mark All Read'}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-light rounded-circle p-1 border-0"
                  onClick={() => setIsOpen(false)}
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="overflow-y-auto" style={{ maxHeight: '420px' }}>
              {/* Hold Expiry Reminders Section */}
              {pendingExpiries.length > 0 && (
                <div className="p-2.5 bg-amber-50 border-bottom border-amber-200">
                  <div className="d-flex align-items-center justify-content-between mb-1.5">
                    <span className="d-flex align-items-center gap-1 text-3xs text-amber-900 fw-bold text-uppercase">
                      <Clock size={12} className="text-amber-600" /> Payment Hold Alerts ({pendingExpiries.length})
                    </span>
                    <span className="badge bg-amber-200 text-amber-900 text-3xs">Expiring Soon</span>
                  </div>
                  {pendingExpiries.map((exp) => (
                    <div
                      key={exp.booking_id}
                      className="p-2.5 rounded-3 bg-white border border-amber-300 shadow-2xs mb-1.5 text-xs"
                    >
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <strong className="text-dark">Slot {exp.slot_number} @ {exp.lot_name}</strong>
                        <span className="badge bg-danger text-white text-3xs">
                          {exp.remainingMinutes}m left
                        </span>
                      </div>
                      <p className="text-3xs text-muted mb-2">
                        Complete payment now before your reservation expires and the slot is released.
                      </p>
                      <Link
                        to="/bookings"
                        onClick={() => setIsOpen(false)}
                        className="btn btn-xs btn-primary text-3xs rounded-pill px-2.5 py-1 d-inline-flex align-items-center gap-1"
                      >
                        Complete Payment <ExternalLink size={10} />
                      </Link>
                    </div>
                  ))}
                </div>
              )}

              {/* Django API Notifications */}
              {loading && notifications.length === 0 ? (
                <div className="p-4 text-center text-muted">
                  <RefreshCw size={24} className="text-primary animate-spin mx-auto mb-2" />
                  <div className="text-xs">Checking for alerts...</div>
                </div>
              ) : notifications.length > 0 ? (
                <div>
                  {notifications.map((n) => {
                    const catMeta = CATEGORY_META[n.category] || CATEGORY_META.system;
                    const IconComponent = catMeta.icon || Info;
                    return (
                      <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        className={`p-3 border-bottom transition-all cursor-pointer ${
                          n.is_read ? 'bg-white hover-bg-slate-50' : 'bg-blue-50 bg-opacity-70 text-dark'
                        }`}
                        style={{
                          backgroundColor: n.is_read ? '#ffffff' : '#f0f7ff',
                          cursor: 'pointer',
                        }}
                      >
                        <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
                          <div className="d-flex align-items-start gap-2">
                            <span className={`p-1.5 rounded-2 bg-${catMeta.color} bg-opacity-10 text-${catMeta.color} mt-0.5 flex-shrink-0`}>
                              <IconComponent size={14} />
                            </span>
                            <div>
                              <div className="d-flex align-items-center gap-1.5">
                                {!n.is_read && (
                                  <span
                                    className="rounded-circle bg-primary d-inline-block flex-shrink-0"
                                    style={{ width: '7px', height: '7px' }}
                                  />
                                )}
                                <span className={`text-xs ${n.is_read ? 'fw-semibold text-slate-800' : 'fw-bold text-dark'}`}>
                                  {n.title}
                                </span>
                              </div>
                              <span className="badge bg-light text-muted border text-3xs mt-0.5">
                                {catMeta.label}
                              </span>
                            </div>
                          </div>
                          {!n.is_read && (
                            <button
                              type="button"
                              onClick={(e) => handleMarkAsRead(n.id, e)}
                              disabled={markingId === n.id}
                              className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0 text-3xs flex-shrink-0"
                              title="Mark as read"
                            >
                              <Check size={11} /> Mark read
                            </button>
                          )}
                        </div>

                        <p className="text-2xs text-slate-600 mb-1 ps-4 ms-1">{n.message}</p>

                        <div className="d-flex justify-content-between align-items-center text-3xs text-slate-400 ps-4 ms-1">
                          <span>{formatDateTime(n.created_at)}</span>
                          {n.link && (
                            <span className="text-primary d-flex align-items-center gap-1 text-3xs">
                              View details <ExternalLink size={9} />
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                pendingExpiries.length === 0 && (
                  <div className="p-4 text-center text-muted">
                    <CheckCircle2 size={32} className="text-slate-300 mx-auto mb-2" />
                    <div className="text-xs fw-semibold text-slate-600">No Notifications</div>
                    <div className="text-3xs text-slate-400">You are all caught up with latest parking updates.</div>
                  </div>
                )
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-slate-50 border-top d-flex justify-content-between align-items-center text-3xs">
              <span className="text-slate-500">
                {lastSync ? `Synced at ${lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'Live Polling Active'}
              </span>
              <Link
                to="/notifications"
                onClick={() => setIsOpen(false)}
                className="text-primary fw-semibold text-decoration-none hover-underline d-flex align-items-center gap-1"
              >
                View Notification History →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default NotificationCenter;
