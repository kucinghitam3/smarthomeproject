# SmartHome IoT — Monitoring Suhu & Kontrol Lampu

React + Vite (frontend) · Node.js + Express (backend) · SQLite (database) · ESP32 + DHT22 + relay.
Tanpa login. Satu server melayani web dan API.

## Struktur
```
backend/   Express API + SQLite (data/smarthome.db dibuat otomatis, skema di schema.sql)
frontend/  React + Vite dashboard (Dashboard, Lampu, Sensor, dark mode)
esp32/     smarthome.ino (Arduino IDE)
```

## Menjalankan (butuh Node.js 18+)
```bash
npm run setup     # install backend + frontend, lalu build web
npm start         # buka http://localhost:3000
```
Mode pengembangan (hot reload): jalankan `npm run dev:backend` dan `npm run dev:frontend` di dua terminal, buka http://localhost:5173.

Konfigurasi ada di `backend/.env` (PORT, OFFLINE_SECONDS, DEVICE_KEY opsional).

## ESP32
1. Arduino IDE → install board **esp32**, library **DHT sensor library** + **Adafruit Unified Sensor**.
2. Buka `esp32/smarthome.ino`, isi WIFI_SSID, WIFI_PASS, dan SERVER (IP laptop, cek dengan `ipconfig` / `ip a`; ESP32 dan laptop harus satu WiFi).
3. Wiring: DHT22 data → GPIO4 (+3V3, GND, resistor pull-up 10k jika modul tanpa PCB) · relay IN → GPIO26 · relay VCC → 5V/VIN · GND bersama.
4. Upload, buka Serial Monitor 115200.

Alur: ESP32 kirim `POST /api/sensor` tiap 5 detik dan polling `GET /api/lamp` tiap 1,5 detik (sekaligus jadi penanda online). Offline = tidak ada kontak > 15 detik.

## Tes tanpa ESP32
```bash
curl -X POST localhost:3000/api/sensor -H "Content-Type: application/json" -d '{"temperature":27.5,"humidity":65}'
curl localhost:3000/api/lamp
curl -X POST localhost:3000/api/lamp -H "Content-Type: application/json" -d '{"on":true}'
```

## API
| Method | Endpoint | Fungsi |
| --- | --- | --- |
| GET | /api/state | lampOn, temperature, humidity, deviceOnline, lastSeen, activity |
| GET | /api/history | 60 pembacaan terakhir |
| GET | /api/lamp | status lampu (dipakai ESP32) |
| POST | /api/lamp | `{ "on": true }` |
| POST | /api/sensor | `{ "temperature": 27.5, "humidity": 65 }` |

## Keselamatan
Tes dulu dengan LED atau beban tegangan rendah. Untuk lampu AC/listrik rumah, pakai relay dengan rating sesuai, enclosure, proteksi, dan pemasangan oleh orang yang kompeten.
