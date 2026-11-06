import api from './api';

export const membershipLoyaltyService = {
  // ---------------------------------------------------------------------------
  // MEMBERSHIP PLANS
  // ---------------------------------------------------------------------------
  async getPlans() {
    const res = await api.get('/memberships/plans/');
    return res.data;
  },

  async getPlanDetail(id) {
    const res = await api.get(`/memberships/plans/${id}/`);
    return res.data;
  },

  async createPlan(data) {
    const res = await api.post('/memberships/plans/', data);
    return res.data;
  },

  async updatePlan(id, data) {
    const res = await api.patch(`/memberships/plans/${id}/`, data);
    return res.data;
  },

  async deletePlan(id) {
    const res = await api.delete(`/memberships/plans/${id}/`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // CUSTOMER MEMBERSHIPS
  // ---------------------------------------------------------------------------
  async getMyMemberships() {
    const res = await api.get('/memberships/my/');
    return res.data;
  },

  async purchaseMembership(data) {
    const res = await api.post('/memberships/purchase/', data);
    return res.data;
  },

  async cancelMembershipRenewal(id) {
    const res = await api.post(`/memberships/${id}/cancel-renewal/`);
    return res.data;
  },

  async renewMembership(id) {
    const res = await api.post(`/memberships/${id}/renew/`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // MONTHLY PARKING PASSES
  // ---------------------------------------------------------------------------
  async getMyPasses() {
    const res = await api.get('/passes/my/');
    return res.data;
  },

  async purchasePass(data) {
    const res = await api.post('/passes/purchase/', data);
    return res.data;
  },

  async cancelPass(id) {
    const res = await api.post(`/passes/${id}/cancel/`);
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // LOYALTY POINTS & REWARDS
  // ---------------------------------------------------------------------------
  async getLoyaltyAccount() {
    const res = await api.get('/loyalty/me/');
    return res.data;
  },

  async getLoyaltyHistory(params = {}) {
    const res = await api.get('/loyalty/history/', { params });
    return res.data;
  },

  async getLoyaltyConfig() {
    const res = await api.get('/loyalty/config/');
    return res.data;
  },

  async updateLoyaltyConfig(data) {
    const res = await api.patch('/loyalty/config/', data);
    return res.data;
  },

  async adminAdjustLoyaltyPoints(data) {
    const res = await api.post('/loyalty/admin/adjust/', data);
    return res.data;
  },

  async adminGetLoyaltyAccounts(params = {}) {
    const res = await api.get('/loyalty/admin/accounts/', { params });
    return res.data;
  },

  // ---------------------------------------------------------------------------
  // ADMIN OVERVIEW & ANALYTICS
  // ---------------------------------------------------------------------------
  async getAdminOverview() {
    const res = await api.get('/admin/memberships/overview/');
    return res.data;
  },
};

export default membershipLoyaltyService;
