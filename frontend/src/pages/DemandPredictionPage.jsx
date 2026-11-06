import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  MapPin,
  Calendar,
  AlertCircle,
  Clock,
  Layers,
  Database,
  Info,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';
import parkingService from '../services/parkingService';
import analyticsService from '../services/analyticsService';
import LoadingSpinner from '../components/LoadingSpinner';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function DemandPredictionPage() {
  const [lots, setLots] = useState([]);
  const [selectedLotId, setSelectedLotId] = useState('');
  const [timeWindow, setTimeWindow] = useState('next_24h');
  const [loading, setLoading] = useState(true);
  const [predictionResult, setPredictionResult] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    async function loadLots() {
      try {
        const lotList = await parkingService.getLots();
        setLots(lotList);
        if (lotList.length > 0) {
          setSelectedLotId(lotList[0].id);
        }
      } catch (err) {
        console.error('Failed to load parking lots for prediction dashboard:', err);
      }
    }
    loadLots();
  }, []);

  const fetchPredictions = async (lotId, windowParam) => {
    if (!lotId) return;
    setRefreshing(true);
    try {
      // Query real Django prediction API endpoint
      const result = await analyticsService.getDemandPredictions(lotId, { time_window: windowParam });
      setPredictionResult(result);
    } catch (err) {
      setPredictionResult({
        available: false,
        message: err.message || 'Failed to reach demand prediction service.',
        insufficientData: false,
      });
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLotId) {
      fetchPredictions(selectedLotId, timeWindow);
    }
  }, [selectedLotId, timeWindow]);

  const selectedLot = lots.find((l) => String(l.id) === String(selectedLotId)) || lots[0];

  if (loading && lots.length === 0) {
    return <LoadingSpinner message="Connecting to AI Demand Prediction Engine..." />;
  }

  return (
    <div className="demand-prediction-page container-fluid px-0">
      {/* Page Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-inline-flex align-items-center gap-1.5 px-2.5 py-1 rounded-pill bg-purple-subtle text-purple text-2xs fw-bold mb-1" style={{ color: '#7c3aed', backgroundColor: '#f3e8ff' }}>
            <Sparkles size={13} /> Machine Learning Forecast
          </div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">
            AI/ML Demand Prediction Dashboard
          </h2>
          <p className="text-muted small mb-0">
            Predict bay demand patterns and occupancy bottlenecks using time-series forecasting.
          </p>
        </div>

        {/* Filters */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          {/* Parking Hub Selector */}
          <div className="d-flex align-items-center gap-1.5 bg-white p-1 rounded-3 border">
            <MapPin size={14} className="text-muted ms-2" />
            <select
              className="form-select form-select-sm border-0 shadow-none text-xs fw-medium text-dark"
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
            >
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Time Window Selector */}
          <div className="d-flex align-items-center gap-1.5 bg-white p-1 rounded-3 border">
            <Clock size={14} className="text-muted ms-2" />
            <select
              className="form-select form-select-sm border-0 shadow-none text-xs fw-medium text-dark"
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value)}
            >
              <option value="next_24h">Next 24 Hours</option>
              <option value="next_7d">Next 7 Days</option>
              <option value="weekend">Upcoming Weekend</option>
            </select>
          </div>

          <button
            onClick={() => fetchPredictions(selectedLotId, timeWindow)}
            disabled={refreshing}
            className="btn btn-sm btn-outline-secondary rounded-3 px-3 py-1.5 text-xs d-flex align-items-center gap-1.5"
            title="Refresh forecast from server"
          >
            <RefreshCw size={13} className={refreshing ? 'spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Case 1: Backend Prediction Endpoint Missing or Insufficient Data */}
      {predictionResult && !predictionResult.available && (
        <div className="card border-0 shadow-sm rounded-4 p-4 mb-4 bg-white">
          <div className="d-flex align-items-start gap-3">
            <div className="p-3 rounded-circle bg-amber-50 text-amber-600 border border-amber-200 mt-1" style={{ color: '#d97706', backgroundColor: '#fffbeb' }}>
              <AlertCircle size={24} />
            </div>
            <div className="flex-grow-1">
              <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
                <h5 className="fw-bold text-dark mb-0">
                  Django AI/ML Prediction Service Status
                </h5>
                <span className="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle text-2xs px-2 py-0.5 rounded-pill">
                  {predictionResult.status === 404 ? 'Backend Endpoint Not Implemented (404)' : 'Insufficient Training Data'}
                </span>
              </div>
              <p className="text-muted text-xs mb-3">
                {predictionResult.message}
              </p>

              {/* Strict Requirement Notice: Never invent fake prediction accuracy */}
              <div className="alert alert-info py-2.5 px-3 rounded-3 text-xs mb-3 border-0 bg-slate-100">
                <div className="d-flex align-items-center gap-2 fw-semibold text-slate-800 mb-1">
                  <Database size={14} className="text-primary" /> Strict Backend Verification Notice
                </div>
                <div className="text-slate-600 text-3xs">
                  In accordance with Phase 4 architectural constraints, <strong>synthetic AI forecasts and fabricated model accuracy metrics are strictly prohibited</strong>. The dashboard will automatically connect and render forecasts once the Django AI prediction service endpoint is deployed.
                </div>
              </div>

              {/* Backend Implementation Task Card */}
              <div className="p-3 rounded-3 bg-slate-50 border border-slate-200 text-xs">
                <div className="fw-bold text-dark mb-1 d-flex align-items-center gap-1.5">
                  <Layers size={14} className="text-primary" /> Pending Backend Tasks for AI Demand Prediction:
                </div>
                <ul className="mb-0 ps-3 text-slate-600 text-2xs">
                  <li className="mb-1">
                    <strong>Endpoint:</strong> <code>GET /api/analytics/demand-prediction/?lot_id=&lt;id&gt;&time_window=&lt;window&gt;</code>
                  </li>
                  <li className="mb-1">
                    <strong>Training Pipeline:</strong> Train a regression or ARIMA/Prophet demand model over historical <code>Booking</code> records grouped by lot and hour.
                  </li>
                  <li className="mb-1">
                    <strong>Evaluation Metrics:</strong> Supply server-computed <code>mae</code>, <code>rmse</code>, and <code>r2_score</code> in the response payload.
                  </li>
                  <li>
                    <strong>Insufficient Data Guard:</strong> Return HTTP 422 with message <em>"Insufficient historical booking records to establish statistically significant forecasting model"</em> when historical count &lt; threshold.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Case 2: Backend returned real prediction data */}
      {predictionResult && predictionResult.available && predictionResult.data && (
        <div>
          {/* Model Evaluation Metrics (Shown ONLY when provided by backend) */}
          {predictionResult.data.model_evaluation && (
            <div className="card border-0 shadow-sm rounded-4 p-3.5 mb-4 bg-white">
              <h6 className="fw-bold text-xs text-uppercase tracking-wider text-muted mb-3 d-flex align-items-center gap-1.5">
                <CheckCircle2 size={14} className="text-success" /> Server-Verified Model Evaluation Information
              </h6>
              <div className="row g-3">
                {predictionResult.data.model_evaluation.algorithm && (
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 bg-slate-50 rounded-3 border">
                      <div className="text-3xs text-muted text-uppercase">Algorithm</div>
                      <div className="fw-bold text-dark text-xs">{predictionResult.data.model_evaluation.algorithm}</div>
                    </div>
                  </div>
                )}
                {predictionResult.data.model_evaluation.r2_score !== undefined && (
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 bg-slate-50 rounded-3 border">
                      <div className="text-3xs text-muted text-uppercase">R² Score</div>
                      <div className="fw-bold text-primary text-xs">{predictionResult.data.model_evaluation.r2_score}</div>
                    </div>
                  </div>
                )}
                {predictionResult.data.model_evaluation.mae !== undefined && (
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 bg-slate-50 rounded-3 border">
                      <div className="text-3xs text-muted text-uppercase">Mean Absolute Error</div>
                      <div className="fw-bold text-dark text-xs">{predictionResult.data.model_evaluation.mae}</div>
                    </div>
                  </div>
                )}
                {predictionResult.data.model_evaluation.rmse !== undefined && (
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 bg-slate-50 rounded-3 border">
                      <div className="text-3xs text-muted text-uppercase">RMSE</div>
                      <div className="fw-bold text-dark text-xs">{predictionResult.data.model_evaluation.rmse}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Forecast Charts */}
          <div className="row g-4">
            <div className="col-12 col-lg-8">
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
                <h6 className="fw-bold text-dark mb-1">
                  Predicted Demand vs Historical Actuals: {selectedLot?.name}
                </h6>
                <p className="text-muted text-2xs mb-3">
                  Historical bookings plotted separately from projected demand intervals.
                </p>
                <div style={{ height: '300px' }}>
                  <Line
                    data={{
                      labels: predictionResult.data.timeline?.labels || [],
                      datasets: [
                        {
                          label: 'Predicted Occupancy Demand (%)',
                          data: predictionResult.data.timeline?.predicted || [],
                          borderColor: '#7c3aed',
                          backgroundColor: 'rgba(124, 58, 237, 0.1)',
                          fill: true,
                          tension: 0.3,
                        },
                        {
                          label: 'Actual Historical Bookings',
                          data: predictionResult.data.timeline?.actual || [],
                          borderColor: '#2563eb',
                          backgroundColor: 'transparent',
                          borderDash: [5, 5],
                          tension: 0.3,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="col-12 col-lg-4">
              <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
                <h6 className="fw-bold text-dark mb-1">Peak Demand Windows</h6>
                <p className="text-muted text-2xs mb-3">
                  High-congestion hours predicted by the backend model.
                </p>
                <div className="d-flex flex-column gap-2">
                  {(predictionResult.data.peak_hours || []).map((p, idx) => (
                    <div key={idx} className="p-2.5 rounded-3 bg-slate-50 border d-flex justify-content-between align-items-center text-xs">
                      <span className="fw-medium text-dark">{p.time_label}</span>
                      <span className="badge bg-danger-subtle text-danger font-monospace">
                        {p.predicted_occupancy}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DemandPredictionPage;
