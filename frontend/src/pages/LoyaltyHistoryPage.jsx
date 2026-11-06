import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  ArrowLeft,
  Coins,
  Filter,
  Search,
  CheckCircle2,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotification } from '../context/NotificationContext';
import membershipLoyaltyService from '../services/membershipLoyaltyService';
import LoadingSpinner from '../components/LoadingSpinner';
import { formatDateTime } from '../utils/formatters';

export function LoyaltyHistoryPage() {
  const { user } = useAuth();
  const { showError } = useNotification();

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    async function loadLedger() {
      setLoading(true);
      try {
        const data = await membershipLoyaltyService.getLoyaltyHistory();
        setTransactions(Array.isArray(data) ? data : (data.results || []));
      } catch (err) {
        console.error('Error loading loyalty ledger:', err);
        showError('Failed to load transaction ledger.');
      } finally {
        setLoading(false);
      }
    }
    loadLedger();
  }, []);

  const filtered = transactions.filter((tx) => {
    if (filterType !== 'all' && tx.transaction_type !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchDesc = tx.description?.toLowerCase().includes(q);
      const matchRef = tx.reference_id?.toLowerCase().includes(q);
      if (!matchDesc && !matchRef) return false;
    }
    return true;
  });

  return (
    <div className="container-fluid max-w-7xl px-0 py-2">
      {/* Top back navigation */}
      <Link
        to="/rewards"
        className="text-slate-600 text-sm fw-medium text-decoration-none d-inline-flex align-items-center gap-1 mb-3 hover-text-primary"
      >
        <ArrowLeft size={16} /> Back to Rewards Dashboard
      </Link>

      {/* Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h1 className="fs-3 fw-black text-slate-900 mb-1 d-flex align-items-center gap-2">
            <History size={26} className="text-primary" /> Rewards Transaction Ledger
          </h1>
          <p className="text-slate-500 text-sm mb-0">
            Immutable audit record of all earned, redeemed, refunded, and adjusted points.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card rounded-4 border-slate-200 shadow-sm p-3 mb-4 bg-white">
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4">
            <div className="input-group input-group-sm">
              <span className="input-group-text bg-slate-50 border-slate-200 text-slate-400">
                <Search size={14} />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search reference ID or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="col-12 col-md-8 d-flex flex-wrap gap-1 justify-content-md-end">
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'all' ? 'btn-primary' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('all')}
            >
              All Events
            </button>
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'earned' ? 'btn-success' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('earned')}
            >
              Points Earned
            </button>
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'redeemed' ? 'btn-primary' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('redeemed')}
            >
              Points Redeemed
            </button>
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'refunded' ? 'btn-info' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('refunded')}
            >
              Points Refunded
            </button>
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'reversed' ? 'btn-danger' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('reversed')}
            >
              Points Reversed
            </button>
            <button
              type="button"
              className={`btn btn-xs rounded-2 px-2.5 py-1 ${filterType === 'adjusted_admin' ? 'btn-warning text-dark' : 'btn-light border text-slate-600'}`}
              onClick={() => setFilterType('adjusted_admin')}
            >
              Admin Adjustments
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="py-5 text-center">
          <LoadingSpinner size="lg" message="Loading transaction ledger..." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card rounded-4 border border-dashed border-2 border-slate-300 p-5 text-center bg-slate-50">
          <div className="w-16 h-16 mx-auto rounded-circle bg-slate-100 text-slate-400 d-flex align-items-center justify-content-center mb-3">
            <History size={32} />
          </div>
          <h2 className="fs-5 fw-bold text-slate-800 mb-1">No transaction records match your filter</h2>
          <p className="text-slate-500 text-sm max-w-md mx-auto mb-3">
            Try adjusting your search criteria or filter to see previous events.
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                setFilterType('all');
                setSearchQuery('');
              }}
              className="btn btn-sm btn-outline-secondary px-3"
            >
              Clear Filters
            </button>
          </div>
        </div>
      ) : (
        <div className="card rounded-4 border-slate-200 shadow-sm overflow-hidden">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-sm">
              <thead className="bg-slate-50 text-slate-500 text-2xs text-uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-3">Description</th>
                  <th className="py-3 px-3">Reference ID</th>
                  <th className="py-3 px-3">Date &amp; Time</th>
                  <th className="py-3 px-3 text-end">Points Delta</th>
                  <th className="py-3 px-4 text-end">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((tx) => {
                  const isPositive = tx.points > 0;
                  return (
                    <tr key={tx.id}>
                      <td className="py-3 px-4">
                        <span
                          className={`badge text-2xs px-2.5 py-1 ${
                            tx.transaction_type === 'earned'
                              ? 'bg-success-subtle text-success'
                              : tx.transaction_type === 'redeemed'
                              ? 'bg-primary-subtle text-primary'
                              : tx.transaction_type === 'reversed'
                              ? 'bg-danger-subtle text-danger'
                              : tx.transaction_type === 'refunded'
                              ? 'bg-info-subtle text-info'
                              : 'bg-warning-subtle text-warning-emphasis'
                          }`}
                        >
                          {tx.transaction_type_display || tx.transaction_type}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-800 text-xs font-medium">
                        {tx.description}
                      </td>
                      <td className="py-3 px-3 text-slate-400 font-monospace text-2xs">
                        {tx.reference_id}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-xs">
                        {new Date(tx.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-end">
                        <span className={`fw-black text-sm ${isPositive ? 'text-success' : 'text-danger'}`}>
                          {isPositive ? `+${tx.points}` : tx.points} pts
                        </span>
                      </td>
                      <td className="py-3 px-4 text-end fw-bold text-slate-800 text-xs font-monospace">
                        {tx.balance_after} pts
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default LoyaltyHistoryPage;
