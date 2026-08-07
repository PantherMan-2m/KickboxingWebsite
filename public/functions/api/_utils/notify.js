// T3.3: coach (and, for waitlist_promoted, student) notifications for waitlist
// events (D1: waitlist join only, no class_full event). buildEvent is split out
// as the pure, network-free half so it's testable in isolation.
import { sendEmail } from './email.js';

const EVENT_TOPICS = {
  waitlist_joined: 'WAITLIST_JOINED',
  waitlist_promoted: 'WAITLIST_PROMOTED',
};

// Pure. `payload` must include className, dayLabel, time, date, studentName --
// plus whatever else is specific to the event type (e.g. queueLength for
// waitlist_joined). Subject is a stable bracketed topic; the body is one
// "key: value" line per field (insertion order of `payload`, `event` first),
// no prose, so an inbox-watching automation can parse it naively.
export function buildEvent(type, payload) {
  const topic = EVENT_TOPICS[type];
  if (!topic) {
    throw new Error(`Unknown notification event type: ${type}`);
  }
  const json = { event: type, ...payload };
  const subject = `[CJN][${topic}] ${payload.dayLabel} ${payload.time} ${payload.className} — ${payload.date}`;
  const text = Object.entries(json)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return { type, subject, text, json };
}

// Dispatches `event` via email (when COACH_NOTIFY_EMAIL + RESEND_API_KEY are
// both set) and/or webhook (when COACH_WEBHOOK_URL is set), through
// ctx.waitUntil() so neither ever adds latency to the caller's response. Each
// path is independent -- the feature ships working with neither, one, or both
// configured, and with no env vars set this is a pure no-op.
//
// Non-negotiable: must never turn a successful caller action into a failure.
// sendEmail doesn't catch a network-level fetch rejection, and a bare `fetch`
// to the webhook URL can reject the same way -- both are wrapped in their own
// try/catch so a Resend outage or an unreachable webhook endpoint is silently
// swallowed, never thrown back at the caller.
export function notifyCoach(env, ctx, event) {
  ctx.waitUntil(dispatchToCoach(env, event));
}

async function dispatchToCoach(env, event) {
  if (env.COACH_NOTIFY_EMAIL && env.RESEND_API_KEY) {
    await sendEmailSafely(env, env.COACH_NOTIFY_EMAIL, event);
  }
  if (env.COACH_WEBHOOK_URL) {
    try {
      await fetch(env.COACH_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CJN-Signature': env.COACH_WEBHOOK_SECRET || '',
        },
        body: JSON.stringify(event.json),
      });
    } catch {
      // Swallowed deliberately -- see the module comment above.
    }
  }
}

// waitlist_promoted (T3.4) goes to the promoted student directly, not just the
// coach -- `to` is the student's own address from the users table, not an env
// var. Gated on RESEND_API_KEY alone (no COACH_NOTIFY_EMAIL involved): there's
// no coach-webhook equivalent for a student notification.
export function notifyStudent(env, ctx, to, event) {
  if (!env.RESEND_API_KEY) return;
  ctx.waitUntil(sendEmailSafely(env, to, event));
}

async function sendEmailSafely(env, to, event) {
  try {
    await sendEmail(env, { to, subject: event.subject, text: event.text });
  } catch {
    // Swallowed deliberately -- see the module comment above.
  }
}
