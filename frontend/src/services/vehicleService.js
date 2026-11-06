import api from './api';
import { MOCK_VEHICLES } from './mockData';

const LOCAL_VEHICLES_KEY = 'smart_parking_local_vehicles';

function getLocalVehicles() {
  try {
    const raw = localStorage.getItem(LOCAL_VEHICLES_KEY);
    return raw ? JSON.parse(raw) : MOCK_VEHICLES;
  } catch {
    return MOCK_VEHICLES;
  }
}

function saveLocalVehicles(list) {
  try {
    localStorage.setItem(LOCAL_VEHICLES_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save vehicles locally', e);
  }
}

export const vehicleService = {
  async getVehicles() {
    try {
      const response = await api.get('/vehicles/');
      return response.data?.results || response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Offline Fallback] Django API /vehicles/ not reachable, using offline preview.', error.message);
      return getLocalVehicles();
    }
  },

  async addVehicle(vehicleData) {
    try {
      const response = await api.post('/vehicles/', {
        license_plate: vehicleData.license_plate.toUpperCase().trim(),
        vehicle_type: vehicleData.vehicle_type || 'car',
        nickname: vehicleData.nickname || '',
        is_default: Boolean(vehicleData.is_default),
      });
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }

      console.warn('[Offline Fallback] Adding vehicle locally.', error.message);
      const current = getLocalVehicles();
      const newVehicle = {
        id: Date.now(),
        license_plate: vehicleData.license_plate.toUpperCase().trim(),
        vehicle_type: vehicleData.vehicle_type || 'car',
        nickname: vehicleData.nickname || 'My Vehicle',
        is_default: current.length === 0 || vehicleData.is_default,
      };

      const updated = vehicleData.is_default
        ? current.map((v) => ({ ...v, is_default: false })).concat(newVehicle)
        : current.concat(newVehicle);

      saveLocalVehicles(updated);
      return newVehicle;
    }
  },

  async deleteVehicle(id) {
    try {
      const response = await api.delete(`/vehicles/${id}/`);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }
      console.warn('[Offline Fallback] Deleting vehicle locally.', error.message);
      const current = getLocalVehicles().filter((v) => v.id !== id);
      saveLocalVehicles(current);
      return { success: true };
    }
  },

  async setDefaultVehicle(id) {
    try {
      const response = await api.post(`/vehicles/${id}/set-default/`);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }
      console.warn('[Offline Fallback] Setting default vehicle locally.', error.message);
      const updated = getLocalVehicles().map((v) => ({
        ...v,
        is_default: v.id === id,
      }));
      saveLocalVehicles(updated);
      return { success: true };
    }
  },
};

export default vehicleService;
