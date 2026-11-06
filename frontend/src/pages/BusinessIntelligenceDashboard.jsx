import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  CreditCard,
  CalendarCheck,
  Percent,
  Download,
  Building,
  RefreshCw,
  Calendar,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  CheckCircle2,
  Clock,
  Users,
  Shield,
  Award,
  Ticket,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  BarChart2,
  Activity,
  Filter,
  ArrowLeft,
  ChevronRight,
  Info,
} from 'lucide-react';
import analyticsService from '../services/analyticsService';
import parkingService from '../services/parkingService';
import { formatCurrency, formatDateTime } from '../utils/formatters';

// Register ChartJS modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export function BusinessIntelligenceDashboard() {
  const [data, setData] = useState(null);
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters State
  const [dateRange, setDateRange] = useState('last_30_days');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLot, setSelectedLot] = useState('all');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('all');

  // Export State
  const [exportingFormat, setExportingFormat] = useState(null);
  const [exportNotice, setExportNotice] = useState(null);

  const fetchBIData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        range: dateRange,
        lot_id: selectedLot,
        payment_method: selectedPaymentMethod,
      };
      if (dateRange === 'custom' && startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }

      const [biResponse, lotsResponse] = await Promise.all([
        analyticsService.getBIData(params),
        parkingService.getLots(),
      ]);

      setData(biResponse);
      setLots(Array.isArray(lotsResponse) ? lotsResponse : []);
    } catch (err) {
      console.error('Failed to load BI data:', err);
      setError(err.response?.data?.message || err.message || 'Failed to retrieve analytics data.');
    } finally {
      setLoading(false);
    }
  }, [dateRange, startDate, endDate, selectedLot, selectedPaymentMethod]);

  useEffect(() => {
    fetchBIData();
  }, [fetchBIData]);

  const handleExport = async (format) => {
    setExportingFormat(format);
    setExportNotice(null);
    try {
      const params = {
        range: dateRange,
        lot_id: selectedLot,
        payment_method: selectedPaymentMethod,
      };
      if (dateRange === 'custom' && startDate && endDate) {
        params.start_date = startDate;
        params.end_date = endDate;
      }
      const res = await analyticsService.exportReport(format, params);
      setExportNotice({
        type: 'success',
        message: `${format.toUpperCase()} report (${res.filename}) generated and downloaded successfully.`,
      });
    } catch (err) {
      setExportNotice({
        type: 'danger',
        message: err.message || `Failed to export ${format.toUpperCase()} report.`,
      });
    } finally {
      setExportingFormat(null);
    }
  };

  // Helper chart configurations
  const revenueChartData = {
    labels: data?.revenue?.trend?.labels || [],
    datasets: [
      {
        label: 'Revenue (₹)',
        data: data?.revenue?.trend?.revenue || [],
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 3,
        pointHoverRadius: 6,
        yAxisID: 'y',
      },
      {
        label: 'Bookings Count',
        data: data?.revenue?.trend?.bookings_count || [],
        borderColor: '#3B82F6',
        backgroundColor: 'transparent',
        borderDash: [4, 4],
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        yAxisID: 'y1',
      },
    ],
  };

  const revenueChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            if (ctx.datasetIndex === 0) return ` Revenue: ₹${Number(ctx.raw).toLocaleString('en-IN')}`;
            return ` Bookings: ${ctx.raw}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        type: 'linear',
        position: 'left',
        grid: { color: '#f1f5f9' },
        ticks: {
          font: { size: 10 },
          callback: (v) => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`,
        },
      },
      y1: {
        type: 'linear',
        position: 'right',
        grid: { display: false },
        ticks: { font: { size: 10 }, precision: 0 },
      },
    },
  };

  // Hourly Peak Chart
  const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);
  const hourlyChartData = {
    labels: hourlyLabels,
    datasets: [
      {
        label: 'Booking Demand by Hour',
        data: data?.peak_hours?.hourly_distribution || [],
        backgroundColor: hourlyLabels.map((_, i) =>
          (i >= 9 && i <= 12) || (i >= 17 && i <= 21) ? '#F59E0B' : '#3B82F6'
        ),
        borderRadius: 4,
      },
    ],
  };

  // Payment Methods Doughnut
  const paymentDoughnutData = {
    labels: data?.payments?.methods?.map((m) => m.label) || [],
    datasets: [
      {
        data: data?.payments?.methods?.map((m) => m.count) || [],
        backgroundColor: ['#6366F1', '#10B981', '#3B82F6', '#F59E0B'],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  // Lot Utilization Bar Chart
  const lotBarData = {
    labels: data?.lot_performance?.lots?.map((l) => l.lot_name) || [],
    datasets: [
      {
        label: 'Revenue (₹)',
        data: data?.lot_performance?.lots?.map((l) => l.revenue) || [],
        backgroundColor: '#10B981',
        borderRadius: 4,
        yAxisID: 'y',
      },
      {
        label: 'Current Occupancy (%)',
        data: data?.lot_performance?.lots?.map((l) => l.current_occupancy_percent) || [],
        backgroundColor: '#3B82F6',
        borderRadius: 4,
        yAxisID: 'y1',
      },
    ],
  };

  const lotBarOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        type: 'linear',
        position: 'left',
        ticks: { callback: (v) => `₹${v}` },
      },
      y1: {
        type: 'linear',
        position: 'right',
        max: 100,
        ticks: { callback: (v) => `${v}%` },
        grid: { display: false },
      },
    },
  };

  return (
    <div className="container-fluid py-4 px-3 px-lg-4 max-w-7xl">
      {/* Breadcrumb & Navigation */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Link to="/admin" className="text-decoration-none text-muted small d-inline-flex align-items-center gap-1 hover-text-primary">
              <ArrowLeft size={14} /> Admin Overview
            </Link>
            <span className="text-muted small">/</span>
            <span className="text-slate-800 small fw-medium">Business Intelligence</span>
          </div>
          <h2 className="h4 fw-bold text-dark m-0 d-flex align-items-center gap-2">
            <BarChart2 className="text-primary" size={24} /> Executive Business Intelligence &amp; Analytics
          </h2>
          <p className="text-muted small m-0 mt-1">
            Comprehensive multi-dimensional metrics, sensor-free occupancy analytics, revenue forecasting, and export center.
          </p>
        </div>

        {/* Export Center Buttons */}
        <div className="d-flex flex-wrap align-items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('pdf')}
            disabled={exportingFormat !== null || loading}
            className="btn btn-sm btn-outline-danger rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
            title="Export executive PDF report"
          >
            <FileText size={14} /> {exportingFormat === 'pdf' ? 'Generating PDF...' : 'Export PDF'}
          </button>

          <button
            type="button"
            onClick={() => handleExport('excel')}
            disabled={exportingFormat !== null || loading}
            className="btn btn-sm btn-outline-success rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
            title="Export multi-sheet Excel spreadsheet"
          >
            <FileSpreadsheet size={14} /> {exportingFormat === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>

          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={exportingFormat !== null || loading}
            className="btn btn-sm btn-outline-secondary rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
            title="Export raw tabular CSV"
          >
            <Download size={14} /> {exportingFormat === 'csv' ? 'Exporting...' : 'Export CSV'}
          </button>

          <button
            type="button"
            onClick={fetchBIData}
            disabled={loading}
            className="btn btn-sm btn-primary rounded-3 d-inline-flex align-items-center gap-1.5 shadow-xs"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Export Notice Banner */}
      {exportNotice && (
        <div className={`alert alert-${exportNotice.type} border-0 rounded-3 py-2.5 px-3 mb-4 d-flex justify-content-between align-items-center small shadow-xs`}>
          <span>{exportNotice.message}</span>
          <button type="button" className="btn-close" onClick={() => setExportNotice(null)}></button>
        </div>
      )}

      {/* Filter Toolbar Card */}
      <div className="card border-0 shadow-sm rounded-4 mb-4 bg-white">
        <div className="card-body p-3">
          <div className="row g-2 align-items-center">
            {/* Range Presets */}
            <div className="col-12 col-md-4 col-lg-3">
              <label className="text-3xs text-uppercase fw-bold text-muted mb-1 d-block">Time Period</label>
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="form-select form-select-sm rounded-3 fw-medium"
              >
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="last_7_days">Last 7 Days</option>
                <option value="last_30_days">Last 30 Days (Default)</option>
                <option value="this_month">This Month</option>
                <option value="previous_month">Previous Month</option>
                <option value="this_year">This Year (YTD)</option>
                <option value="custom">Custom Date Range...</option>
              </select>
            </div>

            {/* Custom Range Inputs (Conditional) */}
            {dateRange === 'custom' && (
              <>
                <div className="col-6 col-md-2">
                  <label className="text-3xs text-uppercase fw-bold text-muted mb-1 d-block">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="form-control form-control-sm rounded-3"
                  />
                </div>
                <div className="col-6 col-md-2">
                  <label className="text-3xs text-uppercase fw-bold text-muted mb-1 d-block">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="form-control form-control-sm rounded-3"
                  />
                </div>
              </>
            )}

            {/* Parking Lot Filter */}
            <div className="col-12 col-md-3">
              <label className="text-3xs text-uppercase fw-bold text-muted mb-1 d-block">Parking Facility</label>
              <select
                value={selectedLot}
                onChange={(e) => setSelectedLot(e.target.value)}
                className="form-select form-select-sm rounded-3"
              >
                <option value="all">All Parking Lots</option>
                {lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Filter */}
            <div className="col-12 col-md-3">
              <label className="text-3xs text-uppercase fw-bold text-muted mb-1 d-block">Payment Method</label>
              <select
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="form-select form-select-sm rounded-3"
              >
                <option value="all">All Payment Methods</option>
                <option value="upi">UPI</option>
                <option value="card">Debit / Credit Card</option>
                <option value="netbanking">Net Banking</option>
                <option value="wallet">Digital Wallet</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {loading && !data ? (
        <div className="p-5 text-center text-muted">
          <RefreshCw size={36} className="text-primary animate-spin mx-auto mb-3" />
          <h6 className="fw-bold text-dark">Aggregating Business Intelligence Data...</h6>
          <p className="text-3xs text-muted mb-0">Computing multi-facility metrics from live database intervals.</p>
        </div>
      ) : error ? (
        <div className="alert alert-danger border-0 rounded-4 p-4 text-center">
          <AlertCircle size={36} className="mx-auto mb-2 text-danger" />
          <h6 className="fw-bold mb-1">Failed to Load Analytics</h6>
          <p className="text-xs mb-3">{error}</p>
          <button type="button" onClick={fetchBIData} className="btn btn-sm btn-outline-danger rounded-pill px-3">
            Retry
          </button>
        </div>
      ) : (
        <>
          {/* ============================================================= */}
          {/* MODULE A: REVENUE ANALYTICS HERO CARDS */}
          {/* ============================================================= */}
          <div className="row g-3 mb-4">
            {/* Total Revenue & Growth */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card border-0 shadow-xs rounded-4 p-3.5 bg-white h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="text-2xs fw-bold text-muted text-uppercase">Total Period Revenue</span>
                  <span className="p-2 bg-emerald-50 text-emerald-600 rounded-3">
                    <DollarSign size={18} />
                  </span>
                </div>
                <div className="h3 fw-bold text-dark mb-1">
                  ₹{Number(data?.revenue?.total_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="d-flex align-items-center gap-1.5 text-xs">
                  {data?.revenue?.growth_percent >= 0 ? (
                    <span className="badge bg-emerald-100 text-emerald-800 d-inline-flex align-items-center gap-1 text-2xs">
                      <ArrowUpRight size={12} /> +{data?.revenue?.growth_percent}%
                    </span>
                  ) : (
                    <span className="badge bg-danger-subtle text-danger d-inline-flex align-items-center gap-1 text-2xs">
                      <ArrowDownRight size={12} /> {data?.revenue?.growth_percent}%
                    </span>
                  )}
                  <span className="text-muted text-3xs">vs previous period (₹{Number(data?.revenue?.previous_period_revenue || 0).toFixed(0)})</span>
                </div>
              </div>
            </div>

            {/* Daily & Monthly Revenue */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card border-0 shadow-xs rounded-4 p-3.5 bg-white h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="text-2xs fw-bold text-muted text-uppercase">Today's Revenue</span>
                  <span className="p-2 bg-blue-50 text-blue-600 rounded-3">
                    <Clock size={18} />
                  </span>
                </div>
                <div className="h3 fw-bold text-dark mb-1">
                  ₹{Number(data?.revenue?.daily_revenue || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div className="text-3xs text-muted">
                  30-day running total: <strong>₹{Number(data?.revenue?.monthly_revenue || 0).toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            {/* Average Occupancy Rate */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card border-0 shadow-xs rounded-4 p-3.5 bg-white h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="text-2xs fw-bold text-muted text-uppercase">Live Slot Occupancy</span>
                  <span className="p-2 bg-purple-50 text-purple-600 rounded-3">
                    <Percent size={18} />
                  </span>
                </div>
                <div className="h3 fw-bold text-dark mb-1">
                  {data?.occupancy?.current_occupancy_percent || 0}%
                </div>
                <div className="text-3xs text-muted">
                  {data?.occupancy?.occupied_slots} occupied / {data?.occupancy?.active_slots} active bays
                </div>
              </div>
            </div>

            {/* Customer Retention & Booking Value */}
            <div className="col-12 col-sm-6 col-lg-3">
              <div className="card border-0 shadow-xs rounded-4 p-3.5 bg-white h-100">
                <div className="d-flex justify-content-between align-items-start mb-2">
                  <span className="text-2xs fw-bold text-muted text-uppercase">Avg Booking Value (ABV)</span>
                  <span className="p-2 bg-amber-50 text-amber-600 rounded-3">
                    <Award size={18} />
                  </span>
                </div>
                <div className="h3 fw-bold text-dark mb-1">
                  ₹{Number(data?.customers?.avg_booking_value || 0).toFixed(2)}
                </div>
                <div className="text-3xs text-muted">
                  Retention Rate: <strong>{data?.customers?.retention_rate}%</strong> ({data?.customers?.returning_customers} repeat users)
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* REVENUE TRENDS & PAYMENT HEALTH SECTION */}
          {/* ============================================================= */}
          <div className="row g-3 mb-4">
            {/* Interactive Revenue Trajectory Line Chart */}
            <div className="col-12 col-lg-8">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h5 className="h6 fw-bold text-dark m-0">Revenue &amp; Booking Volume Trajectory</h5>
                    <span className="text-3xs text-muted">Daily trend progression across the selected date interval</span>
                  </div>
                  <span className="badge bg-slate-100 text-slate-700 text-3xs border">
                    {data?.filters?.range_label}
                  </span>
                </div>
                <div style={{ height: '280px' }}>
                  <Line data={revenueChartData} options={revenueChartOptions} />
                </div>
              </div>
            </div>

            {/* Payment Health Summary */}
            <div className="col-12 col-lg-4">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <h5 className="h6 fw-bold text-dark mb-1">Transaction Processing Health</h5>
                <span className="text-3xs text-muted mb-3 d-block">Success, pending holds, and failure distribution</span>

                <div className="p-3 rounded-3 bg-slate-50 border mb-2.5">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-xs fw-semibold text-slate-700 d-flex align-items-center gap-1.5">
                      <CheckCircle2 size={14} className="text-success" /> Successful Transactions
                    </span>
                    <strong className="text-success text-xs">
                      {data?.revenue?.successful_count} (₹{Number(data?.revenue?.total_revenue).toFixed(0)})
                    </strong>
                  </div>
                  <div className="progress" style={{ height: '5px' }}>
                    <div
                      className="progress-bar bg-success"
                      style={{ width: `${data?.payments?.success_rate}%` }}
                    />
                  </div>
                  <span className="text-3xs text-muted mt-1 d-block">
                    Gateway settlement rate: <strong>{data?.payments?.success_rate}%</strong>
                  </span>
                </div>

                <div className="p-3 rounded-3 bg-slate-50 border mb-2.5">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-xs fw-semibold text-slate-700 d-flex align-items-center gap-1.5">
                      <Clock size={14} className="text-warning" /> Pending Payment Holds
                    </span>
                    <strong className="text-warning text-xs">
                      {data?.revenue?.pending_count} (₹{Number(data?.revenue?.pending_amount).toFixed(0)})
                    </strong>
                  </div>
                  <span className="text-3xs text-muted">
                    10-minute hold window awaiting UPI/Card checkout
                  </span>
                </div>

                <div className="p-3 rounded-3 bg-slate-50 border">
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <span className="text-xs fw-semibold text-slate-700 d-flex align-items-center gap-1.5">
                      <AlertCircle size={14} className="text-danger" /> Failed / Rejected Transactions
                    </span>
                    <strong className="text-danger text-xs">
                      {data?.revenue?.failed_count} (₹{Number(data?.revenue?.failed_amount).toFixed(0)})
                    </strong>
                  </div>
                  <span className="text-3xs text-muted">
                    {data?.revenue?.failed_count === 0 ? 'No transaction rejections in this period' : 'Failed gateway attempts'}
                  </span>
                </div>

                {/* Simulated Gateway Disclaimer */}
                <div className="mt-auto pt-3 border-top text-3xs text-muted d-flex align-items-center gap-1.5">
                  <Shield size={12} className="text-primary flex-shrink-0" />
                  <span>Demonstration gateway: Simulated records recorded with mock transaction IDs.</span>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* MODULE B & C: OCCUPANCY & PEAK-HOUR ANALYTICS */}
          {/* ============================================================= */}
          <div className="row g-3 mb-4">
            {/* 24-Hour Peak Demand Chart */}
            <div className="col-12 col-lg-7">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <div>
                    <h5 className="h6 fw-bold text-dark m-0">Peak-Hour Demand Distribution (24-Hour Cycle)</h5>
                    <span className="text-3xs text-muted">
                      Morning peak (09:00 - 12:00) and evening surge (17:00 - 21:00) highlighted in amber
                    </span>
                  </div>
                  <span className="badge bg-warning bg-opacity-25 text-warning-emphasis text-3xs">
                    Busiest: {data?.peak_hours?.busiest_day}
                  </span>
                </div>
                <div style={{ height: '230px' }}>
                  <Bar
                    data={hourlyChartData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { display: false }, ticks: { font: { size: 9 } } },
                        y: { ticks: { precision: 0 } },
                      },
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Weekday vs Weekend Comparison */}
            <div className="col-12 col-lg-5">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <h5 className="h6 fw-bold text-dark mb-1">Weekday vs. Weekend Demand Split</h5>
                <span className="text-3xs text-muted mb-3 d-block">Comparison of booking volume and revenue intake</span>

                <div className="row g-2 mb-3">
                  <div className="col-6">
                    <div className="p-3 rounded-3 bg-blue-50 border border-blue-100 text-center">
                      <span className="text-3xs text-uppercase fw-bold text-blue-700 d-block">Weekdays (Mon - Fri)</span>
                      <strong className="h4 text-blue-900 d-block my-1">
                        {data?.peak_hours?.weekday_vs_weekend?.weekday_bookings || 0}
                      </strong>
                      <span className="badge bg-blue-200 text-blue-900 text-3xs">
                        ₹{Number(data?.peak_hours?.weekday_vs_weekend?.weekday_revenue || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <div className="col-6">
                    <div className="p-3 rounded-3 bg-purple-50 border border-purple-100 text-center">
                      <span className="text-3xs text-uppercase fw-bold text-purple-700 d-block">Weekends (Sat - Sun)</span>
                      <strong className="h4 text-purple-900 d-block my-1">
                        {data?.peak_hours?.weekday_vs_weekend?.weekend_bookings || 0}
                      </strong>
                      <span className="badge bg-purple-200 text-purple-900 text-3xs">
                        ₹{Number(data?.peak_hours?.weekday_vs_weekend?.weekend_revenue || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="table-responsive">
                  <table className="table table-sm table-borderless text-xs align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th className="py-1">Day</th>
                        <th className="py-1 text-center">Bookings</th>
                        <th className="py-1 text-end">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.peak_hours?.days_of_week?.map((d) => (
                        <tr key={d.day}>
                          <td className="py-1 fw-medium">{d.day}</td>
                          <td className="py-1 text-center">{d.bookings}</td>
                          <td className="py-1 text-end text-success fw-semibold">₹{d.revenue.toFixed(0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* MODULE E: PARKING LOT PERFORMANCE MATRIX */}
          {/* ============================================================= */}
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden mb-4 bg-white">
            <div className="card-header bg-white py-3 px-3 px-md-4 border-bottom d-flex justify-content-between align-items-center">
              <div>
                <h5 className="h6 fw-bold text-dark m-0">Facility Performance &amp; Utilization Comparison</h5>
                <span className="text-3xs text-muted">Per-facility revenue, occupancy, booking count, and stay duration</span>
              </div>
              <div className="d-flex align-items-center gap-2">
                <span className="badge bg-emerald-100 text-emerald-800 text-3xs">
                  Top: {data?.lot_performance?.best_performing}
                </span>
              </div>
            </div>

            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0 text-xs">
                  <thead className="table-light">
                    <tr>
                      <th className="ps-4">Parking Facility</th>
                      <th>Location</th>
                      <th className="text-center">Rate</th>
                      <th className="text-center">Total Bays</th>
                      <th className="text-center">Live Occupancy</th>
                      <th className="text-center">Bookings</th>
                      <th className="text-end">Revenue</th>
                      <th className="text-center pe-4">Avg Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.lot_performance?.lots?.map((lot) => (
                      <tr key={lot.lot_id}>
                        <td className="ps-4 fw-bold text-dark">
                          <Link to={`/lots/${lot.lot_id}`} className="text-decoration-none text-dark hover-text-primary">
                            {lot.lot_name}
                          </Link>
                          {lot.lot_name === data?.lot_performance?.best_performing && (
                            <span className="badge bg-warning-subtle text-warning-emphasis ms-1.5 text-3xs">
                              Best Performer
                            </span>
                          )}
                        </td>
                        <td className="text-muted">{lot.location}</td>
                        <td className="text-center">₹{lot.price_per_hour}/h</td>
                        <td className="text-center">{lot.total_slots}</td>
                        <td className="text-center">
                          <div className="d-flex align-items-center justify-content-center gap-1.5">
                            <span className="fw-semibold">{lot.current_occupancy_percent}%</span>
                            <div className="progress" style={{ width: '45px', height: '4px' }}>
                              <div
                                className={`progress-bar ${lot.current_occupancy_percent > 75 ? 'bg-danger' : lot.current_occupancy_percent > 40 ? 'bg-warning' : 'bg-success'}`}
                                style={{ width: `${lot.current_occupancy_percent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="text-center fw-medium">{lot.booking_count}</td>
                        <td className="text-end text-success fw-bold">
                          ₹{Number(lot.revenue).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="text-center pe-4 text-muted">{lot.avg_duration_hours} hrs</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ============================================================= */}
          {/* MODULE F & G: PAYMENT METHODS & MEMBERSHIP / LOYALTY */}
          {/* ============================================================= */}
          <div className="row g-3 mb-4">
            {/* Payment Method Distribution */}
            <div className="col-12 col-lg-5">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <h5 className="h6 fw-bold text-dark mb-1">Payment Method Distribution</h5>
                <span className="text-3xs text-muted mb-3 d-block">Transaction share across UPI, Card, Net Banking &amp; Wallet</span>

                <div style={{ height: '170px' }} className="mb-3">
                  <Doughnut
                    data={paymentDoughnutData}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } },
                    }}
                  />
                </div>

                <div className="table-responsive">
                  <table className="table table-sm table-borderless text-xs mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Channel</th>
                        <th className="text-center">Txns</th>
                        <th className="text-end">Volume</th>
                        <th className="text-end">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.payments?.methods?.map((m) => (
                        <tr key={m.method}>
                          <td className="fw-medium">{m.label}</td>
                          <td className="text-center">{m.count}</td>
                          <td className="text-end text-success">₹{Number(m.amount).toFixed(0)}</td>
                          <td className="text-end text-muted">{m.percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Membership, Pass & Loyalty Metrics */}
            <div className="col-12 col-lg-7">
              <div className="card border-0 shadow-sm rounded-4 p-3 p-md-4 bg-white h-100">
                <h5 className="h6 fw-bold text-dark mb-1">Membership Plans &amp; Loyalty Rewards Analytics</h5>
                <span className="text-3xs text-muted mb-3 d-block">Subscription revenue, monthly parking passes, and points balance</span>

                <div className="row g-2 mb-3">
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 rounded-3 bg-light border text-center">
                      <span className="text-3xs text-muted text-uppercase fw-bold">Active Memberships</span>
                      <strong className="h5 text-primary d-block my-1">{data?.membership_loyalty?.active_memberships}</strong>
                      <span className="text-3xs text-muted">₹{Number(data?.membership_loyalty?.membership_revenue).toFixed(0)} intake</span>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 rounded-3 bg-light border text-center">
                      <span className="text-3xs text-muted text-uppercase fw-bold">Monthly Passes</span>
                      <strong className="h5 text-teal d-block my-1">{data?.membership_loyalty?.active_monthly_passes}</strong>
                      <span className="text-3xs text-muted">₹{Number(data?.membership_loyalty?.monthly_pass_revenue).toFixed(0)} intake</span>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 rounded-3 bg-light border text-center">
                      <span className="text-3xs text-muted text-uppercase fw-bold">Points Earned</span>
                      <strong className="h5 text-success d-block my-1">+{data?.membership_loyalty?.points_earned}</strong>
                      <span className="text-3xs text-muted">In period</span>
                    </div>
                  </div>
                  <div className="col-6 col-md-3">
                    <div className="p-2.5 rounded-3 bg-light border text-center">
                      <span className="text-3xs text-muted text-uppercase fw-bold">Points Redeemed</span>
                      <strong className="h5 text-danger d-block my-1">-{data?.membership_loyalty?.points_redeemed}</strong>
                      <span className="text-3xs text-muted">Discounts applied</span>
                    </div>
                  </div>
                </div>

                {/* Loyalty Tier Distribution */}
                <h6 className="fw-bold text-xs text-muted text-uppercase mb-2">Customer Loyalty Tier Distribution</h6>
                <div className="row g-2">
                  {Object.entries(data?.membership_loyalty?.tier_distribution || {}).map(([tier, count]) => {
                    const tierColors = {
                      Bronze: 'bg-secondary',
                      Silver: 'bg-slate-400',
                      Gold: 'bg-warning text-dark',
                      Platinum: 'bg-dark text-white',
                    };
                    return (
                      <div key={tier} className="col-6 col-sm-3">
                        <div className="p-2 rounded-3 border bg-slate-50 d-flex justify-content-between align-items-center">
                          <span className={`badge ${tierColors[tier] || 'bg-light text-dark'} text-3xs`}>
                            {tier}
                          </span>
                          <strong className="text-xs text-dark">{count} users</strong>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-auto pt-3 border-top text-3xs text-muted d-flex justify-content-between align-items-center">
                  <span>System Unredeemed Points Liability: <strong>{data?.membership_loyalty?.total_points_liability} pts</strong></span>
                  <Link to="/admin/memberships" className="text-primary text-decoration-none hover-underline">
                    Manage Plans &amp; Tiers →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default BusinessIntelligenceDashboard;

