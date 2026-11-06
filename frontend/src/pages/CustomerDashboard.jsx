import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Car,
  CalendarCheck,
  CreditCard,
  Clock,
  MapPin,
  QrCode,
  ArrowRight,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import bookingService from '../services/bookingService';
import vehicleService from '../services/vehicleService';
import StatsCard from '../components/StatsCard';
import StatusBadge from '../components/StatusBadge';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function CustomerDashboard() {
  const { user } = useAuth();
  const { showSuccess, showError } = useNotification();

  const [bookings, setBookings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPass, setSelectedPass] = useState(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [dashData, userVehicles] = await Promise.all([
          bookingService.getCustomerDashboard(),
          vehicleService.getVehicles(),
        ]);
        if (dashData && dashData.recent_bookings) {
          setBookings(dashData.recent_bookings);
        } else {
          const userBookings = await bookingService.getMyBookings();
          setBookings(userBookings);
        }
        setVehicles(userVehicles);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const activeBooking = bookings.find((b) => b.status === 'active');
  const upcomingBooking = bookings.find((b) => b.status === 'confirmed');
  const spotlightBooking = activeBooking || upcomingBooking;

  const totalSpent = bookings
    .filter((b) => b.status === 'completed' || b.status === 'active' || b.status === 'confirmed')
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  const handleCancel = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await bookingService.cancelBooking(bookingId);
      showSuccess('Booking cancelled successfully.');
      const updated = await bookingService.getMyBookings();
      setBookings(updated);
    } catch (err) {
      showError(err?.message || 'Failed to cancel booking.');
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading customer dashboard..." />;
  }

  return (
    <div className="customer-dashboard">
      {/* Top Welcome Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">
            Welcome back, {user?.name || user?.username}! 👋
          </h2>
          <p className="text-muted small mb-0">
            Real-time status of your parking reservations and vehicle access
          </p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/lots" className="btn btn-primary rounded-3 px-3.5 py-2 text-sm d-flex align-items-center gap-2 shadow-xs">
            <MapPin size={16} /> Book Parking Space
          </Link>
          <Link to="/vehicles" className="btn btn-outline-dark rounded-3 px-3 py-2 text-sm d-flex align-items-center gap-1.5">
            <Car size={16} /> My Vehicles
          </Link>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="row g-3 mb-4">
        <div className="col-sm-6 col-xl-3">
          <StatsCard
            title="Active Parked"
            value={bookings.filter((b) => b.status === 'active').length}
            subtitle="Vehicle currently at lot"
            icon={Car}
            color="primary"
          />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatsCard
            title="Upcoming Bookings"
            value={bookings.filter((b) => b.status === 'confirmed').length}
            subtitle="Future reserved slots"
            icon={CalendarCheck}
            color="success"
          />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatsCard
            title="Saved Vehicles"
            value={vehicles.length}
            subtitle="Cars & bikes registered"
            icon={Clock}
            color="warning"
          />
        </div>
        <div className="col-sm-6 col-xl-3">
          <StatsCard
            title="Total Spend"
            value={formatCurrency(totalSpent)}
            subtitle="All-time confirmed parking"
            icon={CreditCard}
            color="info"
          />
        </div>
      </div>

      {/* Spotlight Active / Upcoming Booking */}
      {spotlightBooking ? (
        <div className="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden bg-navy-light text-white p-4 position-relative">
          <div className="row align-items-center position-relative z-1">
            <div className="col-lg-8">
              <div className="d-flex align-items-center gap-2 mb-2">
                <span className={`badge ${spotlightBooking.status === 'active' ? 'bg-primary' : 'bg-success'} text-white px-2.5 py-1 text-2xs text-uppercase fw-bold`}>
                  {spotlightBooking.status === 'active' ? '● Parked Right Now' : 'Upcoming Confirmed'}
                </span>
                <span className="text-slate-300 text-xs">
                  ID: {spotlightBooking.booking_id}
                </span>
              </div>

              <h3 className="fw-bold text-white mb-1">
                {spotlightBooking.lot_name} — Slot {spotlightBooking.slot_number}
              </h3>
              <p className="text-slate-300 small mb-3">
                Vehicle Plate: <strong className="text-white">{spotlightBooking.vehicle_number}</strong>
              </p>

              <div className="d-flex flex-wrap gap-4 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400 d-block">Entry Window:</span>
                  <strong className="text-white">{formatDateTime(spotlightBooking.start_time)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 d-block">Exit Window:</span>
                  <strong className="text-white">{formatDateTime(spotlightBooking.end_time)}</strong>
                </div>
                <div>
                  <span className="text-slate-400 d-block">Total Paid:</span>
                  <strong className="text-accent-cyan">{formatCurrency(spotlightBooking.amount)}</strong>
                </div>
              </div>
            </div>

            <div className="col-lg-4 mt-3 mt-lg-0 text-lg-end d-flex flex-column gap-2">
              <button
                onClick={() => setSelectedPass(spotlightBooking)}
                className="btn btn-light rounded-3 py-2 text-sm fw-medium shadow-xs d-flex align-items-center justify-content-center gap-2"
              >
                <QrCode size={16} /> Show Gate Entry Pass
              </button>
              {spotlightBooking.status === 'confirmed' && (
                <button
                  onClick={() => handleCancel(spotlightBooking.booking_id)}
                  className="btn btn-outline-danger btn-sm rounded-3 py-1.5 text-xs text-white border-white border-opacity-25 hover-bg-danger"
                >
                  Cancel Reservation
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="card border-0 shadow-sm rounded-4 mb-4 p-4 bg-white border border-slate-200">
          <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
            <div>
              <h5 className="fw-bold text-dark mb-1">No Active Reservations Right Now</h5>
              <p className="text-muted small mb-0">
                Heading out? Find and book your guaranteed parking spot before you depart.
              </p>
            </div>
            <Link to="/lots" className="btn btn-primary rounded-3 px-4 py-2 text-sm shadow-xs d-inline-flex align-items-center gap-1.5 flex-shrink-0">
              Find Available Spots <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* Recent Bookings and Registered Vehicles */}
      <div className="row g-4">
        {/* Recent Bookings Table */}
        <div className="col-lg-8">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold text-dark mb-0">Recent Bookings</h5>
              <Link to="/bookings" className="text-primary text-xs fw-semibold text-decoration-none">
                View All &rarr;
              </Link>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-sm">
                <thead>
                  <tr className="text-muted text-2xs text-uppercase border-bottom border-light">
                    <th>Lot / Slot</th>
                    <th>Vehicle</th>
                    <th>Time Window</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th className="text-end">Pass</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.slice(0, 5).map((b) => (
                    <tr key={b.id || b.booking_id}>
                      <td>
                        <div className="fw-semibold text-dark">{b.lot_name}</div>
                        <span className="badge bg-light text-slate-600 border text-2xs">
                          Slot {b.slot_number}
                        </span>
                      </td>
                      <td>
                        <span className="font-monospace text-xs fw-medium text-slate-700">
                          {b.vehicle_number}
                        </span>
                      </td>
                      <td>
                        <div className="text-xs text-muted">{formatDateTime(b.start_time)}</div>
                      </td>
                      <td>
                        <StatusBadge type="booking" status={b.status} />
                      </td>
                      <td className="fw-semibold text-dark">{formatCurrency(b.amount)}</td>
                      <td className="text-end">
                        <button
                          onClick={() => setSelectedPass(b)}
                          className="btn btn-sm btn-light rounded-circle p-1.5 text-muted hover-dark shadow-xs"
                          title="View Pass"
                        >
                          <QrCode size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-4 text-muted small">
                        No bookings found. <Link to="/lots">Reserve your first slot</Link>!
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Saved Vehicles Quick Column */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="fw-bold text-dark mb-0">Saved Vehicles</h5>
              <Link to="/vehicles" className="text-primary text-xs fw-semibold text-decoration-none">
                Manage &rarr;
              </Link>
            </div>

            <div className="d-grid gap-2 mb-3">
              {vehicles.map((v) => (
                <div key={v.id} className="p-3 rounded-3 bg-light border d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2.5">
                    <div className="p-2 rounded-3 bg-white text-primary shadow-xs">
                      <Car size={18} />
                    </div>
                    <div>
                      <div className="font-monospace fw-bold text-dark text-xs">{v.license_plate}</div>
                      <div className="text-muted text-2xs">{v.nickname}</div>
                    </div>
                  </div>
                  {v.is_default && (
                    <span className="badge bg-primary-subtle text-primary text-2xs">Default</span>
                  )}
                </div>
              ))}
            </div>

            <Link
              to="/vehicles"
              className="btn btn-outline-primary btn-sm rounded-3 w-100 py-2 text-xs d-flex align-items-center justify-content-center gap-1.5 mt-auto"
            >
              <PlusCircle size={15} /> Add New Vehicle
            </Link>
          </div>
        </div>
      </div>

      {/* Gate Pass / QR Code Modal */}
      {selectedPass && (
        <Modal
          isOpen={!!selectedPass}
          onClose={() => setSelectedPass(null)}
          title="Digital Gate Pass"
          subtitle={`Booking: ${selectedPass.booking_id}`}
        >
          <div className="text-center py-3">
            <div className="p-4 bg-light rounded-4 d-inline-block shadow-inner mb-3 border">
              <QrCode size={180} className="text-dark mx-auto" />
            </div>
            <h5 className="fw-bold mb-1">{selectedPass.lot_name}</h5>
            <span className="badge bg-primary fs-6 px-3 py-1.5 rounded-pill mb-3">
              Slot: {selectedPass.slot_number}
            </span>

            <div className="card bg-slate-50 border p-3 text-start text-xs rounded-3 mb-3">
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Vehicle Number</span>
                <strong className="font-monospace text-dark">{selectedPass.vehicle_number}</strong>
              </div>
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Valid From</span>
                <span className="text-dark">{formatDateTime(selectedPass.start_time)}</span>
              </div>
              <div className="d-flex justify-content-between py-1 border-bottom">
                <span className="text-muted">Valid Until</span>
                <span className="text-dark">{formatDateTime(selectedPass.end_time)}</span>
              </div>
              <div className="d-flex justify-content-between py-1">
                <span className="text-muted">Status</span>
                <StatusBadge type="booking" status={selectedPass.status} />
              </div>
            </div>

            <p className="text-muted text-2xs mb-0">
              Present this QR code or license plate at the parking barrier for touchless boom barrier access.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default CustomerDashboard;
