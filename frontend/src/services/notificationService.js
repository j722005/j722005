import api from './api';

export const notificationService = {
  /**
   * Fetch notifications with query filters (category, read status, archived, search, pagination)
   */
  async getNotifications(params = {}) {
    try {
      const response = await api.get('/notifications/', { params });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Notifications] API /notifications/ error:', error.message);
      return { results: [], count: 0 };
    }
  },

  /**
   * Fast lightweight polling endpoint for unread count & category counts
   */
  async getUnreadCount() {
    try {
      const response = await api.get('/notifications/unread-count/');
      return response.data;
    } catch (error) {
      console.warn('[Notifications] /unread-count/ error:', error.message);
      return { unread_count: 0, unread_by_category: {} };
    }
  },

  /**
   * Mark a single notification as read
   */
  async markAsRead(notificationId) {
    const response = await api.post(`/notifications/${notificationId}/read/`);
    return response.data;
  },

  /**
   * Mark all unread notifications as read (optionally for a specific category)
   */
  async markAllAsRead(category = null) {
    const response = await api.post('/notifications/mark-all-read/', { category });
    return response.data;
  },

  /**
   * Archive a single notification
   */
  async archiveNotification(notificationId) {
    const response = await api.post(`/notifications/${notificationId}/archive/`);
    return response.data;
  },

  /**
   * Permanently delete a notification owned by the current user
   */
  async deleteNotification(notificationId) {
    const response = await api.delete(`/notifications/${notificationId}/`);
    return response.data;
  },

  /**
   * Clear all read notifications (action: 'archive' or 'delete')
   */
  async clearAllRead(action = 'archive') {
    const response = await api.post('/notifications/clear-all/', { action });
    return response.data;
  },

  /**
   * Admin broadcast announcement
   */
  async createAnnouncement(data) {
    const response = await api.post('/notifications/announce/', data);
    return response.data;
  },

  /**
   * Admin past announcements list & stats
   */
  async getAdminAnnouncements() {
    const response = await api.get('/notifications/admin-announcements/');
    return response.data?.results || response.data || [];
  },

  /**
   * Check SMTP configuration and status
   */
  async getEmailStatus() {
    try {
      const response = await api.get('/notifications/email-status/');
      return response.data;
    } catch (error) {
      return {
        is_configured: false,
        status_message: 'Unable to query SMTP status from server.',
      };
    }
  },

  /**
   * Trigger server-side expiry maintenance checks
   */
  async runExpiryCheck() {
    const response = await api.post('/notifications/run-expiry-check/');
    return response.data;
  },
};

export default notificationService;
