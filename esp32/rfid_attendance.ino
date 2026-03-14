/*
 * ═══════════════════════════════════════════════════════════════════
 *  RFID Student Attendance System — ESP32 Firmware
 *  Hardware: ESP32 Dev Board + RC522 RFID Reader
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Libraries Required (install via Arduino Library Manager):
 *    - MFRC522 by GithubCommunity  (RFID reader)
 *    - ArduinoJson by Benoît Blanchon (JSON)
 *    - NTPClient by Fabrice Weinberg (time sync)
 *
 *  Board: ESP32 Dev Module
 *  Upload Speed: 115200
 *
 *  ── Wiring: RC522 ↔ ESP32 ──────────────────────────────────────
 *  RC522       ESP32
 *  3.3V   →   3.3V
 *  GND    →   GND
 *  SDA    →   GPIO 5  (CS)
 *  SCK    →   GPIO 18
 *  MOSI   →   GPIO 23
 *  MISO   →   GPIO 19
 *  RST    →   GPIO 4
 *  ────────────────────────────────────────────────────────────────
 *  Green LED  → GPIO 26 (through 330Ω resistor)
 *  Red LED    → GPIO 27 (through 330Ω resistor)
 *  Buzzer     → GPIO 25
 */

#include <Arduino.h>
#include <SPI.h>
#include <MFRC522.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// ──────────────────────────────────────────────────────────────────
//  ★  CONFIGURE THESE SETTINGS  ★
// ──────────────────────────────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// URL of the hosted backend (Render / Railway / local)
// Examples:
//   Render:  "https://rfid-attendance-xxxx.onrender.com"
//   Local:   "http://192.168.1.105:3000"
const char* SERVER_URL    = "https://your-app-name.onrender.com";

// Device key — must match DEVICE_KEY in your backend .env
// Get this from the admin (the person who runs the server).
const char* DEVICE_KEY    = "your-device-key-here";
// ──────────────────────────────────────────────────────────────────

// ── Pin Definitions ───────────────────────────────────────────────
#define SS_PIN      5
#define RST_PIN     4
#define GREEN_LED  26
#define RED_LED    27
#define BUZZER     25

// ── RFID ──────────────────────────────────────────────────────────
MFRC522 mfrc522(SS_PIN, RST_PIN);

// ── NTP (IST = UTC+5:30) ──────────────────────────────────────────
WiFiUDP   ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 19800); // +5:30 offset

// ── State ─────────────────────────────────────────────────────────
unsigned long lastScanMs    = 0;
const unsigned long COOLDOWN = 3000; // 3 sec between scans of same card

// ─────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial) delay(10);

  // GPIO setup
  pinMode(GREEN_LED, OUTPUT);
  pinMode(RED_LED,   OUTPUT);
  pinMode(BUZZER,    OUTPUT);
  setLEDs(false, false);

  // SPI + RFID
  SPI.begin();
  mfrc522.PCD_Init();
  Serial.println("\n[RFID] RC522 Reader initialized.");

  // WiFi
  connectWiFi();

  // NTP
  timeClient.begin();
  timeClient.update();
  Serial.println("[NTP] Time synced: " + timeClient.getFormattedTime());

  // Ping server to verify connectivity
  pingServer();

  Serial.println("\n✅ System Ready — Tap an RFID card...\n");
  flashLED(GREEN_LED, 2);
}

// ─────────────────────────────────────────────────────────────────
void loop() {
  // Keep WiFi and NTP alive
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected! Reconnecting…");
    connectWiFi();
  }
  timeClient.update();

  // Wait for a card
  if (!mfrc522.PICC_IsNewCardPresent() || !mfrc522.PICC_ReadCardSerial()) {
    delay(100);
    return;
  }

  // Cooldown check
  if (millis() - lastScanMs < COOLDOWN) {
    mfrc522.PICC_HaltA();
    return;
  }
  lastScanMs = millis();

  // Read UID
  String uid = getUID();
  Serial.println("\n[SCAN] Card detected — UID: " + uid);
  Serial.println("[TIME] " + timeClient.getFormattedTime());

  // POST to server
  postAttendance(uid);

  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();
  delay(500);
}

// ─────────────────────────────────────────────────────────────────
//  Ping the server on boot to verify connectivity & device key
// ─────────────────────────────────────────────────────────────────
void pingServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[PING] No WiFi — skipping server ping.");
    return;
  }

  HTTPClient http;
  String endpoint = String(SERVER_URL) + "/api/ping";
  http.begin(endpoint);
  http.addHeader("X-Device-Key", DEVICE_KEY);

  Serial.println("[PING] Checking server at: " + endpoint);
  int httpCode = http.GET();

  if (httpCode == 200) {
    Serial.println("[PING] ✅ Server reachable — device key accepted.");
    flashLED(GREEN_LED, 1);
  } else if (httpCode == 401) {
    Serial.println("[PING] ❌ Server responded 401 — check DEVICE_KEY!");
    flashLED(RED_LED, 5);
  } else {
    Serial.printf("[PING] Server responded with code: %d\n", httpCode);
    flashLED(RED_LED, 2);
  }
  http.end();
}

// ─────────────────────────────────────────────────────────────────
//  Get UID as uppercase hex string (e.g. "A1B2C3D4")
// ─────────────────────────────────────────────────────────────────
String getUID() {
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

// ─────────────────────────────────────────────────────────────────
//  POST attendance to backend API (with device key header)
// ─────────────────────────────────────────────────────────────────
void postAttendance(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] No WiFi — cannot post.");
    blinkError();
    return;
  }

  HTTPClient http;
  String endpoint = String(SERVER_URL) + "/api/scan";

  http.begin(endpoint);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY); // ← Auth header for ESP32

  // Build JSON body
  StaticJsonDocument<128> doc;
  doc["uid"] = uid;
  String body;
  serializeJson(doc, body);

  Serial.println("[HTTP] POST → " + endpoint);
  int httpCode = http.POST(body);

  if (httpCode == 200 || httpCode == 201) {
    String response = http.getString();
    deserializeJson(doc, response);

    bool alreadyMarked = doc["alreadyMarked"] | false;
    const char* name   = doc["student"]["name"] | "Unknown";
    const char* rollNo = doc["student"]["roll_no"] | "";
    const char* cls    = doc["student"]["class"] | "";

    if (alreadyMarked) {
      Serial.println("[RESULT] Already marked today: " + String(name));
      beep(500); // single medium beep = already marked
      setLEDs(false, true);
      delay(400);
      setLEDs(false, false);
    } else {
      Serial.println("[RESULT] ✅ Marked: " + String(name) + " | " + rollNo + " | " + cls);
      flashLED(GREEN_LED, 1);
      beep(150); // short beep = success
    }

  } else if (httpCode == 401) {
    Serial.println("[RESULT] ❌ Unauthorized — check DEVICE_KEY in firmware!");
    flashLED(RED_LED, 5);
    beep(2000); // very long beep = auth failure

  } else if (httpCode == 404) {
    Serial.println("[RESULT] ❌ Unknown card: " + uid);
    flashLED(RED_LED, 3);
    beep(1000); // long beep = not registered

  } else {
    Serial.printf("[HTTP] Error code: %d\n", httpCode);
    blinkError();
  }

  http.end();
}

// ─────────────────────────────────────────────────────────────────
//  WiFi connection helper
// ─────────────────────────────────────────────────────────────────
void connectWiFi() {
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 40) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\n[WiFi] ❌ Failed to connect. Check credentials.");
  }
}

// ─────────────────────────────────────────────────────────────────
//  LED / Buzzer helpers
// ─────────────────────────────────────────────────────────────────
void setLEDs(bool green, bool red) {
  digitalWrite(GREEN_LED, green ? HIGH : LOW);
  digitalWrite(RED_LED,   red   ? HIGH : LOW);
}

void flashLED(int pin, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(pin, HIGH);
    delay(200);
    digitalWrite(pin, LOW);
    delay(150);
  }
}

void blinkError() {
  for (int i = 0; i < 3; i++) {
    setLEDs(false, true);
    delay(150);
    setLEDs(false, false);
    delay(100);
  }
}

void beep(int durationMs) {
  digitalWrite(BUZZER, HIGH);
  delay(durationMs);
  digitalWrite(BUZZER, LOW);
}
