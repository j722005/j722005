import React, { useState, useEffect } from 'react';
import { Car, Bike, Zap, Plus, Trash2, Check, Star, ShieldAlert } from 'lucide-react';
import vehicleService from '../services/vehicleService';
import { useNotification } from '../context/NotificationContext';
import Modal from '../components/Modal';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';

export function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const [newVehicle, setNewVehicle] = useState({
    license_plate: '',
    vehicle_type: 'car',
    nickname: '',
    is_default: false,
  });

  const { showSuccess, showError } = useNotification();

  useEffect(() => {
    loadVehicles();
  }, []);

  async function loadVehicles() {
    try {
      const data = await vehicleService.getVehicles();
      setVehicles(data);
    } catch (err) {
      showError('Failed to load vehicles.');
    } finally {
      setLoading(false);
    }
  }

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const plate = newVehicle.license_plate.trim().toUpperCase();
    if (!plate) {
      setFormError('Please enter a vehicle license plate number.');
      return;
    }

    setSubmitting(true);
    try {
      await vehicleService.addVehicle({
        ...newVehicle,
        license_plate: plate,
      });
      showSuccess(`Vehicle ${plate} registered successfully!`);
      setIsModalOpen(false);
      setNewVehicle({
        license_plate: '',
        vehicle_type: 'car',
        nickname: '',
        is_default: false,
      });
      loadVehicles();
    } catch (err) {
      setFormError(err?.message || 'Failed to add vehicle.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id, plate) => {
    if (!window.confirm(`Are you sure you want to remove vehicle ${plate}?`)) return;
    try {
      await vehicleService.deleteVehicle(id);
      showSuccess(`Vehicle ${plate} removed.`);
      loadVehicles();
    } catch (err) {
      showError('Failed to remove vehicle.');
    }
  };

  const handleSetDefault = async (id, plate) => {
    try {
      await vehicleService.setDefaultVehicle(id);
      showSuccess(`${plate} set as your default vehicle.`);
      loadVehicles();
    } catch (err) {
      showError('Failed to set default vehicle.');
    }
  };

  const getVehicleIcon = (type) => {
    switch (type) {
      case 'bike':
        return <Bike size={22} className="text-muted" />;
      case 'ev':
        return <Zap size={22} className="text-warning" />;
      case 'car':
      default:
        return <Car size={22} className="text-primary" />;
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading saved vehicles..." />;
  }

  return (
    <div className="vehicles-page">
      {/* Page Header */}
      <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-3 mb-4">
        <div>
          <h2 className="fw-bold tracking-tight text-dark mb-1">My Vehicles</h2>
          <p className="text-muted small mb-0">
            Manage your registered automobiles for instant one-click parking reservations
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="btn btn-primary rounded-3 px-3.5 py-2 text-sm d-flex align-items-center gap-2 shadow-xs"
        >
          <Plus size={16} /> Register New Vehicle
        </button>
      </div>

      {/* Vehicles Grid */}
      {vehicles.length > 0 ? (
        <div className="row g-3">
          {vehicles.map((v) => (
            <div className="col-md-6 col-lg-4" key={v.id}>
              <div
                className={`card h-100 border rounded-4 p-4 shadow-sm bg-white transition-all position-relative ${
                  v.is_default ? 'border-primary ring-1 ring-primary' : 'border-slate-200'
                }`}
              >
                <div className="d-flex align-items-start justify-content-between mb-3">
                  <div className="d-flex align-items-center gap-3">
                    <div className="p-2.5 rounded-3 bg-light shadow-xs border">
                      {getVehicleIcon(v.vehicle_type)}
                    </div>
                    <div>
                      <h5 className="font-monospace fw-bold text-dark mb-0 tracking-wide">
                        {v.license_plate}
                      </h5>
                      <span className="text-muted text-xs text-capitalize">
                        {v.nickname || `${v.vehicle_type} vehicle`}
                      </span>
                    </div>
                  </div>

                  {v.is_default && (
                    <span className="badge bg-primary-subtle text-primary border border-primary-subtle text-2xs px-2 py-1 rounded-pill d-flex align-items-center gap-1">
                      <Star size={11} fill="currentColor" /> Default
                    </span>
                  )}
                </div>

                <div className="d-flex align-items-center justify-content-between mt-auto pt-3 border-top border-light">
                  {!v.is_default ? (
                    <button
                      onClick={() => handleSetDefault(v.id, v.license_plate)}
                      className="btn btn-sm btn-outline-secondary text-xs rounded-2 px-2.5 py-1"
                    >
                      Set as Default
                    </button>
                  ) : (
                    <span className="text-2xs text-muted">Primary Vehicle</span>
                  )}

                  <button
                    onClick={() => handleDelete(v.id, v.license_plate)}
                    className="btn btn-sm btn-light text-danger rounded-circle p-1.5 hover-bg-danger-subtle"
                    title="Remove Vehicle"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Car}
          title="No vehicles registered yet"
          description="Register your car or motorcycle license plate to quickly autofill your parking reservations."
          actionText="Register Vehicle"
          onAction={() => setIsModalOpen(true)}
        />
      )}

      {/* Add Vehicle Modal */}
      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title="Register New Vehicle"
          subtitle="Add your vehicle details for rapid check-in"
        >
          <form onSubmit={handleAddSubmit} noValidate>
            {formError && (
              <div className="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2 mb-3 rounded-3" role="alert">
                <ShieldAlert size={16} className="flex-shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="mb-3">
              <label className="form-label small fw-medium text-dark" htmlFor="plateInput">
                License Plate Number *
              </label>
              <input
                id="plateInput"
                type="text"
                className="form-control border-slate-300 font-monospace text-uppercase"
                placeholder="e.g. TN 07 AB 1234"
                value={newVehicle.license_plate}
                onChange={(e) =>
                  setNewVehicle({ ...newVehicle, license_plate: e.target.value.toUpperCase() })
                }
                required
              />
              <span className="text-3xs text-muted mt-1 d-block">
                Standard state-issued vehicle registration plate
              </span>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-medium text-dark" htmlFor="vehicleType">
                Vehicle Type
              </label>
              <select
                id="vehicleType"
                className="form-select border-slate-300 text-sm"
                value={newVehicle.vehicle_type}
                onChange={(e) =>
                  setNewVehicle({ ...newVehicle, vehicle_type: e.target.value })
                }
              >
                <option value="car">Car / 4-Wheeler</option>
                <option value="bike">Bike / Motorcycle / Two-Wheeler</option>
                <option value="ev">EV Charging Vehicle</option>
              </select>
            </div>

            <div className="mb-3">
              <label className="form-label small fw-medium text-dark" htmlFor="nicknameInput">
                Nickname / Model (Optional)
              </label>
              <input
                id="nicknameInput"
                type="text"
                className="form-control border-slate-300 text-sm"
                placeholder="e.g. Rahul's White Honda City"
                value={newVehicle.nickname}
                onChange={(e) =>
                  setNewVehicle({ ...newVehicle, nickname: e.target.value })
                }
              />
            </div>

            <div className="form-check mb-4">
              <input
                id="defaultCheck"
                type="checkbox"
                className="form-check-input"
                checked={newVehicle.is_default}
                onChange={(e) =>
                  setNewVehicle({ ...newVehicle, is_default: e.target.checked })
                }
              />
              <label className="form-check-label small text-dark" htmlFor="defaultCheck">
                Set as my default vehicle for new bookings
              </label>
            </div>

            <div className="d-flex justify-content-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="btn btn-outline-secondary px-3 py-2 text-sm rounded-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary px-4 py-2 text-sm rounded-3 fw-medium shadow-xs"
              >
                {submitting ? 'Saving...' : 'Register Vehicle'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

export default VehiclesPage;
