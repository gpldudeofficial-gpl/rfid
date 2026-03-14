// scheduler.js — Daily cron job for absent student notifications
'use strict';

require('dotenv').config();
const cron = require('node-cron');
const db   = require('./database');
const { sendAbsentNotification } = require('./sms');

const NOTIFY_TIME = process.env.NOTIFY_TIME || '18:00';
const [notifyHour, notifyMin] = NOTIFY_TIME.split(':').map(Number);

console.log(`[Scheduler] Daily absent notification scheduled at ${NOTIFY_TIME} (server local time)`);

/**
 * Send SMS to all absent students' registered parent phone numbers.
 * Returns a summary of the operation.
 */
async function notifyAbsentStudents() {
  console.log('[Scheduler] Running absent notification job...');

  const absentStudents = await db.getAbsentStudentsToday();
  console.log(`[Scheduler] ${absentStudents.length} absent student(s) found.`);

  if (absentStudents.length === 0) {
    return { notified: 0, failed: 0, students: [] };
  }

  const results = await Promise.allSettled(
    absentStudents.map(async (student) => {
      const smsResult = await sendAbsentNotification(
        student.name,
        student.roll_no,
        student.class,
        student.parent_phone
      );
      return { student: student.name, phone: student.parent_phone, ...smsResult };
    })
  );

  const summary = results.map((r) =>
    r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
  );

  const notified = summary.filter((r) => r.success).length;
  const failed   = summary.filter((r) => !r.success).length;

  console.log(`[Scheduler] Done — ${notified} notified, ${failed} failed.`);
  return { notified, failed, students: summary };
}

// Schedule the cron job — runs daily at NOTIFY_TIME (IST)
cron.schedule(`${notifyMin} ${notifyHour} * * *`, () => {
  notifyAbsentStudents().catch((err) =>
    console.error('[Scheduler] Cron error:', err)
  );
}, { timezone: 'Asia/Kolkata' });

module.exports = { notifyAbsentStudents };
