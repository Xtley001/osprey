/**
 * Minimal example: point at a running Osprey server and read live rates.
 * Run: npx tsx examples/basic.ts (from packages/sdk, after `npm run build`)
 */
import { Osprey } from '../src/index.js';

const osprey = new Osprey({
  baseUrl: process.env.OSPREY_API_URL ?? 'http://localhost:8787',
  apiKey: process.env.OSPREY_API_KEY,
});

const rates = await osprey.rates.list();
const top5 = [...rates].sort((a, b) => b.currentRate - a.currentRate).slice(0, 5);
console.log('Top 5 funding rates:', top5.map(r => `${r.symbol}: ${(r.currentRate * 100).toFixed(4)}%/hr`));

const regime = await osprey.regime.get();
console.log('Market regime:', regime.label);
