#!/bin/bash

echo "==================================="
echo "  LoadTest v3.0 - Test Suite"
echo "==================================="

# আপনার ওয়েবসাইট
TARGET="https://your-website.com"

echo ""
echo "📌 Test 1: Basic (30s, 50 req/sec, 10 conn)"
node loadtester-simple.js $TARGET 30 50 10

echo ""
echo "📌 Test 2: Medium (60s, 100 req/sec, 20 conn)"
node loadtester-simple.js $TARGET 60 100 20

echo ""
echo "📌 Test 3: Heavy (120s, 200 req/sec, 50 conn)"
node loadtester-simple.js $TARGET 120 200 50

echo ""
echo "📌 Test 4: Extreme (60s, 500 req/sec, 100 conn)"
node loadtester-simple.js $TARGET 60 500 100

echo ""
echo "✅ All tests completed!"
