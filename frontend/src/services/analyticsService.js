import api from './api';
import { MOCK_ADMIN_STATS } from './mockData';

export const analyticsService = {
  /**
   * Fetch aggregated admin analytics from Django API
   */
  async getAdminStats(params = {}) {
    try {
      const response = await api.get('/admin/stats/', { params });
      return response.data;
    } catch (error) {
      if (error.response && error.response.status !== 404) throw error;
      console.warn('[Offline Fallback] Django API /admin/stats/ not reachable.', error.message);
      return MOCK_ADMIN_STATS;
    }
  },

  /**
   * Feature 7: Fetch comprehensive Business Intelligence Analytics
   */
  async getBIData(params = {}) {
    const response = await api.get('/analytics/bi/', { params });
    return response.data;
  },

  /**
   * Feature 7: Universal Report Exporter (CSV, Excel, PDF)
   */
  async exportReport(format = 'csv', params = {}) {
    try {
      const response = await api.get('/analytics/export/', {
        params: { ...params, format },
        responseType: 'blob',
      });

      const extensions = {
        csv: 'csv',
        excel: 'xlsx',
        xlsx: 'xlsx',
        pdf: 'pdf',
      };
      const ext = extensions[format.toLowerCase()] || 'csv';
      const filename = `smart_parking_bi_${params.range || 'report'}_${new Date().toISOString().slice(0, 10)}.${ext}`;

      const blob = new Blob([response.data], {
        type: response.headers['content-type'] || 'application/octet-stream',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      return { success: true, filename };
    } catch (error) {
      let errorMsg = 'Failed to download report.';
      if (error.response?.data instanceof Blob) {
        try {
          const text = await error.response.data.text();
          const parsed = JSON.parse(text);
          errorMsg = parsed.message || errorMsg;
        } catch (_) {}
      } else if (error.response?.data?.message) {
        errorMsg = error.response.data.message;
      }
      throw new Error(errorMsg);
    }
  },

  /**
   * Specific format exporters
   */
  async exportCsv(params = {}) {
    return this.exportReport('csv', params);
  },

  async exportExcel(params = {}) {
    return this.exportReport('excel', params);
  },

  async exportPdf(params = {}) {
    return this.exportReport('pdf', params);
  },

  /**
   * Fetch AI/ML Demand Predictions from Django prediction API
   */
  async getDemandPredictions(lotId, params = {}) {
    try {
      const response = await api.get('/analytics/demand-prediction/', {
        params: { lot_id: lotId, ...params },
      });
      return {
        available: true,
        data: response.data,
      };
    } catch (error) {
      return {
        available: false,
        status: error.response?.status || 404,
        message:
          error.response?.data?.message ||
          'AI/ML demand prediction endpoint (/api/analytics/demand-prediction/) is not implemented on the Django backend.',
        insufficientData: error.response?.status === 422 || error.response?.status === 400,
        modelEvaluation: null,
      };
    }
  },
};

export default analyticsService;
