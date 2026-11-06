import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  CheckCircle,
  LogOut,
  LogIn,
  Search,
  Car,
  Wrench,
  Clock,
  ShieldCheck,
  RefreshCw,
  QrCode,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Layers,
} from 'lucide-react';
import parkingService from '../services/parkingService';
import bookingService from '../services/bookingService';
import { useNotification } from '../context/NotificationContext';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function StaffDashboard() {
  const [lots, setLots] = useState([]);
  const [selectedLotId, setSelectedLotId] = useState(1);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);

  // Operational view tab: 'checkin' | 'checkout' | 'slots'
  const [activeTab, setActiveTab] = useState('checkin');

  // Gate Check-in & Checkout lookup state
  const [lookupQuery, setLookupQuery] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [matchedBooking, setMatchedBooking] = useState(null);
  const [lookupError, setLookupError] = useState('');
  const [gateActionStatus, setGateActionStatus] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    async function init() {
      try {
        const lotList = await parkingService.getLots();
        setLots(lotList);
        if (lotList.length > 0) {
          setSelectedLotId(lotList[0].id);
          const slotsData = await parkingService.getSlotsForLot(lotList[0].id);
          setSlots(slotsData);
        }
      } catch (err) {
        showError('Failed to load staff gate data.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [showError]);

  const handleLotChange = async (lotId) => {
    setSelectedLotId(lotId);
    setLoading(true);
    try {
      const slotsData = await parkingService.getSlotsForLot(lotId);
      setSlots(slotsData);
    } finally {
      setLoading(false);
    }
  };

  // Backend plate & booking verification (NEVER approve solely in browser)
  const handleLookup = async (e) => {
    e?.preventDefault();
    setMatchedBooking(null);
    setLookupError('');
    setGateActionStatus(null);

    const query = lookupQuery.trim().toUpperCase();
    if (!query) {
      setLookupError('Please provide a vehicle license plate or booking ID.');
      return;
    }

    setVerifying(true);
    try {
      // POST /api/staff/verify-plate/
      const data = await bookingService.verifyPlate(query);
      if (data && data.found) {
        setMatchedBooking({
          booking_id: data.booking.booking_id,
          slot: { slot_number: data.slot_number },
          lot_name: data.lot_name,
          vehicle_number: data.booking.vehicle_number,
          status: data.booking.status,
          start_time: data.booking.start_time,
          end_time: data.booking.end_time,
          amount: data.booking.amount,
        });
        showSuccess(`Server verified reservation for vehicle ${data.booking.vehicle_number}`);
      } else {
        setLookupError(`No active or confirmed reservation found for: ${query}`);
      }
    } catch (err) {
      const errorMsg =
        err?.response?.data?.message ||
        `No active or confirmed reservation found for: ${query}. Verification rejected by server.`;
      setLookupError(errorMsg);
    } finally {
      setVerifying(false);
    }
  };

  // Staff-authorized check-in (Entry) and check-out (Exit)
  const handleGateAction = async (action) => {
    if (!matchedBooking?.booking_id) return;

    setActionLoading(true);
    setLookupError('');

    try {
      const res = await bookingService.gateAction(matchedBooking.booking_id, action);

      // Calculate server confirmed duration upon checkout
      let durationDisplay = null;
      if (action === 'out' && matchedBooking.start_time) {
        const start = new Date(matchedBooking.start_time);
        const exitTime = new Date();
        const diffMs = Math.max(0, exitTime - start);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        durationDisplay = `${diffHrs}h ${diffMins}m`;
      }

      setGateActionStatus({
        action,
        message: res.message,
        booking: res.booking,
        duration: durationDisplay,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Update matched booking status from server response
      setMatchedBooking((prev) => ({
        ...prev,
        status: res.booking?.status,
      }));

      showSuccess(
        action === 'in'
          ? 'Check-In Complete: Gate barrier raised for vehicle entry.'
          : 'Check-Out Complete: Gate barrier raised for exit and bay released.'
      );

      // Refresh slot counts
      const slotsData = await parkingService.getSlotsForLot(selectedLotId);
      setSlots(slotsData);
    } catch (err) {
      // Clear duplicate / invalid action handling
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Server rejected the gate action. Verify booking status.';
      setLookupError(`Gate Action Error: ${msg}`);
      showError(msg);
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSlotMaintenance = async (slotId) => {
    const slot = slots.find((s) => s.id === slotId);
    if (!slot) return;
    const newActiveState = slot.status === 'maintenance';

    try {
      await parkingService.updateSlotStatus(slotId, newActiveState);
      setSlots((prev) =>
        prev.map((s) =>
          s.id === slotId
            ? { ...s, status: newActiveState ? 'available' : 'maintenance', is_active: newActiveState }
            : s
        )
      );
      showSuccess(`Slot ${slot.slot_number} status updated successfully.`);
    } catch (err) {
      showError('Failed to update slot status.');
    }
  };

  const currentLot = lots.find((l) => l.id === Number(selectedLotId)) || lots[0] || {};

  if (loading && lots.length === 0) {
    return <LoadingSpinner message="Initializing Staff Station..." />;
  }

  const occupiedSlots = slots.filter((s) => s.status === 'occupied');
  const availableSlots = slots.filter((s) => s.status === 'available');

  return (
    <div className="staff-dashboard container-fluid px-0">
      {/* Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill bg-primary-subtle text-primary text-2xs fw-bold mb-1">
            <Briefcase size={12} /> Gate Operator Console
          </div>
          <h2 className="fw-bold tracking-tight text-dark mb-0">Gate Operations & Live Monitor</h2>
          <p className="text-muted small mb-0">
            Control gate barriers, authorize vehicle entry and exit, and monitor active bays.
          </p>
        </div>

        {/* Lot Selector & Scanner Shortcut */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          <Link
            to="/staff/scan"
            className="btn btn-outline-primary btn-sm rounded-3 px-3 py-1.5 text-xs d-flex align-items-center gap-1.5 shadow-xs"
          >
            <QrCode size={14} /> Launch QR Scanner Page
          </Link>

          <div className="d-flex align-items-center gap-1.5 bg-white p-1 rounded-3 border">
            <label className="text-2xs fw-semibold text-muted text-nowrap ms-1" htmlFor="lotSelect">
              Active Hub:
            </label>
            <select
              id="lotSelect"
              className="form-select form-select-sm border-0 shadow-none text-xs fw-medium text-dark"
              value={selectedLotId}
              onChange={(e) => handleLotChange(Number(e.target.value))}
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lot Status Quick Bar */}
      <div className="row g-3 mb-4">
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span className="text-2xs text-muted text-uppercase fw-semibold">Available Bays</span>
            <h3 className="fw-bold text-success mb-0 mt-1">{availableSlots.length}</h3>
            <span className="text-2xs text-muted">Ready for parking</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span className="text-2xs text-muted text-uppercase fw-semibold">Vehicles Parked</span>
            <h3 className="fw-bold text-danger mb-0 mt-1">{occupiedSlots.length}</h3>
            <span className="text-2xs text-muted">Currently active inside</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span className="text-2xs text-muted text-uppercase fw-semibold">Future Reserved</span>
            <h3 className="fw-bold text-warning mb-0 mt-1">
              {slots.filter((s) => s.status === 'reserved').length}
            </h3>
            <span className="text-2xs text-muted">Awaiting arrival</span>
          </div>
        </div>
        <div className="col-md-3 col-6">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white">
            <span className="text-2xs text-muted text-uppercase fw-semibold">In Maintenance</span>
            <h3 className="fw-bold text-secondary mb-0 mt-1">
              {slots.filter((s) => s.status === 'maintenance').length}
            </h3>
            <span className="text-2xs text-muted">Out of service</span>
          </div>
        </div>
      </div>

      {/* Operation Tabs (Check-in, Checkout, Bay Controls) */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
        <div className="d-flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('checkin');
              setMatchedBooking(null);
              setLookupError('');
              setGateActionStatus(null);
            }}
            className={`btn btn-sm rounded-pill text-xs px-3.5 py-1.5 transition-all d-flex align-items-center gap-1.5 ${
              activeTab === 'checkin' ? 'btn-success text-white shadow-xs' : 'btn-light text-muted'
            }`}
          >
            <LogIn size={14} /> Gate Entry Check-In
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('checkout');
              setMatchedBooking(null);
              setLookupError('');
              setGateActionStatus(null);
            }}
            className={`btn btn-sm rounded-pill text-xs px-3.5 py-1.5 transition-all d-flex align-items-center gap-1.5 ${
              activeTab === 'checkout' ? 'btn-primary text-white shadow-xs' : 'btn-light text-muted'
            }`}
          >
            <LogOut size={14} /> Gate Exit Checkout
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('slots')}
            className={`btn btn-sm rounded-pill text-xs px-3.5 py-1.5 transition-all d-flex align-items-center gap-1.5 ${
              activeTab === 'slots' ? 'btn-dark text-white shadow-xs' : 'btn-light text-muted'
            }`}
          >
            <Layers size={14} /> Bay Maintenance Grid
          </button>
        </div>
      </div>

      {/* Main Tab Views */}
      {activeTab !== 'slots' ? (
        <div className="row g-4 mb-4">
          {/* Left Column: Verification & Plate Lookup */}
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
              <div className="d-flex align-items-center justify-content-between mb-1">
                <h5 className="fw-bold text-dark mb-0">
                  {activeTab === 'checkin' ? 'Vehicle Arrival Verification' : 'Vehicle Departure Checkout'}
                </h5>
                <span className={`badge ${activeTab === 'checkin' ? 'bg-success-subtle text-success' : 'bg-primary-subtle text-primary'} text-2xs`}>
                  {activeTab === 'checkin' ? 'ENTRY GATE' : 'EXIT GATE'}
                </span>
              </div>
              <p className="text-muted small mb-3">
                {activeTab === 'checkin'
                  ? 'Verify license plate or booking ID before raising entry barrier gate.'
                  : 'Verify active vehicle before releasing bay and authorizing gate exit.'}
              </p>

              <form onSubmit={handleLookup} className="mb-3">
                <div className="input-group">
                  <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                    <Search size={16} />
                  </span>
                  <input
                    type="text"
                    className="form-control border-slate-300 font-monospace text-uppercase text-xs"
                    placeholder="Enter License Plate or Booking UUID..."
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value.toUpperCase())}
                  />
                  <button
                    type="submit"
                    disabled={verifying || !lookupQuery.trim()}
                    className="btn btn-primary px-3 text-xs fw-medium d-flex align-items-center gap-1"
                  >
                    {verifying ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        Checking...
                      </>
                    ) : (
                      'Verify With Server'
                    )}
                  </button>
                </div>
              </form>

              {lookupError && (
                <div className="alert alert-danger py-2.5 px-3 rounded-3 small mb-3 d-flex align-items-start gap-2 shadow-xs">
                  <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
                  <div className="text-xs">{lookupError}</div>
                </div>
              )}

              {/* Server-Confirmed Gate Result Notice */}
              {gateActionStatus && (
                <div className="alert alert-success py-2.5 px-3 rounded-3 small mb-3 shadow-xs">
                  <div className="d-flex align-items-center gap-1.5 fw-bold text-success text-xs mb-1">
                    <CheckCircle2 size={16} /> Gate Operation Succeeded ({gateActionStatus.action === 'in' ? 'ENTRY' : 'EXIT'})
                  </div>
                  <div className="text-xs text-dark">{gateActionStatus.message}</div>
                  <div className="d-flex gap-3 text-3xs text-muted mt-1 pt-1 border-top border-success-subtle">
                    <span>Time: <strong>{gateActionStatus.timestamp}</strong></span>
                    <span>Status: <strong className="text-capitalize">{gateActionStatus.booking?.status}</strong></span>
                    {gateActionStatus.duration && (
                      <span>Parked Duration: <strong className="text-primary">{gateActionStatus.duration}</strong></span>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions footer */}
              <div className="mt-auto pt-3 text-3xs text-muted border-top d-flex align-items-center justify-content-between">
                <span>* Server-enforced state machine prevents duplicate check-ins or unauthorized exits.</span>
                <Link to="/staff/scan" className="text-primary text-decoration-none fw-semibold">
                  Scan 2D QR Code &rarr;
                </Link>
              </div>
            </div>
          </div>

          {/* Right Column: Server-Confirmed Booking Actions Card */}
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
              <h5 className="fw-bold text-dark mb-1">Gate Authorization Console</h5>
              <p className="text-muted small mb-3">
                Review server record and trigger physical gate barrier relays.
              </p>

              {matchedBooking ? (
                <div className="card bg-slate-50 border p-3.5 rounded-4 animate-fade-in">
                  <div className="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                    <div>
                      <span className="text-3xs text-muted text-uppercase d-block fw-semibold">
                        Vehicle License
                      </span>
                      <strong className="font-monospace text-dark fs-5">
                        {matchedBooking.vehicle_number}
                      </strong>
                    </div>
                    <div className="text-end">
                      <span className="badge bg-primary fs-6 px-3 py-1 rounded-pill font-monospace">
                        Slot {matchedBooking.slot?.slot_number}
                      </span>
                    </div>
                  </div>

                  <div className="row g-2 text-xs mb-3">
                    <div className="col-6">
                      <div className="p-2 bg-white rounded-3 border">
                        <span className="text-muted text-3xs d-block">Server Status:</span>
                        <strong className={`fs-6 text-capitalize ${
                          matchedBooking.status === 'confirmed' ? 'text-success' :
                          matchedBooking.status === 'active' ? 'text-primary' : 'text-muted'
                        }`}>
                          {matchedBooking.status}
                        </strong>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="p-2 bg-white rounded-3 border">
                        <span className="text-muted text-3xs d-block">Reservation Window:</span>
                        <span className="text-dark fw-medium text-2xs">
                          until {formatDateTime(matchedBooking.end_time)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for Entry */}
                  {activeTab === 'checkin' && (
                    <div>
                      {matchedBooking.status === 'confirmed' ? (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleGateAction('in')}
                          className="btn btn-success w-100 py-2.5 rounded-3 text-xs fw-bold shadow-xs d-flex align-items-center justify-content-center gap-1.5"
                        >
                          {actionLoading ? (
                            'Authorizing...'
                          ) : (
                            <>
                              <LogIn size={16} /> Authorize Check-In (Open Entry Barrier)
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="alert alert-warning py-2 px-3 text-xs mb-0 rounded-3">
                          <AlertTriangle size={14} className="me-1 d-inline" />
                          Vehicle cannot enter. Current server status is <strong>{matchedBooking.status}</strong>. Entry requires <em>confirmed</em> status.
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions for Exit */}
                  {activeTab === 'checkout' && (
                    <div>
                      {matchedBooking.status === 'active' ? (
                        <button
                          type="button"
                          disabled={actionLoading}
                          onClick={() => handleGateAction('out')}
                          className="btn btn-primary w-100 py-2.5 rounded-3 text-xs fw-bold shadow-xs d-flex align-items-center justify-content-center gap-1.5"
                        >
                          {actionLoading ? (
                            'Authorizing...'
                          ) : (
                            <>
                              <LogOut size={16} /> Authorize Check-Out (Open Exit Barrier)
                            </>
                          )}
                        </button>
                      ) : (
                        <div className="alert alert-warning py-2 px-3 text-xs mb-0 rounded-3">
                          <AlertTriangle size={14} className="me-1 d-inline" />
                          Vehicle cannot exit. Current server status is <strong>{matchedBooking.status}</strong>. Checkout requires <em>active</em> (parked) status.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-5 my-auto text-muted">
                  <div className="p-3 bg-slate-50 rounded-circle d-inline-block mb-2 border">
                    <Car size={32} className="text-slate-400" />
                  </div>
                  <h6 className="fw-bold text-dark mb-1">Awaiting Vehicle Query</h6>
                  <p className="text-xs text-muted mb-0">
                    Enter license plate on the left to verify credentials with Django.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Bay Grid & Maintenance View */
        <div className="card border-0 shadow-sm rounded-4 p-4 bg-white mb-4">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h5 className="fw-bold text-dark mb-0">Parking Bay Service Controls</h5>
              <span className="text-muted text-2xs">Take bays out of service for maintenance or repair</span>
            </div>
            <span className="badge bg-light text-slate-700 border text-xs">
              {currentLot.name}
            </span>
          </div>

          <div className="table-responsive">
            <table className="table table-hover align-middle text-sm mb-0">
              <thead className="bg-light">
                <tr className="text-muted text-2xs text-uppercase border-bottom">
                  <th className="ps-3">Slot Number</th>
                  <th>Vehicle Type</th>
                  <th>Floor</th>
                  <th>Covered</th>
                  <th>Status</th>
                  <th className="text-end pe-3">Service Toggle</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((slot) => (
                  <tr key={slot.id}>
                    <td className="ps-3 fw-bold text-dark font-monospace">{slot.slot_number}</td>
                    <td className="text-uppercase text-muted text-xs">{slot.slot_type}</td>
                    <td className="text-xs">{slot.floor}</td>
                    <td className="text-xs">{slot.is_covered ? 'Yes' : 'No'}</td>
                    <td>
                      <StatusBadge type="slot" status={slot.status} />
                    </td>
                    <td className="text-end pe-3">
                      <button
                        onClick={() => toggleSlotMaintenance(slot.id)}
                        className={`btn btn-sm rounded-3 px-3 py-1 text-xs ${
                          slot.status === 'maintenance'
                            ? 'btn-outline-success'
                            : 'btn-outline-secondary'
                        }`}
                      >
                        {slot.status === 'maintenance' ? 'Restore to Active' : 'Mark Maintenance'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default StaffDashboard;
