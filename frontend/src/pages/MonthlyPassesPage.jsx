import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Ticket,
  Car,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  PlusCircle,
  AlertCircle,
  XCircle,
  QrCode,
  ShieldCheck,
  CreditCard,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import vehicleService from '../services/vehicleService';
import parkingService from '../services/parkingService';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function MonthlyPassesPage() {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [passes, setPasses] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);

  // Purchase Modal State
  const [isPurchaseModalOpen, setIsPurchaseModalOpen] = useState(false);
  const [purchaseForm, setPurchaseForm] = useState({
    vehicle_id: '',
    lot_id: '',
    pass_type: 'full_coverage',
    payment_method: 'upi',
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchPasses = async () => {
    setLoading(true);
    try {
      const [passesData, userVehicles, lotsData] = await Promise.all([
        membershipLoyaltyService.getMyPasses(),
        vehicleService.getVehicles().catch(() => []),
        parkingService.getLots().catch(() => []),
      ]);
      setPasses(Array.isArray(passesData) ? passesData : (passesData.results || []));
      setVehicles(userVehicles);
      setLots(Array.isArray(lotsData) ? lotsData : (lotsData.results || []));

      // Auto-select first vehicle
      if (userVehicles.length > 0 && !purchaseForm.vehicle_id) {
        setPurchaseForm((prev) => ({ ...prev, vehicle_id: userVehicles[0].id }));
      }
    } catch (err) {
      console.error('Error fetching passes:', err);
      showError('Failed to load parking passes.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPasses();
  }, []);

  const handlePurchaseSubmit = async (e) => {
    e.preventDefault();
    if (!purchaseForm.vehicle_id) {
      showError('Please register and select a vehicle for this pass.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        vehicle_id: parseInt(purchaseForm.vehicle_id, 10),
        lot_id: purchaseForm.lot_id ? parseInt(purchaseForm.lot_id, 10) : null,
        pass_type: purchaseForm.pass_type,
        payment_method: purchaseForm.payment_method,
      };
      const res = await membershipLoyaltyService.purchasePass(payload);
      showSuccess(`Monthly pass issued! Pass Code: ${res.pass?.pass_code || ''}`);
      setIsPurchaseModalOpen(false);
      fetchPasses();
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Failed to issue monthly pass.';
      showError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPass = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this monthly pass? Remaining validity will be forfeited.')) return;
    try {
      await membershipLoyaltyService.cancelPass(id);
      showSuccess('Monthly pass cancelled.');
      fetchPasses();
    } catch (err) {
      console.error(err);
      showError('Failed to cancel pass.');
    }
  };

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h1 className="fs-3 fw-black text-slate-900 mb-1 d-flex align-items-center gap-2">
            <Ticket size={28} className="text-primary" /> Monthly Parking Passes
          </h1>
          <p className="text-slate-500 text-sm mb-0">
            Enjoy 30 days of hassle-free parking coverage for your vehicle across designated lots.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => setIsPurchaseModalOpen(true)}
            className="btn btn-primary px-3 py-2 rounded-3 fw-bold text-sm shadow-xs d-inline-flex align-items-center gap-2"
          >
            <PlusCircle size={16} /> Buy New Monthly Pass
          </button>
        </div>
      </div>

      {/* Info notice about slot reservation requirement */}
      <div className="alert alert-info py-3 px-4 rounded-4 border-info border-opacity-25 bg-info bg-opacity-10 mb-4 d-flex align-items-start gap-3">
        <AlertCircle size={20} className="text-info-emphasis flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700">
          <strong className="text-slate-900 d-block mb-0.5">Physical Slot Reservation Required:</strong>
          A Monthly Parking Pass covers parking fees fully (or provides a discount) during its validity period.
          However, because our sensor-free platform tracks real-time bay availability strictly via reservations,
          pass holders must still reserve a slot in advance for their intended parking hours to ensure a bay is open.
        </div>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <LoadingSpinner size="lg" message="Loading your parking passes..." />
        </div>
      ) : passes.length === 0 ? (
        <div className="card rounded-4 border border-dashed border-2 border-slate-300 p-5 text-center bg-slate-50">
          <div className="w-16 h-16 mx-auto rounded-circle bg-blue-50 text-primary d-flex align-items-center justify-content-center mb-3">
            <Ticket size={32} />
          </div>
          <h2 className="fs-5 fw-bold text-slate-800 mb-1">No monthly parking passes found</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
            Link a pass to your vehicle to enjoy 100% free parking bookings for a full month.
          </p>
          <div>
            <button
              type="button"
              onClick={() => setIsPurchaseModalOpen(true)}
              className="btn btn-primary px-4 py-2.5 rounded-3 fw-bold shadow-xs d-inline-flex align-items-center gap-2"
            >
              <PlusCircle size={16} /> Get a Monthly Pass
            </button>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {passes.map((pass) => {
            const isActive = pass.status === 'active' && !pass.is_expired;
            return (
              <div key={pass.id} className="col-12 col-md-6 col-lg-4">
                <div
                  className={`card h-100 rounded-4 transition-all border ${
                    isActive ? 'border-primary shadow-sm hover-shadow-md' : 'border-slate-200 bg-slate-50 opacity-80'
                  }`}
                >
                  {/* Top Pass Header */}
                  <div className="card-header bg-slate-900 text-white p-3 px-4 d-flex justify-content-between align-items-center rounded-top-4">
                    <div className="d-flex align-items-center gap-2">
                      <Ticket size={18} className="text-warning" />
                      <span className="font-monospace fw-bold text-xs">{pass.pass_code}</span>
                    </div>
                    <span
                      className={`badge text-uppercase text-2xs px-2 py-0.5 ${
                        isActive ? 'bg-success text-white' : 'bg-secondary text-white'
                      }`}
                    >
                      {isActive ? 'Active' : pass.status}
                    </span>
                  </div>

                  <div className="card-body p-4 d-flex flex-column">
                    <h3 className="fs-6 fw-bold text-slate-900 mb-1">{pass.pass_name}</h3>
                    <div className="d-flex align-items-center gap-1.5 text-xs text-slate-500 mb-3">
                      <MapPin size={14} className="text-slate-400" />
                      <span>{pass.lot_name || 'All Parking Facilities'}</span>
                    </div>

                    {/* Linked vehicle plate */}
                    <div className="p-2.5 rounded-3 bg-slate-100 border border-slate-200 d-flex align-items-center justify-content-between mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <Car size={16} className="text-slate-600" />
                        <span className="text-2xs text-slate-500">Linked Vehicle:</span>
                      </div>
                      <span className="badge bg-white border border-slate-300 text-slate-900 font-monospace text-xs px-2 py-1">
                        {pass.vehicle_license_plate}
                      </span>
                    </div>

                    {/* Coverage & Dates */}
                    <div className="d-flex flex-column gap-2 text-xs text-slate-600 mb-4 flex-grow-1">
                      <div className="d-flex justify-content-between py-1 border-bottom border-slate-100">
                        <span className="text-slate-500">Coverage Type:</span>
                        <strong className="text-slate-900">
                          {pass.pass_type === 'full_coverage' ? '100% Free Parking' : `${pass.discount_percent}% Discount`}
                        </strong>
                      </div>
                      <div className="d-flex justify-content-between py-1 border-bottom border-slate-100">
                        <span className="text-slate-500">Valid From:</span>
                        <span>{new Date(pass.start_date).toLocaleDateString()}</span>
                      </div>
                      <div className="d-flex justify-content-between py-1 border-bottom border-slate-100">
                        <span className="text-slate-500">Valid Until:</span>
                        <strong className={isActive ? 'text-slate-900' : 'text-danger'}>
                          {new Date(pass.end_date).toLocaleDateString()}
                        </strong>
                      </div>
                      <div className="d-flex justify-content-between py-1">
                        <span className="text-slate-500">Bookings Used:</span>
                        <span className="fw-bold text-slate-900">
                          {pass.usage_count} {pass.max_bookings > 0 ? `/ ${pass.max_bookings}` : '(Unlimited)'}
                        </span>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-3 border-top border-slate-100 d-flex align-items-center justify-content-between">
                      <span className="text-2xs text-slate-500">
                        Paid: <strong>{formatCurrency(pass.amount_paid)}</strong>
                      </span>
                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleCancelPass(pass.id)}
                          className="btn btn-xs btn-outline-danger px-2.5 py-1 rounded-2 text-2xs"
                        >
                          Cancel Pass
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

      {/* Purchase Modal */}
      {isPurchaseModalOpen && (
        <Modal
          title="Buy a Monthly Parking Pass"
          onClose={() => setIsPurchaseModalOpen(false)}
        >
          <form onSubmit={handlePurchaseSubmit}>
            {/* Vehicle selection */}
            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-slate-700">
                Eligible Vehicle <span className="text-danger">*</span>
              </label>
              {vehicles.length === 0 ? (
                <div className="alert alert-warning p-2.5 text-xs mb-0">
                  You have not registered any vehicles yet. Please{' '}
                  <Link to="/vehicles" className="fw-bold text-decoration-underline">
                    add a vehicle
                  </Link>{' '}
                  first.
                </div>
              ) : (
                <select
                  className="form-select form-select-sm"
                  value={purchaseForm.vehicle_id}
                  onChange={(e) => setPurchaseForm({ ...purchaseForm, vehicle_id: e.target.value })}
                  required
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate} ({v.vehicle_type?.toUpperCase()}) {v.nickname ? `- ${v.nickname}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Parking Location */}
            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-slate-700">Parking Facility Coverage</label>
              <select
                className="form-select form-select-sm"
                value={purchaseForm.lot_id}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, lot_id: e.target.value })}
              >
                <option value="">All Network Parking Facilities (Universal Access)</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name} ({lot.location})
                  </option>
                ))}
              </select>
              <span className="text-2xs text-slate-500 mt-1 d-block">
                Leave as Universal Access to use this pass across any city lot.
              </span>
            </div>

            {/* Pass Type */}
            <div className="mb-3">
              <label className="form-label text-xs fw-bold text-slate-700">Select Pass Coverage Tier</label>
              <div className="row g-2">
                <div className="col-6">
                  <label
                    className={`p-3 rounded-3 border w-100 cursor-pointer d-block transition-all ${
                      purchaseForm.pass_type === 'full_coverage'
                        ? 'border-primary bg-primary bg-opacity-5'
                        : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pass_type"
                      value="full_coverage"
                      checked={purchaseForm.pass_type === 'full_coverage'}
                      onChange={() => setPurchaseForm({ ...purchaseForm, pass_type: 'full_coverage' })}
                      className="form-check-input mb-1"
                    />
                    <div className="fw-bold text-xs text-slate-900">All-Access Pass</div>
                    <div className="text-2xs text-success fw-bold">100% Free Bookings</div>
                    <div className="text-sm fw-black text-slate-900 mt-1">₹1,499 / mo</div>
                  </label>
                </div>
                <div className="col-6">
                  <label
                    className={`p-3 rounded-3 border w-100 cursor-pointer d-block transition-all ${
                      purchaseForm.pass_type === 'discounted'
                        ? 'border-primary bg-primary bg-opacity-5'
                        : 'border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="pass_type"
                      value="discounted"
                      checked={purchaseForm.pass_type === 'discounted'}
                      onChange={() => setPurchaseForm({ ...purchaseForm, pass_type: 'discounted' })}
                      className="form-check-input mb-1"
                    />
                    <div className="fw-bold text-xs text-slate-900">50% Saver Pass</div>
                    <div className="text-2xs text-primary fw-bold">50% Off Every Booking</div>
                    <div className="text-sm fw-black text-slate-900 mt-1">₹799 / mo</div>
                  </label>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            <div className="mb-4">
              <label className="form-label text-xs fw-bold text-slate-700">Simulated Payment Method</label>
              <select
                className="form-select form-select-sm"
                value={purchaseForm.payment_method}
                onChange={(e) => setPurchaseForm({ ...purchaseForm, payment_method: e.target.value })}
              >
                <option value="upi">UPI Instant Sandbox (Demo)</option>
                <option value="card">Debit / Credit Card Sandbox</option>
                <option value="netbanking">Net Banking Sandbox</option>
                <option value="wallet">Mobile Wallet Sandbox</option>
              </select>
            </div>

            <div className="alert alert-warning text-2xs py-2 px-3 mb-4">
              <strong>Simulated Demo Payment:</strong> A demonstration transaction will be processed instantly.
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                onClick={() => setIsPurchaseModalOpen(false)}
                className="btn btn-sm btn-light px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || vehicles.length === 0}
                className="btn btn-sm btn-primary px-4 fw-bold"
              >
                {submitting ? 'Confirming...' : 'Confirm & Issue Pass'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default MonthlyPassesPage;
