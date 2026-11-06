import React, { useState, useEffect, useCallback } from 'react';
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
  LifeBuoy,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  UserPlus,
  Briefcase,
  Layers,
  BarChart2,
  PieChart,
} from 'lucide-react';
import supportService from '../services/supportService';
import LoadingSpinner from '../components/LoadingSpinner';
import StatusBadge from '../components/StatusBadge';
import { formatDateTime } from '../utils/formatters';

// Register Chart.js components
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

export function AdminSupportDashboardPage() {
  const [analytics, setAnalytics] = useState(null);
  const [recentTickets, setRecentTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsData, ticketsData] = await Promise.all([
        supportService.getAnalytics(),
        supportService.getTickets({ status: 'all' }),
      ]);
      setAnalytics(analyticsData);
      setRecentTickets(Array.isArray(ticketsData) ? ticketsData.slice(0, 8) : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load support analytics.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return <LoadingSpinner message="Calculating support resolution metrics and ticket charts..." />;
  }

  const overview = analytics?.overview || {};

  // Doughnut Chart Data for Categories
  const categoryLabels = Object.values(analytics?.categories || {}).map((c) => c.label);
  const categoryCounts = Object.values(analytics?.categories || {}).map((c) => c.count);

  const categoryChartData = {
    labels: categoryLabels.length ? categoryLabels : ['No Data'],
    datasets: [
      {
        data: categoryCounts.length && categoryCounts.some((x) => x > 0) ? categoryCounts : [1],
        backgroundColor: [
          '#3b82f6', // blue
          '#10b981', // green
          '#f59e0b', // amber
          '#8b5cf6', // purple
          '#ef4444', // red
          '#06b6d4', // cyan
          '#64748b', // slate
        ],
        borderWidth: 2,
        borderColor: '#ffffff',
      },
    ],
  };

  // Line Chart Data for 14-day trends
  const trendLabels = (analytics?.trends || []).map((t) => t.date);
  const trendCreated = (analytics?.trends || []).map((t) => t.created);
  const trendResolved = (analytics?.trends || []).map((t) => t.resolved);

  const trendChartData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Tickets Created',
        data: trendCreated,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
      },
      {
        label: 'Tickets Resolved',
        data: trendResolved,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.05)',
        fill: true,
        tension: 0.35,
        borderWidth: 2,
        pointRadius: 3,
      },
    ],
  };

  // Bar Chart Data for Priority Breakdown
  const priorities = analytics?.priorities || { low: 0, medium: 0, high: 0 };
  const priorityChartData = {
    labels: ['Low Priority', 'Medium Priority', 'High Priority'],
    datasets: [
      {
        label: 'Active Tickets by Priority',
        data: [priorities.low || 0, priorities.medium || 0, priorities.high || 0],
        backgroundColor: ['#94a3b8', '#f59e0b', '#ef4444'],
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="admin-support-dashboard container-fluid px-0">
      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <div className="d-flex align-items-center gap-2 mb-1">
            <span className="badge bg-primary text-white text-3xs px-2 py-1 font-monospace">EXECUTIVE REPORT</span>
            <span className="text-muted text-2xs">System Performance & SLA Metrics</span>
          </div>
          <h2 className="fw-bold tracking-tight text-dark mb-0.5">Support & Complaint Analytics</h2>
          <p className="text-muted small mb-0">
            Real-time analytics for resolution velocity, complaint category distribution, and operator workloads.
          </p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <button
            onClick={loadData}
            className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-flex align-items-center gap-1.5"
            title="Refresh metrics"
          >
            <RotateCw size={14} className={loading ? 'spin' : ''} /> Refresh Metrics
          </button>
          <Link
            to="/staff/tickets"
            className="btn btn-primary rounded-3 px-3.5 py-2 text-xs d-flex align-items-center gap-1.5 shadow-xs"
          >
            <Briefcase size={15} /> Open Staff Queue
          </Link>
        </div>
      </div>

      {/* Top 5 KPI Cards */}
      <div className="row g-3 mb-4">
        <div className="col-12 col-sm-6 col-lg">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Total Tickets Logged</div>
            <div className="fs-3 fw-black text-dark">{overview.total_tickets || 0}</div>
            <div className="text-3xs text-muted mt-1">All-time customer requests</div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Resolution Rate</div>
            <div className="fs-3 fw-black text-success">{overview.resolution_rate || 0}%</div>
            <div className="text-3xs text-success mt-1">Resolved or closed tickets</div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Avg Resolution Time</div>
            <div className="fs-3 fw-black text-primary">{overview.avg_resolution_hours || 0} hrs</div>
            <div className="text-3xs text-muted mt-1">Creation to verified resolution</div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Active Backlog</div>
            <div className="fs-3 fw-black text-warning-emphasis">
              {(overview.open_tickets || 0) + (overview.in_progress_tickets || 0)}
            </div>
            <div className="text-3xs text-muted mt-1">Open & in-progress inquiries</div>
          </div>
        </div>

        <div className="col-12 col-sm-6 col-lg">
          <div className="card border-0 shadow-sm rounded-4 p-3 bg-white h-100">
            <div className="text-3xs text-uppercase fw-bold text-muted mb-1">Unassigned Queue</div>
            <div className="fs-3 fw-black text-danger">{overview.unassigned_tickets || 0}</div>
            <div className="text-3xs text-danger mt-1">Requires staff claiming</div>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="row g-4 mb-4">
        {/* Trend Area Chart */}
        <div className="col-12 col-xl-8">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="fw-bold tracking-tight text-dark mb-0.5">14-Day Ticket Volume & Resolution Velocity</h5>
                <p className="text-muted text-xs mb-0">Daily volume of incoming complaints vs solved cases</p>
              </div>
              <span className="badge bg-light text-slate-700 border text-3xs">Daily Trends</span>
            </div>
            <div style={{ height: '280px' }}>
              <Line
                data={trendChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                  },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                    x: { ticks: { font: { size: 10 } } },
                  },
                }}
              />
            </div>
          </div>
        </div>

        {/* Category Breakdown Doughnut */}
        <div className="col-12 col-xl-4">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="mb-3">
              <h5 className="fw-bold tracking-tight text-dark mb-0.5">Category Breakdown</h5>
              <p className="text-muted text-xs mb-0">Complaints classified by module origin</p>
            </div>
            <div style={{ height: '230px' }}>
              <Doughnut
                data={categoryChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                  },
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Priority Distribution & Recent Tickets */}
      <div className="row g-4 mb-4">
        {/* Priority Bar Chart */}
        <div className="col-12 col-lg-5">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="mb-3">
              <h5 className="fw-bold tracking-tight text-dark mb-0.5">Urgency & Priority Distribution</h5>
              <p className="text-muted text-xs mb-0">Active complaints by severity level</p>
            </div>
            <div style={{ height: '240px' }}>
              <Bar
                data={priorityChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                  },
                  scales: {
                    y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 10 } } },
                    x: { ticks: { font: { size: 11 } } },
                  },
                }}
              />
            </div>
          </div>
        </div>

        {/* Recent Tickets Table */}
        <div className="col-12 col-lg-7">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="fw-bold tracking-tight text-dark mb-0.5">Recent Complaints & Tickets</h5>
                <p className="text-muted text-xs mb-0">Latest customer activities across all lots</p>
              </div>
              <Link to="/staff/tickets" className="text-xs text-primary fw-medium text-decoration-none">
                View All Queue →
              </Link>
            </div>

            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0 text-xs">
                <thead>
                  <tr className="text-muted text-3xs text-uppercase border-bottom">
                    <th>Ticket</th>
                    <th>Customer</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th className="text-end">Manage</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTickets.map((t) => (
                    <tr key={t.id || t.ticket_id}>
                      <td style={{ maxWidth: '200px' }}>
                        <span className="badge bg-slate-900 text-white font-monospace text-3xs px-2 py-0.5 rounded-2 d-inline-block mb-0.5">
                          {t.ticket_id}
                        </span>
                        <div className="fw-semibold text-dark text-truncate">{t.subject}</div>
                      </td>
                      <td>@{t.user_username}</td>
                      <td>
                        <StatusBadge type="priority" status={t.priority} />
                      </td>
                      <td>
                        <StatusBadge type="ticket" status={t.status} />
                      </td>
                      <td className="text-end">
                        <Link
                          to={`/support/${t.ticket_id}`}
                          className="btn btn-sm btn-outline-primary rounded-2 px-2.5 py-0.5 text-3xs"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminSupportDashboardPage;
