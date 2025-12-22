import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TestFailuresSummary from './TestFailuresSummary';
import TestFailureDetail from './TestFailureDetail';

const TestFailuresRouter: React.FC = () => {
  return (
    <Routes>
      <Route index element={<TestFailuresSummary />} />
      <Route path="detail/:testName" element={<TestFailureDetail />} />
    </Routes>
  );
};

export default TestFailuresRouter;
