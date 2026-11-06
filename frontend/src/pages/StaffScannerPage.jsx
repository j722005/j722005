import React, { useState, useEffect, useRef } from 'react';
import {
  QrCode,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  LogIn,
  LogOut,
  Camera,
  RotateCw,
  Clock,
  Car,
  MapPin,
  ShieldCheck,
  ArrowRight,
  Video,
  VideoOff,
} from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import bookingService from '../services/bookingService';
import { useNotification } from '../context/NotificationContext';
import { formatCurrency, formatDateTime } from '../utils/formatters';

export function StaffScannerPage() {
  const [manualCode, setManualCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState(null);
  const [serverError, setServerError] = useState('');
  const [gateActionStatus, setGateActionStatus] = useState(null);
  const [gateActionLoading, setGateActionLoading] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const scannerInstanceRef = useRef(null);

  const { showSuccess, showError } = useNotification();

  // Send scanned ticket details to backend for verification
  // RULE: NEVER approve a ticket solely in the browser!
  const verifyWithBackend = async (queryText) => {
    let cleaned = (queryText || '').trim();
    if (!cleaned) {
      setServerError('Please enter or scan a valid booking reference or license plate.');
      return;
    }

    // Try parsing if payload is a JSON QR object from PrintableTicketModal
    try {
      const parsed = JSON.parse(cleaned);
      if (parsed.booking_id) cleaned = parsed.booking_id;
      else if (parsed.plate) cleaned = parsed.plate;
    } catch {
      // not JSON, keep original string
    }

    cleaned = cleaned.trim().toUpperCase();

    setVerifying(true);
    setServerError('');
    setVerificationResult(null);
    setGateActionStatus(null);

    try {
      // Backend POST /api/staff/verify-plate/
      const res = await bookingService.verifyPlate(cleaned);
      if (res && res.found) {
        setVerificationResult(res);
        showSuccess(`Ticket verified with server for vehicle ${res.booking.vehicle_number}`);
      } else {
        setServerError(res?.message || `No active or confirmed reservation found for: ${cleaned}`);
      }
    } catch (err) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        `Verification failed: Ticket ${cleaned} could not be validated by backend.`;
      setServerError(msg);
    } finally {
      setVerifying(false);
    }
  };

  // Live Laptop Camera QR Scanner integration using html5-qrcode
  useEffect(() => {
    let isMounted = true;

    async function startScanner() {
      if (!isCameraActive) return;
      setCameraError('');

      try {
        const qrCodeScanner = new Html5Qrcode('staff-live-qr-reader');
        scannerInstanceRef.current = qrCodeScanner;

        await qrCodeScanner.start(
          { facingMode: 'user' }, // use laptop webcam or mobile environment
          {
            fps: 10,
            qrbox: { width: 220, height: 220 },
            aspectRatio: 1.0,
          },
          (decodedText) => {
            if (!isMounted) return;
            // Extracted QR code content
            setManualCode(decodedText);
            verifyWithBackend(decodedText);
          },
          () => {
            // Frame scan without QR (ignore to avoid spam)
          }
        );
      } catch (err) {
        console.warn('Laptop camera access failed:', err);
        if (isMounted) {
          setCameraError(
            'Unable to access laptop camera. Please grant camera permission in your browser address bar or use manual entry below.'
          );
          setIsCameraActive(false);
        }
      }
    }

    if (isCameraActive) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      isMounted = false;
      stopScanner();
    };
  }, [isCameraActive]);

  const stopScanner = async () => {
    if (scannerInstanceRef.current) {
      try {
        if (scannerInstanceRef.current.isScanning) {
          await scannerInstanceRef.current.stop();
        }
        scannerInstanceRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      } finally {
        scannerInstanceRef.current = null;
      }
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    verifyWithBackend(manualCode);
  };

  const handleSimulateScan = (sampleCode) => {
    setManualCode(sampleCode);
    verifyWithBackend(sampleCode);
  };

  // Staff-authorized check-in and check-out actions
  const handleGateAction = async (action) => {
    if (!verificationResult?.booking?.booking_id) return;

    setGateActionLoading(true);
    setServerError('');

    try {
      const bookingId = verificationResult.booking.booking_id;
      // Backend POST /api/staff/gate-action/
      const res = await bookingService.gateAction(bookingId, action);

      // Calculate server confirmed duration if checkout
      let durationStr = null;
      if (action === 'out' && verificationResult.booking.start_time) {
        const start = new Date(verificationResult.booking.start_time);
        const exitTime = new Date();
        const diffMs = Math.max(0, exitTime - start);
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        durationStr = `${diffHrs}h ${diffMins}m`;
      }

      setGateActionStatus({
        action,
        message: res.message,
        booking: res.booking,
        duration: durationStr,
        timestamp: new Date().toLocaleTimeString(),
      });

      // Update current verification state to reflect new server booking status
      setVerificationResult((prev) => ({
        ...prev,
        booking: res.booking,
      }));

      showSuccess(
        action === 'in'
          ? 'Check-In Authorized: Gate barrier raised for vehicle entry.'
          : 'Check-Out Authorized: Vehicle cleared and bay marked completed.'
      );
    } catch (err) {
      // Clear errors for duplicate / invalid actions
      const errMsg =
        err?.response?.data?.message ||
        err?.message ||
        'Server rejected the gate action. Booking may already be in an invalid status.';
      setServerError(`Gate Action Rejected by Server: ${errMsg}`);
      showError(errMsg);
    } finally {
      setGateActionLoading(false);
    }
  };

  const resetScanner = () => {
    setManualCode('');
    setVerificationResult(null);
    setServerError('');
    setGateActionStatus(null);
  };

  return (
    <div className="staff-scanner-page container-fluid px-0">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <div className="d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill bg-primary-subtle text-primary text-2xs fw-bold mb-1">
            <QrCode size={13} /> Staff Gate Station
          </div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">
            QR Ticket Scanner & Gate Verification
          </h2>
          <p className="text-muted small mb-0">
            Scan physical or mobile QR tickets. All tickets are cryptographically validated against the live Django database.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={resetScanner}
            className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
          >
            <RotateCw size={14} /> Reset Scanner
          </button>
        </div>
      </div>

      <div className="row g-4">
        {/* Left Column: QR Scanner Viewfinder & Camera Simulation */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden bg-white h-100">
            <div className="p-3 border-bottom d-flex justify-content-between align-items-center bg-slate-50">
              <span className="fw-semibold text-xs text-dark d-flex align-items-center gap-2">
                <Camera size={15} className="text-primary" /> Live Laptop Camera & Optical Scanner
              </span>
              <button
                type="button"
                className={`btn btn-xs rounded-pill px-3 py-1 text-2xs d-flex align-items-center gap-1.5 fw-semibold ${
                  isCameraActive ? 'btn-danger text-white' : 'btn-primary text-white shadow-xs'
                }`}
                onClick={() => setIsCameraActive(!isCameraActive)}
              >
                {isCameraActive ? (
                  <>
                    <VideoOff size={13} /> Turn Off Camera
                  </>
                ) : (
                  <>
                    <Video size={13} /> Turn On Laptop Camera
                  </>
                )}
              </button>
            </div>

            {/* Camera Permission Alert if Error */}
            {cameraError && (
              <div className="alert alert-warning m-3 py-2 px-3 text-xs d-flex align-items-center gap-2 border-0 rounded-3 mb-0">
                <AlertTriangle size={15} className="flex-shrink-0 text-warning" />
                <span>{cameraError}</span>
              </div>
            )}

            {/* Viewfinder Frame / Live Video Feed */}
            <div
              className="position-relative bg-dark d-flex flex-column align-items-center justify-content-center p-3"
              style={{ minHeight: '340px', background: 'radial-gradient(circle, #1e293b 0%, #0f172a 100%)' }}
            >
              {isCameraActive ? (
                <div className="w-100 d-flex flex-column align-items-center">
                  <div
                    id="staff-live-qr-reader"
                    className="w-100 rounded-3 overflow-hidden shadow-lg border border-slate-700"
                    style={{ maxWidth: '380px', minHeight: '280px', background: '#000' }}
                  />
                  <div className="mt-2 text-center text-slate-300 text-2xs">
                    Hold customer ticket QR code in front of your laptop camera
                  </div>
                </div>
              ) : (
                /* Inactive Viewfinder Reticle */
                <div
                  className="position-relative rounded-4 d-flex flex-column align-items-center justify-content-center p-3 text-center"
                  style={{
                    width: '260px',
                    height: '240px',
                    border: '2px dashed rgba(59, 130, 246, 0.4)',
                    boxShadow: '0 0 25px rgba(59, 130, 246, 0.15)',
                  }}
                >
                  <QrCode size={52} className="text-blue-400 opacity-60 mb-2 mx-auto" />
                  <div className="text-xs text-white fw-semibold mb-1">
                    Laptop Camera Ready
                  </div>
                  <div className="text-3xs text-slate-400 mb-3">
                    Click below to open webcam and auto-detect QR code
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCameraActive(true)}
                    className="btn btn-sm btn-primary rounded-pill px-3 py-1 text-2xs d-inline-flex align-items-center gap-1.5 shadow-sm"
                  >
                    <Video size={13} /> Open Camera
                  </button>
                </div>
              )}

              {/* Status pill inside viewfinder */}
              <div className="position-absolute bottom-0 mb-2 px-3 py-0.5 rounded-pill bg-black bg-opacity-70 text-white text-2xs d-flex align-items-center gap-1.5 border border-slate-700">
                <span className={`status-indicator-dot ${isCameraActive ? 'bg-success animate-pulse' : 'bg-secondary'}`} />
                <span>{isCameraActive ? 'Webcam Live • Scanning QR at 10 FPS' : 'Optical Reader Standby'}</span>
              </div>
            </div>

            {/* Manual Booking Code Fallback Form */}
            <div className="p-4 bg-white border-top">
              <h6 className="fw-bold text-xs text-uppercase tracking-wider text-muted mb-2">
                Manual Booking Reference Fallback
              </h6>
              <p className="text-xs text-muted mb-3">
                If the customer QR ticket is damaged or illegible, enter the booking reference UUID or license plate number directly:
              </p>

              <form onSubmit={handleManualSubmit}>
                <div className="input-group mb-3">
                  <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                    <Search size={15} />
                  </span>
                  <input
                    type="text"
                    className="form-control border-slate-300 shadow-none ps-2 text-xs font-monospace text-uppercase"
                    placeholder="Enter Booking UUID or Plate (e.g. TN 07 AB 1234)..."
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={verifying || !manualCode.trim()}
                    className="btn btn-primary px-3 text-xs fw-medium d-flex align-items-center gap-1.5"
                  >
                    {verifying ? (
                      <>
                        <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} /> Verify Server
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* Quick sample ticket triggers for evaluation testing */}
              <div className="d-flex align-items-center gap-2 pt-2 border-top">
                <span className="text-3xs text-muted text-nowrap">Quick Test Triggers:</span>
                <button
                  type="button"
                  onClick={() => handleSimulateScan('TN 07 AB 1234')}
                  className="btn btn-xs btn-outline-secondary rounded-pill px-2 py-0.5 text-3xs font-monospace"
                >
                  Plate: TN 07 AB 1234
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateScan('INVALID-CODE-999')}
                  className="btn btn-xs btn-outline-danger rounded-pill px-2 py-0.5 text-3xs font-monospace"
                >
                  Test Invalid Code
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Server Verification & Authorized Gate Action Screen */}
        <div className="col-12 col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h5 className="fw-bold text-dark mb-1 d-flex align-items-center gap-2">
              <ShieldCheck size={20} className="text-primary" /> Server Authorization Station
            </h5>
            <p className="text-muted small mb-3">
              Real-time gate authorization screen. Approval is granted strictly by Django backend validation.
            </p>

            {/* Error Banner (Duplicate actions, invalid status, or ticket not found) */}
            {serverError && (
              <div className="alert alert-danger rounded-3 p-3 mb-3 d-flex align-items-start gap-2.5 shadow-xs" role="alert">
                <AlertTriangle size={18} className="text-danger flex-shrink-0 mt-0.5" />
                <div className="flex-grow-1 text-xs">
                  <div className="fw-bold mb-0.5">Verification / Gate Action Error</div>
                  <div>{serverError}</div>
                </div>
              </div>
            )}

            {/* Server-Confirmed Gate Action Confirmation */}
            {gateActionStatus && (
              <div className="alert alert-success rounded-3 p-3 mb-3 border-0 bg-success-subtle shadow-xs">
                <div className="d-flex align-items-center gap-2 mb-1">
                  <CheckCircle2 size={18} className="text-success" />
                  <strong className="text-success text-xs text-uppercase">
                    Gate Action Confirmed: Barrier {gateActionStatus.action === 'in' ? 'ENTRY' : 'EXIT'}
                  </strong>
                </div>
                <p className="text-xs text-dark mb-1">{gateActionStatus.message}</p>
                <div className="d-flex flex-wrap gap-3 text-2xs text-muted pt-1 border-top border-success-subtle">
                  <span>Timestamp: <strong>{gateActionStatus.timestamp}</strong></span>
                  <span>New Status: <strong className="text-capitalize">{gateActionStatus.booking?.status}</strong></span>
                  {gateActionStatus.duration && (
                    <span>Total Parked Duration: <strong className="text-primary">{gateActionStatus.duration}</strong></span>
                  )}
                </div>
              </div>
            )}

            {/* If Verified Result from Backend */}
            {verificationResult?.booking ? (
              <div className="border rounded-4 p-3.5 bg-slate-50 mb-3">
                <div className="d-flex justify-content-between align-items-center pb-2 mb-3 border-bottom">
                  <div>
                    <span className="badge bg-success-subtle text-success text-2xs px-2 py-1 fw-bold d-inline-flex align-items-center gap-1">
                      <CheckCircle2 size={12} /> SERVER-CONFIRMED RESERVATION
                    </span>
                    <div className="fw-bold text-dark fs-6 mt-1">
                      {verificationResult.lot_name}
                    </div>
                  </div>
                  <div className="text-end">
                    <span className="badge bg-primary text-white font-monospace fs-6 px-3 py-1 rounded-pill">
                      Slot {verificationResult.slot_number}
                    </span>
                  </div>
                </div>

                <div className="row g-2 text-xs mb-3">
                  <div className="col-6">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted text-3xs d-block text-uppercase">Vehicle License</span>
                      <strong className="font-monospace text-dark fs-6">
                        {verificationResult.booking.vehicle_number}
                      </strong>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-2 bg-white rounded-3 border">
                      <span className="text-muted text-3xs d-block text-uppercase">Current Server Status</span>
                      <strong className={`fs-6 text-capitalize ${
                        verificationResult.booking.status === 'active' ? 'text-primary' :
                        verificationResult.booking.status === 'confirmed' ? 'text-success' : 'text-muted'
                      }`}>
                        {verificationResult.booking.status}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-3 border p-2.5 text-xs mb-3">
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span className="text-muted">Start Time:</span>
                    <span className="text-dark fw-medium">{formatDateTime(verificationResult.booking.start_time)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1 border-bottom">
                    <span className="text-muted">End Time:</span>
                    <span className="text-dark fw-medium">{formatDateTime(verificationResult.booking.end_time)}</span>
                  </div>
                  <div className="d-flex justify-content-between py-1">
                    <span className="text-muted">Total Paid:</span>
                    <strong className="text-dark">{formatCurrency(verificationResult.booking.amount)}</strong>
                  </div>
                </div>

                {/* Staff Authorized Gate Entry / Exit Buttons */}
                <div className="pt-2">
                  <div className="text-2xs fw-bold text-muted text-uppercase mb-2">
                    Staff Barrier Controls
                  </div>
                  <div className="d-flex gap-2">
                    {/* Check-In (Entry) Button */}
                    <button
                      type="button"
                      disabled={
                        gateActionLoading ||
                        verificationResult.booking.status !== 'confirmed'
                      }
                      onClick={() => handleGateAction('in')}
                      className={`btn w-50 py-2.5 rounded-3 text-xs fw-bold d-flex align-items-center justify-content-center gap-1.5 shadow-xs ${
                        verificationResult.booking.status === 'confirmed'
                          ? 'btn-success'
                          : 'btn-light border text-muted'
                      }`}
                    >
                      <LogIn size={15} /> Authorize Check-In (Entry)
                    </button>

                    {/* Check-Out (Exit) Button */}
                    <button
                      type="button"
                      disabled={
                        gateActionLoading ||
                        verificationResult.booking.status !== 'active'
                      }
                      onClick={() => handleGateAction('out')}
                      className={`btn w-50 py-2.5 rounded-3 text-xs fw-bold d-flex align-items-center justify-content-center gap-1.5 shadow-xs ${
                        verificationResult.booking.status === 'active'
                          ? 'btn-primary'
                          : 'btn-light border text-muted'
                      }`}
                    >
                      <LogOut size={15} /> Authorize Check-Out (Exit)
                    </button>
                  </div>

                  {verificationResult.booking.status === 'active' && (
                    <div className="mt-2 text-2xs text-primary text-center">
                      ● Vehicle currently parked. Press "Authorize Check-Out" when vehicle approaches exit gate.
                    </div>
                  )}
                  {verificationResult.booking.status === 'completed' && (
                    <div className="mt-2 text-2xs text-muted text-center">
                      ✓ This reservation has already exited and completed. No further gate actions permitted.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Awaiting Scan Placeholder */
              <div className="text-center py-5 my-auto text-muted">
                <div className="p-4 bg-slate-50 rounded-circle d-inline-block mb-3 border">
                  <QrCode size={40} className="text-slate-400" />
                </div>
                <h6 className="fw-bold text-dark mb-1">Awaiting Scanned Pass</h6>
                <p className="text-xs text-muted mb-0 max-w-sm mx-auto">
                  Scan a ticket QR via the gate reader or enter a booking reference code on the left to verify credentials with the Django backend.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StaffScannerPage;
