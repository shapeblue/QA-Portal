import axios from 'axios';
import { PRData } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

export const api = {
  // Get all health check PRs
  getHealthPRs: async (): Promise<PRData[]> => {
    const response = await axios.get(`${API_BASE_URL}/health-prs`);
    return response.data;
  },

  // Get specific PR by number
  getPR: async (prNumber: number): Promise<PRData> => {
    const response = await axios.get(`${API_BASE_URL}/pr/${prNumber}`);
    return response.data;
  },

  // Parse PR number from URL or number string
  parsePRNumber: (input: string): number | null => {
    // Try to extract PR number from GitHub URL
    const urlMatch = input.match(/github\.com\/[^/]+\/[^/]+\/pull\/(\d+)/);
    if (urlMatch) {
      return parseInt(urlMatch[1]);
    }

    // Try to parse as number
    const num = parseInt(input.replace(/\D/g, ''));
    return isNaN(num) ? null : num;
  },
};
