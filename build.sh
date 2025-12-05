#!/usr/bin bash
npm run build
cp package*.json build/
cd build && npm ci --omit dev
