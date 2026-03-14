// server.js — Main Express server for RFID Attendance System
'use strict';

require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const db         = require('./database');
const { initDb }                   = require('./db-init');
const { sendAbsentNotification }   = require('./sms');
const { notifyAbsentStudents }     = require('./scheduler'); // registers cron

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Auth Keys ────────────────────────────────────────────────────────────────
// DEVICE_KEY  — sent by ESP32 hardware in X-Device-Key header on every scan.
//               Share this with anyone who sets up an ESP32 for your system.
// ADMIN_KEY   — sent by the admin portal. Protects add/remove students & SMS.
//               Keep this private — only you should know it.
const DEVICE_KEY = process.env.DEVICE_KEY || null;
const ADMIN_KEY  = process.env.ADMIN_KEY  || null;

if (!DEVICE_KEY) console.warn('[Auth] WARNING: DEVICE_KEY not set. /api/scan is unprotected.');
if (!ADMIN_KEY)  console.warn('[Auth] WARNING: ADMIN_KEY not set.  Admin endpoints are unprotected.');

// ESP32 devices must send X-Device-Key header
function requireDeviceKey(req, res, next) {
  if (!DEVICE_KEY) return next(); // dev mode — no key required
  const provided = req.headers['x-device-key'];
  if (!provided || provided !== DEVICE_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid or missing device key' });
  }
  next();
}

// Admin portal must send X-Admin-Key header
function requireAdminKey(req, res, next) {
  if (!ADMIN_KEY) return next(); // dev mode — no key required
  const provided = req.headers['x-admin-key'];
  if (!provided || provided !== ADMIN_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized: invalid or missing admin key' });
  }
  next();
}

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ─── Ping / Health ────────────────────────────────────────────────────────────
// Open endpoint — ESP32 uses this on boot to verify it can reach the server
app.get('/api/ping', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ─── ESP32 Scan Endpoint ──────────────────────────────────────────────────────
// Called by ESP32 when a card is scanned
// POST /api/scan   Body: { "uid": "A1B2C3D4" }   Header: X-Device-Key: <key>
app.post('/api/scan', requireDeviceKey, async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ success: false, error: 'UID required' });

  try {
    const student = await db.getStudentByUid(uid.toUpperCase());
    if (!student) {
      console.log(`[SCAN] Unknown card: ${uid}`);
      return res.status(404).json({ success: false, error: 'Card not registered', uid });
    }

    const result = await db.recordAttendance(uid.toUpperCase());

    if (result.alreadyMarked) {
      console.log(`[SCAN] Already marked today: ${student.name}`);
      return res.json({
        success: true,
        alreadyMarked: true,
        student: { name: student.name, roll_no: student.roll_no, class: student.class },
      });
    }

    console.log(`[SCAN] Attendance marked: ${student.name} (${student.roll_no})`);
    return res.json({
      success: true,
      alreadyMarked: false,
      student: { name: student.name, roll_no: student.roll_no, class: student.class },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Student / Card Management ────────────────────────────────────────────────

// GET /api/students — list all registered students (open — anyone can view)
app.get('/api/students', async (req, res) => {
  try {
    const students = await db.getAllStudents();
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/students — register a new student + RFID card (admin only)
// Body: { uid, name, roll_no, class, phone, parent_phone }   Header: X-Admin-Key: <key>
app.post('/api/students', requireAdminKey, async (req, res) => {
  const { uid, name, roll_no, class: studentClass, phone, parent_phone } = req.body;
  if (!uid || !name || !roll_no || !studentClass || !phone || !parent_phone) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  try {
    await db.addStudent(uid.toUpperCase(), name, roll_no, studentClass, phone, parent_phone);
    console.log(`[ADMIN] Registered: ${name} — UID: ${uid.toUpperCase()}`);
    res.json({ success: true, message: `Student ${name} registered.` });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'Card UID already registered' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/students/:uid — remove a student + card (admin only)
app.delete('/api/students/:uid', requireAdminKey, async (req, res) => {
  const uid = req.params.uid.toUpperCase();
  try {
    const student = await db.getStudentByUid(uid);
    if (!student) return res.status(404).json({ success: false, error: 'Card not found' });

    await db.removeStudent(uid);
    console.log(`[ADMIN] Removed: ${student.name} — UID: ${uid}`);
    res.json({ success: true, message: `Student ${student.name} removed.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Attendance Queries ───────────────────────────────────────────────────────

// GET /api/attendance?date=YYYY-MM-DD
app.get('/api/attendance', async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    const records = await db.getAttendanceByDate(date);
    res.json({ success: true, date, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/attendance/history/:uid
app.get('/api/attendance/history/:uid', async (req, res) => {
  try {
    const records = await db.getAttendanceHistory(req.params.uid.toUpperCase());
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/absent — get absent students for today
app.get('/api/absent', async (req, res) => {
  try {
    const students = await db.getAbsentStudentsToday();
    res.json({ success: true, students });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats — dashboard statistics
app.get('/api/stats', async (req, res) => {
  try {
    res.json({ success: true, ...(await db.getStats()) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Manual SMS Notification ──────────────────────────────────────────────────

// POST /api/notify — manually trigger absent notifications (admin only)
app.post('/api/notify', requireAdminKey, async (req, res) => {
  try {
    const result = await notifyAbsentStudents();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── Catch-all → frontend SPA ─────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ─── Boot: init DB then start server ─────────────────────────────────────────
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n🚀 RFID Attendance Server running at http://localhost:${PORT}`);
      console.log(`📊 Web Portal: http://localhost:${PORT}`);
      console.log(`🔌 ESP32 Scan endpoint: POST http://localhost:${PORT}/api/scan`);
      console.log(`🔑 Auth: DEVICE_KEY=${DEVICE_KEY ? '✅ set' : '⚠️  NOT SET'}  ADMIN_KEY=${ADMIN_KEY ? '✅ set' : '⚠️  NOT SET'}\n`);
    });
  })
  .catch((err) => {
    console.error('[BOOT] Failed to initialize database:', err);
    process.exit(1);
  });
