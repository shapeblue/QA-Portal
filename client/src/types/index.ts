export interface SmokeTestResult {
  hypervisor: string;
  passed: number;
  total: number;
  status: 'OK' | 'FAIL';
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
