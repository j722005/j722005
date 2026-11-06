import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Search,
  MapPin,
  Clock,
  Calendar,
  Car,
  Bike,
  Zap,
  SlidersHorizontal,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Info,
  RotateCw,
  Compass,
  Navigation,
  ShieldCheck,
  Award,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import parkingService from '../services/parkingService';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatCurrency } from '../utils/formatters';

export function RecommendationsPage() {
  const navigate = useNavigate();

  // Search & Filter State
  const [destination, setDestination] = useState('');
  const [vehicleType, setVehicleType] = useState('car');
  const [date, setDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [startTime, setStartTime] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() + 15);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [endTime, setEndTime] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 2, d.getMinutes() + 15);
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const [durationHours, setDurationHours] = useState(2);
  const [priceMax, setPriceMax] = useState('');
  const [preference, setPreference] = useState('balanced'); // 'balanced' | 'cheapest' | 'availability' | 'distance'

  // Geolocation State
  const [userCoords, setUserCoords] = useState(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [geoError, setGeoError] = useState('');

  // Results & UI State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [validationError, setValidationError] = useState('');
  const [expandedScoreId, setExpandedScoreId] = useState(null);

  // Quick Destination Presets
  const quickDestinations = ['Anna Nagar', 'OMR Road', 'Egmore', 'Central'];

  // Handle GPS Geolocation
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeoLocating(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lng: parseFloat(pos.coords.longitude.toFixed(6)),
        });
        setGeoLocating(false);
      },
      (err) => {
        setGeoError('Location permission denied or unavailable. Distance scoring will be omitted.');
        setUserCoords(null);
        setGeoLocating(false);
      },
      { timeout: 8000 }
    );
  };

  // Update End Time based on duration
  const handleDurationPreset = (hrs) => {
    setDurationHours(hrs);
    try {
      const [h, m] = startTime.split(':').map(Number);
      const startD = new Date();
      startD.setHours(h, m, 0, 0);
      const endD = new Date(startD.getTime() + hrs * 60 * 60 * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      setEndTime(`${pad(endD.getHours())}:${pad(endD.getMinutes())}`);
    } catch {
      // fallback
    }
  };

  // Build ISO timestamps and fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    setValidationError('');
    setError(null);

    // Validate times
    if (!date || !startTime || !endTime) {
      setValidationError('Please specify date, start time, and end time.');
      return;
    }

    const startIso = `${date}T${startTime}:00`;
    const endIso = `${date}T${endTime}:00`;
    const startDate = new Date(startIso);
    const endDate = new Date(endIso);
    const now = new Date();

    if (endDate <= startDate) {
      setValidationError('End time must be after start time.');
      return;
    }

    const diffHours = (endDate - startDate) / (1000 * 60 * 60);
    if (diffHours < 0.5) {
      setValidationError('Minimum required parking duration is 30 minutes (0.5 hr).');
      return;
    }
    if (diffHours > 24) {
      setValidationError('Maximum booking duration cannot exceed 24 hours.');
      return;
    }

    setLoading(true);
    try {
      const params = {
        destination: destination.trim(),
        vehicle_type: vehicleType,
        date,
        start_time: startTime,
        end_time: endTime,
        duration_hours: diffHours.toFixed(2),
        preference,
      };

      if (priceMax) params.price_max = priceMax;
      if (userCoords) {
        params.user_lat = userCoords.lat;
        params.user_lng = userCoords.lng;
      }

      const res = await parkingService.getRecommendations(params);
      setData(res);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to retrieve parking recommendations.');
    } finally {
      setLoading(false);
    }
  }, [destination, vehicleType, date, startTime, endTime, preference, priceMax, userCoords]);

  // Initial load on page mount
  useEffect(() => {
    fetchRecommendations();
  }, [fetchRecommendations]);

  const handleSubmit = (e) => {
    e.preventDefault();
    fetchRecommendations();
  };

  return (
    <div className="recommendations-page pb-5">
      {/* Header Banner */}
      <div className="card border-0 rounded-4 p-4 p-md-5 mb-4 text-white position-relative overflow-hidden bg-navy-hero shadow-sm">
        <div className="row align-items-center position-relative z-1">
          <div className="col-lg-8">
            <div className="d-inline-flex align-items-center gap-2 px-3 py-1.5 rounded-pill bg-white bg-opacity-10 text-white text-xs mb-3 border border-white border-opacity-15">
              <Sparkles size={14} className="text-warning animate-pulse" />
              <span>Sensor-Free AI Parking Recommender</span>
            </div>
            <h2 className="display-6 fw-bold tracking-tight mb-2">
              Smart Parking Recommendation Engine
            </h2>
            <p className="lead text-slate-300 fs-6 mb-3 max-w-xl">
              Transparent, multi-criteria scoring algorithm based strictly on live slot availability, real pricing, and verified GPS distance. Never guesses availability.
            </p>
          </div>
          <div className="col-lg-4 text-lg-end mt-3 mt-lg-0">
            <Link to="/lots" className="btn btn-outline-light rounded-3 px-3 py-2 text-sm shadow-xs">
              View All Lots Grid
            </Link>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Search Form & Filter on Left/Top, Recommendations on Right */}
      <div className="row g-4">
        {/* Left Filter & Search Form */}
        <div className="col-lg-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 sticky-top" style={{ top: '90px' }}>
            <h5 className="fw-bold text-dark mb-3 d-flex align-items-center gap-2">
              <SlidersHorizontal size={18} className="text-primary" />
              <span>Search & Preferences</span>
            </h5>

            <form onSubmit={handleSubmit}>
              {/* Destination Query */}
              <div className="mb-3">
                <label className="form-label text-xs fw-semibold text-slate-700" htmlFor="rec-destination">
                  Destination / Area
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-slate-300 text-muted">
                    <MapPin size={16} />
                  </span>
                  <input
                    id="rec-destination"
                    type="text"
                    className="form-control border-slate-300 text-sm"
                    placeholder="e.g. Anna Nagar, OMR, Egmore..."
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                  {destination && (
                    <button
                      type="button"
                      onClick={() => setDestination('')}
                      className="btn btn-light border border-slate-300 text-muted px-2"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Quick Presets */}
                <div className="d-flex flex-wrap gap-1.5 mt-2">
                  <span className="text-3xs text-muted fw-medium d-flex align-items-center me-1">Quick:</span>
                  {quickDestinations.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setDestination(loc)}
                      className={`btn btn-xs rounded-pill py-0.5 px-2 ${
                        destination.toLowerCase() === loc.toLowerCase()
                          ? 'btn-primary text-white'
                          : 'btn-outline-secondary border-slate-200 text-slate-600 bg-white'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Geolocation Button */}
              <div className="mb-3 p-2.5 rounded-3 bg-slate-50 border border-slate-200">
                <div className="d-flex justify-content-between align-items-center">
                  <div className="d-flex align-items-center gap-2">
                    <Navigation size={14} className={userCoords ? 'text-success' : 'text-slate-400'} />
                    <span className="text-xs fw-medium text-slate-700">
                      {userCoords ? 'Location Active' : 'Enable Distance Scoring'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleDetectLocation}
                    disabled={geoLocating}
                    className="btn btn-xs btn-outline-primary rounded-pill px-2.5 py-1"
                  >
                    {geoLocating ? (
                      <span className="spinner-border spinner-border-sm" role="status" />
                    ) : userCoords ? (
                      'Update GPS'
                    ) : (
                      'Use My GPS'
                    )}
                  </button>
                </div>
                {userCoords && (
                  <p className="text-3xs text-success mb-0 mt-1">
                    ✓ Coordinates: {userCoords.lat}, {userCoords.lng}
                  </p>
                )}
                {geoError && (
                  <p className="text-3xs text-danger mb-0 mt-1">{geoError}</p>
                )}
              </div>

              {/* Vehicle Type */}
              <div className="mb-3">
                <label className="form-label text-xs fw-semibold text-slate-700">Vehicle Type</label>
                <div className="d-flex gap-2">
                  {[
                    { id: 'car', label: 'Car', icon: Car },
                    { id: 'bike', label: 'Bike', icon: Bike },
                    { id: 'ev', label: 'EV Bay', icon: Zap },
                  ].map((v) => {
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVehicleType(v.id)}
                        className={`btn flex-fill py-1.5 px-2 rounded-2 text-xs fw-semibold d-flex align-items-center justify-content-center gap-1.5 ${
                          vehicleType === v.id
                            ? 'btn-primary shadow-xs'
                            : 'btn-outline-secondary border-slate-200 bg-white text-slate-600'
                        }`}
                      >
                        <VIcon size={14} /> {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Date & Time Window */}
              <div className="mb-3">
                <label className="form-label text-xs fw-semibold text-slate-700" htmlFor="rec-date">
                  Parking Date
                </label>
                <div className="input-group">
                  <span className="input-group-text bg-light border-slate-300 text-muted">
                    <Calendar size={16} />
                  </span>
                  <input
                    id="rec-date"
                    type="date"
                    className="form-control border-slate-300 text-sm"
                    value={date}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="row g-2 mb-3">
                <div className="col-6">
                  <label className="form-label text-xs fw-semibold text-slate-700" htmlFor="rec-start">
                    Start Time
                  </label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-slate-300 text-muted p-2">
                      <Clock size={14} />
                    </span>
                    <input
                      id="rec-start"
                      type="time"
                      className="form-control border-slate-300 text-sm px-2"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="col-6">
                  <label className="form-label text-xs fw-semibold text-slate-700" htmlFor="rec-end">
                    End Time
                  </label>
                  <div className="input-group">
                    <span className="input-group-text bg-light border-slate-300 text-muted p-2">
                      <Clock size={14} />
                    </span>
                    <input
                      id="rec-end"
                      type="time"
                      className="form-control border-slate-300 text-sm px-2"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Quick Duration Pills */}
              <div className="mb-3">
                <span className="text-3xs text-muted fw-medium d-block mb-1.5">Quick Duration:</span>
                <div className="d-flex gap-1.5">
                  {[1, 2, 3, 4].map((hrs) => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => handleDurationPreset(hrs)}
                      className={`btn btn-xs flex-fill py-1 rounded-2 ${
                        durationHours === hrs
                          ? 'btn-dark text-white'
                          : 'btn-outline-secondary border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {hrs} hr{hrs > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Filter */}
              <div className="mb-3">
                <label className="form-label text-xs fw-semibold text-slate-700" htmlFor="rec-max-price">
                  Max Hourly Price (₹/hr)
                </label>
                <input
                  id="rec-max-price"
                  type="number"
                  min="0"
                  step="5"
                  className="form-control border-slate-300 text-sm"
                  placeholder="e.g. 30 (Leave blank for all)"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                />
              </div>

              {/* User Preference Weights */}
              <div className="mb-4">
                <label className="form-label text-xs fw-semibold text-slate-700">Ranking Priority</label>
                <div className="d-grid gap-1.5">
                  {[
                    { id: 'balanced', label: '⚖️ Balanced (Recommended)', desc: 'Optimizes availability, price & distance' },
                    { id: 'cheapest', label: '💰 Lowest Cost First', desc: 'Prioritizes lowest total booking price' },
                    { id: 'availability', label: '🟢 Maximum Free Slots', desc: 'Prioritizes lots with highest bay availability' },
                    { id: 'distance', label: '📍 Closest Proximity', desc: 'Prioritizes minimum distance to destination' },
                  ].map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setPreference(p.id)}
                      className={`p-2 rounded-3 border cursor-pointer transition-all ${
                        preference === p.id
                          ? 'border-primary bg-primary-subtle text-primary'
                          : 'border-slate-200 bg-white hover-bg-slate-50 text-slate-700'
                      }`}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className="text-xs fw-bold">{p.label}</div>
                      <div className="text-3xs text-muted">{p.desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary w-100 py-2.5 rounded-3 fw-medium d-flex align-items-center justify-content-center gap-2 shadow-sm"
              >
                {loading ? (
                  <span className="spinner-border spinner-border-sm" role="status" />
                ) : (
                  <>
                    <Sparkles size={16} /> Calculate Recommendations
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Recommendation Results */}
        <div className="col-lg-8">
          {/* Validation Error Banner */}
          {validationError && (
            <div className="alert alert-warning py-3 px-4 rounded-4 d-flex align-items-center gap-3 mb-4 shadow-xs" role="alert">
              <AlertCircle size={20} className="text-warning flex-shrink-0" />
              <div>
                <strong className="d-block text-dark">Time Validation Required</strong>
                <span className="text-xs text-slate-600">{validationError}</span>
              </div>
            </div>
          )}

          {/* API Error Banner */}
          {error && (
            <div className="alert alert-danger py-3 px-4 rounded-4 d-flex align-items-center justify-content-between mb-4 shadow-xs" role="alert">
              <div className="d-flex align-items-center gap-3">
                <AlertCircle size={20} className="text-danger flex-shrink-0" />
                <div>
                  <strong className="d-block text-dark">Recommendation Calculation Error</strong>
                  <span className="text-xs text-slate-600">{error}</span>
                </div>
              </div>
              <button onClick={fetchRecommendations} className="btn btn-sm btn-outline-danger rounded-pill px-3">
                Retry
              </button>
            </div>
          )}

          {/* Distance Limitation Notice (Req 6) */}
          {data?.distance_limitation_notice && !loading && (
            <div className="alert alert-info py-2.5 px-3 rounded-3 d-flex align-items-center gap-2 mb-4 border-info-subtle bg-info-subtle text-info-emphasis text-xs shadow-xs">
              <Info size={16} className="flex-shrink-0" />
              <span>{data.distance_limitation_notice}</span>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="card border-0 shadow-sm rounded-4 p-5 text-center my-3">
              <div className="spinner-grow text-primary mx-auto mb-3" role="status" />
              <h5 className="fw-bold text-dark mb-1">Evaluating Optimal Parking Locations</h5>
              <p className="text-muted small mb-0">
                Intersecting live booking intervals, calculating exact bay counts, and scoring transparently...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!loading && data && data.recommendations.length === 0 && (
            <EmptyState
              icon={MapPin}
              title="No Matching Parking Lots Found"
              description={`We couldn't find active parking lots matching "${destination || 'your search criteria'}". Try adjusting the destination keyword or expanding the price range.`}
              actionText="Reset Search"
              onAction={() => {
                setDestination('');
                setPriceMax('');
                setVehicleType('car');
              }}
            />
          )}

          {/* Recommendations List */}
          {!loading && data && data.recommendations.length > 0 && (
            <div>
              {/* Results Summary Bar */}
              <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 px-1">
                <div>
                  <h6 className="fw-bold text-dark mb-0">
                    Recommended Locations ({data.total_matching_lots})
                  </h6>
                  <span className="text-xs text-muted">
                    Ranked by multi-factor score for {data.search_params.duration_hours} hr window ({vehicleType.toUpperCase()})
                  </span>
                </div>

                <div className="d-flex align-items-center gap-2 mt-2 mt-sm-0">
                  <span className="badge bg-slate-100 text-slate-700 border border-slate-200 text-2xs px-2.5 py-1 rounded-pill">
                    Priority: <strong className="text-capitalize">{preference}</strong>
                  </span>
                  {data.distance_scoring_enabled && (
                    <span className="badge bg-success-subtle text-success text-2xs px-2.5 py-1 rounded-pill">
                      GPS Distance Active
                    </span>
                  )}
                </div>
              </div>

              {/* List of Recommendation Cards */}
              <div className="d-flex flex-column gap-3.5">
                {data.recommendations.map((rec, index) => {
                  const isTopPick = index === 0;
                  const isExpanded = expandedScoreId === rec.lot_id;
                  const recSlot = rec.recommended_slot;

                  return (
                    <div
                      key={rec.lot_id}
                      className={`card border-0 rounded-4 shadow-sm transition-all overflow-hidden ${
                        isTopPick ? 'ring-2 border-primary border-opacity-50' : ''
                      }`}
                      style={{
                        border: isTopPick ? '2px solid #0d6efd' : '1px solid #e2e8f0',
                      }}
                    >
                      {/* Top Pick Ribbon */}
                      {isTopPick && (
                        <div className="bg-primary text-white py-1 px-3 text-xs fw-semibold d-flex align-items-center justify-content-between">
                          <span className="d-flex align-items-center gap-1.5">
                            <Award size={14} /> #1 TOP RECOMMENDED PARKING CHOICE
                          </span>
                          <span className="badge bg-white bg-opacity-25 text-white text-3xs">
                            Score: {rec.total_score}/100
                          </span>
                        </div>
                      )}

                      <div className="p-4">
                        <div className="row align-items-start g-3">
                          {/* Lot Title & Location */}
                          <div className="col-md-7">
                            <div className="d-flex align-items-center gap-2 mb-1">
                              <h5 className="fw-bold text-dark mb-0">{rec.lot_name}</h5>
                              {!isTopPick && (
                                <span className="badge bg-slate-100 text-slate-600 border text-3xs">
                                  Rank #{index + 1}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-500 text-xs d-flex align-items-center gap-1.5 mb-2">
                              <MapPin size={14} className="text-primary flex-shrink-0" />
                              <span>{rec.location}</span>
                              {rec.distance_km !== null && (
                                <strong className="text-dark ms-1">({rec.distance_km} km away)</strong>
                              )}
                            </p>

                            {/* Key Stats Chips */}
                            <div className="d-flex flex-wrap gap-2 mb-3">
                              {/* Availability Chip */}
                              <div className={`badge px-2.5 py-1 rounded-pill d-flex align-items-center gap-1 text-2xs ${
                                rec.available_matching_slots > 0
                                  ? 'bg-success-subtle text-success border border-success-subtle'
                                  : 'bg-danger-subtle text-danger border border-danger-subtle'
                              }`}>
                                <CheckCircle2 size={12} />
                                <span>{rec.available_matching_slots} of {rec.total_matching_slots} {rec.vehicle_type} bays free</span>
                              </div>

                              {/* Price Chip */}
                              <div className="badge bg-slate-100 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-pill text-2xs">
                                ₹{rec.price_per_hour}/hr (Est. total: ₹{rec.estimated_total_cost})
                              </div>

                              {/* Recommended Bay Chip */}
                              {recSlot && (
                                <div className="badge bg-primary-subtle text-primary border border-primary-subtle px-2.5 py-1 rounded-pill text-2xs d-flex align-items-center gap-1">
                                  <Layers size={11} />
                                  <span>Bay {recSlot.slot_number} ({recSlot.floor})</span>
                                </div>
                              )}
                            </div>

                            {/* Transparent Reasons List */}
                            <div className="mb-2">
                              <span className="text-3xs text-uppercase fw-bold text-slate-500 tracking-wider d-block mb-1.5">
                                Why This Location Is Recommended:
                              </span>
                              <ul className="list-unstyled mb-0 d-flex flex-column gap-1">
                                {rec.recommendation_reasons.map((reason, rIdx) => (
                                  <li key={rIdx} className="text-xs text-slate-700 d-flex align-items-start gap-1.5">
                                    <span className="text-success mt-0.5">✓</span>
                                    <span>{reason}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>

                          {/* Right Side: Score Box & 1-Click Action */}
                          <div className="col-md-5 d-flex flex-column justify-content-between align-items-md-end text-md-end h-100">
                            {/* Score Dial */}
                            <div className="mb-3">
                              <div className="d-inline-flex flex-column align-items-center p-2.5 rounded-3 bg-slate-50 border border-slate-200">
                                <span className="text-3xs text-uppercase fw-bold text-slate-500">
                                  Match Score
                                </span>
                                <div className="display-6 fw-bold text-primary my-0 lh-1">
                                  {rec.total_score}
                                  <span className="fs-6 text-muted fw-normal">/100</span>
                                </div>
                                <span className="text-3xs text-muted mt-1">
                                  {rec.is_bookable ? 'Guaranteed Available' : 'No Free Bays'}
                                </span>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="w-100 d-flex flex-column gap-2">
                              {rec.is_bookable && recSlot ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    // Direct 1-click booking routing: passes slot and window
                                    navigate(
                                      `/lots/${rec.lot_id}?slot_id=${recSlot.id}&start=${date}T${startTime}&end=${date}T${endTime}`
                                    );
                                  }}
                                  className="btn btn-primary btn-sm py-2 px-3 rounded-3 fw-semibold d-flex align-items-center justify-content-center gap-1.5 shadow-xs"
                                >
                                  <span>Book Bay {recSlot.slot_number} Now</span>
                                  <ArrowRight size={15} />
                                </button>
                              ) : (
                                <button disabled className="btn btn-secondary btn-sm py-2 px-3 rounded-3 text-xs">
                                  No Bays Available for this Time
                                </button>
                              )}

                              {/* Scoring Breakdown Accordion Toggle */}
                              <button
                                type="button"
                                onClick={() => setExpandedScoreId(isExpanded ? null : rec.lot_id)}
                                className="btn btn-link btn-sm p-0 text-2xs text-muted text-decoration-none d-flex align-items-center justify-content-center gap-1"
                              >
                                <span>{isExpanded ? 'Hide Algorithm Breakdown' : 'View Scoring Breakdown'}</span>
                                {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Expandable Transparent Algorithm Breakdown */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-top border-slate-200 bg-slate-50 p-3 rounded-3 text-start">
                            <h6 className="fw-bold text-dark text-xs mb-2 d-flex align-items-center gap-1.5">
                              <ShieldCheck size={14} className="text-primary" />
                              <span>Deterministic Scoring Transparency</span>
                            </h6>
                            <div className="row g-2 text-2xs">
                              {/* Availability */}
                              <div className="col-sm-4">
                                <div className="p-2 bg-white rounded-2 border">
                                  <div className="d-flex justify-content-between fw-bold mb-1">
                                    <span>Availability Score:</span>
                                    <span className="text-success">{rec.scoring_breakdown.availability_score}/100</span>
                                  </div>
                                  <p className="text-muted mb-0">{rec.scoring_breakdown.availability_reason}</p>
                                  <span className="text-3xs text-slate-400 d-block mt-1">
                                    Weight: {Math.round(rec.scoring_breakdown.weights.availability * 100)}%
                                  </span>
                                </div>
                              </div>

                              {/* Price */}
                              <div className="col-sm-4">
                                <div className="p-2 bg-white rounded-2 border">
                                  <div className="d-flex justify-content-between fw-bold mb-1">
                                    <span>Pricing Score:</span>
                                    <span className="text-primary">{rec.scoring_breakdown.price_score}/100</span>
                                  </div>
                                  <p className="text-muted mb-0">{rec.scoring_breakdown.price_reason}</p>
                                  <span className="text-3xs text-slate-400 d-block mt-1">
                                    Weight: {Math.round(rec.scoring_breakdown.weights.price * 100)}%
                                  </span>
                                </div>
                              </div>

                              {/* Distance */}
                              <div className="col-sm-4">
                                <div className="p-2 bg-white rounded-2 border">
                                  <div className="d-flex justify-content-between fw-bold mb-1">
                                    <span>Distance Score:</span>
                                    <span className={rec.scoring_breakdown.distance_score !== null ? 'text-primary' : 'text-muted'}>
                                      {rec.scoring_breakdown.distance_score !== null
                                        ? `${rec.scoring_breakdown.distance_score}/100`
                                        : 'Omitted'}
                                    </span>
                                  </div>
                                  <p className="text-muted mb-0">{rec.scoring_breakdown.distance_reason}</p>
                                  <span className="text-3xs text-slate-400 d-block mt-1">
                                    Weight: {Math.round(rec.scoring_breakdown.weights.distance * 100)}%
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecommendationsPage;
