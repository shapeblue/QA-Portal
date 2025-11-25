export interface SmokeTestResult {
  hypervisor: string;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
  logsUrl?: string;
  failedTests?: string[];
}

export interface PRData {
  number: number;
  title: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  approvals: {
    approved: number;
    changesRequested: number;
    commented: number;
  };
  smokeTests: SmokeTestResult[];
  logsUrl?: string;
  codeCoverage?: {
    percentage: number;
    change: number;
    url: string;
  };
}

export interface UpgradeTestResult {
  id: number;
  timestamp_start: string;
  timestamp_end?: string;
  duration_seconds?: number;
  upgraded_env_url?: string;
  jenkins_build_number?: number;
  management_server_os?: string;
  hypervisor?: string;
  hypervisor_version?: string;
  infrastructure_provider?: string;
  upgrade_start_version?: string;
  upgrade_target_version?: string;
  overall_status?: 'PASS' | 'FAIL' | 'ERROR' | 'SKIPPED' | null;
  failure_stage?: string;
  tests_data_created?: string;
  tests_data_post_upgrade_verification?: string;
  error_log?: string;
  upgrade_matrix_url?: string;
  comments?: string;
  upgrade_console?: string;
  build_console?: string;
}

export interface UpgradeTestFilters {
  versions: Array<{ upgrade_start_version: string; upgrade_target_version: string }>;
  distros: string[];
  hypervisors: string[];
}

export interface UpgradeTestStats {
  total: number;
  passed: number;
  failed: number;
  error: number;
  skipped: number;
  running: number;
  latest_test_date: string;
}
