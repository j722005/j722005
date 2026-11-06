import api from './api';
import { MOCK_BOOKINGS } from './mockData';

// Local storage key for offline fallback preview
const LOCAL_BOOKINGS_KEY = 'smart_parking_local_bookings';

function getLocalBookings() {
  try {
    const raw = localStorage.getItem(LOCAL_BOOKINGS_KEY);
    return raw ? JSON.parse(raw) : MOCK_BOOKINGS;
  } catch {
    return MOCK_BOOKINGS;
  }
}

function saveLocalBookings(list) {
  try {
    localStorage.setItem(LOCAL_BOOKINGS_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Failed to save to local storage', e);
  }
}

export const bookingService = {
  /**
   * Fetch current user's booking history from real Django endpoint
   */
  async getMyBookings() {
    try {
      const response = await api.get('/my-bookings/');
      return response.data?.results || response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Offline Fallback] Django API /my-bookings/ not reachable, using offline preview.', error.message);
      return getLocalBookings();
    }
  },

  /**
   * Get single booking detail by booking_id
   */
  async getBookingById(bookingId) {
    try {
      const response = await api.get(`/bookings/${bookingId}/`);
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn(`[Offline Fallback] Django API /bookings/${bookingId}/ not reachable, using offline preview.`, error.message);
      const list = getLocalBookings();
      const found = list.find((b) => b.booking_id === bookingId || String(b.id) === String(bookingId));
      if (!found) throw new Error('Booking not found');
      return found;
    }
  },

  /**
   * Create a new booking via real Django API
   */
  async createBooking(bookingPayload) {
    try {
      const response = await api.post('/bookings/create/', {
        lot_id: bookingPayload.lot_id,
        slot_id: bookingPayload.slot_id,
        vehicle_number: bookingPayload.vehicle_number,
        start_time: bookingPayload.start_time,
        end_time: bookingPayload.end_time,
      });
      return response.data;
    } catch (error) {
      // Re-throw real server error responses (validation / 409 conflict)
      if (error.response) {
        throw error;
      }

      console.warn('[Network Offline Fallback] Django API /bookings/create/ not reachable. Creating in offline store.', error.message);
      const newBooking = {
        id: Date.now(),
        booking_id: `bk_${Math.random().toString(36).substring(2, 10)}-${Date.now().toString(36)}`,
        lot_id: bookingPayload.lot_id,
        lot_name: bookingPayload.lot_name || 'Selected Parking Lot',
        slot_id: bookingPayload.slot_id,
        slot_number: bookingPayload.slot_number || 'S-01',
        slot_type: bookingPayload.slot_type || 'car',
        vehicle_number: bookingPayload.vehicle_number,
        start_time: bookingPayload.start_time,
        end_time: bookingPayload.end_time,
        status: 'pending',
        amount: Number(bookingPayload.amount) || 50.0,
        created_at: new Date().toISOString(),
        payment: null,
      };

      const current = getLocalBookings();
      saveLocalBookings([newBooking, ...current]);
      return newBooking;
    }
  },

  /**
   * Cancel an upcoming or pending booking (POST only)
   */
  async cancelBooking(bookingId) {
    try {
      const response = await api.post(`/bookings/${bookingId}/cancel/`);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }
      console.warn(`[Network Offline Fallback] Django API /bookings/${bookingId}/cancel/ not reachable.`, error.message);
      const list = getLocalBookings().map((b) => {
        if (b.booking_id === bookingId || String(b.id) === String(bookingId)) {
          return { ...b, status: 'cancelled' };
        }
        return b;
      });
      saveLocalBookings(list);
      return { success: true, message: 'Booking cancelled successfully.' };
    }
  },

  /**
   * Submit simulated demo payment
   */
  async processPayment(bookingId, paymentData) {
    try {
      const response = await api.post(`/bookings/${bookingId}/payment/`, paymentData);
      return response.data;
    } catch (error) {
      if (error.response) {
        throw error;
      }
      console.warn(`[Network Offline Fallback] Django API payment endpoint not reachable.`, error.message);
      const list = getLocalBookings().map((b) => {
        if (b.booking_id === bookingId || String(b.id) === String(bookingId)) {
          return {
            ...b,
            status: 'confirmed',
            payment: {
              transaction_id: `TXN${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
              method: paymentData.method || 'upi',
              status: 'success',
              paid_at: new Date().toISOString(),
            },
          };
        }
        return b;
      });
      saveLocalBookings(list);
      return { success: true, message: 'Simulated payment completed! Slot confirmed.' };
    }
  },

  /**
   * Fetch customer dashboard summary
   */
  async getCustomerDashboard() {
    try {
      const response = await api.get('/customer/dashboard/');
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      return null;
    }
  },

  /**
   * Fetch staff station overview
   */
  async getStaffOverview(lotId) {
    try {
      const response = await api.get('/staff/overview/', { params: { lot_id: lotId } });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      return null;
    }
  },

  /**
   * Verify vehicle plate at gate
   */
  async verifyPlate(query) {
    const response = await api.post('/staff/verify-plate/', { query });
    return response.data;
  },

  /**
   * Authorize barrier gate action
   */
  async gateAction(bookingId, action) {
    const response = await api.post('/staff/gate-action/', { booking_id: bookingId, action });
    return response.data;
  },
};

export default bookingService;
