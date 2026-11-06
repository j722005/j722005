import api from './api';

export const refundService = {
  // ============================================================================
  // CUSTOMER REFUND ENDPOINTS
  // ============================================================================

  /**
   * Fetch customer's paid bookings eligible for refund.
   */
  async getEligibleBookings() {
    const res = await api.get('/refunds/eligible-bookings/');
    return res.data;
  },

  /**
   * Create a new refund request (supports file attachment).
   */
  async createRefundRequest(payload) {
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
    const res = await api.post('/refunds/request/', body, { headers });
    return res.data;
  },

  /**
   * Fetch customer's refund history with search and status filtering.
   */
  async getMyRefunds(params = {}) {
    const res = await api.get('/refunds/my-refunds/', { params });
    return res.data;
  },

  /**
   * Fetch detailed refund request information and transaction log.
   */
  async getRefundDetail(refundId) {
    const res = await api.get(`/refunds/${refundId}/`);
    return res.data;
  },

  /**
   * Customer provides additional information when requested by staff.
   */
  async provideAdditionalInfo(refundId, payload) {
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
    const res = await api.post(`/refunds/${refundId}/provide-info/`, body, { headers });
    return res.data;
  },

  /**
   * Customer cancels their pending refund request.
   */
  async cancelRefundRequest(refundId, reason = '') {
    const res = await api.post(`/refunds/${refundId}/cancel/`, { reason });
    return res.data;
  },

  // ============================================================================
  // ADMIN REFUND ENDPOINTS
  // ============================================================================

  /**
   * Admin lists all refund requests.
   */
  async getAdminRefunds(params = {}) {
    const res = await api.get('/admin/refunds/', { params });
    return res.data;
  },

  /**
   * Admin status counter summary.
   */
  async getAdminRefundSummary() {
    const res = await api.get('/admin/refunds/summary/');
    return res.data;
  },

  /**
   * Admin takes action (review, request_info, approve, reject, process).
   */
  async adminRefundAction(refundId, payload) {
    const res = await api.post(`/admin/refunds/${refundId}/action/`, payload);
    return res.data;
  },

  // ============================================================================
  // PAYMENT DISPUTES ENDPOINTS
  // ============================================================================

  /**
   * Customer raises a payment dispute.
   */
  async raiseDispute(payload) {
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
    const res = await api.post('/disputes/raise/', body, { headers });
    return res.data;
  },

  /**
   * Customer lists their payment disputes.
   */
  async getMyDisputes(params = {}) {
    const res = await api.get('/disputes/my-disputes/', { params });
    return res.data;
  },

  /**
   * Get dispute details and conversation messages.
   */
  async getDisputeDetail(disputeId) {
    const res = await api.get(`/disputes/${disputeId}/`);
    return res.data;
  },

  /**
   * Post message or reply to a dispute thread.
   */
  async replyDispute(disputeId, payload) {
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
    const res = await api.post(`/disputes/${disputeId}/reply/`, body, { headers });
    return res.data;
  },

  /**
   * Admin lists all payment disputes.
   */
  async getAdminDisputes(params = {}) {
    const res = await api.get('/admin/disputes/', { params });
    return res.data;
  },

  /**
   * Admin dispute counters summary.
   */
  async getAdminDisputeSummary() {
    const res = await api.get('/admin/disputes/summary/');
    return res.data;
  },

  /**
   * Admin updates dispute status & resolution summary.
   */
  async adminDisputeStatus(disputeId, payload) {
    const res = await api.post(`/admin/disputes/${disputeId}/status/`, payload);
    return res.data;
  },

  /**
   * Admin assigns dispute to staff.
   */
  async adminDisputeAssign(disputeId, staffUserId) {
    const res = await api.post(`/admin/disputes/${disputeId}/assign/`, {
      staff_user_id: staffUserId,
    });
    return res.data;
  },
};

export default refundService;

