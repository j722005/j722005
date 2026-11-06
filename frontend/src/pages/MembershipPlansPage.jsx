import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Crown,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Zap,
  Tag,
  Car,
  MapPin,
  Calendar,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency } from '../utils/formatters';

export function MembershipPlansPage() {
  const { user } = useAuth();
  const { showError } = useNotification();
  const navigate = useNavigate();

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [durationFilter, setDurationFilter] = useState('all'); // 'all', 'monthly', 'yearly'
  const [myMemberships, setMyMemberships] = useState([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [plansData, myData] = await Promise.all([
          membershipLoyaltyService.getPlans(),
          user ? membershipLoyaltyService.getMyMemberships().catch(() => []) : Promise.resolve([]),
        ]);
        setPlans(Array.isArray(plansData) ? plansData : (plansData.results || []));
        setMyMemberships(Array.isArray(myData) ? myData : (myData.results || []));
      } catch (err) {
        console.error('Error loading plans:', err);
        showError('Failed to load membership plans. Please refresh.');
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [user]);

  const activeSubscription = myMemberships.find((m) => m.is_valid);

  const filteredPlans = plans.filter((p) => {
    if (durationFilter === 'all') return true;
    return p.duration_type === durationFilter;
  });

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Top Banner */}
      <div className="card border-0 rounded-4 shadow-sm mb-4 overflow-hidden position-relative bg-dark text-white p-4 p-md-5">
        <div
          className="position-absolute top-0 end-0 w-50 h-100 opacity-20 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at top right, #3b82f6, #8b5cf6, transparent 70%)',
          }}
        />
        <div className="position-relative z-1 max-w-3xl">
          <div className="d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill bg-white bg-opacity-10 backdrop-blur-sm border border-white border-opacity-15 text-warning mb-3">
            <Crown size={16} />
            <span className="text-xs fw-semibold tracking-wide text-uppercase">Premium Driver Club</span>
          </div>
          <h1 className="display-6 fw-black tracking-tight text-white mb-2">
            Save on Every Park with Smart Memberships
          </h1>
          <p className="lead text-white-50 fs-6 mb-4">
            Unlock exclusive member discounts across all parking facilities, guaranteed rate caps,
            unlimited reservation privileges, and prioritized customer support.
          </p>

          <div className="d-flex flex-wrap align-items-center gap-3">
            {activeSubscription ? (
              <Link to="/memberships/my" className="btn btn-warning px-4 py-2.5 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2">
                <ShieldCheck size={18} />
                You have an Active Membership ({activeSubscription.plan_details?.name})
                <ArrowRight size={16} />
              </Link>
            ) : (
              <a href="#plans-grid" className="btn btn-primary px-4 py-2.5 rounded-3 fw-bold shadow-sm d-inline-flex align-items-center gap-2">
                <Sparkles size={18} />
                Explore Available Plans
              </a>
            )}
            <Link to="/passes" className="btn btn-outline-light px-3 py-2.5 rounded-3 fw-medium">
              Looking for 100% Free Monthly Passes? &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Duration Switcher */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4" id="plans-grid">
        <div>
          <h2 className="fs-4 fw-bold text-slate-800 mb-1">Choose the Plan That Fits You</h2>
          <p className="text-slate-500 text-sm mb-0">
            Cancel or switch anytime. All payments verified via simulated secure sandbox.
          </p>
        </div>

        <div className="btn-group p-1 bg-white border border-slate-200 rounded-3 shadow-xs">
          <button
            type="button"
            className={`btn btn-sm px-3 rounded-2 fw-medium ${durationFilter === 'all' ? 'btn-primary shadow-xs' : 'btn-light text-slate-600'}`}
            onClick={() => setDurationFilter('all')}
          >
            All Plans
          </button>
          <button
            type="button"
            className={`btn btn-sm px-3 rounded-2 fw-medium ${durationFilter === 'monthly' ? 'btn-primary shadow-xs' : 'btn-light text-slate-600'}`}
            onClick={() => setDurationFilter('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            className={`btn btn-sm px-3 rounded-2 fw-medium ${durationFilter === 'yearly' ? 'btn-primary shadow-xs' : 'btn-light text-slate-600'}`}
            onClick={() => setDurationFilter('yearly')}
          >
            Yearly <span className="badge bg-success-subtle text-success ms-1">Save 20%</span>
          </button>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="py-5 text-center">
          <LoadingSpinner size="lg" message="Loading membership plans..." />
        </div>
      ) : filteredPlans.length === 0 ? (
        <div className="card border-dashed border-2 border-slate-200 rounded-4 p-5 text-center bg-slate-50">
          <div className="w-16 h-16 mx-auto mb-3 rounded-circle bg-amber-50 text-amber-600 d-flex align-items-center justify-content-center">
            <Crown size={32} />
          </div>
          <h3 className="fs-5 fw-bold text-slate-800 mb-1">No plans available right now</h3>
          <p className="text-slate-500 text-sm mb-3">
            Our administrators are updating membership offerings. Please check back shortly.
          </p>
        </div>
      ) : (
        <div className="row g-4 mb-5">
          {filteredPlans.map((plan, index) => {
            const isSubscribedToThis = myMemberships.some(
              (m) => m.plan === plan.id && m.is_valid
            );
            const isPopular = index === 1 || plan.price > 300;

            return (
              <div key={plan.id} className="col-12 col-md-6 col-lg-4">
                <div
                  className={`card h-100 rounded-4 transition-all border ${
                    isSubscribedToThis
                      ? 'border-success shadow-md bg-success bg-opacity-5'
                      : isPopular
                      ? 'border-primary shadow-md position-relative'
                      : 'border-slate-200 shadow-sm hover-shadow-md'
                  }`}
                >
                  {isPopular && !isSubscribedToThis && (
                    <div className="position-absolute top-0 start-50 translate-middle">
                      <span className="badge bg-primary text-white px-3 py-1.5 rounded-pill shadow-xs text-uppercase tracking-wider text-2xs fw-bold">
                        Most Popular
                      </span>
                    </div>
                  )}

                  {isSubscribedToThis && (
                    <div className="position-absolute top-0 start-50 translate-middle">
                      <span className="badge bg-success text-white px-3 py-1.5 rounded-pill shadow-xs text-uppercase tracking-wider text-2xs fw-bold d-inline-flex align-items-center gap-1">
                        <CheckCircle2 size={12} /> Active Plan
                      </span>
                    </div>
                  )}

                  <div className="card-body p-4 d-flex flex-column">
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h3 className="fs-5 fw-bold text-slate-900 mb-0">{plan.name}</h3>
                      <span className="badge bg-slate-100 text-slate-700 text-capitalize px-2.5 py-1">
                        {plan.duration_type}
                      </span>
                    </div>

                    <p className="text-slate-500 text-sm mb-4 min-h-40">
                      {plan.description || 'Exclusive discounts on all lot bookings and zero surge rates.'}
                    </p>

                    {/* Price Tag */}
                    <div className="p-3 rounded-3 bg-slate-50 border border-slate-100 mb-4">
                      <div className="d-flex align-items-baseline gap-1">
                        <span className="fs-2 fw-black text-slate-900">{formatCurrency(plan.price)}</span>
                        <span className="text-slate-500 text-sm">/ {plan.duration_type === 'yearly' ? 'year' : 'month'}</span>
                      </div>
                      <div className="mt-1 d-inline-flex align-items-center gap-1 text-2xs fw-bold text-success">
                        <Tag size={12} />
                        {plan.discount_type === 'percentage'
                          ? `${plan.discount_value}% OFF bookings`
                          : `₹${plan.discount_value} OFF every booking`}
                        {plan.max_discount_per_booking && (
                          <span className="text-slate-500 fw-normal"> (up to ₹{plan.max_discount_per_booking})</span>
                        )}
                      </div>
                    </div>

                    {/* Feature list */}
                    <div className="mb-4 flex-grow-1">
                      <span className="text-2xs text-uppercase tracking-wider fw-bold text-slate-400 d-block mb-2">
                        Plan Benefits
                      </span>
                      <ul className="list-unstyled d-flex flex-column gap-2 text-sm text-slate-700 mb-0">
                        <li className="d-flex align-items-start gap-2">
                          <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>
                            <strong>{plan.discount_type === 'percentage' ? `${plan.discount_value}% discount` : `₹${plan.discount_value} discount`}</strong> applied automatically on checkout.
                          </span>
                        </li>
                        <li className="d-flex align-items-start gap-2">
                          <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>
                            {plan.max_discounted_bookings > 0 ? (
                              <>Up to <strong>{plan.max_discounted_bookings} discounted bookings</strong> per cycle</>
                            ) : (
                              <strong>Unlimited discounted bookings</strong>
                            )}
                          </span>
                        </li>
                        <li className="d-flex align-items-start gap-2">
                          <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>
                            Eligible vehicles: <strong className="text-capitalize">{plan.eligible_vehicle_types}</strong>
                          </span>
                        </li>
                        <li className="d-flex align-items-start gap-2">
                          <CheckCircle2 size={16} className="text-success mt-0.5 flex-shrink-0" />
                          <span>
                            Facility access:{' '}
                            {plan.eligible_lots && plan.eligible_lots.length > 0 ? (
                              <strong>{plan.eligible_lot_names?.join(', ') || 'Selected Locations'}</strong>
                            ) : (
                              <strong>All Network Parking Locations</strong>
                            )}
                          </span>
                        </li>
                        {plan.perks_description && (
                          <li className="d-flex align-items-start gap-2">
                            <Sparkles size={16} className="text-warning mt-0.5 flex-shrink-0" />
                            <span>{plan.perks_description}</span>
                          </li>
                        )}
                      </ul>
                    </div>

                    {/* Action Button */}
                    <div className="mt-auto">
                      {isSubscribedToThis ? (
                        <Link
                          to="/memberships/my"
                          className="btn btn-outline-success w-100 py-2.5 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2"
                        >
                          <ShieldCheck size={18} />
                          Manage Active Subscription
                        </Link>
                      ) : (
                        <button
                          type="button"
                          className={`btn w-100 py-2.5 rounded-3 fw-bold d-flex align-items-center justify-content-center gap-2 ${
                            isPopular ? 'btn-primary shadow-xs' : 'btn-dark'
                          }`}
                          onClick={() => {
                            if (!user) {
                              navigate('/login');
                            } else {
                              navigate(`/memberships/checkout/${plan.id}`);
                            }
                          }}
                        >
                          <Crown size={16} />
                          Subscribe Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Trust & Guarantee Banner */}
      <div className="card rounded-4 border-slate-200 bg-slate-50 p-4">
        <div className="row g-3 text-center text-md-start align-items-center">
          <div className="col-12 col-md-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center flex-shrink-0">
              <Zap size={24} />
            </div>
            <div>
              <h4 className="fs-6 fw-bold text-slate-800 mb-0">Instant Benefit Activation</h4>
              <p className="text-2xs text-slate-500 mb-0">Discounts are calculated automatically on quotes</p>
            </div>
          </div>
          <div className="col-12 col-md-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center flex-shrink-0">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h4 className="fs-6 fw-bold text-slate-800 mb-0">Simulated Secure Sandbox</h4>
              <p className="text-2xs text-slate-500 mb-0">Zero real money charged during demonstration</p>
            </div>
          </div>
          <div className="col-12 col-md-4 d-flex align-items-center gap-3">
            <div className="w-12 h-12 rounded-circle bg-purple-50 text-purple-600 d-flex align-items-center justify-content-center flex-shrink-0">
              <Sparkles size={24} />
            </div>
            <div>
              <h4 className="fs-6 fw-bold text-slate-800 mb-0">Earn Double Loyalty Points</h4>
              <p className="text-2xs text-slate-500 mb-0">Members gain loyalty points on all transactions</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MembershipPlansPage;
