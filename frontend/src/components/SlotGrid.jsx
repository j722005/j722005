import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Car,
  Bike,
  Zap,
  RotateCw,
  Layers,
  Shield,
  Sun,
  Info,
  X,
  CheckCircle,
} from 'lucide-react';
import SlotCard from './SlotCard';
import EmptyState from './EmptyState';

export function SlotGrid({
  slots = [],
  onSelectSlot,
  selectedSlot,
  isRefreshing = false,
  onRefresh,
}) {
  const [vehicleFilter, setVehicleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [floorFilter, setFloorFilter] = useState('all');
  const [coveredFilter, setCoveredFilter] = useState('all'); // 'all' | 'covered' | 'uncovered'
  const [searchQuery, setSearchQuery] = useState('');

  // Extract available distinct floors from slots
  const availableFloors = useMemo(() => {
    const floors = new Set();
    slots.forEach((s) => {
      if (s.floor) floors.add(s.floor);
    });
    return Array.from(floors).sort();
  }, [slots]);

  // Check if backend data includes covered attributes
  const hasCoveredData = useMemo(() => {
    return slots.some((s) => s.is_covered !== undefined);
  }, [slots]);

  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      // Vehicle type filter
      if (vehicleFilter !== 'all' && slot.slot_type !== vehicleFilter) {
        return false;
      }
      // Status filter
      if (statusFilter !== 'all' && slot.status !== statusFilter) {
        return false;
      }
      // Floor filter
      if (floorFilter !== 'all' && slot.floor !== floorFilter) {
        return false;
      }
      // Covered filter
      if (coveredFilter !== 'all') {
        if (coveredFilter === 'covered' && !slot.is_covered) return false;
        if (coveredFilter === 'uncovered' && slot.is_covered) return false;
      }
      // Search slot number
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        return slot.slot_number.toLowerCase().includes(query);
      }
      return true;
    });
  }, [slots, vehicleFilter, statusFilter, floorFilter, coveredFilter, searchQuery]);

  // Statistics counts
  const counts = useMemo(() => {
    return {
      total: slots.length,
      available: slots.filter((s) => s.status === 'available').length,
      reserved: slots.filter((s) => s.status === 'reserved').length,
      occupied: slots.filter((s) => s.status === 'occupied').length,
      maintenance: slots.filter((s) => s.status === 'maintenance' || !s.is_active).length,
    };
  }, [slots]);

  const handleResetFilters = () => {
    setVehicleFilter('all');
    setStatusFilter('all');
    setFloorFilter('all');
    setCoveredFilter('all');
    setSearchQuery('');
  };

  const hasActiveFilters =
    vehicleFilter !== 'all' ||
    statusFilter !== 'all' ||
    floorFilter !== 'all' ||
    coveredFilter !== 'all' ||
    searchQuery.trim() !== '';

  return (
    <div className="slot-grid-wrapper position-relative">
      {/* Interactive Status Legend & Accessible Quick Filter Pills */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-3 bg-white">
        <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2 pb-2 border-bottom border-light">
          <div className="d-flex align-items-center gap-2">
            <span className="small text-dark fw-bold">Bay Status Legend:</span>
            <span className="text-muted text-xs d-none d-sm-inline">
              (Filter grid by clicking any status badge below)
            </span>
          </div>

          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="btn btn-outline-secondary btn-sm rounded-pill text-2xs px-3 py-1 d-inline-flex align-items-center gap-1.5"
              title="Refetch live availability from server"
            >
              <RotateCw size={12} className={isRefreshing ? 'spin' : ''} />
              {isRefreshing ? 'Checking...' : 'Refresh Availability'}
            </button>
          )}
        </div>

        {/* Legend buttons with accessible status counts */}
        <div className="d-flex flex-wrap gap-2 align-items-center" role="toolbar" aria-label="Slot Status Filter Toolbar">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
              statusFilter === 'all' ? 'btn-dark' : 'btn-light border text-muted'
            }`}
            aria-pressed={statusFilter === 'all'}
          >
            All Bays ({counts.total})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('available')}
            className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
              statusFilter === 'available'
                ? 'btn-success shadow-xs'
                : 'btn-outline-success text-success bg-white'
            }`}
            aria-pressed={statusFilter === 'available'}
            title="Available: Ready for immediate reservation in this time interval"
          >
            ● Available ({counts.available})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('reserved')}
            className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
              statusFilter === 'reserved'
                ? 'btn-warning text-dark shadow-xs'
                : 'btn-outline-warning text-dark bg-white'
            }`}
            aria-pressed={statusFilter === 'reserved'}
            title="Reserved: Has an upcoming scheduled hold or booking"
          >
            ● Reserved ({counts.reserved})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('occupied')}
            className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
              statusFilter === 'occupied'
                ? 'btn-danger shadow-xs'
                : 'btn-outline-danger text-danger bg-white'
            }`}
            aria-pressed={statusFilter === 'occupied'}
            title="Occupied: Vehicle currently parked during selected interval"
          >
            ● Occupied ({counts.occupied})
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter('maintenance')}
            className={`btn btn-sm rounded-pill text-xs px-3 py-1 transition-all ${
              statusFilter === 'maintenance'
                ? 'btn-secondary text-white shadow-xs'
                : 'btn-outline-secondary text-muted bg-white'
            }`}
            aria-pressed={statusFilter === 'maintenance'}
            title="Maintenance: Temporarily out of service"
          >
            ● Maintenance ({counts.maintenance})
          </button>
        </div>
      </div>

      {/* Filter and Search Bar for Slots */}
      <div className="card border-0 shadow-sm rounded-4 p-3 mb-4 bg-white">
        <div className="row g-2 align-items-center">
          {/* Slot Number Search */}
          <div className="col-12 col-md-4 col-lg-3">
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted ps-2.5">
                <Search size={15} />
              </span>
              <input
                type="text"
                className="form-control border-slate-300 shadow-none ps-2 text-xs"
                placeholder="Search slot (e.g. S-01)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search slot number"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="btn btn-light border-slate-300 text-muted px-2"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* Vehicle Type Toggle */}
          <div className="col-12 col-md-8 col-lg-5 d-flex flex-wrap gap-1">
            <div className="btn-group w-100 shadow-xs rounded-3 bg-light p-1 border">
              <button
                type="button"
                onClick={() => setVehicleFilter('all')}
                className={`btn btn-sm rounded-2 text-xs py-1 ${
                  vehicleFilter === 'all' ? 'btn-primary' : 'btn-light border-0 text-muted'
                }`}
              >
                All Types
              </button>
              <button
                type="button"
                onClick={() => setVehicleFilter('car')}
                className={`btn btn-sm rounded-2 text-xs py-1 d-inline-flex align-items-center justify-content-center gap-1 ${
                  vehicleFilter === 'car' ? 'btn-primary' : 'btn-light border-0 text-muted'
                }`}
              >
                <Car size={13} /> Cars
              </button>
              <button
                type="button"
                onClick={() => setVehicleFilter('bike')}
                className={`btn btn-sm rounded-2 text-xs py-1 d-inline-flex align-items-center justify-content-center gap-1 ${
                  vehicleFilter === 'bike' ? 'btn-primary' : 'btn-light border-0 text-muted'
                }`}
              >
                <Bike size={13} /> Bikes
              </button>
              <button
                type="button"
                onClick={() => setVehicleFilter('ev')}
                className={`btn btn-sm rounded-2 text-xs py-1 d-inline-flex align-items-center justify-content-center gap-1 ${
                  vehicleFilter === 'ev' ? 'btn-primary' : 'btn-light border-0 text-muted'
                }`}
              >
                <Zap size={13} className="text-warning" /> EV Rapid
              </button>
            </div>
          </div>

          {/* Floor & Covered Parking Filters (when supported by backend data) */}
          <div className="col-6 col-md-6 col-lg-2">
            <div className="input-group">
              <span className="input-group-text bg-light border-slate-300 text-muted px-2">
                <Layers size={13} />
              </span>
              <select
                className="form-select border-slate-300 shadow-none text-xs"
                value={floorFilter}
                onChange={(e) => setFloorFilter(e.target.value)}
                aria-label="Filter by floor level"
              >
                <option value="all">All Floors</option>
                {availableFloors.map((floor) => (
                  <option key={floor} value={floor}>
                    {floor}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Covered Parking Toggle */}
          <div className="col-6 col-md-6 col-lg-2">
            <select
              className="form-select border-slate-300 shadow-none text-xs"
              value={coveredFilter}
              onChange={(e) => setCoveredFilter(e.target.value)}
              aria-label="Filter by covered parking"
            >
              <option value="all">All Parking</option>
              <option value="covered">🛡️ Covered Only</option>
              <option value="uncovered">☀️ Open Air Only</option>
            </select>
          </div>
        </div>

        {/* Active Filters Bar */}
        {hasActiveFilters && (
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2 pt-2 border-top border-light">
            <span className="text-3xs text-muted fw-semibold">Filtered by:</span>
            {vehicleFilter !== 'all' && (
              <span className="badge bg-light text-dark border text-3xs">
                Type: {vehicleFilter.toUpperCase()}
              </span>
            )}
            {statusFilter !== 'all' && (
              <span className="badge bg-light text-dark border text-3xs">
                Status: {statusFilter.toUpperCase()}
              </span>
            )}
            {floorFilter !== 'all' && (
              <span className="badge bg-light text-dark border text-3xs">
                Floor: {floorFilter}
              </span>
            )}
            {coveredFilter !== 'all' && (
              <span className="badge bg-light text-dark border text-3xs">
                {coveredFilter === 'covered' ? 'Covered Bays' : 'Open Air Bays'}
              </span>
            )}
            {searchQuery && (
              <span className="badge bg-light text-dark border text-3xs">
                Query: "{searchQuery}"
              </span>
            )}
            <button
              onClick={handleResetFilters}
              className="btn btn-link text-primary text-3xs p-0 ms-auto text-decoration-none fw-semibold"
            >
              Reset Slot Filters
            </button>
          </div>
        )}
      </div>

      {/* Live Refreshing Indicator */}
      {isRefreshing && (
        <div
          className="position-absolute top-0 start-0 w-100 h-100 bg-white bg-opacity-75 d-flex flex-column align-items-center justify-content-center rounded-4 z-3 backdrop-blur"
          style={{ minHeight: '300px' }}
        >
          <div className="spinner-border text-primary mb-2" role="status">
            <span className="visually-hidden">Refreshing slot availability...</span>
          </div>
          <p className="text-dark fw-semibold text-xs mb-0">
            Checking live bay availability for selected time window...
          </p>
        </div>
      )}

      {/* Grid of Slots */}
      {filteredSlots.length > 0 ? (
        <div className="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-6 g-3">
          {filteredSlots.map((slot) => (
            <div className="col" key={slot.id}>
              <SlotCard
                slot={slot}
                onSelect={onSelectSlot}
                isSelected={selectedSlot?.id === slot.id}
              />
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Filter}
          title="No parking bays match your filter criteria"
          description="Try selecting a different floor, vehicle type, or resetting filters to see available parking slots."
          actionText="Reset All Filters"
          onAction={handleResetFilters}
        />
      )}
    </div>
  );
}

export default SlotGrid;
