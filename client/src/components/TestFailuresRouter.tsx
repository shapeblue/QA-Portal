import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TestFailuresSummary from './TestFailuresSummary';
import TestFailureDetail from './TestFailureDetail';

const TestFailuresRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<TestFailuresSummary />} />
      <Route path="/:testName" element={<TestFailureDetail />} />
    </Routes>
  );
};

export default TestFailuresRouter;
