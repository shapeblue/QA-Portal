#!/bin/bash

# Kill existing processes
echo "Stopping existing servers..."
lsof -ti:5001 | head -1 | xargs -I {} kill {} 2>/dev/null
lsof -ti:3000 | head -1 | xargs -I {} kill {} 2>/dev/null
sleep 2

# Start backend
echo "Starting backend server..."
cd server
node dist/index.js > /tmp/qa-backend-stable.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > /tmp/qa-backend.pid
echo "Backend started (PID: $BACKEND_PID)"
cd ..

# Start frontend
echo "Starting frontend server..."
cd client
BROWSER=none PORT=3000 npm start > /tmp/qa-frontend-stable.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > /tmp/qa-frontend.pid
echo "Frontend started (PID: $FRONTEND_PID)"
cd ..

echo ""
echo "Waiting for servers to initialize..."
sleep 25

echo ""
echo "Checking status..."
if lsof -ti:5001 > /dev/null 2>&1; then
  echo "✅ Backend: http://localhost:5001"
else
  echo "❌ Backend failed to start"
fi

if lsof -ti:3000 > /dev/null 2>&1; then
  echo "✅ Frontend: http://localhost:3000"
else
  echo "❌ Frontend failed to start"
fi

echo ""
echo "Logs:"
echo "  Backend:  tail -f /tmp/qa-backend-stable.log"
echo "  Frontend: tail -f /tmp/qa-frontend-stable.log"
echo ""
echo "To stop: kill \$(cat /tmp/qa-backend.pid) \$(cat /tmp/qa-frontend.pid)"
