import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  MapPin,
  Clock,
  ShieldCheck,
  Zap,
  ArrowLeft,
  Calendar,
  Car,
  Bike,
  QrCode,
  CreditCard,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RotateCw,
  Info,
  Shield,
  Layers,
  Sparkles,
  Crown,
  Ticket,
  Award,
  Coins,
} from 'lucide-react';
import parkingService from '../services/parkingService';
import bookingService from '../services/bookingService';
import vehicleService from '../services/vehicleService';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import SlotGrid from '../components/SlotGrid';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function LotDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { showSuccess, showError } = useNotification();

  // Page Data State
  const [lot, setLot] = useState(null);
  const [slots, setSlots] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState(null);
  const [isRefreshingSlots, setIsRefreshingSlots] = useState(false);

  // Time Window Selection State
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timeValidationError, setTimeValidationError] = useState('');

  // Booking Flow State
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [bookingStep, setBookingStep] = useState(1); // 1: details & summary, 2: payment, 3: confirmation
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('upi');
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState('');
  const [conflictError, setConflictError] = useState('');
  const [createdBooking, setCreatedBooking] = useState(null);
  const [userPasses, setUserPasses] = useState([]);
  const [selectedPassId, setSelectedPassId] = useState('');
  const [loyaltyAccount, setLoyaltyAccount] = useState(null);
  const [redeemPoints, setRedeemPoints] = useState(0);

  // Helper for datetime-local input formatting
  const toDatetimeLocal = (date) => {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };

  // Initialize arrival/departure defaults or read from URL parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const qStart = queryParams.get('start');
    const qEnd = queryParams.get('end');

    if (qStart && qEnd) {
      setStartTime(qStart);
      setEndTime(qEnd);
    } else {
      const now = new Date();
      // Round up to next 15-minute slot at least 10 minutes in the future
      now.setMinutes(Math.ceil((now.getMinutes() + 10) / 15) * 15, 0, 0);
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

      setStartTime(toDatetimeLocal(now));
      setEndTime(toDatetimeLocal(twoHoursLater));
    }
  }, [location.search]);

  // If slot_id was specified in query parameters, auto-select it once slots are loaded
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const qSlotId = queryParams.get('slot_id');
    if (qSlotId && slots.length > 0 && !selectedSlot) {
      const match = slots.find((s) => String(s.id) === String(qSlotId));
      if (match && match.status === 'available') {
        setSelectedSlot(match);
      }
    }
  }, [slots, location.search, selectedSlot]);

  // Duration calculation in hours
  const durationHours = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const start = new Date(startTime);
    const end = new Date(endTime);
    const diff = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    return diff > 0 ? Number(diff.toFixed(2)) : 0;
  }, [startTime, endTime]);

  // Server estimated pricing
  const estimatedAmount = useMemo(() => {
    if (!lot || durationHours <= 0) return 0;
    return Number((Number(lot.price_per_hour) * durationHours).toFixed(2));
  }, [lot, durationHours]);

  // Validate time window
  const validateTimeWindow = useCallback(() => {
    if (!startTime || !endTime) {
      return 'Please choose both arrival and departure times.';
    }
    const start = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    if (start <= now) {
      return 'Arrival / Start time must be in the future.';
    }
    if (end <= start) {
      return 'Departure / End time must be after the start time.';
    }
    const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (diffHours < 0.5) {
      return 'Booking duration must be at least 30 minutes.';
    }
    if (diffHours > 24) {
      return 'Booking duration cannot exceed 24 hours.';
    }
    return '';
  }, [startTime, endTime]);

  // Fetch slots for lot with interval availability from Django
  const fetchSlotsAvailability = useCallback(async (startVal, endVal) => {
    if (!id) return;
    setIsRefreshingSlots(true);
    try {
      const params = {};
      if (startVal && endVal) {
        const s = new Date(startVal);
        const e = new Date(endVal);
        if (e > s) {
          params.start_time = s.toISOString();
          params.end_time = e.toISOString();
        }
      }
      const slotsData = await parkingService.getSlotsForLot(id, params);
      setSlots(Array.isArray(slotsData) ? slotsData : []);
    } catch (err) {
      console.error('Failed to refetch slot availability:', err);
    } finally {
      setIsRefreshingSlots(false);
    }
  }, [id]);

  // Initial load of lot, slots, and user vehicles
  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [lotData, userVehicles, myPasses, loyalty] = await Promise.all([
        parkingService.getLotById(id),
        isAuthenticated ? vehicleService.getVehicles().catch(() => []) : Promise.resolve([]),
        isAuthenticated ? membershipLoyaltyService.getMyPasses().catch(() => []) : Promise.resolve([]),
        isAuthenticated ? membershipLoyaltyService.getLoyaltyAccount().catch(() => null) : Promise.resolve(null),
      ]);
      setLot(lotData);
      setVehicles(userVehicles);
      setUserPasses(Array.isArray(myPasses) ? myPasses : (myPasses.results || []));
      setLoyaltyAccount(loyalty);

      if (userVehicles.length > 0) {
        const def = userVehicles.find((v) => v.is_default) || userVehicles[0];
        setVehicleNumber(def.license_plate);
      }

      // Fetch initial slot availability
      const now = new Date();
      now.setMinutes(Math.ceil((now.getMinutes() + 10) / 15) * 15, 0, 0);
      const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      await fetchSlotsAvailability(toDatetimeLocal(now), toDatetimeLocal(twoHoursLater));
    } catch (err) {
      setPageError(err?.response?.data?.message || err?.message || 'Failed to load parking lot details.');
    } finally {
      setLoading(false);
    }
  }, [id, isAuthenticated, fetchSlotsAvailability]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // Live refetch of slot availability when start or end time changes
  useEffect(() => {
    if (!startTime || !endTime || loading) return;

    const validationMsg = validateTimeWindow();
    setTimeValidationError(validationMsg);

    if (!validationMsg) {
      const timer = setTimeout(() => {
        fetchSlotsAvailability(startTime, endTime);
      }, 400); // Debounce to allow user to finish datetime picker input
      return () => clearTimeout(timer);
    }
  }, [startTime, endTime, validateTimeWindow, fetchSlotsAvailability, loading]);

  // Quick duration presets
  const handleSetQuickDuration = (hours) => {
    const start = startTime ? new Date(startTime) : new Date();
    const end = new Date(start.getTime() + hours * 60 * 60 * 1000);
    setEndTime(toDatetimeLocal(end));
  };

  const handleSetTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const endTomorrow = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
    setStartTime(toDatetimeLocal(tomorrow));
    setEndTime(toDatetimeLocal(endTomorrow));
  };

  // Slot Selection handler
  const handleOpenBooking = (slot) => {
    if (!isAuthenticated) {
      showError('Please log in or create an account to reserve a parking slot.');
      navigate('/login', { state: { from: `/lots/${id}` } });
      return;
    }

    // Verify time validation
    const valError = validateTimeWindow();
    if (valError) {
      showError(valError);
      return;
    }

    // Check if slot is in maintenance
    if (slot.status === 'maintenance' || !slot.is_active) {
      showError(`Slot ${slot.slot_number} is currently under maintenance.`);
      return;
    }

    // Check if slot is occupied during the selected window
    if (slot.status === 'occupied') {
      showError(`Slot ${slot.slot_number} is already occupied during your selected time window. Please choose an available bay.`);
      return;
    }

    setSelectedSlot(slot);
    setBookingStep(1);
    setBookingError('');
    setConflictError('');
  };

  // Submit booking (creates pending booking with 10-minute hold in Django)
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setBookingError('');
    setConflictError('');

    // Pre-validation
    const valError = validateTimeWindow();
    if (valError) {
      setBookingError(valError);
      return;
    }

    if (!vehicleNumber.trim()) {
      setBookingError('Please enter or select a vehicle license plate number.');
      return;
    }

    setSubmitting(true);
    try {
      const start = new Date(startTime);
      const end = new Date(endTime);

      const payload = {
        lot_id: lot.id,
        slot_id: selectedSlot.id,
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        pass_id: selectedPassId ? parseInt(selectedPassId, 10) : null,
        redeem_points: parseInt(redeemPoints || 0, 10),
      };

      // Django API is the single source of truth for validation, locking, and pricing
      const booking = await bookingService.createBooking(payload);
      setCreatedBooking(booking);

      if (booking.status === 'confirmed') {
        setBookingStep(3); // Covered by pass or 100% discount, already confirmed!
        showSuccess(`Reservation confirmed! Slot ${selectedSlot.slot_number} reserved.`);
        fetchSlotsAvailability(startTime, endTime);
      } else {
        setBookingStep(2); // proceed to payment hold step
        showSuccess(`Temporary hold confirmed for Slot ${selectedSlot.slot_number}. Complete payment within 10 minutes.`);
      }
    } catch (err) {
      const status = err?.response?.status;
      const errorMsg =
        err?.response?.data?.message ||
        err?.response?.data?.detail ||
        (err?.response?.data && typeof err.response.data === 'object'
          ? Object.values(err.response.data).flat().join(' ')
          : null) ||
        err?.message ||
        'Booking submission failed.';

      // Requirement 10: Handle booking conflicts returned by server and ask user to select another slot
      if (status === 409 || errorMsg.toLowerCase().includes('already booked') || errorMsg.toLowerCase().includes('conflict')) {
        const conflictMsg = `Booking Conflict: Slot ${selectedSlot.slot_number} was just reserved by another driver for this time window. Please select another slot from the updated layout below.`;
        setConflictError(conflictMsg);
        setSelectedSlot(null); // return to layout
        showError(conflictMsg);
        // Live refetch slots from server
        fetchSlotsAvailability(startTime, endTime);
      } else if (status === 401) {
        showError('Your session has expired. Please log in again to continue.');
        navigate('/login', { state: { from: `/lots/${id}` } });
      } else {
        setBookingError(errorMsg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Submit payment confirmation
  const handlePaymentSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setBookingError('');
    try {
      const response = await bookingService.processPayment(createdBooking.booking_id, {
        method: paymentMethod,
      });
      showSuccess('Payment confirmed! Your parking slot is successfully reserved.');
      if (response?.booking) {
        setCreatedBooking(response.booking);
      }
      setBookingStep(3); // success pass
      // Live refetch slot grid to reflect confirmed status
      fetchSlotsAvailability(startTime, endTime);
    } catch (err) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message || err?.message || 'Payment processing failed.';
      if (status === 410) {
        // Hold expired
        setBookingError('Your 10-minute hold has expired and the slot was released. Please select a slot again.');
      } else if (status === 409) {
        setBookingError('Slot conflict detected. Please select an alternate slot.');
      } else {
        setBookingError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Loading state
  if (loading) {
    return <LoadingSpinner message="Loading parking hub layout and live bay status..." />;
  }

  // Error loading page
  if (pageError || !lot) {
    return (
      <div className="card border-0 shadow-sm rounded-4 p-5 text-center my-5 bg-white">
        <AlertCircle size={48} className="text-danger mx-auto mb-3" />
        <h4 className="fw-bold text-dark">Parking Hub Not Found or Unavailable</h4>
        <p className="text-muted small mb-4">{pageError || 'The requested parking location could not be found.'}</p>
        <div className="d-flex justify-content-center gap-2">
          <button onClick={loadInitialData} className="btn btn-outline-primary rounded-3 px-4 text-sm">
            <RotateCw size={14} className="me-1" /> Retry
          </button>
          <Link to="/lots" className="btn btn-primary rounded-3 px-4 text-sm">
            Back to All Parking Hubs
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="lot-detail-page container-fluid px-0">
      {/* Navigation Breadcrumb */}
      <div className="mb-3 d-flex align-items-center justify-content-between">
        <Link
          to="/lots"
          className="text-decoration-none text-muted small d-inline-flex align-items-center gap-1.5 hover-text-dark"
        >
          <ArrowLeft size={16} /> Back to all parking hubs
        </Link>
        <span className="badge bg-slate-100 text-slate-700 border text-xs">
          ID: HUB-{lot.id}
        </span>
      </div>

      {/* Booking Conflict Alert (Requirement 10) */}
      {conflictError && (
        <div className="alert alert-warning shadow-sm rounded-4 p-3 mb-4 d-flex align-items-center gap-3 border-warning" role="alert">
          <AlertTriangle size={24} className="text-warning-emphasis flex-shrink-0" />
          <div className="flex-grow-1">
            <h6 className="fw-bold text-dark mb-0">Slot Conflict Detected</h6>
            <p className="text-xs text-dark mb-0">{conflictError}</p>
          </div>
          <button
            type="button"
            onClick={() => setConflictError('')}
            className="btn btn-sm btn-outline-dark rounded-pill text-xs px-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Lot Overview Banner */}
      <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4 bg-white">
        <div className="row g-0">
          <div className="col-lg-4 position-relative" style={{ minHeight: '220px' }}>
            <img
              src={lot.image_url || 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80'}
              alt={lot.name}
              className="w-100 h-100 object-fit-cover"
            />
            <div className="position-absolute top-0 start-0 m-3">
              <span className="badge bg-primary text-white px-3 py-1.5 rounded-pill fs-6 fw-bold shadow-xs">
                {formatCurrency(lot.price_per_hour)} / hour
              </span>
            </div>
          </div>

          <div className="col-lg-8 p-4 d-flex flex-column justify-content-between">
            <div>
              <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-1">
                <h2 className="fw-bold text-dark tracking-tight mb-0">{lot.name}</h2>
                <span className="badge bg-success-subtle text-success border border-success-subtle px-3 py-1.5 rounded-pill small">
                  ● {lot.available_slots_count || 0} Available Now
                </span>
              </div>
              <p className="text-muted small d-flex align-items-center gap-1.5 mb-2">
                <MapPin size={15} className="text-primary flex-shrink-0" />
                <span>{lot.location}</span>
              </p>
              <p className="text-slate-600 text-sm mb-3">
                {lot.description || 'Modern automated smart parking facility with surveillance, sensor-free interval booking, and automated gate barriers.'}
              </p>
            </div>

            {/* Quick stats badges */}
            <div className="d-flex flex-wrap gap-2 text-xs pt-3 border-top border-light">
              <span className="badge bg-light text-slate-700 border px-2.5 py-1.5">
                Total Bays: {lot.total_slots || 0}
              </span>
              <span className="badge bg-light text-slate-700 border px-2.5 py-1.5">
                Active Bays: {lot.active_slots_count || lot.total_slots || 0}
              </span>
              <span className="badge bg-danger-subtle text-danger px-2.5 py-1.5">
                Occupied Now: {lot.occupied_slots_count || 0}
              </span>
              <span className="badge bg-warning-subtle text-warning-emphasis px-2.5 py-1.5">
                Upcoming Reserved: {lot.future_reserved_slots_count || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Date & Start/End Time Selection Bar (Requirement 3 & 5) */}
      <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
          <div>
            <h5 className="fw-bold tracking-tight text-dark mb-0 d-flex align-items-center gap-2">
              <Calendar size={18} className="text-primary" />
              1. Select Arrival Date & Parking Duration
            </h5>
            <p className="text-muted text-xs mb-0">
              Slots below automatically refresh to show real availability for your exact selected arrival and departure window.
            </p>
          </div>

          {/* Quick presets */}
          <div className="d-flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => handleSetQuickDuration(1)}
              className="btn btn-sm btn-light border text-2xs rounded-pill px-2.5 py-1"
            >
              +1 Hour
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickDuration(2)}
              className="btn btn-sm btn-light border text-2xs rounded-pill px-2.5 py-1"
            >
              +2 Hours
            </button>
            <button
              type="button"
              onClick={() => handleSetQuickDuration(4)}
              className="btn btn-sm btn-light border text-2xs rounded-pill px-2.5 py-1"
            >
              +4 Hours
            </button>
            <button
              type="button"
              onClick={handleSetTomorrow}
              className="btn btn-sm btn-light border text-2xs rounded-pill px-2.5 py-1"
            >
              Tomorrow 10 AM
            </button>
          </div>
        </div>

        <div className="row g-3 align-items-center">
          <div className="col-md-4">
            <label className="form-label text-xs fw-semibold text-dark mb-1" htmlFor="lotStartTime">
              Arrival Date & Start Time *
            </label>
            <input
              id="lotStartTime"
              type="datetime-local"
              className="form-control border-slate-300 text-xs shadow-none"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>

          <div className="col-md-4">
            <label className="form-label text-xs fw-semibold text-dark mb-1" htmlFor="lotEndTime">
              Departure Date & End Time *
            </label>
            <input
              id="lotEndTime"
              type="datetime-local"
              className="form-control border-slate-300 text-xs shadow-none"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              required
            />
          </div>

          <div className="col-md-4">
            <div className="bg-slate-50 border rounded-3 p-2.5 text-center">
              <div className="text-3xs text-muted text-uppercase fw-semibold">Estimated Duration & Rate</div>
              <div className="d-flex justify-content-center align-items-center gap-2 mt-0.5">
                <span className="text-dark fw-bold text-sm">{durationHours} hrs</span>
                <span className="text-muted text-xs">@ {formatCurrency(lot.price_per_hour)}/hr</span>
                <span className="text-primary fw-bold text-sm">= {formatCurrency(estimatedAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {timeValidationError && (
          <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mt-3 mb-0 rounded-3" role="alert">
            <AlertCircle size={15} className="flex-shrink-0" />
            <span>{timeValidationError}</span>
          </div>
        )}
      </div>

      {/* Interactive Slot Grid Section (Requirements 2, 4, 5) */}
      <div className="mb-4">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
          <div>
            <h4 className="fw-bold tracking-tight text-dark mb-0">
              2. Interactive Parking Slot Layout
            </h4>
            <p className="text-muted small mb-0">
              Click any active green bay to review details and confirm reservation. Availability is verified live with Django.
            </p>
          </div>

          <div className="text-2xs text-muted d-flex align-items-center gap-1">
            <Clock size={13} className="text-primary" />
            Live refetch active for: {formatDateTime(startTime)} – {formatDateTime(endTime)}
          </div>
        </div>

        <SlotGrid
          slots={slots}
          onSelectSlot={handleOpenBooking}
          selectedSlot={selectedSlot}
          isRefreshing={isRefreshingSlots}
          onRefresh={() => fetchSlotsAvailability(startTime, endTime)}
        />
      </div>

      {/* Booking Drawer / Modal (Requirements 6, 7, 9, 10) */}
      {selectedSlot && (
        <Modal
          isOpen={!!selectedSlot}
          onClose={() => {
            if (!submitting) setSelectedSlot(null);
          }}
          title={
            bookingStep === 1
              ? `Review & Reserve Slot ${selectedSlot.slot_number}`
              : bookingStep === 2
              ? `Complete Hold Payment: Slot ${selectedSlot.slot_number}`
              : 'Reservation Confirmed!'
          }
          subtitle={
            bookingStep === 1
              ? `${lot.name} · ${selectedSlot.slot_type.toUpperCase()} BAY · Floor: ${selectedSlot.floor || 'Ground'}`
              : bookingStep === 2
              ? 'Temporary 10-minute hold active in Django'
              : `Booking Reference: ${createdBooking?.booking_id}`
          }
        >
          {/* Step 1: Booking Summary & Details */}
          {bookingStep === 1 && (
            <form onSubmit={handleBookingSubmit} noValidate>
              {bookingError && (
                <div className="alert alert-danger py-2.5 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              {/* Requirement 6: Comprehensive Booking Summary */}
              <div className="card bg-slate-50 border p-3 rounded-3 mb-3">
                <h6 className="fw-bold text-dark text-xs text-uppercase tracking-wider mb-2 pb-1 border-bottom">
                  Booking Summary
                </h6>
                <div className="row g-2 text-xs">
                  <div className="col-sm-6">
                    <span className="text-muted d-block text-2xs">Location & Address</span>
                    <strong className="text-dark d-flex align-items-center gap-1 mt-0.5">
                      <MapPin size={12} className="text-primary flex-shrink-0" /> {lot.name}
                    </strong>
                    <span className="text-muted text-3xs d-block ps-3.5">{lot.location}</span>
                  </div>

                  <div className="col-sm-6">
                    <span className="text-muted d-block text-2xs">Assigned Bay</span>
                    <div className="d-flex align-items-center gap-1.5 mt-0.5">
                      <span className="badge bg-primary text-white font-monospace">
                        Slot {selectedSlot.slot_number}
                      </span>
                      <span className="badge bg-light text-dark border text-3xs">
                        {selectedSlot.slot_type.toUpperCase()}
                      </span>
                      <span className="badge bg-light text-dark border text-3xs">
                        {selectedSlot.floor || 'Ground'}
                      </span>
                      {selectedSlot.is_covered !== undefined && (
                        <span className="badge bg-light text-dark border text-3xs">
                          {selectedSlot.is_covered ? 'Covered' : 'Open Air'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-sm-6 mt-2 pt-2 border-top">
                    <span className="text-muted d-block text-2xs">Reserved Time Window</span>
                    <strong className="text-dark d-block">
                      {formatDateTime(startTime)}
                    </strong>
                    <span className="text-muted text-3xs">until {formatDateTime(endTime)}</span>
                  </div>

                  <div className="col-sm-6 mt-2 pt-2 border-top">
                    <span className="text-muted d-block text-2xs">Duration & Pricing</span>
                    <strong className="text-dark d-block">
                      {durationHours} hours @ {formatCurrency(lot.price_per_hour)}/hr
                    </strong>
                    <span className="text-primary fw-bold text-xs">
                      Total: {formatCurrency(estimatedAmount)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Vehicle selection */}
              <div className="mb-3">
                <label className="form-label small fw-semibold text-dark mb-1" htmlFor="bookingPlateInput">
                  Vehicle License Plate Number *
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-slate-300 text-muted">
                    <Car size={16} />
                  </span>
                  <input
                    id="bookingPlateInput"
                    type="text"
                    className="form-control border-slate-300 text-uppercase font-monospace text-sm"
                    placeholder="e.g. TN 07 AB 1234"
                    value={vehicleNumber}
                    onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                    required
                  />
                </div>

                {vehicles.length > 0 && (
                  <div className="d-flex flex-wrap gap-1.5 mt-2">
                    <span className="text-2xs text-muted me-1 align-self-center">Select saved vehicle:</span>
                    {vehicles.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVehicleNumber(v.license_plate)}
                        className={`btn btn-sm text-2xs py-0.5 px-2.5 rounded-pill font-monospace ${
                          vehicleNumber === v.license_plate
                            ? 'btn-primary shadow-xs'
                            : 'btn-light border text-muted'
                        }`}
                      >
                        {v.license_plate} {v.nickname ? `(${v.nickname})` : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Feature 4: Monthly Parking Pass Selection */}
              {userPasses && userPasses.length > 0 && (
                <div className="mb-3 p-2.5 rounded-3 bg-blue-50 border border-blue-200">
                  <div className="d-flex align-items-center gap-1.5 text-xs fw-bold text-slate-900 mb-1">
                    <Ticket size={14} className="text-primary" /> Apply Monthly Parking Pass
                  </div>
                  <select
                    className="form-select form-select-sm"
                    value={selectedPassId}
                    onChange={(e) => setSelectedPassId(e.target.value)}
                  >
                    <option value="">Do not apply monthly pass</option>
                    {userPasses.filter((p) => p.status === 'active' && !p.is_expired).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.pass_code} ({p.vehicle_license_plate}) - {p.pass_type === 'full_coverage' ? '100% Free' : `${p.discount_percent}% Off`}
                      </option>
                    ))}
                  </select>
                  {selectedPassId && (
                    <span className="text-2xs text-success fw-bold mt-1 d-block">
                      &bull; Monthly pass selected! Will apply on reservation.
                    </span>
                  )}
                </div>
              )}

              {/* Feature 4: Loyalty Points Redemption */}
              {loyaltyAccount && loyaltyAccount.points_balance >= 20 && !selectedPassId && (
                <div className="mb-3 p-2.5 rounded-3 bg-amber-50 border border-amber-200">
                  <div className="d-flex justify-content-between align-items-center text-xs mb-1">
                    <span className="fw-bold text-slate-900 d-flex align-items-center gap-1">
                      <Coins size={14} className="text-amber-600" /> Redeem Loyalty Points
                    </span>
                    <span className="text-2xs text-slate-600">Balance: <strong>{loyaltyAccount.points_balance} pts</strong></span>
                  </div>
                  <div className="input-group input-group-sm">
                    <input
                      type="number"
                      min="0"
                      max={loyaltyAccount.points_balance}
                      step="10"
                      className="form-control"
                      placeholder="Points to redeem (e.g. 20, 50)"
                      value={redeemPoints || ''}
                      onChange={(e) => setRedeemPoints(Math.min(loyaltyAccount.points_balance, Math.max(0, parseInt(e.target.value || 0, 10))))}
                    />
                    <span className="input-group-text bg-white text-2xs text-emerald-600 fw-bold">
                      -₹{((redeemPoints || 0) * 0.50).toFixed(2)} Off
                    </span>
                  </div>
                </div>
              )}

              {/* Cancellation Policy Box (Requirement 6) */}
              <div className="alert alert-info py-2 px-3 small rounded-3 mb-4 border-info-subtle bg-info-subtle/30">
                <div className="d-flex align-items-center gap-1.5 fw-semibold text-dark text-xs mb-1">
                  <ShieldCheck size={14} className="text-primary" />
                  Cancellation & Hold Policy
                </div>
                <ul className="text-3xs text-muted mb-0 ps-3">
                  <li><strong>Free Cancellation:</strong> You can cancel anytime before your scheduled arrival time for a full release.</li>
                  <li><strong>10-Minute Payment Hold:</strong> Your slot is held exclusively for 10 minutes to finish checkout.</li>
                  <li><strong>Active Session Rule:</strong> Once the reserved start time arrives or barrier is scanned, booking is active and non-refundable.</li>
                </ul>
              </div>

              {/* Action Buttons */}
              <div className="d-flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  disabled={submitting}
                  className="btn btn-outline-secondary w-50 py-2.5 rounded-3 text-sm"
                >
                  Change Slot
                </button>
                <button
                  type="submit"
                  disabled={submitting || durationHours <= 0}
                  className="btn btn-primary w-50 py-2.5 rounded-3 text-sm fw-medium shadow-xs d-flex align-items-center justify-content-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      Holding Slot in Django...
                    </>
                  ) : (
                    'Proceed to Payment Hold'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Payment Simulation & Hold Countdown */}
          {bookingStep === 2 && (
            <form onSubmit={handlePaymentSubmit}>
              {bookingError && (
                <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
                  <AlertCircle size={16} className="flex-shrink-0" />
                  <span>{bookingError}</span>
                </div>
              )}

              <div className="alert alert-warning py-2.5 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
                <Clock size={20} className="flex-shrink-0 text-warning-emphasis" />
                <div>
                  <strong>Temporary Hold Active in Django:</strong> Slot {createdBooking?.slot_number} is held for you for 10 minutes. Complete payment to confirm your booking.
                </div>
              </div>

              {/* Breakdown summary */}
              <div className="card bg-slate-50 border p-3 rounded-3 mb-3 text-xs">
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Parking Hub</span>
                  <strong className="text-dark">{createdBooking?.lot_name || lot.name}</strong>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Reserved Bay</span>
                  <strong className="text-primary font-monospace">Slot {createdBooking?.slot_number}</strong>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">License Plate</span>
                  <strong className="font-monospace text-dark">{createdBooking?.vehicle_number}</strong>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Arrival Window</span>
                  <span className="text-dark">{formatDateTime(createdBooking?.start_time)}</span>
                </div>
                <div className="d-flex justify-content-between py-1">
                  <span className="text-muted">Amount Due</span>
                  <strong className="text-primary fs-6">{formatCurrency(createdBooking?.amount)}</strong>
                </div>
              </div>

              {/* Payment method selector */}
              <div className="mb-4">
                <label className="form-label small fw-semibold text-dark mb-2">
                  Choose Payment Method
                </label>
                <div className="d-grid gap-2">
                  {[
                    { id: 'upi', label: 'UPI / Instant QR Payment', icon: QrCode },
                    { id: 'card', label: 'Credit / Debit Card', icon: CreditCard },
                    { id: 'netbanking', label: 'Net Banking', icon: ShieldCheck },
                    { id: 'wallet', label: 'Mobile Wallet (Paytm / PhonePe)', icon: Zap },
                  ].map((m) => (
                    <label
                      key={m.id}
                      className={`form-check p-2.5 border rounded-3 d-flex align-items-center gap-2 cursor-pointer transition-all ${
                        paymentMethod === m.id ? 'border-primary bg-primary-subtle bg-opacity-25' : 'bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="paymentMethod"
                        className="form-check-input ms-1 me-2"
                        checked={paymentMethod === m.id}
                        onChange={() => setPaymentMethod(m.id)}
                      />
                      <m.icon size={16} className="text-primary" />
                      <span className="small fw-medium text-dark">{m.label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-muted text-3xs mt-2 mb-0 text-center">
                  * Demo Gateway: Slot is confirmed and stored in the database instantly.
                </p>
              </div>

              <div className="d-flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSlot(null)}
                  disabled={submitting}
                  className="btn btn-outline-secondary w-50 py-2.5 rounded-3 text-sm"
                >
                  Cancel Hold
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-success w-50 py-2.5 rounded-3 text-sm fw-medium shadow-xs d-flex align-items-center justify-content-center gap-2"
                >
                  {submitting ? (
                    <>
                      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Pay {formatCurrency(createdBooking?.amount)} & Confirm
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Step 3: Confirmation Pass (Requirement 7) */}
          {bookingStep === 3 && (
            <div className="text-center py-2">
              <div className="p-3 rounded-circle bg-success-subtle text-success d-inline-block mb-3 shadow-xs">
                <CheckCircle2 size={44} />
              </div>
              <h4 className="fw-bold text-dark mb-1">Reservation Confirmed!</h4>
              <p className="text-muted small mb-4">
                Your parking bay is locked in the system. Use this digital pass at the barrier gate.
              </p>

              {/* QR Pass Box */}
              <div className="card bg-light border p-3 rounded-4 mb-3 text-center">
                <div className="p-3 bg-white rounded-3 d-inline-block shadow-sm mx-auto mb-2 border">
                  <QrCode size={160} className="text-dark mx-auto" />
                </div>
                <div className="font-monospace text-xs text-muted">
                  PASS #{createdBooking?.booking_id?.substring(0, 18)}...
                </div>
              </div>

              {/* Booking Pass Details */}
              <div className="card bg-slate-50 border p-3 text-start text-xs rounded-3 mb-4">
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Parking Hub</span>
                  <strong className="text-dark">{createdBooking?.lot_name || lot.name}</strong>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Assigned Bay</span>
                  <span className="badge bg-primary fs-6 px-2.5 py-1 rounded-2">
                    Slot {createdBooking?.slot_number}
                  </span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Vehicle License Plate</span>
                  <span className="font-monospace text-dark fw-bold">{createdBooking?.vehicle_number}</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Arrival Window</span>
                  <span className="text-dark">{formatDateTime(createdBooking?.start_time)}</span>
                </div>
                <div className="d-flex justify-content-between py-1 border-bottom">
                  <span className="text-muted">Departure Window</span>
                  <span className="text-dark">{formatDateTime(createdBooking?.end_time)}</span>
                </div>
                <div className="d-flex justify-content-between py-1">
                  <span className="text-muted">Total Paid</span>
                  <strong className="text-success fs-6">{formatCurrency(createdBooking?.amount)}</strong>
                </div>
              </div>

              <div className="d-grid gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(null);
                    navigate('/bookings');
                  }}
                  className="btn btn-primary py-2.5 rounded-3 text-sm fw-medium shadow-xs"
                >
                  View in My Bookings
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSlot(null);
                  }}
                  className="btn btn-outline-secondary py-2 rounded-3 text-xs"
                >
                  Close & Back to Layout
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

export default LotDetailPage;
