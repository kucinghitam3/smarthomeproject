// ESP32 + DHT22 + Relay untuk SmartHome IoT
// Library: "DHT sensor library" (Adafruit) + "Adafruit Unified Sensor"
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

// ====== EDIT BAGIAN INI ======
const char* WIFI_SSID  = "NAMA_WIFI";
const char* WIFI_PASS  = "PASSWORD_WIFI";
const char* SERVER     = "http://192.168.1.10:3000";  // IP laptop/server yang menjalankan backend
const char* DEVICE_KEY = "";                          // samakan dengan DEVICE_KEY di backend/.env (kosongkan jika tidak dipakai)
#define DHT_PIN 4
#define RELAY_PIN 26
#define RELAY_ACTIVE_LOW true   // kebanyakan modul relay aktif saat LOW
// =============================

const unsigned long SENSOR_EVERY = 5000;  // kirim suhu tiap 5 detik
const unsigned long LAMP_EVERY   = 1500;  // cek perintah lampu tiap 1,5 detik
DHT dht(DHT_PIN, DHT22);
unsigned long lastSensor = 0, lastLamp = 0, lastWifi = 0;

void setRelay(bool on) {
  digitalWrite(RELAY_PIN, (on ^ RELAY_ACTIVE_LOW) ? HIGH : LOW);
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Menghubungkan WiFi");
  for (int i = 0; i < 30 && WiFi.status() != WL_CONNECTED; i++) { delay(500); Serial.print("."); }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi terhubung: " + WiFi.localIP().toString() : "\nGagal, akan dicoba lagi");
}

void addHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  if (strlen(DEVICE_KEY) > 0) http.addHeader("x-api-key", DEVICE_KEY);
}

void pollLamp() {
  HTTPClient http;
  http.begin(String(SERVER) + "/api/lamp");
  addHeaders(http);
  if (http.GET() == 200) {
    String body = http.getString();
    setRelay(body.indexOf("\"on\":true") >= 0);
  }
  http.end();
}

void sendSensor() {
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  if (isnan(t) || isnan(h)) { Serial.println("DHT22 gagal dibaca"); return; }
  char json[64];
  snprintf(json, sizeof(json), "{\"temperature\":%.1f,\"humidity\":%.1f}", t, h);
  HTTPClient http;
  http.begin(String(SERVER) + "/api/sensor");
  addHeaders(http);
  int code = http.POST(json);
  Serial.printf("Sensor %s -> HTTP %d\n", json, code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(RELAY_PIN, OUTPUT);
  setRelay(false);
  dht.begin();
  connectWifi();
}

void loop() {
  unsigned long now = millis();
  if (WiFi.status() != WL_CONNECTED) {            // auto reconnect
    if (now - lastWifi > 10000) { lastWifi = now; WiFi.disconnect(); WiFi.begin(WIFI_SSID, WIFI_PASS); }
    return;
  }
  if (now - lastLamp >= LAMP_EVERY)     { lastLamp = now;   pollLamp(); }
  if (now - lastSensor >= SENSOR_EVERY) { lastSensor = now; sendSensor(); }
}
