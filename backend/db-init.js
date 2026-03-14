// db-init.js — Create tables in Turso on first run
'use strict';

const { getClient } = require('./database');

async function initDb() {
  const client = getClient();

  await client.batch([
    `CREATE TABLE IF NOT EXISTS students (
      uid         TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      roll_no     TEXT NOT NULL,
      class       TEXT NOT NULL,
      phone       TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      created_at  TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS attendance (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      uid       TEXT NOT NULL,
      scan_time TEXT NOT NULL,
      date      TEXT NOT NULL,
      UNIQUE(uid, date)
    )`,
  ], 'write');

  console.log('[DB] Tables ready (Turso/libSQL).');
}

module.exports = { initDb };
