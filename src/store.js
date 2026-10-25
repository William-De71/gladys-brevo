// -----------------------------------------------------------------------------
// What the integration remembers across restarts, in /data/state.json (the
// only writable path of the container):
//
//   day, month, counters   emails and SMS sent by Gladys today and this month,
//                          failures of the month (the account widget)
//   lowCredits             the last state of the low credits transition, so a
//                          restart does not fire `credits_low` again
//   messages               the last messages sent (or not sent), newest first:
//                          channel, masked recipient, subject or first words,
//                          delivery status. The delivery events of Brevo are
//                          matched to them by message id, and the activity
//                          widget lists them. A message fires
//                          `delivery_failed` once, never again after a restart.
//
// Recipients are kept masked: the file never holds a full address or number.
// A missing or broken file starts empty. Writes go through a temporary file
// and a rename, one after the other.
// -----------------------------------------------------------------------------

import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DELIVERED, DELIVERY_FAILURES } from './brevo.js';

const DEFAULT_PATH = '/data/state.json';
const MAX_MESSAGES = 50;
// The delivery of a message is followed for two days: Brevo keeps retrying a
// deferred email for a while, and the events endpoints are read over 2 days.
const FOLLOW_MS = 48 * 60 * 60 * 1000;

const SENT = 'sent';
const NOT_SENT = 'not_sent';
const FAILURE_STATUSES = new Set(Object.values(DELIVERY_FAILURES));

/**
 * @description The day and the month of an instant (UTC).
 * @param {number} instant - The instant, in ms.
 * @returns {{ day: string, month: string }} 'YYYY-MM-DD' and 'YYYY-MM'.
 * @example
 * periodOf(Date.UTC(2026, 9, 25)); // -> { day: '2026-10-25', month: '2026-10' }
 */
function periodOf(instant) {
  const iso = new Date(instant).toISOString();
  return { day: iso.slice(0, 10), month: iso.slice(0, 7) };
}

/**
 * @description Fresh counters.
 * @returns {object} The counters.
 */
const emptyCounters = () => ({
  dayEmail: 0,
  daySms: 0,
  monthEmail: 0,
  monthSms: 0,
  monthFailed: 0,
});

/**
 * @description A fresh state.
 * @param {number} now - Now, in ms.
 * @returns {object} The state.
 */
function emptyState(now) {
  return {
    version: 1,
    ...periodOf(now),
    counters: emptyCounters(),
    lowCredits: null,
    messages: [],
  };
}

/**
 * @description Keep the known fields of a state read from disk.
 * @param {object} data - The parsed file.
 * @param {number} now - Now, in ms.
 * @returns {object} The state.
 */
function sanitize(data, now) {
  const state = emptyState(now);
  if (typeof data?.day === 'string') {
    state.day = data.day;
  }
  if (typeof data?.month === 'string') {
    state.month = data.month;
  }
  Object.keys(state.counters).forEach((key) => {
    const value = data?.counters?.[key];
    if (Number.isFinite(value) && value >= 0) {
      state.counters[key] = value;
    }
  });
  if (typeof data?.lowCredits === 'boolean') {
    state.lowCredits = data.lowCredits;
  }
  if (Array.isArray(data?.messages)) {
    state.messages = data.messages
      .filter(
        (entry) =>
          entry &&
          (entry.channel === 'email' || entry.channel === 'sms') &&
          typeof entry.status === 'string' &&
          typeof entry.at === 'string',
      )
      .slice(0, MAX_MESSAGES);
  }
  return state;
}

/**
 * @description Create the store.
 * @param {object} options - Options.
 * @param {string} [options.path] - The JSON file.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {object} options.logger - Logger.
 * @returns {object} The store.
 * @example
 * const store = createStore({ logger });
 * await store.load();
 */
function createStore({ path = DEFAULT_PATH, now = () => Date.now(), logger }) {
  let state = emptyState(now());
  let saving = Promise.resolve();

  /**
   * @description A new day or month starts its counters again.
   */
  function roll() {
    const { day, month } = periodOf(now());
    if (state.day !== day) {
      state.day = day;
      state.counters.dayEmail = 0;
      state.counters.daySms = 0;
    }
    if (state.month !== month) {
      state.month = month;
      state.counters.monthEmail = 0;
      state.counters.monthSms = 0;
      state.counters.monthFailed = 0;
    }
  }

  /**
   * @description Write the state (queued, never throws).
   * @returns {Promise<void>} Resolves once written (or failed).
   */
  function save() {
    const content = JSON.stringify(state);
    saving = saving.then(async () => {
      try {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, content);
        await rename(`${path}.tmp`, path);
      } catch (err) {
        logger.warn(`Unable to write ${path}: ${err.message}`);
      }
    });
    return saving;
  }

  /**
   * @description Add messages at the top of the list.
   * @param {object[]} entries - The messages.
   */
  function remember(entries) {
    state.messages = [...entries, ...state.messages].slice(0, MAX_MESSAGES);
  }

  return {
    /**
     * @description Read the file; a missing or broken file starts empty.
     * @returns {Promise<void>}
     */
    async load() {
      try {
        state = sanitize(JSON.parse(await readFile(path, 'utf8')), now());
      } catch (err) {
        if (err.code !== 'ENOENT') {
          logger.warn(`Unable to read ${path}: ${err.message}`);
        }
        state = emptyState(now());
      }
      roll();
    },

    /** @returns {object} The counters of today and of this month. */
    counters() {
      roll();
      return { ...state.counters };
    },

    /**
     * @description Count and remember messages Brevo accepted.
     * @param {string} channel - 'email' or 'sms'.
     * @param {Array<{ messageId: string|null, recipient: string, label: string }>} entries -
     *   One per recipient; the recipient already masked.
     * @returns {Promise<void>}
     */
    recordSent(channel, entries) {
      roll();
      const key = channel === 'sms' ? 'Sms' : 'Email';
      state.counters[`day${key}`] += entries.length;
      state.counters[`month${key}`] += entries.length;
      const at = new Date(now()).toISOString();
      remember(
        entries.map((entry) => ({
          id: entry.messageId,
          channel,
          recipient: entry.recipient,
          label: String(entry.label ?? '').slice(0, 120),
          at,
          status: SENT,
        })),
      );
      return save();
    },

    /**
     * @description Count and remember a message Brevo did not accept.
     * @param {string} channel - 'email' or 'sms'.
     * @param {object} entry - `{ recipient (masked), label, reason }`.
     * @returns {Promise<void>}
     */
    recordNotSent(channel, { recipient, label, reason }) {
      roll();
      state.counters.monthFailed += 1;
      remember([
        {
          id: null,
          channel,
          recipient,
          label: String(label ?? '').slice(0, 120),
          at: new Date(now()).toISOString(),
          status: NOT_SENT,
          reason,
        },
      ]);
      return save();
    },

    /**
     * @description Whether a channel has messages whose delivery is still
     * followed (sent less than two days ago, no final status yet).
     * @param {string} channel - 'email' or 'sms'.
     * @returns {boolean} True when the events are worth reading.
     */
    awaitingDelivery(channel) {
      const limit = now() - FOLLOW_MS;
      return state.messages.some(
        (entry) =>
          entry.channel === channel &&
          entry.id &&
          entry.status === SENT &&
          Date.parse(entry.at) >= limit,
      );
    },

    /**
     * @description Apply a delivery event to the message it belongs to.
     * @param {string} channel - 'email' or 'sms'.
     * @param {{ messageId: string, status: string, reason: string, date: string }} event - The event.
     * @returns {object|null} The message when it just FAILED (fire the trigger
     *   once), null otherwise (unknown message, delivered, already failed).
     */
    applyEvent(channel, event) {
      const entry = state.messages.find(
        (message) => message.channel === channel && message.id && message.id === event.messageId,
      );
      if (!entry || FAILURE_STATUSES.has(entry.status) || entry.status === NOT_SENT) {
        return null;
      }
      if (event.status === DELIVERED) {
        if (entry.status === SENT) {
          entry.status = DELIVERED;
          entry.statusAt = event.date;
        }
        return null;
      }
      // A failure after "delivered" is possible (a spam complaint).
      entry.status = event.status;
      entry.statusAt = event.date;
      entry.reason = event.reason;
      state.counters.monthFailed += 1;
      return { ...entry };
    },

    /** @returns {Promise<void>} Write after a batch of applyEvent. */
    save,

    /** @returns {boolean|null} The last low credits state (null: never read). */
    lowCredits: () => state.lowCredits,

    /**
     * @description Remember the low credits state.
     * @param {boolean|null} low - Below the threshold or not (null: compare again).
     * @returns {Promise<void>}
     */
    setLowCredits(low) {
      if (state.lowCredits === low) {
        return Promise.resolve();
      }
      state.lowCredits = low;
      return save();
    },

    /** @returns {object[]} The last messages, newest first. */
    recentMessages: () => state.messages.map((entry) => ({ ...entry })),

    /** @returns {Promise<void>} Resolves when every write is done (tests, shutdown). */
    flush: () => saving,
  };
}

export { createStore, periodOf, DEFAULT_PATH, SENT, NOT_SENT, FOLLOW_MS };
