# 📡 RFID Student Attendance System

> IoT-based student attendance system using **ESP32 + RC522 RFID** with a **web portal** and **Twilio SMS alerts** for parents of absent students.

---

## 📁 Project Structure

```
rfid-attendance/
├── backend/
│   ├── server.js       ← Express API server
│   ├── database.js     ← SQLite schema & queries
│   ├── sms.js          ← Twilio SMS helper
│   ├── scheduler.js    ← Daily absent SMS cron job
│   ├── package.json
│   └── .env.example    ← Copy to .env and fill in credentials
│
├── frontend/
│   ├── index.html      ← Web portal (served by backend)
│   ├── style.css
│   └── app.js
│
└── esp32/
    └── rfid_attendance.ino  ← Arduino sketch for ESP32
```

---

## 🔌 Hardware Wiring (RC522 ↔ ESP32)

| RC522 Pin | ESP32 GPIO |
|-----------|-----------|
| 3.3V      | 3.3V      |
| GND       | GND       |
| SDA (SS)  | GPIO 5    |
| SCK       | GPIO 18   |
| MOSI      | GPIO 23   |
| MISO      | GPIO 19   |
| RST       | GPIO 4    |

**Optional feedback:**

| Component  | ESP32 GPIO |
|------------|-----------|
| Green LED  | GPIO 26   |
| Red LED    | GPIO 27   |
| Buzzer     | GPIO 25   |

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
# Requires Node.js 18+
cd rfid-attendance/backend

# Install dependencies
npm install

# Create environment file
copy .env.example .env
# Edit .env with your Twilio credentials

# Start the server
npm start
```

Server starts at **http://localhost:3000**

### 2. Web Portal

Open **http://localhost:3000** in your browser.

### 3. ESP32 Setup

1. Open `esp32/rfid_attendance.ino` in **Arduino IDE**
2. Install required libraries via Library Manager:
   - `MFRC522` by GithubCommunity
   - `ArduinoJson` by Benoît Blanchon
   - `NTPClient` by Fabrice Weinberg
3. Edit these 3 lines at the top of the sketch:
   ```cpp
   const char* WIFI_SSID     = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* SERVER_URL    = "http://192.168.x.x:3000"; // Your PC's local IP
   ```
4. Select **ESP32 Dev Module** as board, upload at **115200 baud**
5. Open Serial Monitor — tap a card to test

---

## 🔑 Finding Your School's RFID Card UID

Since the card UID needs to be registered before use:

1. Temporarily register a dummy student in the portal
2. Tap the card on the ESP32  
3. The Serial Monitor shows: `[SCAN] Card detected — UID: AABBCCDD`
4. Update the student record with that actual UID

---

## 📱 Twilio SMS Setup

1. Create a free account at [twilio.com](https://www.twilio.com)
2. Get a Twilio phone number (free trial included)
3. Fill in `.env`:
   ```ini
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxxxxx
   TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
   NOTIFY_TIME=18:00      # 6 PM daily alert for absent students
   SMS_ENABLED=true
   ```
4. **Trial accounts**: You must verify the parent phone numbers in Twilio console before SMS can be sent to them.

---

## 🌐 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scan` | ESP32 posts card UID to mark attendance |
| `GET`  | `/api/stats` | Dashboard statistics |
| `GET`  | `/api/students` | List all students |
| `POST` | `/api/students` | Register new student + RFID card |
| `DELETE` | `/api/students/:uid` | Remove student |
| `GET`  | `/api/attendance?date=YYYY-MM-DD` | Attendance for a date |
| `GET`  | `/api/absent` | Absent students today |
| `POST` | `/api/notify` | Manually trigger SMS for absent students |

---

## 🔊 ESP32 Beep Meanings

| Beep | LED | Meaning |
|------|-----|---------|
| 1 short beep | Green flash | Attendance marked ✅ |
| 1 medium beep | Red flash | Already marked today ⚠️ |
| 1 long beep | Red blink x3 | Card not registered ❌ |

---

## 📦 Dependencies

### Backend
- `express` — HTTP server
- `better-sqlite3` — local SQLite database
- `twilio` — SMS notifications
- `node-cron` — daily scheduler
- `cors`, `dotenv`

### ESP32 Libraries
- `MFRC522` — RFID reader
- `ArduinoJson` — JSON parsing
- `NTPClient` — time sync
