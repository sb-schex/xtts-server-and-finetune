#!/bin/bash
# Start both backend and frontend

cd "$(dirname "$0")/.."

echo "Starting XTTS Backend..."
./scripts/start-backend.sh &
BACKEND_PID=$!

sleep 3

echo "Starting XTTS Frontend..."
./scripts/start-frontend.sh &
FRONTEND_PID=$!

echo ""
echo "=========================================="
echo "XTTS Server started!"
echo "Frontend: http://localhost:3000"
echo "Backend:  http://localhost:8000"
echo "API Docs: http://localhost:8000/docs"
echo "=========================================="
echo ""
echo "Press Ctrl+C to stop all services"

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
