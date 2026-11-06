import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Crown,
  Calendar,
  CheckCircle2,
  Clock,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  XCircle,
  ArrowRight,
  Sparkles,
  Tag,
  CreditCard,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function MyMembershipsPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [memberships, setMemberships] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchMemberships = async () => {
    setLoading(true);
    try {
      const data = await membershipLoyaltyService.getMyMemberships();
      setMemberships(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      console.error('Error fetching memberships:', err);
      showError('Failed to load your memberships.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMemberships();
  }, []);

  const handleCancelAutoRenew = async (id) => {
    if (!window.confirm('Are you sure you want to cancel auto-renewal for this membership?')) return;
    setActionLoading(true);
    try {
      await membershipLoyaltyService.cancelMembershipRenewal(id);
      showSuccess('Auto-renewal has been cancelled.');
      fetchMemberships();
    } catch (err) {
      console.error(err);
      showError('Failed to cancel auto-renewal.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRenew = async (id) => {
    setActionLoading(true);
    try {
      await membershipLoyaltyService.renewMembership(id);
      showSuccess('Membership renewed successfully! Validity extended.');
      fetchMemberships();
    } catch (err) {
      console.error(err);
      showError('Failed to renew membership.');
    } finally {
      setActionLoading(false);
    }
  };

  const activeMembership = memberships.find((m) => m.is_valid);
  const otherMemberships = memberships.filter((m) => m.id !== activeMembership?.id);

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h1 className="fs-3 fw-black text-slate-900 mb-1 d-flex align-items-center gap-2">
            <Crown size={28} className="text-warning" /> My Memberships
          </h1>
          <p className="text-slate-500 text-sm mb-0">
            View active plan benefits, validity schedules, usage limits, and renewal controls.
          </p>
        </div>
        <div>
          <Link to="/memberships/plans" className="btn btn-primary px-3 py-2 rounded-3 fw-bold text-sm shadow-xs d-inline-flex align-items-center gap-2">
            <Sparkles size={16} /> Browse All Plans
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <LoadingSpinner size="lg" message="Loading your memberships..." />
        </div>
      ) : (
        <>
          {/* Active Membership Spotlight Card */}
          {activeMembership ? (
            <div className="card rounded-4 border-primary border-2 shadow-sm p-4 p-md-5 mb-5 bg-gradient position-relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%)',
              }}
            >
              <div className="position-absolute top-0 end-0 p-4 opacity-10 pointer-events-none text-primary">
                <Crown size={180} />
              </div>

              <div className="position-relative z-1">
                <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                  <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-success text-white text-xs fw-bold">
                    <CheckCircle2 size={14} /> Active Subscription
                  </div>
                  <span className="text-xs text-slate-500 font-monospace">
                    TXN: {activeMembership.transaction_id || 'N/A'}
                  </span>
                </div>

                <div className="row g-4 align-items-center">
                  <div className="col-12 col-lg-7">
                    <h2 className="display-6 fw-black text-slate-900 mb-2">
                      {activeMembership.plan_details?.name || 'Smart Driver Plan'}
                    </h2>
                    <p className="text-slate-600 text-sm mb-4">
                      {activeMembership.plan_details?.description || 'Active parking membership granting discount perks across facilities.'}
                    </p>

                    <div className="d-flex flex-wrap gap-2 mb-4">
                      <span className="badge bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-3 text-xs fw-semibold d-inline-flex align-items-center gap-1.5 shadow-2xs">
                        <Tag size={14} className="text-primary" />
                        {activeMembership.plan_details?.discount_type === 'percentage'
                          ? `${activeMembership.plan_details?.discount_value}% Discount per reservation`
                          : `₹${activeMembership.plan_details?.discount_value} Discount per reservation`}
                      </span>
                      <span className="badge bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-3 text-xs fw-semibold d-inline-flex align-items-center gap-1.5 shadow-2xs">
                        <Calendar size={14} className="text-indigo-600" />
                        Valid: {new Date(activeMembership.start_date).toLocaleDateString()} &mdash; {new Date(activeMembership.end_date).toLocaleDateString()}
                      </span>
                    </div>

                    {/* Action buttons */}
                    <div className="d-flex flex-wrap align-items-center gap-3">
                      {activeMembership.is_renewable && (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleRenew(activeMembership.id)}
                          className="btn btn-primary px-4 py-2 rounded-3 fw-bold text-sm shadow-xs d-inline-flex align-items-center gap-2"
                        >
                          <RefreshCw size={16} /> Renew Plan Now
                        </button>
                      )}

                      {activeMembership.auto_renew ? (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleCancelAutoRenew(activeMembership.id)}
                          className="btn btn-outline-danger px-3 py-2 rounded-3 fw-medium text-sm d-inline-flex align-items-center gap-2"
                        >
                          <XCircle size={16} /> Cancel Auto-Renewal
                        </button>
                      ) : (
                        <span className="badge bg-light text-slate-500 border border-slate-200 px-3 py-2 text-xs">
                          Auto-renewal disabled
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-12 col-lg-5">
                    <div className="bg-white rounded-4 border border-slate-200 p-4 shadow-sm">
                      <h4 className="fs-6 fw-bold text-slate-800 mb-3">Usage Statistics</h4>
                      <div className="mb-3">
                        <div className="d-flex justify-content-between text-xs mb-1">
                          <span className="text-slate-500">Bookings Used</span>
                          <span className="fw-bold text-slate-800">
                            {activeMembership.usage_count}{' '}
                            {activeMembership.plan_details?.max_discounted_bookings > 0
                              ? `/ ${activeMembership.plan_details?.max_discounted_bookings}`
                              : '(Unlimited)'}
                          </span>
                        </div>
                        {activeMembership.plan_details?.max_discounted_bookings > 0 && (
                          <div className="progress" style={{ height: '8px' }}>
                            <div
                              className="progress-bar bg-primary"
                              role="progressbar"
                              style={{
                                width: `${Math.min(
                                  100,
                                  (activeMembership.usage_count / activeMembership.plan_details.max_discounted_bookings) * 100
                                )}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-top border-slate-100 text-2xs text-slate-500 d-flex flex-column gap-1">
                        <div>
                          <strong>Simulated Payment:</strong> Verified via demo gateway
                        </div>
                        <div>
                          <strong>Eligible Vehicles:</strong>{' '}
                          <span className="text-capitalize">{activeMembership.plan_details?.eligible_vehicle_types || 'All'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Empty Active Membership state */
            <div className="card rounded-4 border border-dashed border-2 border-slate-300 p-5 text-center bg-slate-50 mb-5">
              <div className="w-16 h-16 mx-auto rounded-circle bg-amber-50 text-amber-600 d-flex align-items-center justify-content-center mb-3">
                <Crown size={32} />
              </div>
              <h2 className="fs-5 fw-bold text-slate-800 mb-1">You do not have an active membership</h2>
              <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
                Unlock instant savings on parking, rate caps, and priority booking benefits by subscribing to one of our membership plans.
              </p>
              <div>
                <Link to="/memberships/plans" className="btn btn-primary px-4 py-2.5 rounded-3 fw-bold shadow-xs d-inline-flex align-items-center gap-2">
                  <Sparkles size={16} /> Browse Membership Plans
                </Link>
              </div>
            </div>
          )}

          {/* Membership History Table */}
          <div className="card rounded-4 border-slate-200 shadow-sm overflow-hidden">
            <div className="card-header bg-white py-3 px-4 border-bottom border-slate-200">
              <h3 className="fs-6 fw-bold text-slate-800 mb-0">Subscription History</h3>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-sm">
                <thead className="bg-slate-50 text-slate-500 text-2xs text-uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Plan Name</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3">Start Date</th>
                    <th className="py-3 px-3">End Date</th>
                    <th className="py-3 px-3">Usage</th>
                    <th className="py-3 px-3">Amount Paid</th>
                    <th className="py-3 px-4 text-end">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {memberships.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="text-center py-4 text-muted text-xs">
                        No previous subscriptions found.
                      </td>
                    </tr>
                  ) : (
                    memberships.map((m) => (
                      <tr key={m.id}>
                        <td className="py-3 px-4">
                          <div className="fw-bold text-slate-800">{m.plan_details?.name || 'Smart Plan'}</div>
                          <div className="text-2xs text-slate-400 font-monospace">{m.transaction_id || ''}</div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`badge text-uppercase text-2xs px-2.5 py-1 ${
                              m.status === 'active'
                                ? 'bg-success-subtle text-success'
                                : m.status === 'expired'
                                ? 'bg-secondary-subtle text-secondary'
                                : 'bg-danger-subtle text-danger'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-xs">
                          {m.start_date ? new Date(m.start_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-xs">
                          {m.end_date ? new Date(m.end_date).toLocaleDateString() : '-'}
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-xs">
                          {m.usage_count} bookings
                        </td>
                        <td className="py-3 px-3 fw-bold text-slate-800 text-xs">
                          {formatCurrency(m.amount_paid)}
                        </td>
                        <td className="py-3 px-4 text-end">
                          {m.is_renewable && (
                            <button
                              type="button"
                              onClick={() => handleRenew(m.id)}
                              className="btn btn-xs btn-outline-primary rounded-2 fw-medium text-xs py-1 px-2.5"
                            >
                              Renew
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MyMembershipsPage;
