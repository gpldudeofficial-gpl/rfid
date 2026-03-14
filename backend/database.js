// database.js — Turso (libSQL/SQLite) data layer
'use strict';

require('dotenv').config();
const { createClient } = require('@libsql/client');

// ─── Client singleton ─────────────────────────────────────────
let _client = null;

function getClient() {
  if (!_client) {
    _client = createClient({
      url:       process.env.TURSO_DATABASE_URL || 'file:local.db',
      authToken: process.env.TURSO_AUTH_TOKEN   || undefined,
    });
  }
  return _client;
}

// ─── Helper: current date/time strings ───────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function nowStr() {
  return new Date().toISOString(); // ISO 8601 — reliable cross-browser parsing
}

// ─── Student Queries ──────────────────────────────────────────

async function getAllStudents() {
  const client = getClient();
  const result = await client.execute(
    'SELECT * FROM students ORDER BY name ASC'
  );
  return result.rows;
}

async function getStudentByUid(uid) {
  const client = getClient();
  const result = await client.execute({
    sql:  'SELECT * FROM students WHERE uid = ?',
    args: [uid],
  });
  return result.rows[0] || null;
}

async function addStudent(uid, name, roll_no, studentClass, phone, parent_phone) {
  const client = getClient();
  try {
    await client.execute({
      sql:  `INSERT INTO students (uid, name, roll_no, class, phone, parent_phone, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [uid, name, roll_no, studentClass, phone, parent_phone, nowStr()],
    });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      const e = new Error('UNIQUE constraint failed: students.uid');
      e.code = 'UNIQUE';
      throw e;
    }
    throw err;
  }
}

async function removeStudent(uid) {
  const client = getClient();
  await client.batch([
    { sql: 'DELETE FROM students  WHERE uid = ?', args: [uid] },
    { sql: 'DELETE FROM attendance WHERE uid = ?', args: [uid] },
  ], 'write');
}

// ─── Attendance Queries ───────────────────────────────────────

async function recordAttendance(uid) {
  const client = getClient();
  const today  = todayStr();
  try {
    await client.execute({
      sql:  `INSERT INTO attendance (uid, scan_time, date) VALUES (?, ?, ?)`,
      args: [uid, nowStr(), today],
    });
    return { alreadyMarked: false };
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return { alreadyMarked: true };
    }
    throw err;
  }
}

async function getAttendanceByDate(date) {
  const client = getClient();
  const result = await client.execute({
    sql: `SELECT a.*, s.name, s.roll_no, s.class
          FROM attendance a
          LEFT JOIN students s ON s.uid = a.uid
          WHERE a.date = ?
          ORDER BY a.scan_time ASC`,
    args: [date],
  });
  return result.rows;
}

async function getAttendanceHistory(uid) {
  const client = getClient();
  const result = await client.execute({
    sql:  `SELECT * FROM attendance WHERE uid = ? ORDER BY scan_time DESC LIMIT 60`,
    args: [uid],
  });
  return result.rows;
}

async function getAbsentStudentsToday() {
  const client = getClient();
  const today  = todayStr();
  const result = await client.execute({
    sql:  `SELECT * FROM students
           WHERE uid NOT IN (
             SELECT uid FROM attendance WHERE date = ?
           )`,
    args: [today],
  });
  return result.rows;
}

async function getStats() {
  const client  = getClient();
  const today   = todayStr();

  const [totalRes, presentRes] = await Promise.all([
    client.execute('SELECT COUNT(*) AS cnt FROM students'),
    client.execute({
      sql:  'SELECT COUNT(DISTINCT uid) AS cnt FROM attendance WHERE date = ?',
      args: [today],
    }),
  ]);

  const total   = Number(totalRes.rows[0].cnt);
  const present = Number(presentRes.rows[0].cnt);
  return { totalStudents: total, presentToday: present, absentToday: total - present, date: today };
}

module.exports = {
  getClient,
  getAllStudents,
  getStudentByUid,
  addStudent,
  removeStudent,
  recordAttendance,
  getAttendanceByDate,
  getAttendanceHistory,
  getAbsentStudentsToday,
  getStats,
};
