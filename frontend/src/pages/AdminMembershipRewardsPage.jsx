import React, { useEffect, useState } from 'react';
import {
  Crown,
  Ticket,
  Award,
  Settings,
  Users,
  PlusCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Search,
  DollarSign,
  TrendingUp,
  Coins,
  ShieldCheck,
  AlertCircle,
  Save,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import parkingService from '../services/parkingService';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function AdminMembershipRewardsPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [activeTab, setActiveTab] = useState('plans'); // 'plans', 'passes', 'loyalty_config', 'accounts'
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);

  // Plans data
  const [plans, setPlans] = useState([]);
  const [allLots, setAllLots] = useState([]);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    description: '',
    duration_type: 'monthly',
    duration_days: 30,
    price: '299.00',
    discount_type: 'percentage',
    discount_value: '15.00',
    max_discount_per_booking: '',
    min_booking_amount: '0.00',
    eligible_lots: [],
    eligible_vehicle_types: 'all',
    max_discounted_bookings: 0,
    perks_description: '',
    is_active: true,
    allow_auto_renewal: true,
  });

  // Loyalty Config Data
  const [loyaltyConfig, setLoyaltyConfig] = useState(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Accounts Data
  const [accounts, setAccounts] = useState([]);
  const [accountsQuery, setAccountsQuery] = useState('');
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [adjustForm, setAdjustForm] = useState({
    points: 50,
    adjustment_type: 'credit',
    reason: '',
  });
  const [adjusting, setAdjusting] = useState(false);

  const fetchOverviewAndPlans = async () => {
    setLoading(true);
    try {
      const [overviewData, plansData, lotsData, configData] = await Promise.all([
        membershipLoyaltyService.getAdminOverview(),
        membershipLoyaltyService.getPlans(),
        parkingService.getLots().catch(() => []),
        membershipLoyaltyService.getLoyaltyConfig(),
      ]);
      setOverview(overviewData);
      setPlans(Array.isArray(plansData) ? plansData : (plansData.results || []));
      setAllLots(Array.isArray(lotsData) ? lotsData : (lotsData.results || []));
      setLoyaltyConfig(configData);
    } catch (err) {
      console.error('Error fetching admin data:', err);
      showError('Failed to load admin membership metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverviewAndPlans();
  }, []);

  // Fetch Accounts when switching to accounts tab
  const fetchAccounts = async (q = '') => {
    try {
      const data = await membershipLoyaltyService.adminGetLoyaltyAccounts({ q });
      setAccounts(Array.isArray(data) ? data : (data.results || []));
    } catch (err) {
      console.error(err);
      showError('Failed to load customer accounts.');
    }
  };

  useEffect(() => {
    if (activeTab === 'accounts') {
      fetchAccounts(accountsQuery);
    }
  }, [activeTab]);

  // Plan Handlers
  const handleOpenCreatePlan = () => {
    setEditingPlan(null);
    setPlanForm({
      name: '',
      description: '',
      duration_type: 'monthly',
      duration_days: 30,
      price: '299.00',
      discount_type: 'percentage',
      discount_value: '15.00',
      max_discount_per_booking: '',
      min_booking_amount: '0.00',
      eligible_lots: [],
      eligible_vehicle_types: 'all',
      max_discounted_bookings: 0,
      perks_description: '',
      is_active: true,
      allow_auto_renewal: true,
    });
    setIsPlanModalOpen(true);
  };

  const handleOpenEditPlan = (plan) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description || '',
      duration_type: plan.duration_type,
      duration_days: plan.duration_days,
      price: String(plan.price),
      discount_type: plan.discount_type,
      discount_value: String(plan.discount_value),
      max_discount_per_booking: plan.max_discount_per_booking ? String(plan.max_discount_per_booking) : '',
      min_booking_amount: String(plan.min_booking_amount || '0.00'),
      eligible_lots: plan.eligible_lots || [],
      eligible_vehicle_types: plan.eligible_vehicle_types || 'all',
      max_discounted_bookings: plan.max_discounted_bookings || 0,
      perks_description: plan.perks_description || '',
      is_active: plan.is_active,
      allow_auto_renewal: plan.allow_auto_renewal,
    });
    setIsPlanModalOpen(true);
  };

  const handleSavePlan = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...planForm,
        price: parseFloat(planForm.price),
        discount_value: parseFloat(planForm.discount_value),
        max_discount_per_booking: planForm.max_discount_per_booking ? parseFloat(planForm.max_discount_per_booking) : null,
        min_booking_amount: parseFloat(planForm.min_booking_amount || 0),
        duration_days: parseInt(planForm.duration_days, 10),
        max_discounted_bookings: parseInt(planForm.max_discounted_bookings || 0, 10),
      };

      if (editingPlan) {
        await membershipLoyaltyService.updatePlan(editingPlan.id, payload);
        showSuccess(`Plan "${planForm.name}" updated successfully!`);
      } else {
        await membershipLoyaltyService.createPlan(payload);
        showSuccess(`Plan "${planForm.name}" created successfully!`);
      }
      setIsPlanModalOpen(false);
      fetchOverviewAndPlans();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || JSON.stringify(err.response?.data) || 'Failed to save membership plan.';
      showError(msg);
    }
  };

  const handleTogglePlanActive = async (plan) => {
    try {
      await membershipLoyaltyService.updatePlan(plan.id, { is_active: !plan.is_active });
      showSuccess(`Plan "${plan.name}" status updated.`);
      fetchOverviewAndPlans();
    } catch (err) {
      showError('Failed to toggle status.');
    }
  };

  // Save Loyalty Config
  const handleSaveLoyaltyConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await membershipLoyaltyService.updateLoyaltyConfig(loyaltyConfig);
      showSuccess('Loyalty rewards settings updated successfully!');
    } catch (err) {
      console.error(err);
      showError('Failed to update loyalty settings.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Adjust points submit
  const handleAdjustPointsSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccount) return;
    setAdjusting(true);
    try {
      await membershipLoyaltyService.adminAdjustLoyaltyPoints({
        user_id: selectedAccount.user,
        points: parseInt(adjustForm.points, 10),
        adjustment_type: adjustForm.adjustment_type,
        reason: adjustForm.reason,
      });
      showSuccess(`Successfully adjusted points for ${selectedAccount.user_username}`);
      setIsAdjustModalOpen(false);
      fetchAccounts(accountsQuery);
      fetchOverviewAndPlans();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || 'Failed to adjust points.';
      showError(msg);
    } finally {
      setAdjusting(false);
    }
  };

  const kpis = overview?.kpis;

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h1 className="fs-3 fw-black text-slate-900 mb-1 d-flex align-items-center gap-2">
            <Crown size={28} className="text-warning" /> Membership &amp; Loyalty Rewards Admin
          </h1>
          <p className="text-slate-500 text-sm mb-0">
            Configure subscription tiers, discount policies, loyalty earning rules, and adjust customer accounts.
          </p>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card rounded-4 border-slate-200 shadow-xs p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-xs text-slate-500 fw-medium">Active Memberships</span>
              <span className="p-2 rounded-3 bg-blue-50 text-primary">
                <Crown size={18} />
              </span>
            </div>
            <div className="fs-3 fw-black text-slate-900">{kpis?.active_memberships || 0}</div>
            <div className="text-2xs text-slate-500 mt-1">
              Revenue: <strong>{formatCurrency(kpis?.membership_revenue || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card rounded-4 border-slate-200 shadow-xs p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-xs text-slate-500 fw-medium">Active Monthly Passes</span>
              <span className="p-2 rounded-3 bg-emerald-50 text-emerald-600">
                <Ticket size={18} />
              </span>
            </div>
            <div className="fs-3 fw-black text-slate-900">{kpis?.active_monthly_passes || 0}</div>
            <div className="text-2xs text-slate-500 mt-1">
              Pass Revenue: <strong>{formatCurrency(kpis?.monthly_pass_revenue || 0)}</strong>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card rounded-4 border-slate-200 shadow-xs p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-xs text-slate-500 fw-medium">Points In Circulation</span>
              <span className="p-2 rounded-3 bg-warning bg-opacity-20 text-warning-emphasis">
                <Coins size={18} />
              </span>
            </div>
            <div className="fs-3 fw-black text-slate-900">{kpis?.total_active_points_circulation || 0} pts</div>
            <div className="text-2xs text-slate-500 mt-1">
              Issued Lifetime: <strong>{kpis?.total_points_issued_lifetime || 0} pts</strong>
            </div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg-3">
          <div className="card rounded-4 border-slate-200 shadow-xs p-3 bg-white">
            <div className="d-flex align-items-center justify-content-between mb-2">
              <span className="text-xs text-slate-500 fw-medium">Points Redeemed</span>
              <span className="p-2 rounded-3 bg-purple-50 text-purple-600">
                <Award size={18} />
              </span>
            </div>
            <div className="fs-3 fw-black text-slate-900">{kpis?.total_points_redeemed_lifetime || 0} pts</div>
            <div className="text-2xs text-slate-500 mt-1">Converted to parking discounts</div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="card rounded-4 border-slate-200 shadow-sm mb-4">
        <div className="card-header bg-white p-2 border-bottom border-slate-200">
          <ul className="nav nav-pills gap-1">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link px-3 py-2 rounded-3 text-sm fw-bold ${activeTab === 'plans' ? 'active' : 'text-slate-600'}`}
                onClick={() => setActiveTab('plans')}
              >
                <Crown size={16} className="me-1.5" /> Membership Plans
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link px-3 py-2 rounded-3 text-sm fw-bold ${activeTab === 'loyalty_config' ? 'active' : 'text-slate-600'}`}
                onClick={() => setActiveTab('loyalty_config')}
              >
                <Settings size={16} className="me-1.5" /> Loyalty Program Rules
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link px-3 py-2 rounded-3 text-sm fw-bold ${activeTab === 'accounts' ? 'active' : 'text-slate-600'}`}
                onClick={() => setActiveTab('accounts')}
              >
                <Users size={16} className="me-1.5" /> Customer Balances &amp; Adjustments
              </button>
            </li>
          </ul>
        </div>

        <div className="card-body p-4">
          {/* TAB 1: PLANS */}
          {activeTab === 'plans' && (
            <div>
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h3 className="fs-6 fw-bold text-slate-900 mb-0">Configured Membership Plans</h3>
                <button
                  type="button"
                  onClick={handleOpenCreatePlan}
                  className="btn btn-sm btn-primary rounded-3 px-3 fw-bold d-inline-flex align-items-center gap-1.5 shadow-xs"
                >
                  <PlusCircle size={16} /> Add New Plan
                </button>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-2xs text-uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">Plan Name</th>
                      <th className="py-3 px-3">Duration</th>
                      <th className="py-3 px-3">Price</th>
                      <th className="py-3 px-3">Discount Benefit</th>
                      <th className="py-3 px-3">Usage Limit</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {plans.map((p) => (
                      <tr key={p.id}>
                        <td className="py-3 px-3">
                          <div className="fw-bold text-slate-900">{p.name}</div>
                          <div className="text-2xs text-slate-500 text-truncate" style={{ maxWidth: '240px' }}>
                            {p.description || 'No description'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-capitalize text-xs">
                          {p.duration_type} ({p.duration_days}d)
                        </td>
                        <td className="py-3 px-3 fw-bold text-slate-900 text-xs">
                          {formatCurrency(p.price)}
                        </td>
                        <td className="py-3 px-3 text-xs">
                          <span className="badge bg-success-subtle text-success">
                            {p.discount_type === 'percentage' ? `${p.discount_value}% OFF` : `₹${p.discount_value} OFF`}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-xs text-slate-600">
                          {p.max_discounted_bookings > 0 ? `${p.max_discounted_bookings} bookings` : 'Unlimited'}
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleTogglePlanActive(p)}
                            className={`badge border-0 cursor-pointer text-uppercase text-2xs px-2.5 py-1 ${
                              p.is_active ? 'bg-success text-white' : 'bg-secondary text-white'
                            }`}
                          >
                            {p.is_active ? 'Active' : 'Disabled'}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-end">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPlan(p)}
                            className="btn btn-xs btn-outline-secondary p-1.5 rounded-2"
                            title="Edit Plan"
                          >
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: LOYALTY CONFIG */}
          {activeTab === 'loyalty_config' && loyaltyConfig && (
            <div className="max-w-2xl">
              <h3 className="fs-6 fw-bold text-slate-900 mb-1">Global Points &amp; Rewards Policy</h3>
              <p className="text-slate-500 text-xs mb-4">
                Configure earning rules, minimum redemption thresholds, and rupee discount exchange rates.
              </p>

              <form onSubmit={handleSaveLoyaltyConfig}>
                {/* Program active switch */}
                <div className="p-3 rounded-3 bg-slate-50 border border-slate-200 mb-3">
                  <div className="form-check form-switch mb-1">
                    <input
                      className="form-check-input cursor-pointer"
                      type="checkbox"
                      id="loyaltyActiveSwitch"
                      checked={loyaltyConfig.is_enabled}
                      onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, is_enabled: e.target.checked })}
                    />
                    <label className="form-check-label fw-bold text-slate-800 text-sm cursor-pointer" htmlFor="loyaltyActiveSwitch">
                      Loyalty Points Program Active
                    </label>
                  </div>
                  <span className="text-2xs text-slate-500">
                    When disabled, customers cannot earn or redeem loyalty points on reservations.
                  </span>
                </div>

                <div className="row g-3 mb-3">
                  <div className="col-12 col-sm-6">
                    <label className="form-label text-xs fw-bold text-slate-700">Points Earning Rate</label>
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        value={loyaltyConfig.points_per_currency_unit}
                        onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, points_per_currency_unit: e.target.value })}
                        required
                      />
                      <span className="input-group-text bg-slate-50 text-2xs">pts / ₹1</span>
                    </div>
                    <span className="text-2xs text-slate-500 mt-0.5 d-block">
                      e.g. 0.10 gives 1 pt for every ₹10 spent.
                    </span>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label text-xs fw-bold text-slate-700">Points Value Rate (Redemption)</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-slate-50 text-2xs">1 pt = ₹</span>
                      <input
                        type="number"
                        step="0.05"
                        className="form-control"
                        value={loyaltyConfig.points_redemption_rate}
                        onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, points_redemption_rate: e.target.value })}
                        required
                      />
                    </div>
                    <span className="text-2xs text-slate-500 mt-0.5 d-block">
                      e.g. 0.50 means 100 points give ₹50.00 off.
                    </span>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label text-xs fw-bold text-slate-700">Minimum Spending to Earn</label>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-slate-50 text-2xs">₹</span>
                      <input
                        type="number"
                        step="1"
                        className="form-control"
                        value={loyaltyConfig.min_spending_to_earn}
                        onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, min_spending_to_earn: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label text-xs fw-bold text-slate-700">Minimum Points to Redeem</label>
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        step="1"
                        className="form-control"
                        value={loyaltyConfig.min_points_to_redeem}
                        onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, min_points_to_redeem: e.target.value })}
                        required
                      />
                      <span className="input-group-text bg-slate-50 text-2xs">points</span>
                    </div>
                  </div>

                  <div className="col-12 col-sm-6">
                    <label className="form-label text-xs fw-bold text-slate-700">Max Booking Discount Cap (%)</label>
                    <div className="input-group input-group-sm">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        max="100"
                        className="form-control"
                        value={loyaltyConfig.max_redemption_percentage}
                        onChange={(e) => setLoyaltyConfig({ ...loyaltyConfig, max_redemption_percentage: e.target.value })}
                        required
                      />
                      <span className="input-group-text bg-slate-50 text-2xs">% of total</span>
                    </div>
                    <span className="text-2xs text-slate-500 mt-0.5 d-block">
                      Limits maximum portion of a reservation payable via points.
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn btn-sm btn-primary px-4 fw-bold shadow-xs d-inline-flex align-items-center gap-1.5"
                >
                  <Save size={16} /> {savingConfig ? 'Saving...' : 'Save Loyalty Settings'}
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: CUSTOMER ACCOUNTS */}
          {activeTab === 'accounts' && (
            <div>
              <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mb-3">
                <h3 className="fs-6 fw-bold text-slate-900 mb-0">Customer Loyalty Accounts</h3>
                <div className="input-group input-group-sm max-w-xs">
                  <span className="input-group-text bg-slate-50">
                    <Search size={14} />
                  </span>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search customer username/email..."
                    value={accountsQuery}
                    onChange={(e) => {
                      setAccountsQuery(e.target.value);
                      fetchAccounts(e.target.value);
                    }}
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 text-sm">
                  <thead className="bg-slate-50 text-slate-500 text-2xs text-uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Tier</th>
                      <th className="py-3 px-3">Current Balance</th>
                      <th className="py-3 px-3">Discount Value</th>
                      <th className="py-3 px-3">Lifetime Earned</th>
                      <th className="py-3 px-3 text-end">Adjust</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {accounts.length === 0 ? (
                      <tr>
                        <td colSpan="6" className="text-center py-4 text-muted text-xs">
                          No loyalty accounts found.
                        </td>
                      </tr>
                    ) : (
                      accounts.map((acct) => (
                        <tr key={acct.id}>
                          <td className="py-3 px-3">
                            <div className="fw-bold text-slate-900">{acct.user_username}</div>
                            <div className="text-2xs text-slate-500">{acct.user_email}</div>
                          </td>
                          <td className="py-3 px-3">
                            <span className="badge bg-warning text-dark text-uppercase text-2xs px-2 py-0.5">
                              {acct.tier}
                            </span>
                          </td>
                          <td className="py-3 px-3 fw-bold text-slate-900">
                            {acct.points_balance} pts
                          </td>
                          <td className="py-3 px-3 text-emerald-600 font-semibold text-xs">
                            {formatCurrency(acct.current_discount_value)}
                          </td>
                          <td className="py-3 px-3 text-slate-600 text-xs">
                            +{acct.lifetime_earned} pts
                          </td>
                          <td className="py-3 px-3 text-end">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAccount(acct);
                                setAdjustForm({ points: 50, adjustment_type: 'credit', reason: '' });
                                setIsAdjustModalOpen(true);
                              }}
                              className="btn btn-xs btn-outline-primary px-2.5 py-1 rounded-2 fw-medium text-xs"
                            >
                              Adjust Points
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit Plan Modal */}
      {isPlanModalOpen && (
        <Modal
          title={editingPlan ? `Edit Membership Plan: ${editingPlan.name}` : 'Create New Membership Plan'}
          onClose={() => setIsPlanModalOpen(false)}
        >
          <form onSubmit={handleSavePlan}>
            <div className="row g-2 mb-2">
              <div className="col-12">
                <label className="form-label text-xs fw-bold text-slate-700">Plan Name *</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  value={planForm.name}
                  onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="col-12">
                <label className="form-label text-xs fw-bold text-slate-700">Description</label>
                <textarea
                  className="form-control form-control-sm"
                  rows={2}
                  value={planForm.description}
                  onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                />
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Duration Type</label>
                <select
                  className="form-select form-select-sm"
                  value={planForm.duration_type}
                  onChange={(e) =>
                    setPlanForm({
                      ...planForm,
                      duration_type: e.target.value,
                      duration_days: e.target.value === 'yearly' ? 365 : 30,
                    })
                  }
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Validity (Days)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={planForm.duration_days}
                  onChange={(e) => setPlanForm({ ...planForm, duration_days: e.target.value })}
                  required
                  min="1"
                />
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Price (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={planForm.price}
                  onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })}
                  required
                  min="0"
                />
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Discount Type</label>
                <select
                  className="form-select form-select-sm"
                  value={planForm.discount_type}
                  onChange={(e) => setPlanForm({ ...planForm, discount_type: e.target.value })}
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (INR)</option>
                </select>
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">
                  {planForm.discount_type === 'percentage' ? 'Discount Percentage (%) *' : 'Discount Value (₹) *'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  value={planForm.discount_value}
                  onChange={(e) => setPlanForm({ ...planForm, discount_value: e.target.value })}
                  required
                  min="0"
                />
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Max Discount Limit (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  className="form-control form-control-sm"
                  placeholder="Optional limit"
                  value={planForm.max_discount_per_booking}
                  onChange={(e) => setPlanForm({ ...planForm, max_discount_per_booking: e.target.value })}
                />
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Vehicle Eligibility</label>
                <select
                  className="form-select form-select-sm"
                  value={planForm.eligible_vehicle_types}
                  onChange={(e) => setPlanForm({ ...planForm, eligible_vehicle_types: e.target.value })}
                >
                  <option value="all">All Vehicles</option>
                  <option value="car">Car Only</option>
                  <option value="bike">Bike Only</option>
                  <option value="ev">EV Charging Vehicles Only</option>
                </select>
              </div>

              <div className="col-6">
                <label className="form-label text-xs fw-bold text-slate-700">Max Bookings (0 = Unlimited)</label>
                <input
                  type="number"
                  className="form-control form-control-sm"
                  value={planForm.max_discounted_bookings}
                  onChange={(e) => setPlanForm({ ...planForm, max_discounted_bookings: e.target.value })}
                  min="0"
                />
              </div>

              <div className="col-12">
                <label className="form-label text-xs fw-bold text-slate-700">Special Perks Description</label>
                <input
                  type="text"
                  className="form-control form-control-sm"
                  placeholder="e.g. Priority customer support, zero surge multipliers"
                  value={planForm.perks_description}
                  onChange={(e) => setPlanForm({ ...planForm, perks_description: e.target.value })}
                />
              </div>
            </div>

            <div className="d-flex gap-3 my-3">
              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="planActiveSwitch"
                  checked={planForm.is_active}
                  onChange={(e) => setPlanForm({ ...planForm, is_active: e.target.checked })}
                />
                <label className="form-check-label text-xs fw-semibold" htmlFor="planActiveSwitch">
                  Active (Visible to Customers)
                </label>
              </div>

              <div className="form-check form-switch">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="planRenewSwitch"
                  checked={planForm.allow_auto_renewal}
                  onChange={(e) => setPlanForm({ ...planForm, allow_auto_renewal: e.target.checked })}
                />
                <label className="form-check-label text-xs fw-semibold" htmlFor="planRenewSwitch">
                  Support Auto-Renewal
                </label>
              </div>
            </div>

            <div className="d-flex justify-content-end gap-2 pt-2 border-top">
              <button
                type="button"
                onClick={() => setIsPlanModalOpen(false)}
                className="btn btn-sm btn-light px-3"
              >
                Cancel
              </button>
              <button type="submit" className="btn btn-sm btn-primary px-4 fw-bold">
                {editingPlan ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Adjust Points Modal */}
      {isAdjustModalOpen && selectedAccount && (
        <Modal
          title={`Adjust Points: ${selectedAccount.user_username}`}
          onClose={() => setIsAdjustModalOpen(false)}
        >
          <form onSubmit={handleAdjustPointsSubmit}>
            <div className="p-3 rounded-3 bg-slate-50 border border-slate-200 mb-3 text-xs">
              <div>Customer: <strong>{selectedAccount.user_username}</strong> ({selectedAccount.user_email})</div>
              <div>Current Balance: <strong>{selectedAccount.points_balance} pts</strong></div>
            </div>

            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-slate-700">Adjustment Action</label>
              <div className="d-flex gap-3">
                <label className="d-flex align-items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="adj_type"
                    value="credit"
                    checked={adjustForm.adjustment_type === 'credit'}
                    onChange={() => setAdjustForm({ ...adjustForm, adjustment_type: 'credit' })}
                  />
                  <strong className="text-success">Credit (+) Points</strong>
                </label>
                <label className="d-flex align-items-center gap-1.5 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="adj_type"
                    value="debit"
                    checked={adjustForm.adjustment_type === 'debit'}
                    onChange={() => setAdjustForm({ ...adjustForm, adjustment_type: 'debit' })}
                  />
                  <strong className="text-danger">Debit (-) Points</strong>
                </label>
              </div>
            </div>

            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-slate-700">Points Amount</label>
              <input
                type="number"
                min="1"
                className="form-control form-control-sm"
                value={adjustForm.points}
                onChange={(e) => setAdjustForm({ ...adjustForm, points: e.target.value })}
                required
              />
            </div>

            <div className="mb-4">
              <label className="form-label text-xs fw-bold text-slate-700">Reason for Audit Ledger *</label>
              <input
                type="text"
                placeholder="e.g. Promotional goodwill bonus / Resolution compensation"
                className="form-control form-control-sm"
                value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                required
                minLength={3}
              />
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                onClick={() => setIsAdjustModalOpen(false)}
                className="btn btn-sm btn-light px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjusting}
                className="btn btn-sm btn-primary px-4 fw-bold"
              >
                {adjusting ? 'Processing...' : 'Confirm Adjustment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default AdminMembershipRewardsPage;
