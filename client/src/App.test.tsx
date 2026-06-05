import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { api } from './services/api';

// App calls the API on mount; stub it so tests don't hit the network.
// NOTE: CRA's Jest config sets resetMocks:true, which clears mock
// implementations before each test, so resolved values are set in beforeEach
// (not in the factory below, where they'd be wiped).
jest.mock('./services/api', () => ({
  api: {
    getHealthPRs: jest.fn(),
    getAllOpenPRs: jest.fn(),
    getReadyToMergePRs: jest.fn(),
    getPR: jest.fn(),
    parsePRNumber: jest.fn(),
    getUpgradeTests: jest.fn(),
    getUpgradeTestFilters: jest.fn(),
    getUpgradeTestStats: jest.fn(),
  },
}));

const mockApi = api as jest.Mocked<typeof api>;

beforeEach(() => {
  mockApi.getHealthPRs.mockResolvedValue([]);
  mockApi.getAllOpenPRs.mockResolvedValue([]);
  mockApi.getReadyToMergePRs.mockResolvedValue([]);
  mockApi.getUpgradeTests.mockResolvedValue([]);
  mockApi.getUpgradeTestFilters.mockResolvedValue({} as any);
  mockApi.getUpgradeTestStats.mockResolvedValue({} as any);
});

const renderApp = () =>
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );

test('renders the dashboard header', async () => {
  renderApp();
  expect(screen.getByText(/CloudStack PR Health Dashboard/i)).toBeInTheDocument();
  await waitFor(() => expect(mockApi.getHealthPRs).toHaveBeenCalled());
});

test('renders all four navigation tabs', async () => {
  renderApp();
  expect(screen.getByRole('button', { name: /Health Check Runs/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /All Open PRs/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Upgrade Tests/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Flaky Tests/i })).toBeInTheDocument();
  await waitFor(() => expect(mockApi.getHealthPRs).toHaveBeenCalled());
});

test('loads health PRs on mount', async () => {
  renderApp();
  await waitFor(() => expect(mockApi.getHealthPRs).toHaveBeenCalled());
});
