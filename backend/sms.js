// sms.js — Twilio WhatsApp notification helper
'use strict';

require('dotenv').config();
const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_WHATSAPP_NUMBER, // e.g. +14155238886 (sandbox) or your approved WA number
  SMS_ENABLED,
} = process.env;

// Twilio WhatsApp sandbox number (default for trial accounts)
const FROM_WHATSAPP = TWILIO_WHATSAPP_NUMBER
  ? `whatsapp:${TWILIO_WHATSAPP_NUMBER}`
  : 'whatsapp:+14155238886';

let client = null;

if (SMS_ENABLED !== 'false' && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
  try {
    client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('[WhatsApp] Twilio client initialized. Sending via WhatsApp.');
  } catch (err) {
    console.error('[WhatsApp] Failed to initialize Twilio:', err.message);
  }
} else {
  console.warn('[WhatsApp] DISABLED or Twilio credentials not set.');
}

/**
 * Normalize an Indian phone number to E.164 format (+91XXXXXXXXXX).
 * Handles: 10-digit, 91XXXXXXXXXX, +91XXXXXXXXXX
 * @param {string} phone
 * @returns {string}
 */
function normalizePhone(phone) {
  let p = String(phone).replace(/\s+/g, '').replace(/-/g, '');
  if (p.startsWith('+')) return p;
  if (p.startsWith('91') && p.length === 12) return '+' + p;
  if (p.length === 10) return '+91' + p;
  return '+' + p;
}

/**
 * Send an absence notification via WhatsApp to a student's parent.
 * @param {string} studentName
 * @param {string} rollNo
 * @param {string} studentClass
 * @param {string} parentPhone  - any format, auto-normalized to E.164
 * @returns {Promise<{success: boolean, sid?: string, error?: string}>}
 */
async function sendAbsentNotification(studentName, rollNo, studentClass, parentPhone) {
  parentPhone = normalizePhone(parentPhone);
  const toWhatsApp = `whatsapp:${parentPhone}`;

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  const message =
    `📚 *Attendance Alert!*\n\n` +
    `Dear Parent/Guardian,\n\n` +
    `Your ward *${studentName}* ` +
    `(Roll No: ${rollNo}, Class: ${studentClass}) ` +
    `has *NOT* marked attendance today (${today}).\n\n` +
    `Please ensure their presence or contact the school administration.\n\n` +
    `— RFID Attendance System`;

  if (!client) {
    console.log(`[WhatsApp SKIPPED] Would send to ${parentPhone}:\n${message}`);
    return { success: false, error: 'WhatsApp disabled or Twilio not configured' };
  }

  try {
    const result = await client.messages.create({
      body: message,
      from: FROM_WHATSAPP,
      to: toWhatsApp,
    });
    console.log(`[WhatsApp] Sent to ${parentPhone} — SID: ${result.sid}`);
    return { success: true, sid: result.sid };
  } catch (err) {
    console.error(`[WhatsApp] Failed to send to ${parentPhone}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendAbsentNotification };
