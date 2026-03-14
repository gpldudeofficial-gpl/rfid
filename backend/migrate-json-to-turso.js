#!/usr/bin/env node
// migrate-json-to-turso.js
// One-time script: reads the old db.json and inserts its data into Turso.
// Run ONCE from the backend/ directory:
//   node migrate-json-to-turso.js
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const DB_PATH = path.join(__dirname, 'db.json');

if (!fs.existsSync(DB_PATH)) {
  console.log('No db.json found — nothing to migrate.');
  process.exit(0);
}

const raw  = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
const { students = [], attendance = [] } = raw;

const client = createClient({
  url:       process.env.TURSO_DATABASE_URL || 'file:local.db',
  authToken: process.env.TURSO_AUTH_TOKEN   || undefined,
});

async function run() {
  console.log(`Migrating ${students.length} students and ${attendance.length} attendance records…`);

  // Create tables (idempotent)
  await client.batch([
    `CREATE TABLE IF NOT EXISTS students (
      uid TEXT PRIMARY KEY, name TEXT NOT NULL, roll_no TEXT NOT NULL,
      class TEXT NOT NULL, phone TEXT NOT NULL, parent_phone TEXT NOT NULL, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT, uid TEXT NOT NULL,
      scan_time TEXT NOT NULL, date TEXT NOT NULL, UNIQUE(uid, date)
    )`,
  ], 'write');

  // Insert students
  for (const s of students) {
    try {
      await client.execute({
        sql:  `INSERT OR IGNORE INTO students (uid, name, roll_no, class, phone, parent_phone, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [s.uid, s.name, s.roll_no, s.class, s.phone, s.parent_phone,
               s.created_at || new Date().toISOString()],
      });
      console.log(`  ✅ Student: ${s.name} (${s.uid})`);
    } catch (e) {
      console.warn(`  ⚠️  Skipped ${s.uid}: ${e.message}`);
    }
  }

  // Insert attendance
  for (const a of attendance) {
    try {
      await client.execute({
        sql:  `INSERT OR IGNORE INTO attendance (uid, scan_time, date) VALUES (?, ?, ?)`,
        args: [a.uid, a.scan_time || new Date().toISOString(), a.date],
      });
    } catch (e) {
      console.warn(`  ⚠️  Skipped attendance ${a.uid}/${a.date}: ${e.message}`);
    }
  }

  console.log('\n✅ Migration complete!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
