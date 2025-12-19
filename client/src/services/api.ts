import axios from 'axios';
import { PRData, UpgradeTestResult, UpgradeTestFilters, UpgradeTestStats } from '../types';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// Create axios instance with longer timeout
const axiosInstance = axios.create({
  timeout: 60000, // 60 second timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

export const api = {
  // Get all health check PRs
  getHealthPRs: async (): Promise<PRData[]> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/health-prs`);
    return response.data;
  },

  // Get ALL open PRs (not just health check labeled)
  getAllOpenPRs: async (): Promise<PRData[]> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/all-open-prs`);
    return response.data;
  },

  // Get ready to merge PRs
  getReadyToMergePRs: async (): Promise<PRData[]> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/ready-to-merge`);
    return response.data;
  },

  // Get specific PR by number
  getPR: async (prNumber: number): Promise<PRData> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/pr/${prNumber}`);
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

  // Upgrade test endpoints
  getUpgradeTests: async (filters?: {
    fromVersion?: string;
    toVersion?: string;
    distro?: string;
    hypervisor?: string;
    status?: string;
  }): Promise<UpgradeTestResult[]> => {
    const params = new URLSearchParams();
    if (filters?.fromVersion) params.append('fromVersion', filters.fromVersion);
    if (filters?.toVersion) params.append('toVersion', filters.toVersion);
    if (filters?.distro) params.append('distro', filters.distro);
    if (filters?.hypervisor) params.append('hypervisor', filters.hypervisor);
    if (filters?.status) params.append('status', filters.status);

    const response = await axiosInstance.get(`${API_BASE_URL}/upgrade-tests?${params.toString()}`);
    return response.data;
  },

  getUpgradeTestFilters: async (): Promise<UpgradeTestFilters> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/upgrade-tests/filters`);
    return response.data;
  },

  getUpgradeTestStats: async (): Promise<UpgradeTestStats> => {
    const response = await axiosInstance.get(`${API_BASE_URL}/upgrade-tests/stats`);
    return response.data;
  },
};
