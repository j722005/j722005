import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Search,
  MapPin,
  SlidersHorizontal,
  ArrowUpDown,
  Car,
  Bike,
  Zap,
  RotateCw,
  AlertCircle,
  X,
  IndianRupee,
  ShieldCheck,
  CheckCircle,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import parkingService from '../services/parkingService';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { formatCurrency } from '../utils/formatters';

export function ParkingLotsPage() {
  const [lots, setLots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [search, setSearch] = useState('');
  const [maxPrice, setMaxPrice] = useState('all');
  const [vehicleType, setVehicleType] = useState('all');
  const [sortBy, setSortBy] = useState('default'); // 'default' | 'price_asc' | 'price_desc' | 'avail_desc' | 'name_asc'

  const fetchLots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (search.trim()) params.search = search.trim();
      if (maxPrice !== 'all') params.max_price = maxPrice;
      if (vehicleType !== 'all') params.vehicle_type = vehicleType;

      const data = await parkingService.getLots(params);
      setLots(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Failed to fetch parking locations. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [search, maxPrice, vehicleType]);

  useEffect(() => {
    fetchLots();
  }, [fetchLots]);

  // Client-side filtering & sorting for smooth UX
  const filteredAndSortedLots = useMemo(() => {
    let result = [...lots];

    // Client search filter (by name or address) as secondary filter
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (lot) =>
          lot.name?.toLowerCase().includes(q) ||
          lot.location?.toLowerCase().includes(q) ||
          lot.description?.toLowerCase().includes(q)
      );
    }

    // Client price filter
    if (maxPrice !== 'all') {
      const limit = Number(maxPrice);
      result = result.filter((lot) => Number(lot.price_per_hour) <= limit);
    }

    // Client vehicle type filter (if lot has slots of this type or in metadata)
    if (vehicleType !== 'all') {
      result = result.filter((lot) => {
        // If lot serializer returns vehicle_types or we allow all lots matching backend
        return true;
      });
    }

    // Sorting
    if (sortBy === 'price_asc') {
      result.sort((a, b) => Number(a.price_per_hour) - Number(b.price_per_hour));
    } else if (sortBy === 'price_desc') {
      result.sort((a, b) => Number(b.price_per_hour) - Number(a.price_per_hour));
    } else if (sortBy === 'avail_desc') {
      result.sort((a, b) => (b.available_slots_count || 0) - (a.available_slots_count || 0));
    } else if (sortBy === 'name_asc') {
      result.sort((a, b) => a.name.localeCompare(b.name));
    }

    return result;
  }, [lots, search, maxPrice, vehicleType, sortBy]);

  const handleResetFilters = () => {
    setSearch('');
    setMaxPrice('all');
    setVehicleType('all');
    setSortBy('default');
  };

  const hasActiveFilters = search.trim() !== '' || maxPrice !== 'all' || vehicleType !== 'all' || sortBy !== 'default';

  return (
    <div className="parking-lots-page container-fluid px-0">
      {/* Page Header */}
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">Find & Reserve Parking</h2>
          <p className="text-muted small mb-0">
            Browse verified parking hubs with real-time slot availability, instant booking, and transparent pricing.
          </p>
        </div>
        <button
          onClick={fetchLots}
          disabled={loading}
          className="btn btn-outline-secondary rounded-3 px-3 py-2 text-xs d-inline-flex align-items-center gap-1.5 self-start align-self-md-auto"
          title="Refresh parking lot availability from server"
        >
          <RotateCw size={14} className={loading ? 'spin' : ''} />
          {loading ? 'Refreshing...' : 'Refresh Hubs'}
        </button>
      </div>

      {/* Smart Recommendation Feature Banner */}
      <div className="card border-0 rounded-4 p-3.5 mb-4 text-white bg-navy-hero shadow-sm">
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
          <div className="d-flex align-items-center gap-3">
            <div className="p-2.5 rounded-3 bg-white bg-opacity-15 text-warning">
              <Sparkles size={24} />
            </div>
            <div>
              <h6 className="fw-bold mb-0 text-white">Smart Parking Recommendation Engine</h6>
              <p className="text-slate-300 text-xs mb-0">
                Search by destination, vehicle type & duration to get multi-factor scoring (availability, cost & GPS distance).
              </p>
            </div>
          </div>
          <Link
            to="/recommendations"
            className="btn btn-warning text-dark btn-sm rounded-3 px-3.5 py-2 fw-semibold d-inline-flex align-items-center gap-1.5 shadow-sm text-nowrap"
          >
            <span>Launch Recommender</span>
            <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
        <div className="row g-3">
          {/* Search by Name and Address */}
          <div className="col-12 col-lg-5">
            <label className="form-label text-xs fw-semibold text-muted mb-1" htmlFor="hubSearchInput">
              Search by Location or Hub Name
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted ps-3">
                <Search size={16} />
              </span>
              <input
                id="hubSearchInput"
                type="text"
                className="form-control border-slate-300 shadow-none ps-2"
                placeholder="Search name, street, or address (e.g. Anna Nagar, Central, OMR)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="btn btn-light border-slate-300 text-muted"
                  aria-label="Clear search text"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Price Filter */}
          <div className="col-6 col-sm-4 col-lg-2">
            <label className="form-label text-xs fw-semibold text-muted mb-1" htmlFor="priceFilterSelect">
              Max Hourly Rate
            </label>
            <select
              id="priceFilterSelect"
              className="form-select border-slate-300 shadow-none text-xs"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            >
              <option value="all">Any Price</option>
              <option value="20">Under ₹20 / hr</option>
              <option value="30">Under ₹30 / hr</option>
              <option value="40">Under ₹40 / hr</option>
              <option value="60">Under ₹60 / hr</option>
            </select>
          </div>

          {/* Vehicle Type Filter */}
          <div className="col-6 col-sm-4 col-lg-2">
            <label className="form-label text-xs fw-semibold text-muted mb-1" htmlFor="vehicleTypeSelect">
              Vehicle Type
            </label>
            <select
              id="vehicleTypeSelect"
              className="form-select border-slate-300 shadow-none text-xs"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              <option value="all">All Vehicles</option>
              <option value="car">🚗 4-Wheeler / Car</option>
              <option value="bike">🏍️ 2-Wheeler / Bike</option>
              <option value="ev">⚡ EV Charging</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="col-12 col-sm-4 col-lg-3">
            <label className="form-label text-xs fw-semibold text-muted mb-1" htmlFor="sortSelect">
              Sort Results
            </label>
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted text-xs">
                <ArrowUpDown size={13} />
              </span>
              <select
                id="sortSelect"
                className="form-select border-slate-300 shadow-none text-xs"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="default">Default Order</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="avail_desc">Availability: Most Slots First</option>
                <option value="name_asc">Name: Alphabetical (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Active Filters Badges & Reset Button */}
        {hasActiveFilters && (
          <div className="d-flex flex-wrap align-items-center gap-2 mt-3 pt-2 border-top border-light">
            <span className="text-2xs text-muted fw-semibold">Active Filters:</span>
            {search.trim() && (
              <span className="badge bg-light text-dark border px-2.5 py-1 text-2xs d-flex align-items-center gap-1">
                Keyword: "{search}"
                <X size={12} className="cursor-pointer" onClick={() => setSearch('')} />
              </span>
            )}
            {maxPrice !== 'all' && (
              <span className="badge bg-light text-dark border px-2.5 py-1 text-2xs d-flex align-items-center gap-1">
                Max Price: ₹{maxPrice}/hr
                <X size={12} className="cursor-pointer" onClick={() => setMaxPrice('all')} />
              </span>
            )}
            {vehicleType !== 'all' && (
              <span className="badge bg-light text-dark border px-2.5 py-1 text-2xs d-flex align-items-center gap-1">
                Vehicle: {vehicleType.toUpperCase()}
                <X size={12} className="cursor-pointer" onClick={() => setVehicleType('all')} />
              </span>
            )}
            {sortBy !== 'default' && (
              <span className="badge bg-light text-dark border px-2.5 py-1 text-2xs d-flex align-items-center gap-1">
                Sorted
                <X size={12} className="cursor-pointer" onClick={() => setSortBy('default')} />
              </span>
            )}
            <button
              onClick={handleResetFilters}
              className="btn btn-link text-primary text-2xs p-0 ms-auto text-decoration-none fw-semibold"
            >
              Reset All Filters
            </button>
          </div>
        )}
      </div>

      {/* Error state with retry action */}
      {error && (
        <div className="alert alert-danger shadow-sm rounded-4 p-4 mb-4 d-flex align-items-start gap-3" role="alert">
          <AlertCircle size={24} className="text-danger flex-shrink-0 mt-0.5" />
          <div className="flex-grow-1">
            <h5 className="fw-bold mb-1">Failed to Load Parking Hubs</h5>
            <p className="text-sm mb-2">{error}</p>
            <button
              onClick={fetchLots}
              className="btn btn-sm btn-outline-danger rounded-3 px-3 py-1.5 text-xs fw-semibold d-inline-flex align-items-center gap-1.5"
            >
              <RotateCw size={13} /> Retry Loading
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading ? (
        <LoadingSpinner message="Scanning real-time parking hubs and slot counts from Django..." />
      ) : filteredAndSortedLots.length > 0 ? (
        <div className="row g-4">
          {filteredAndSortedLots.map((lot) => (
            <div className="col-md-6 col-xl-4" key={lot.id}>
              <div className="card h-100 border-0 shadow-sm rounded-4 overflow-hidden lot-card-hover transition-all bg-white d-flex flex-column">
                <div className="position-relative" style={{ height: '190px' }}>
                  <img
                    src={lot.image_url || 'https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=600&q=80'}
                    alt={lot.name}
                    className="w-100 h-100 object-fit-cover"
                    loading="lazy"
                  />
                  <div className="position-absolute top-0 end-0 m-3">
                    <span className="badge bg-dark bg-opacity-85 backdrop-blur text-white px-3 py-1.5 rounded-pill fs-6 fw-bold shadow-xs">
                      {formatCurrency(lot.price_per_hour)}/hr
                    </span>
                  </div>
                  <div className="position-absolute bottom-0 start-0 m-3">
                    <span className={`badge px-2.5 py-1 rounded-pill text-xs shadow-xs ${
                      lot.available_slots_count > 0 ? 'bg-emerald text-white' : 'bg-danger text-white'
                    }`}>
                      ● {lot.available_slots_count || 0} Available Now
                    </span>
                  </div>
                </div>

                <div className="card-body p-4 d-flex flex-column flex-grow-1">
                  <div className="mb-2">
                    <h5 className="fw-bold text-dark mb-1">{lot.name}</h5>
                    <p className="text-muted text-xs d-flex align-items-start gap-1.5 mb-2">
                      <MapPin size={14} className="text-primary flex-shrink-0 mt-0.5" />
                      <span>{lot.location}</span>
                    </p>
                  </div>

                  <p className="text-slate-600 text-xs line-clamp-2 mb-3">
                    {lot.description || 'Verified smart parking facility equipped with barrier automation and 24/7 security.'}
                  </p>

                  {/* Live occupancy status bar */}
                  <div className="mb-3">
                    <div className="d-flex justify-content-between text-2xs text-muted mb-1">
                      <span>Live Occupancy</span>
                      <strong className="text-dark">{lot.occupancy_percent || 0}%</strong>
                    </div>
                    <div className="progress rounded-pill bg-slate-100" style={{ height: '6px' }}>
                      <div
                        className={`progress-bar rounded-pill ${
                          (lot.occupancy_percent || 0) > 85
                            ? 'bg-danger'
                            : (lot.occupancy_percent || 0) > 60
                            ? 'bg-warning'
                            : 'bg-primary'
                        }`}
                        role="progressbar"
                        style={{ width: `${Math.min(100, lot.occupancy_percent || 0)}%` }}
                        aria-valuenow={lot.occupancy_percent || 0}
                        aria-valuemin="0"
                        aria-valuemax="100"
                      />
                    </div>
                  </div>

                  {/* Feature badges */}
                  <div className="d-flex flex-wrap gap-1.5 text-2xs mb-4">
                    <span className="badge bg-slate-100 text-slate-700 border">
                      {lot.active_slots_count || lot.total_slots} Total Bays
                    </span>
                    <span className="badge bg-slate-100 text-slate-700 border d-inline-flex align-items-center gap-1">
                      <Car size={11} /> Cars
                    </span>
                    <span className="badge bg-slate-100 text-slate-700 border d-inline-flex align-items-center gap-1">
                      <Bike size={11} /> Bikes
                    </span>
                    <span className="badge bg-slate-100 text-slate-700 border d-inline-flex align-items-center gap-1">
                      <Zap size={11} className="text-warning" /> EV Rapid
                    </span>
                  </div>

                  <Link
                    to={`/lots/${lot.id}`}
                    className="btn btn-primary rounded-3 w-100 mt-auto py-2.5 text-sm fw-medium shadow-xs d-flex align-items-center justify-content-center gap-2"
                  >
                    View Layout & Book Bay
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Search}
          title="No parking hubs match your criteria"
          description={
            hasActiveFilters
              ? 'No parking locations match your current search and filter combination. Try resetting your search or adjusting the price/vehicle filters.'
              : 'There are currently no active parking locations registered in the system.'
          }
          actionText={hasActiveFilters ? 'Clear All Filters' : 'Refresh Locations'}
          onAction={hasActiveFilters ? handleResetFilters : fetchLots}
        />
      )}
    </div>
  );
}

export default ParkingLotsPage;
