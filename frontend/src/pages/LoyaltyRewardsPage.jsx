import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  Coins,
  TrendingUp,
  History,
  Gift,
  ArrowRight,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Clock,
  Sparkles,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function LoyaltyRewardsPage() {
  const { user } = useAuth();
  const { showError } = useNotification();

  const [account, setAccount] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadLoyalty() {
      setLoading(true);
      try {
        const [acctData, histData] = await Promise.all([
          membershipLoyaltyService.getLoyaltyAccount(),
          membershipLoyaltyService.getLoyaltyHistory({ limit: 5 }),
        ]);
        setAccount(acctData);
        setHistory(Array.isArray(histData) ? histData : (histData.results || []));
      } catch (err) {
        console.error('Error loading loyalty data:', err);
        showError('Failed to load loyalty rewards data.');
      } finally {
        setLoading(false);
      }
    }
    loadLoyalty();
  }, []);

  const config = account?.program_config;

  // Calculate tier progression
  const tier = account?.tier || 'Bronze';
  const lifetime = account?.lifetime_earned || 0;
  let nextTier = 'Silver';
  let targetPoints = 500;
  if (tier === 'Silver') {
    nextTier = 'Gold';
    targetPoints = 1500;
  } else if (tier === 'Gold') {
    nextTier = 'Platinum';
    targetPoints = 5000;
  } else if (tier === 'Platinum') {
    nextTier = 'Max Tier';
    targetPoints = 5000;
  }
  const progressPercent = Math.min(100, Math.round((lifetime / targetPoints) * 100));

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h1 className="fs-3 fw-black text-slate-900 mb-1 d-flex align-items-center gap-2">
            <Award size={28} className="text-warning" /> Loyalty Rewards &amp; Points
          </h1>
          <p className="text-slate-500 text-sm mb-0">
            Earn points automatically on completed parking bookings and redeem for instant booking discounts.
          </p>
        </div>
        <div>
          <Link
            to="/rewards/history"
            className="btn btn-outline-secondary px-3 py-2 rounded-3 fw-bold text-sm d-inline-flex align-items-center gap-2"
          >
            <History size={16} /> View Full Transaction Ledger
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <LoadingSpinner size="lg" message="Loading your rewards dashboard..." />
        </div>
      ) : (
        <>
          {/* Main Hero Card: Points Balance & Tier */}
          <div
            className="card rounded-4 border-0 shadow-md text-white p-4 p-md-5 mb-5 overflow-hidden position-relative"
            style={{
              background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #312e81 100%)',
            }}
          >
            <div className="position-absolute top-0 end-0 p-4 opacity-10 pointer-events-none text-warning">
              <Coins size={220} />
            </div>

            <div className="row g-4 align-items-center position-relative z-1">
              <div className="col-12 col-md-7">
                <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-pill bg-white bg-opacity-10 backdrop-blur-sm border border-white border-opacity-15 text-warning text-xs fw-bold mb-3">
                  <Sparkles size={14} /> Smart Parking Club Member
                </div>

                <div className="text-white-50 text-xs text-uppercase tracking-wider fw-semibold mb-1">
                  Available Rewards Balance
                </div>
                <div className="d-flex align-items-baseline gap-2 mb-2">
                  <span className="display-4 fw-black text-white">{account?.points_balance || 0}</span>
                  <span className="fs-5 text-warning fw-bold">Points</span>
                </div>
                <div className="text-sm text-emerald-400 fw-semibold mb-4">
                  &asymp; {formatCurrency(account?.current_discount_value || 0)} in instant parking discounts
                </div>

                {/* Tier & Progress */}
                <div className="bg-white bg-opacity-10 backdrop-blur-sm border border-white border-opacity-10 rounded-3 p-3 max-w-md">
                  <div className="d-flex justify-content-between align-items-center text-xs mb-2">
                    <span className="d-flex align-items-center gap-1.5">
                      <span className="badge bg-warning text-slate-900 fw-bold px-2.5 py-0.5 text-uppercase">
                        {tier} Tier
                      </span>
                    </span>
                    {nextTier !== 'Max Tier' && (
                      <span className="text-white-50 text-2xs">
                        {targetPoints - lifetime} pts to <strong>{nextTier}</strong>
                      </span>
                    )}
                  </div>
                  <div className="progress bg-white bg-opacity-20" style={{ height: '6px' }}>
                    <div
                      className="progress-bar bg-warning"
                      role="progressbar"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Lifetime Stats */}
              <div className="col-12 col-md-5">
                <div className="bg-white bg-opacity-10 backdrop-blur-sm border border-white border-opacity-10 rounded-4 p-4 text-white">
                  <h3 className="fs-6 fw-bold mb-3 d-flex align-items-center gap-2 text-white">
                    <TrendingUp size={18} className="text-success" /> Lifetime Statistics
                  </h3>
                  <div className="d-flex flex-column gap-3 text-xs">
                    <div className="d-flex justify-content-between py-1 border-bottom border-white border-opacity-10">
                      <span className="text-white-50">Total Points Earned:</span>
                      <strong className="text-white fs-6">+{account?.lifetime_earned || 0} pts</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1 border-bottom border-white border-opacity-10">
                      <span className="text-white-50">Total Points Redeemed:</span>
                      <strong className="text-emerald-400 fs-6">-{account?.lifetime_redeemed || 0} pts</strong>
                    </div>
                    <div className="d-flex justify-content-between py-1">
                      <span className="text-white-50">Redemption Value Rate:</span>
                      <strong className="text-white">1 pt = ₹{config?.points_redemption_rate || '0.50'}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* How It Works Grid */}
          <div className="row g-4 mb-5">
            <div className="col-12 col-md-4">
              <div className="card h-100 rounded-4 border-slate-200 shadow-sm p-4">
                <div className="w-12 h-12 rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center mb-3">
                  <Coins size={24} />
                </div>
                <h3 className="fs-6 fw-bold text-slate-800 mb-1">1. Earn Automatically</h3>
                <p className="text-slate-500 text-xs mb-0">
                  Earn <strong>1 point for every ₹10 spent</strong> on eligible completed parking reservations and passes.
                  Points are credited to your balance upon verified payment.
                </p>
              </div>
            </div>

            <div className="col-12 col-md-4">
              <div className="card h-100 rounded-4 border-slate-200 shadow-sm p-4">
                <div className="w-12 h-12 rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center mb-3">
                  <Gift size={24} />
                </div>
                <h3 className="fs-6 fw-bold text-slate-800 mb-1">2. Redeem on Checkout</h3>
                <p className="text-slate-500 text-xs mb-0">
                  Use your points to get up to <strong>50% off</strong> on your parking booking total.
                  Redeem starting from as low as {config?.min_points_to_redeem || 20} points.
                </p>
              </div>
            </div>

            <div className="col-12 col-md-4">
              <div className="card h-100 rounded-4 border-slate-200 shadow-sm p-4">
                <div className="w-12 h-12 rounded-circle bg-amber-50 text-amber-600 d-flex align-items-center justify-content-center mb-3">
                  <ShieldCheck size={24} />
                </div>
                <h3 className="fs-6 fw-bold text-slate-800 mb-1">3. Guaranteed Reversals</h3>
                <p className="text-slate-500 text-xs mb-0">
                  If an eligible booking is cancelled, redeemed points are instantly refunded back to your balance,
                  preventing any loss of rewards.
                </p>
              </div>
            </div>
          </div>

          {/* Recent Activity Table */}
          <div className="card rounded-4 border-slate-200 shadow-sm overflow-hidden mb-4">
            <div className="card-header bg-white py-3 px-4 border-bottom border-slate-200 d-flex justify-content-between align-items-center">
              <h3 className="fs-6 fw-bold text-slate-800 mb-0 d-flex align-items-center gap-2">
                <History size={18} className="text-slate-500" /> Recent Points Activity
              </h3>
              <Link to="/rewards/history" className="text-xs fw-bold text-primary text-decoration-none">
                View Full Ledger &rarr;
              </Link>
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-sm">
                <thead className="bg-slate-50 text-slate-500 text-2xs text-uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Event Type</th>
                    <th className="py-3 px-3">Description</th>
                    <th className="py-3 px-3">Reference ID</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-4 text-end">Points Delta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="text-center py-4 text-muted text-xs">
                        No loyalty activity recorded yet. Complete a booking to earn points!
                      </td>
                    </tr>
                  ) : (
                    history.map((tx) => {
                      const isPositive = tx.points > 0;
                      return (
                        <tr key={tx.id}>
                          <td className="py-3 px-4">
                            <span
                              className={`badge text-2xs px-2.5 py-1 ${
                                tx.transaction_type === 'earned'
                                  ? 'bg-success-subtle text-success'
                                  : tx.transaction_type === 'redeemed'
                                  ? 'bg-primary-subtle text-primary'
                                  : tx.transaction_type === 'reversed'
                                  ? 'bg-danger-subtle text-danger'
                                  : 'bg-info-subtle text-info'
                              }`}
                            >
                              {tx.transaction_type_display || tx.transaction_type}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-slate-700 text-xs">
                            {tx.description}
                          </td>
                          <td className="py-3 px-3 text-slate-400 font-monospace text-2xs">
                            {tx.reference_id}
                          </td>
                          <td className="py-3 px-3 text-slate-500 text-xs">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4 text-end">
                            <span className={`fw-black text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
                              {isPositive ? `+${tx.points}` : tx.points} pts
                            </span>
                          </td>
                        </tr>
                      );
                    })
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

export default LoyaltyRewardsPage;
