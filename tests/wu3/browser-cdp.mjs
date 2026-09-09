import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function findBrowser() {
  const candidates = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && fs.existsSync(candidate)) return candidate;
    const result = spawnSync('which', [candidate], { encoding: 'utf8' });
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim();
  }
  throw new Error('No Chrome/Chromium binary found. Set CHROME_BIN or install a supported browser.');
}

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

export class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
        return;
      }
      const waiters = this.eventWaiters.get(msg.method);
      if (waiters && waiters.length) {
        const waiter = waiters.shift();
        waiter(msg.params || {});
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
      const list = this.eventWaiters.get(method) || [];
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      list.push((params) => { clearTimeout(timer); resolve(params); });
      this.eventWaiters.set(method, list);
    });
  }

  close() { this.ws.close(); }
}

export async function waitForJson(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

export async function evaluate(client, expression) {
  const result = await client.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) { const detail = result.exceptionDetails.exception?.description || result.exceptionDetails.exception?.value || result.exceptionDetails.text || 'Runtime.evaluate failed'; throw new Error(String(detail)); }
  return result.result.value;
}

function parseRgb(value) {
  const match = String(value).match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/i);
  if (!match) throw new Error(`Cannot parse rgb color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function relativeLuminance(rgb) {
  const values = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}

export function contrastRatio(a, b) {
  const l1 = relativeLuminance(parseRgb(a));
  const l2 = relativeLuminance(parseRgb(b));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export async function pressTab(client) {
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 });
}
