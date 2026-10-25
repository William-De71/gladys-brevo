// -----------------------------------------------------------------------------
// Scene triggers of the Brevo integration.
//
//   message_not_sent  Gladys could not hand a notification to Brevo. One event
//                     per TRANSITION, never one per failed message: the first
//                     failure fires, the following ones of the same scope stay
//                     silent until a message of that channel goes through
//                     again. The scope is the channel (key, credits, sender,
//                     Brevo down…), or the recipient for an address or a number
//                     Brevo refuses. This keeps a scene that answers the
//                     failure through this same channel from looping.
//   delivery_failed   Brevo accepted a message, then reported that it did not
//                     reach the recipient (bounce, blocked, spam complaint…).
//                     Once per message (store.js), read from the events of
//                     Brevo while the delivery is followed.
//   credits_low       the SMS credits went below the threshold of the
//                     configuration; armed again once they are back above it.
//
// A scene ACTION never fires a trigger: its result goes to the scene.
// Event data is flat (scalars only) and holds the declared variables only.
// -----------------------------------------------------------------------------

import { FAILURE_REASONS } from './brevo.js';

const SCENE_TRIGGERS = Object.freeze({
  MESSAGE_NOT_SENT: 'message_not_sent',
  DELIVERY_FAILED: 'delivery_failed',
  CREDITS_LOW: 'credits_low',
});

const MAX_DATA_TEXT = 1000;

/**
 * @description The payload of `delivery_failed`.
 * @param {object} message - The message (store.applyEvent).
 * @returns {object} The event data.
 * @example
 * deliveryPayload({ channel: 'email', status: 'hard_bounce', recipient: 'a***@b.fr', … });
 */
function deliveryPayload(message) {
  return {
    channel: message.channel,
    event: message.status,
    recipient: String(message.recipient ?? ''),
    subject: String(message.label ?? '').slice(0, MAX_DATA_TEXT),
    reason: String(message.reason ?? '').slice(0, MAX_DATA_TEXT),
    message_id: String(message.id ?? ''),
    sent_at: String(message.at ?? ''),
  };
}

/**
 * @description Track the failures and fire `message_not_sent` on the first one
 * of each scope.
 * @param {object} gladys - The GladysIntegration client.
 * @param {object} logger - Logger.
 * @returns {{ failed: Function, sent: Function }} The tracker.
 * @example
 * const failures = createFailureEvents(gladys, logger);
 * await failures.failed('email', 'a***@example.com', err);
 * failures.sent('email', 'a***@example.com');
 */
function createFailureEvents(gladys, logger) {
  const failing = new Set();

  return {
    /**
     * @description A notification was not sent: fire the trigger if its scope
     * was not already failing. Never throws.
     * @param {string} channel - 'email' or 'sms'.
     * @param {string} recipient - The masked recipient.
     * @param {object} err - A BrevoError.
     * @returns {Promise<void>}
     */
    async failed(channel, recipient, err) {
      const reason = err.reason ?? FAILURE_REASONS.UNEXPECTED;
      const scope =
        reason === FAILURE_REASONS.INVALID_RECIPIENT
          ? `${channel}:${recipient}`
          : `${channel}:account`;
      if (failing.has(scope)) {
        return;
      }
      failing.add(scope);
      try {
        await gladys.publishSceneEvent(SCENE_TRIGGERS.MESSAGE_NOT_SENT, {
          channel,
          reason,
          status: typeof err.status === 'number' ? err.status : null,
          error: String(err.message).slice(0, MAX_DATA_TEXT),
          recipient: String(recipient ?? '').slice(0, MAX_DATA_TEXT),
        });
      } catch (eventErr) {
        logger.warn(`Could not fire ${SCENE_TRIGGERS.MESSAGE_NOT_SENT}: ${eventErr.message}`);
      }
    },

    /**
     * @description A message went through: the channel works again, and so
     * does this recipient.
     * @param {string} channel - 'email' or 'sms'.
     * @param {string} recipient - The masked recipient.
     */
    sent(channel, recipient) {
      failing.delete(`${channel}:account`);
      failing.delete(`${channel}:${recipient}`);
    },
  };
}

export { createFailureEvents, deliveryPayload, SCENE_TRIGGERS };
