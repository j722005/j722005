import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Crown,
  CheckCircle2,
  ShieldCheck,
  CreditCard,
  QrCode,
  Building,
  Wallet,
  ArrowLeft,
  Lock,
  Sparkles,
  Info,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency } from '../utils/formatters';

export function MembershipCheckoutPage() {
  const { planId } = useParams();
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [autoRenew, setAutoRenew] = useState(true);
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    async function loadPlan() {
      setLoading(true);
      try {
        const data = await membershipLoyaltyService.getPlanDetail(planId);
        setPlan(data);
      } catch (err) {
        console.error('Error loading plan:', err);
        showError('Membership plan not found or expired.');
        navigate('/memberships/plans');
      } finally {
        setLoading(false);
      }
    }
    loadPlan();
  }, [planId]);

  const handlePurchase = async (e) => {
    e.preventDefault();
    if (!plan) return;

    setProcessing(true);
    try {
      const res = await membershipLoyaltyService.purchaseMembership({
        plan_id: plan.id,
        payment_method: paymentMethod,
        auto_renew: autoRenew,
      });

      showSuccess(`Membership activated! Transaction ID: ${res.simulated_payment?.transaction_id || ''}`);
      setSuccessResult(res);
    } catch (err) {
      console.error('Purchase error:', err);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to complete membership purchase.';
      showError(msg);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="py-5 text-center">
        <LoadingSpinner size="lg" message="Loading checkout details..." />
      </div>
    );
  }

  if (successResult) {
    return (
      <div className="container max-w-2xl px-0 py-5">
        <div className="card rounded-4 border-0 shadow-lg text-center p-4 p-md-5">
          <div className="w-20 h-20 mx-auto rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center mb-3">
            <CheckCircle2 size={40} />
          </div>
          <span className="badge bg-success-subtle text-success px-3 py-1.5 rounded-pill text-xs fw-bold mx-auto mb-2">
            Payment Verified &bull; Simulated Gateway
          </span>
          <h2 className="fs-3 fw-black text-slate-900 mb-2">Membership Activated!</h2>
          <p className="text-slate-600 text-sm mb-4">
            Congratulations! You are now an active member of <strong>{plan.name}</strong>.
            Your benefits and discounts will be applied automatically on all eligible parking quotes.
          </p>

          <div className="bg-slate-50 border border-slate-200 rounded-3 p-3 text-start mb-4 text-xs text-slate-600">
            <div className="d-flex justify-content-between py-1 border-bottom border-slate-200">
              <span className="text-slate-500">Transaction ID:</span>
              <span className="font-monospace fw-bold text-slate-800">{successResult.simulated_payment?.transaction_id}</span>
            </div>
            <div className="d-flex justify-content-between py-1 border-bottom border-slate-200">
              <span className="text-slate-500">Amount Paid:</span>
              <span className="fw-bold text-slate-900">{formatCurrency(successResult.simulated_payment?.amount)}</span>
            </div>
            <div className="d-flex justify-content-between py-1 border-bottom border-slate-200">
              <span className="text-slate-500">Valid Until:</span>
              <span className="fw-bold text-slate-800">{new Date(successResult.membership?.end_date).toLocaleDateString()}</span>
            </div>
            <div className="d-flex justify-content-between py-1">
              <span className="text-slate-500">Auto-Renewal:</span>
              <span className="fw-bold text-slate-800">{successResult.membership?.auto_renew ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>

          <div className="d-flex flex-column flex-sm-row justify-content-center gap-2">
            <Link to="/memberships/my" className="btn btn-primary px-4 py-2.5 rounded-3 fw-bold">
              View My Memberships
            </Link>
            <Link to="/lots" className="btn btn-outline-secondary px-4 py-2.5 rounded-3 fw-medium">
              Find Parking Lots &amp; Book
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl px-0 py-3">
      {/* Back link */}
      <Link to="/memberships/plans" className="text-slate-600 text-sm fw-medium text-decoration-none d-inline-flex align-items-center gap-1 mb-3 hover-text-primary">
        <ArrowLeft size={16} /> Back to Membership Plans
      </Link>

      <div className="row g-4">
        {/* Left Column: Payment & Options Form */}
        <div className="col-12 col-md-7">
          <div className="card rounded-4 border-slate-200 shadow-sm p-4">
            <h2 className="fs-5 fw-bold text-slate-900 mb-1">Select Payment Method</h2>
            <p className="text-slate-500 text-xs mb-4">
              Choose your preferred simulated demo payment method to activate your subscription.
            </p>

            <form onSubmit={handlePurchase}>
              {/* Payment Method Cards */}
              <div className="d-flex flex-column gap-2 mb-4">
                <label
                  className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center justify-content-between transition-all ${
                    paymentMethod === 'upi' ? 'border-primary bg-primary bg-opacity-5' : 'border-slate-200 hover-bg-slate-50'
                  }`}
                >
                  <div className="d-flex align-items-center gap-3">
                    <input
                      type="radio"
                      name="payment_method"
                      value="upi"
                      checked={paymentMethod === 'upi'}
                      onChange={() => setPaymentMethod('upi')}
                      className="form-check-input mt-0"
                    />
                    <div className="w-9 h-9 rounded-circle bg-emerald-50 text-emerald-600 d-flex align-items-center justify-content-center">
                      <QrCode size={18} />
                    </div>
                    <div>
                      <div className="fw-bold text-slate-800 text-sm">UPI Instant Transfer</div>
                      <div className="text-2xs text-slate-500">Google Pay, PhonePe, Paytm, BHIM</div>
                    </div>
                  </div>
                  <span className="badge bg-success-subtle text-success text-2xs">Recommended</span>
                </label>

                <label
                  className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center justify-content-between transition-all ${
                    paymentMethod === 'card' ? 'border-primary bg-primary bg-opacity-5' : 'border-slate-200 hover-bg-slate-50'
                  }`}
                >
                  <div className="d-flex align-items-center gap-3">
                    <input
                      type="radio"
                      name="payment_method"
                      value="card"
                      checked={paymentMethod === 'card'}
                      onChange={() => setPaymentMethod('card')}
                      className="form-check-input mt-0"
                    />
                    <div className="w-9 h-9 rounded-circle bg-blue-50 text-blue-600 d-flex align-items-center justify-content-center">
                      <CreditCard size={18} />
                    </div>
                    <div>
                      <div className="fw-bold text-slate-800 text-sm">Credit / Debit Card</div>
                      <div className="text-2xs text-slate-500">Visa, Mastercard, RuPay</div>
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center justify-content-between transition-all ${
                    paymentMethod === 'netbanking' ? 'border-primary bg-primary bg-opacity-5' : 'border-slate-200 hover-bg-slate-50'
                  }`}
                >
                  <div className="d-flex align-items-center gap-3">
                    <input
                      type="radio"
                      name="payment_method"
                      value="netbanking"
                      checked={paymentMethod === 'netbanking'}
                      onChange={() => setPaymentMethod('netbanking')}
                      className="form-check-input mt-0"
                    />
                    <div className="w-9 h-9 rounded-circle bg-indigo-50 text-indigo-600 d-flex align-items-center justify-content-center">
                      <Building size={18} />
                    </div>
                    <div>
                      <div className="fw-bold text-slate-800 text-sm">Net Banking</div>
                      <div className="text-2xs text-slate-500">All major Indian banks supported</div>
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-3 border cursor-pointer d-flex align-items-center justify-content-between transition-all ${
                    paymentMethod === 'wallet' ? 'border-primary bg-primary bg-opacity-5' : 'border-slate-200 hover-bg-slate-50'
                  }`}
                >
                  <div className="d-flex align-items-center gap-3">
                    <input
                      type="radio"
                      name="payment_method"
                      value="wallet"
                      checked={paymentMethod === 'wallet'}
                      onChange={() => setPaymentMethod('wallet')}
                      className="form-check-input mt-0"
                    />
                    <div className="w-9 h-9 rounded-circle bg-purple-50 text-purple-600 d-flex align-items-center justify-content-center">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <div className="fw-bold text-slate-800 text-sm">Digital Wallet</div>
                      <div className="text-2xs text-slate-500">Mobikwik, Freecharge, Amazon Pay</div>
                    </div>
                  </div>
                </label>
              </div>

              {/* Auto renewal option */}
              <div className="p-3 rounded-3 bg-slate-50 border border-slate-200 mb-4">
                <div className="form-check form-switch mb-1">
                  <input
                    className="form-check-input cursor-pointer"
                    type="checkbox"
                    role="switch"
                    id="autoRenewSwitch"
                    checked={autoRenew}
                    onChange={(e) => setAutoRenew(e.target.checked)}
                  />
                  <label className="form-check-label fw-bold text-slate-800 text-xs cursor-pointer" htmlFor="autoRenewSwitch">
                    Enable hassle-free Auto-Renewal
                  </label>
                </div>
                <p className="text-slate-500 text-2xs mb-0 ps-6">
                  Automatically extends your plan validity before expiry. You can cancel auto-renewal at any time with one click.
                </p>
              </div>

              {/* Sandbox notice */}
              <div className="alert alert-warning py-2.5 px-3 rounded-3 text-xs mb-4 d-flex align-items-center gap-2">
                <AlertCircle size={16} className="text-warning-emphasis flex-shrink-0" />
                <span>
                  <strong>Simulated Demo Sandbox:</strong> No actual money will be deducted from your bank or card.
                </span>
              </div>

              <button
                type="submit"
                disabled={processing}
                className="btn btn-primary w-100 py-3 rounded-3 fw-bold shadow-sm d-flex align-items-center justify-content-center gap-2"
              >
                {processing ? (
                  <LoadingSpinner size="sm" message="Confirming simulated payment..." inline />
                ) : (
                  <>
                    <Lock size={16} /> Pay {formatCurrency(plan.price)} &amp; Activate Membership
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Order Summary */}
        <div className="col-12 col-md-5">
          <div className="card rounded-4 border-slate-200 shadow-sm p-4 bg-slate-50 sticky-top" style={{ top: '80px' }}>
            <div className="d-flex align-items-center gap-2 mb-3 pb-3 border-bottom border-slate-200">
              <div className="w-10 h-10 rounded-circle bg-warning bg-opacity-20 text-warning d-flex align-items-center justify-content-center">
                <Crown size={20} />
              </div>
              <div>
                <h3 className="fs-6 fw-bold text-slate-900 mb-0">{plan.name}</h3>
                <span className="badge bg-light text-slate-600 text-capitalize text-2xs">
                  {plan.duration_type} Plan ({plan.duration_days} Days)
                </span>
              </div>
            </div>

            <div className="mb-4">
              <span className="text-2xs text-uppercase tracking-wider fw-bold text-slate-400 d-block mb-2">
                Key Benefits Included
              </span>
              <ul className="list-unstyled d-flex flex-column gap-2 text-xs text-slate-600 mb-0">
                <li className="d-flex align-items-center gap-2">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>
                    {plan.discount_type === 'percentage'
                      ? `${plan.discount_value}% discount on every booking`
                      : `₹${plan.discount_value} fixed discount on every booking`}
                  </span>
                </li>
                <li className="d-flex align-items-center gap-2">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>
                    {plan.max_discounted_bookings > 0
                      ? `Up to ${plan.max_discounted_bookings} bookings per cycle`
                      : 'Unlimited discounted bookings'}
                  </span>
                </li>
                <li className="d-flex align-items-center gap-2">
                  <CheckCircle2 size={14} className="text-success" />
                  <span>Eligible vehicles: <strong className="text-capitalize">{plan.eligible_vehicle_types}</strong></span>
                </li>
              </ul>
            </div>

            {/* Price breakdown */}
            <div className="border-top border-slate-200 pt-3">
              <div className="d-flex justify-content-between text-xs text-slate-600 py-1">
                <span>Membership Price</span>
                <span>{formatCurrency(plan.price)}</span>
              </div>
              <div className="d-flex justify-content-between text-xs text-slate-600 py-1">
                <span>Service GST (Included)</span>
                <span>₹0.00</span>
              </div>
              <div className="d-flex justify-content-between text-sm fw-bold text-slate-900 pt-2 border-top border-slate-200 mt-2">
                <span>Total Amount Due</span>
                <span className="text-primary fs-5">{formatCurrency(plan.price)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MembershipCheckoutPage;
