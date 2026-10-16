import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const OFFLINE_MS = (Number(process.env.OFFLINE_SECONDS) || 15) * 1000;
const DEVICE_KEY = process.env.DEVICE_KEY || '';
const KEEP_READINGS = 500;

fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
const db = new Database(path.join(dir, 'data', 'smarthome.db'));
db.pragma('journal_mode = WAL');
db.exec(fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8'));

const q = {
  touch: db.prepare('UPDATE device SET last_seen = ? WHERE id = 1'),
  device: db.prepare('SELECT last_seen FROM device WHERE id = 1'),
  lamp: db.prepare('SELECT state FROM lamp WHERE id = 1'),
  setLamp: db.prepare('UPDATE lamp SET state = ?, updated_at = ? WHERE id = 1'),
  last: db.prepare('SELECT temperature, humidity, created_at FROM readings ORDER BY id DESC LIMIT 1'),
  history: db.prepare('SELECT created_at AS timestamp, temperature, humidity FROM readings ORDER BY id DESC LIMIT 60'),
  insert: db.prepare('INSERT INTO readings (temperature, humidity, created_at) VALUES (?, ?, ?)'),
  prune: db.prepare('DELETE FROM readings WHERE id <= (SELECT MAX(id) FROM readings) - ?'),
  log: db.prepare('INSERT INTO activity (message, created_at) VALUES (?, ?)'),
  activity: db.prepare('SELECT message, created_at AS timestamp FROM activity ORDER BY id DESC LIMIT 8'),
};

const app = express();
app.use(cors());
app.use(express.json());

const deviceAuth = (req, res, next) =>
  !DEVICE_KEY || req.get('x-api-key') === DEVICE_KEY ? next() : res.status(401).json({ error: 'Invalid device key' });
const seen = () => q.touch.run(Date.now());
const isOnline = () => {
  const t = q.device.get().last_seen;
  return !!t && Date.now() - t < OFFLINE_MS;
};

// Status lengkap untuk dashboard
app.get('/api/state', (_req, res) => {
  const last = q.last.get();
  const online = isOnline();
  res.json({
    lampOn: !!q.lamp.get().state,
    temperature: online && last ? last.temperature : null,
    humidity: online && last ? last.humidity : null,
    deviceOnline: online,
    lastSeen: q.device.get().last_seen,
    activity: q.activity.all(),
  });
});

app.get('/api/history', (_req, res) => res.json(q.history.all().reverse()));

// ESP32 polling status lampu
app.get('/api/lamp', deviceAuth, (_req, res) => {
  seen();
  res.json({ on: !!q.lamp.get().state });
});

// Web mengubah status lampu
app.post('/api/lamp', (req, res) => {
  if (typeof req.body?.on !== 'boolean') return res.status(400).json({ success: false, error: '"on" harus boolean' });
  q.setLamp.run(req.body.on ? 1 : 0, Date.now());
  q.log.run(`Lampu ${req.body.on ? 'dinyalakan' : 'dimatikan'} dari web`, Date.now());
  res.json({ success: true, lampOn: req.body.on });
});

// ESP32 kirim data sensor
app.post('/api/sensor', deviceAuth, (req, res) => {
  const { temperature, humidity } = req.body || {};
  const ok = Number.isFinite(temperature) && Number.isFinite(humidity) &&
    temperature >= -40 && temperature <= 80 && humidity >= 0 && humidity <= 100;
  if (!ok) return res.status(400).json({ success: false, error: 'Data sensor tidak valid' });
  const wasOffline = !isOnline();
  seen();
  q.insert.run(temperature, humidity, Date.now());
  q.prune.run(KEEP_READINGS);
  if (wasOffline) q.log.run('ESP32 terhubung', Date.now());
  res.json({ success: true });
});

// Frontend hasil build
const dist = path.join(dir, '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => res.status(400).json({ success: false, error: err.message }));
app.listen(PORT, '0.0.0.0', () => console.log(`SmartHome IoT jalan di http://localhost:${PORT}`));
