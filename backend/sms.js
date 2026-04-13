// sms.js — Twilio SMS helper
'use strict';

require('dotenv').config();
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  SMS_ENABLED,
} = process.env;

let client = null;

if (SMS_ENABLED !== 'false' && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('[SMS] Twilio client initialized.');
  } catch (err) {
    console.error('[SMS] Failed to initialize Twilio:', err.message);
  }
} else {
  console.warn('[SMS] SMS is DISABLED or Twilio credentials not set.');
}

/**
 * Normalize an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Handles: 10-digit, 91XXXXXXXXXX, +91XXXXXXXXXX
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/-/g, '');
  if (p.startsWith('+')) return p;           // already E.164
  if (p.startsWith('91') && p.length === 12) return '+' + p;  // 91XXXXXXXXXX
  if (p.length === 10) return '+91' + p;     // bare 10-digit Indian number
  return '+' + p;                            // fallback — just prepend +
}

/**
 * Send an absence notification to a student's parent phone.
 * @param {string} studentName
 * @param {string} rollNo
 * @param {string} studentClass
 * @param {string} parentPhone  - any format, auto-normalized to E.164
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendAbsentNotification(studentName, rollNo, studentClass, parentPhone) {
  parentPhone = normalizePhone(parentPhone);
  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const message =
    `📚 Attendance Alert!\n\n` +
    `Dear Parent/Guardian,\n\n` +
    `This is to inform you that your ward *${studentName}* ` +
    `(Roll No: ${rollNo}, Class: ${studentClass}) ` +
    `has NOT marked their attendance today (${today}).\n\n` +
    `Please ensure their presence or contact the school administration.\n\n` +
    `— RFID Attendance System`;

  if (!client) {
    console.log(`[SMS SKIPPED] Would send to ${parentPhone}:\n${message}`);
    return { success: false, error: 'SMS disabled or Twilio not configured' };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: TWILIO_PHONE_NUMBER,
      to: parentPhone,
    });
    console.log(`[SMS] Sent to ${parentPhone} — SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (err) {
    console.error(`[SMS] Failed to send to ${parentPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendAbsentNotification };
