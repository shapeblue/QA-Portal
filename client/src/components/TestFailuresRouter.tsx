import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import TestFailuresSummary from './TestFailuresSummary';
import TestFailureDetail from './TestFailureDetail';

const TestFailuresRouter: React.FC = () => {
  const location = useLocation();
  
  // Extract path relative to /test-failures
  const relativePath = location.pathname.replace('/test-failures', '') || '/';
  
  // If we're at exactly /test-failures, show summary
  if (relativePath === '/' || relativePath === '') {
    return <TestFailuresSummary />;
  }
  
  // If we're at /test-failures/detail/:testName, show detail
  const detailMatch = relativePath.match(/^\/detail\/(.+)$/);
  if (detailMatch) {
    return <TestFailureDetail />;
  }
  
  // Fallback to summary
  return <TestFailuresSummary />;
};

export default TestFailuresRouter;
