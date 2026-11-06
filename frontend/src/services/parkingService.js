import api from './api';
import { MOCK_PARKING_LOTS, getMockSlotsForLot, MOCK_ADMIN_STATS } from './mockData';

export const parkingService = {
  /**
   * Fetch all active parking lots
   */
  async getLots(params = {}) {
    try {
      const response = await api.get('/lots/', { params });
      return response.data?.results || response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Offline Fallback] Django API /lots/ not reachable, using offline preview.', error.message);
      return MOCK_PARKING_LOTS;
    }
  },

  /**
   * Fetch a single parking lot detail
   */
  async getLotById(id) {
    try {
      const response = await api.get(`/lots/${id}/`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn(`[Offline Fallback] Django API /lots/${id}/ not reachable, using offline preview.`, error.message);
      const lot = MOCK_PARKING_LOTS.find((l) => l.id === Number(id));
      if (!lot) throw new Error('Parking lot not found');
      return lot;
    }
  },

  /**
   * Fetch slots for a lot with live availability
   */
  async getSlotsForLot(lotId, params = {}) {
    try {
      const response = await api.get(`/lots/${lotId}/slots/`, { params });
      return response.data?.results || response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn(`[Offline Fallback] Django API /lots/${lotId}/slots/ not reachable, using offline preview.`, error.message);
      return getMockSlotsForLot(lotId);
    }
  },

  /**
   * Update slot active / maintenance status (Staff / Admin)
   */
  async updateSlotStatus(slotId, isActive) {
    try {
      const response = await api.patch(`/slots/${slotId}/status/`, { is_active: isActive });
      return response.data;
    } catch (error) {
      if (error.response) throw error;
      return { id: slotId, is_active: isActive, status: isActive ? 'available' : 'maintenance' };
    }
  },

  /**
   * Fetch admin dashboard statistics
   */
  async getAdminStats() {
    try {
      const response = await api.get('/admin/stats/');
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Offline Fallback] Django API /admin/stats/ not reachable, using offline preview.', error.message);
      return MOCK_ADMIN_STATS;
    }
  },

  /**
   * Fetch smart parking recommendations based on destination, filters, and scoring
   */
  async getRecommendations(params = {}) {
    const response = await api.get('/lots/recommend/', { params });
    return response.data;
  },
};

export default parkingService;
