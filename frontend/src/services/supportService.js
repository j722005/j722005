import api from './api';

export const supportService = {
  /**
   * Fetch tickets with optional filters (status, category, priority, assigned_to, search).
   */
  async getTickets(params = {}) {
    const res = await api.get('/support/tickets/', { params });
    return res.data;
  },

  /**
   * Fetch full ticket details and conversation thread.
   */
  async getTicketDetail(ticketId) {
    const res = await api.get(`/support/tickets/${ticketId}/`);
    return res.data;
  },

  /**
   * Create a new support ticket (supports file attachment).
   */
  async createTicket(payload) {
    // If payload contains an attachment File, submit as FormData
    let body = payload;
    let headers = {};
    if (payload instanceof FormData) {
      body = payload;
      headers = { 'Content-Type': 'multipart/form-data' };
    } else if (payload.attachment instanceof File) {
      const fd = new FormData();
      Object.keys(payload).forEach((k) => {
        if (payload[k] !== undefined && payload[k] !== null) {
          fd.append(k, payload[k]);
        }
      });
      body = fd;
      headers = { 'Content-Type': 'multipart/form-data' };
    }

    const res = await api.post('/support/tickets/', body, { headers });
    return res.data;
  },

  /**
   * Post message reply or internal staff note.
   */
  async replyTicket(ticketId, payload) {
    let body = payload;
    let headers = {};
    if (payload instanceof FormData) {
      body = payload;
      headers = { 'Content-Type': 'multipart/form-data' };
    } else if (payload.attachment instanceof File) {
      const fd = new FormData();
      Object.keys(payload).forEach((k) => {
        if (payload[k] !== undefined && payload[k] !== null) {
          fd.append(k, payload[k]);
        }
      });
      body = fd;
      headers = { 'Content-Type': 'multipart/form-data' };
    }

    const res = await api.post(`/support/tickets/${ticketId}/reply/`, body, { headers });
    return res.data;
  },

  /**
   * Update ticket status and resolution notes (Staff/Admin).
   */
  async updateStatus(ticketId, status, resolutionNotes = '') {
    const res = await api.post(`/support/tickets/${ticketId}/status/`, {
      status,
      resolution_notes: resolutionNotes,
    });
    return res.data;
  },

  /**
   * Update ticket priority (Staff/Admin).
   */
  async updatePriority(ticketId, priority) {
    const res = await api.post(`/support/tickets/${ticketId}/priority/`, { priority });
    return res.data;
  },

  /**
   * Assign ticket to a staff member (Staff/Admin).
   */
  async assignTicket(ticketId, assignedToId) {
    const res = await api.post(`/support/tickets/${ticketId}/assign/`, {
      assigned_to_id: assignedToId,
    });
    return res.data;
  },

  /**
   * Reopen a resolved ticket (User or Staff).
   */
  async reopenTicket(ticketId, reason = '') {
    const res = await api.post(`/support/tickets/${ticketId}/reopen/`, { reason });
    return res.data;
  },

  /**
   * Close a ticket (User if resolved/open, or Staff/Admin).
   */
  async closeTicket(ticketId) {
    const res = await api.post(`/support/tickets/${ticketId}/close/`);
    return res.data;
  },

  /**
   * Fetch support analytics and KPIs (Staff/Admin).
   */
  async getAnalytics() {
    const res = await api.get('/support/analytics/');
    return res.data;
  },

  /**
   * Fetch active staff members for ticket assignment.
   */
  async getStaffList() {
    const res = await api.get('/support/staff-list/');
    return res.data;
  },

  /**
   * Fetch user's eligible bookings for linking in ticket creation.
   */
  async getEligibleBookings() {
    const res = await api.get('/support/my-eligible-bookings/');
    return res.data;
  },
};

export default supportService;
