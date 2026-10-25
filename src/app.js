// -----------------------------------------------------------------------------
// Every handler of the Brevo integration, registered on the Gladys client it
// receives: index.js passes the real one, the tests the fake Gladys of the SDK
// (`@gladysassistant/integration-sdk/testing`).
//
// A COMMUNICATION integration of the SEND-ONLY family (`messaging: { receive:
// false }`): Gladys notifications go out by email, by SMS or both, through the
// transactional APIs of Brevo.
//   - The API key and the senders are set once by the administrator
//     (`config_schema`); each user picks the channel and enters an address
//     and/or a mobile number (`contact_schema`, "My account" block), which
//     Gladys hands with every message to `onSendMessage`.
//   - A camera snapshot sent by a scene travels as an email attachment; an SMS
//     carries the text only.
//   - Scene triggers message_not_sent / delivery_failed / credits_low, scene
//     actions send_email / send_sms / get_account, widgets account / activity,
//     Configuration screen buttons test_connection / send_test.
// -----------------------------------------------------------------------------

import { logger as sdkLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, hasCredentials, contactTargets } from './config.js';
import { createBrevoClient } from './brevo-api.js';
import {
  createBrevoAccount,
  BrevoError,
  FAILURE_REASONS,
  CHANNELS,
  toBrevoError,
  notificationSubject,
  imageAttachment,
} from './brevo.js';
import { createStore, DEFAULT_PATH } from './store.js';
import { createFailureEvents, deliveryPayload, SCENE_TRIGGERS } from './events.js';
import { buildAccountWidget, buildActivityWidget, WIDGETS } from './widgets.js';
import {
  normalizeEmail,
  normalizePhone,
  parseEmailList,
  parsePhoneList,
  maskRecipient,
} from './recipients.js';
import { t, all, formatNumber } from './i18n.js';

const ACTIONS = Object.freeze({ TEST_CONNECTION: 'test_connection', SEND_TEST: 'send_test' });
const SCENE_ACTIONS = Object.freeze({
  SEND_EMAIL: 'send_email',
  SEND_SMS: 'send_sms',
  GET_ACCOUNT: 'get_account',
});

// The account (credits) is read every 15 minutes: 4 of the 100 calls an hour
// Brevo allows on /account. The delivery events are read every 5 minutes, per
// channel, and only while a message of the last two days waits for its final
// status: 12 calls an hour at most, none when nothing was sent.
const ACCOUNT_INTERVAL_MS = 15 * 60 * 1000;
const DELIVERY_INTERVAL_MS = 5 * 60 * 1000;
// A scene action sends to 20 recipients at most (one call each).
const MAX_RECIPIENTS = 20;

const TEST_SUBJECT = 'Gladys Assistant: Brevo test';
const TEST_MESSAGE = 'Gladys Assistant: Brevo test OK';

// Status message of each failure reason (the others: status_error).
const STATUS_OF_REASON = {
  [FAILURE_REASONS.NOT_CONFIGURED]: 'status_not_configured',
  [FAILURE_REASONS.ACCESS_DENIED]: 'status_access_denied',
  [FAILURE_REASONS.IP_NOT_AUTHORIZED]: 'status_ip_not_authorized',
  [FAILURE_REASONS.ACCOUNT_RESTRICTED]: 'status_account_restricted',
  [FAILURE_REASONS.NO_SENDER]: 'status_no_sender',
  [FAILURE_REASONS.RATE_LIMITED]: 'status_rate_limited',
  [FAILURE_REASONS.UNREACHABLE]: 'status_unreachable',
  [FAILURE_REASONS.TIMEOUT]: 'status_unreachable',
};

/**
 * @description Register the handlers of the integration on a Gladys client.
 * @param {object} gladys - A GladysIntegration (or the fake Gladys of the SDK).
 * @param {object} [options] - Options (tests).
 * @param {Function} [options.transport] - HTTP transport of the Brevo client.
 * @param {string} [options.statePath] - The state file.
 * @param {Function} [options.now] - `() => number` in ms.
 * @param {Function} [options.wait] - `(ms) => Promise`, pause before a retry.
 * @param {boolean} [options.timers] - Start the periodic readings (false in tests).
 * @param {object} [options.logger] - Logger.
 * @returns {object} Handles for the tests.
 * @example
 * createApp(new GladysIntegration());
 */
function createApp(
  gladys,
  {
    transport,
    statePath = DEFAULT_PATH,
    now = () => Date.now(),
    wait,
    timers = true,
    logger = sdkLogger,
  } = {},
) {
  let config = normalizeConfig();
  // What the account widget shows.
  let account = null;
  let readAt = null;
  let readFailure = null;
  let lastFailure = null;
  let lastStatus = null;
  let accountTimer = null;
  let deliveryTimer = null;
  let following = false;

  const api = createBrevoClient({
    getApiKey: () => config.apiKey,
    ...(transport ? { transport } : {}),
  });
  const brevo = createBrevoAccount({
    api,
    getConfig: () => config,
    ...(wait ? { wait } : {}),
  });
  const store = createStore({ path: statePath, now, logger });
  const failures = createFailureEvents(gladys, logger);

  /**
   * @description Ask the dashboards to fetch the widgets again (fire and forget).
   * @param {string[]} [keys] - The widgets.
   */
  function refreshWidgets(keys = Object.values(WIDGETS)) {
    keys.forEach((key) => {
      Promise.resolve()
        .then(() => gladys.requestWidgetRefresh(key))
        .catch((err) => logger.debug?.(`Widget refresh of ${key} failed: ${err.message}`));
    });
  }

  /**
   * @description Report the connection status, only when it changed.
   * @param {boolean} connected - Connected or not.
   * @param {object} message - The multi-language message.
   * @returns {Promise<void>}
   */
  async function reportStatus(connected, message) {
    const signature = JSON.stringify([connected, message]);
    if (signature === lastStatus) {
      return;
    }
    lastStatus = signature;
    try {
      await gladys.setConnectionStatus(connected, message);
    } catch (err) {
      lastStatus = null;
      logger.error('Unable to report the connection status', err);
    }
  }

  /**
   * @description Compare the SMS credits with the threshold; fire
   * `credits_low` when they go below it.
   * @param {number|null} smsCredits - SMS credits left.
   * @param {object} [options] - Options.
   * @param {boolean} [options.fire] - Whether a scene trigger may fire (never for a scene action).
   * @returns {Promise<void>}
   */
  async function checkCredits(smsCredits, { fire = true } = {}) {
    if (typeof smsCredits !== 'number' || config.lowCreditsThreshold <= 0) {
      return;
    }
    const low = smsCredits < config.lowCreditsThreshold;
    if (!fire || low === store.lowCredits()) {
      return;
    }
    await store.setLowCredits(low);
    if (!low) {
      return;
    }
    logger.warn(
      `${smsCredits} SMS credits left, below the threshold of ${config.lowCreditsThreshold}`,
    );
    try {
      await gladys.publishSceneEvent(SCENE_TRIGGERS.CREDITS_LOW, {
        credits_left: smsCredits,
        threshold: config.lowCreditsThreshold,
      });
    } catch (err) {
      logger.warn(`Could not fire ${SCENE_TRIGGERS.CREDITS_LOW}: ${err.message}`);
    }
  }

  /**
   * @description Read the account (credits, sender) and report the status.
   * @param {object} [options] - Options.
   * @param {boolean} [options.fire] - Whether credits_low may fire.
   * @returns {Promise<object|null>} The account, null on failure.
   */
  async function refreshAccount({ fire = true } = {}) {
    if (!hasCredentials(config)) {
      readFailure = FAILURE_REASONS.NOT_CONFIGURED;
      account = null;
      await reportStatus(false, all('noCredentials'));
      refreshWidgets([WIDGETS.ACCOUNT]);
      return null;
    }
    try {
      const read = await brevo.readAccount();
      account = read;
      readAt = now();
      readFailure = null;
      let sender = null;
      try {
        sender = await brevo.resolveSender();
      } catch (err) {
        // The key works, the emails cannot leave yet: say it, SMS may still go.
        const failure = toBrevoError(err);
        logger.warn(`No email sender (${failure.reason}): ${failure.message}`);
      }
      await reportStatus(
        true,
        all(sender ? 'statusConnected' : 'statusConnectedNoSender', {
          account: read.company || read.email,
          email: (language) => formatNumber(read.emailCredits, language, 0),
          sms: (language) => formatNumber(read.smsCredits, language, 0),
          sender: sender?.email ?? '',
        }),
      );
      await checkCredits(read.smsCredits, { fire });
      return read;
    } catch (err) {
      const failure = toBrevoError(err);
      readFailure = failure.reason;
      logger.warn(`Unable to read the Brevo account (${failure.reason}): ${failure.message}`);
      await reportStatus(false, all(STATUS_OF_REASON[failure.reason] ?? 'status_error'));
      return null;
    } finally {
      refreshWidgets([WIDGETS.ACCOUNT]);
    }
  }

  /**
   * @description Read the delivery events of the channels that wait for some;
   * fire `delivery_failed` once per message that did not arrive.
   * @returns {Promise<number>} The number of failures found.
   */
  async function followDeliveries() {
    if (!config.followDeliveries || !hasCredentials(config) || following) {
      return 0;
    }
    // Refused key: the account reading (every 15 minutes, or a new
    // configuration) tells when it works again; no calls meanwhile.
    if (
      readFailure === FAILURE_REASONS.ACCESS_DENIED ||
      readFailure === FAILURE_REASONS.IP_NOT_AUTHORIZED
    ) {
      return 0;
    }
    following = true;
    let found = 0;
    let changed = false;
    try {
      for (const channel of [CHANNELS.EMAIL, CHANNELS.SMS]) {
        if (!store.awaitingDelivery(channel)) {
          continue;
        }
        let events;
        try {
          events = await brevo.listDeliveryEvents(channel);
        } catch (err) {
          logger.warn(`Unable to read the ${channel} delivery events: ${err.message}`);
          continue;
        }
        const before = JSON.stringify(store.recentMessages());
        for (const event of events) {
          const failed = store.applyEvent(channel, event);
          if (!failed) {
            continue;
          }
          found += 1;
          logger.info(`${channel} to ${failed.recipient} not delivered (${failed.status})`);
          try {
            await gladys.publishSceneEvent(SCENE_TRIGGERS.DELIVERY_FAILED, deliveryPayload(failed));
          } catch (eventErr) {
            logger.warn(`Could not fire ${SCENE_TRIGGERS.DELIVERY_FAILED}: ${eventErr.message}`);
          }
        }
        changed = changed || JSON.stringify(store.recentMessages()) !== before;
      }
      if (changed) {
        await store.save();
        refreshWidgets();
      }
      return found;
    } finally {
      following = false;
    }
  }

  /**
   * @description (Re)start the periodic readings.
   */
  function schedule() {
    clearInterval(accountTimer);
    clearInterval(deliveryTimer);
    accountTimer = null;
    deliveryTimer = null;
    if (!timers) {
      return;
    }
    accountTimer = setInterval(() => {
      refreshAccount().catch((err) => logger.error('Account reading failed', err));
    }, ACCOUNT_INTERVAL_MS);
    if (config.followDeliveries) {
      deliveryTimer = setInterval(() => {
        followDeliveries().catch((err) => logger.error('Delivery follow-up failed', err));
      }, DELIVERY_INTERVAL_MS);
    }
  }

  /**
   * @description Send through one channel, count it, remember it.
   * @param {string} channel - 'email' or 'sms'.
   * @param {string[]} recipients - Normalized recipients.
   * @param {object} content - `{ subject, text, attachment }`.
   * @returns {Promise<Array<{ recipient: string, messageId: string|null }>>} The sends.
   */
  async function deliver(channel, recipients, { subject, text, attachment }) {
    if (!hasCredentials(config)) {
      throw new BrevoError('The Brevo API key is missing in the configuration', {
        reason: FAILURE_REASONS.NOT_CONFIGURED,
      });
    }
    const results =
      channel === CHANNELS.EMAIL
        ? await brevo.sendEmail({ to: recipients, subject, text, attachment })
        : await brevo.sendSms(recipients, text);
    await store.recordSent(
      channel,
      results.map((result) => ({
        messageId: result.messageId,
        recipient: maskRecipient(result.recipient),
        label: channel === CHANNELS.EMAIL ? subject : text,
      })),
    );
    refreshWidgets();
    return results;
  }

  /**
   * @description Remember a notification that did not leave and fire
   * `message_not_sent` on the first failure of its scope.
   * @param {string} channel - 'email' or 'sms'.
   * @param {string} masked - The masked recipient.
   * @param {string} label - Subject or text.
   * @param {BrevoError} failure - The failure.
   * @returns {Promise<void>}
   */
  async function notSent(channel, masked, label, failure) {
    logger.warn(`${channel} to ${masked} not sent (${failure.reason}): ${failure.message}`);
    lastFailure = { reason: failure.reason, at: now() };
    await store.recordNotSent(channel, { recipient: masked, label, reason: failure.reason });
    await failures.failed(channel, masked, failure);
    refreshWidgets();
  }

  // --- Outgoing message: Gladys asks us to deliver a notification --------------------
  // A scene "send a message", an alert or a notification routed to a user ends
  // up here, for the users who filled in their "My account" block. `message`
  // is `{ text, file }`: the file (a camera snapshot) goes as an email
  // attachment, an SMS carries the text only. With both channels, the
  // notification fails only when neither went out.
  gladys.onSendMessage(async (contact, message) => {
    const text = String(message?.text ?? '');
    const subject = notificationSubject(config.subjectPrefix, text);
    let firstFailure = null;
    let delivered = 0;
    for (const target of contactTargets(contact, config.countryCode)) {
      const masked = target.recipient
        ? maskRecipient(target.recipient)
        : maskRecipient(target.typed) || '?';
      const label = target.channel === CHANNELS.EMAIL ? subject : text;
      try {
        if (!target.recipient) {
          throw new BrevoError(
            target.typed
              ? `The ${target.channel === CHANNELS.EMAIL ? 'email address' : 'mobile number'} of the user is not valid`
              : `The user has no ${target.channel === CHANNELS.EMAIL ? 'email address' : 'mobile number'} in "My account"`,
            { reason: FAILURE_REASONS.INVALID_RECIPIENT },
          );
        }
        logger.info(
          `onSendMessage -> ${target.channel} to ${masked}${message?.file && target.channel === CHANNELS.EMAIL ? ' with an image' : ''}`,
        );
        await deliver(target.channel, [target.recipient], {
          subject,
          text,
          attachment: target.channel === CHANNELS.EMAIL ? imageAttachment(message?.file) : null,
        });
        failures.sent(target.channel, masked);
        delivered += 1;
      } catch (err) {
        const failure = toBrevoError(err);
        firstFailure = firstFailure ?? failure;
        await notSent(target.channel, masked, label, failure);
      }
    }
    if (delivered === 0 && firstFailure) {
      throw firstFailure;
    }
  });

  // --- Scene actions -------------------------------------------------------------------
  // Their result goes to the scene; they never fire a scene trigger.
  gladys.onSceneAction(SCENE_ACTIONS.SEND_EMAIL, async (fields = {}) => {
    const { valid, invalid } = parseEmailList(fields.to);
    if (valid.length === 0) {
      throw new Error('No valid email address in the action (one per comma)');
    }
    if (valid.length > MAX_RECIPIENTS) {
      throw new Error(`Too many recipients: ${MAX_RECIPIENTS} at most`);
    }
    const text = String(fields.message ?? '');
    const subject =
      String(fields.subject ?? '').trim() || notificationSubject(config.subjectPrefix, text);
    const results = await deliver(CHANNELS.EMAIL, valid, { subject, text, attachment: null });
    return {
      sent_count: results.length,
      invalid_addresses: invalid.join(', ').slice(0, 1000),
      message_id: results[0]?.messageId ?? '',
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.SEND_SMS, async (fields = {}) => {
    const { valid, invalid } = parsePhoneList(fields.phone_numbers, config.countryCode);
    if (valid.length === 0) {
      throw new Error('No valid phone number in the action (use +33612345678, one per comma)');
    }
    if (valid.length > MAX_RECIPIENTS) {
      throw new Error(`Too many recipients: ${MAX_RECIPIENTS} at most`);
    }
    const results = await deliver(CHANNELS.SMS, valid, {
      text: String(fields.message ?? ''),
    });
    return {
      sent_count: results.length,
      invalid_numbers: invalid.join(', ').slice(0, 1000),
    };
  });

  gladys.onSceneAction(SCENE_ACTIONS.GET_ACCOUNT, async () => {
    const read = await refreshAccount({ fire: false });
    if (!read) {
      throw new Error(`Unable to read the Brevo account (${readFailure})`);
    }
    const counters = store.counters();
    return {
      email_credits: read.emailCredits ?? 0,
      sms_credits: read.smsCredits ?? 0,
      plan: read.planType ?? '',
      emails_today: counters.dayEmail,
      sms_today: counters.daySms,
      emails_this_month: counters.monthEmail,
      sms_this_month: counters.monthSms,
    };
  });

  // --- Configuration screen buttons ----------------------------------------------------
  gladys.onAction(ACTIONS.TEST_CONNECTION, async () => {
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    brevo.reset();
    try {
      const read = await brevo.readAccount();
      const senders = await brevo.listSenders();
      let sender = null;
      try {
        sender = await brevo.resolveSender();
      } catch {
        sender = null;
      }
      await refreshAccount({ fire: false });
      return all('testOk', {
        account: read.company || read.email,
        email: (language) => formatNumber(read.emailCredits, language, 0),
        sms: (language) => formatNumber(read.smsCredits, language, 0),
        active: senders.filter((entry) => entry.active).length,
        total: senders.length,
        sender: (language) => sender?.email ?? t('senderNone', language),
      });
    } catch (err) {
      const failure = toBrevoError(err);
      return all(STATUS_OF_REASON[failure.reason] ?? 'status_error');
    }
  });

  gladys.onAction(ACTIONS.SEND_TEST, async (fields = {}) => {
    const typedEmail = String(fields.email ?? '').trim();
    const typedPhone = String(fields.phone_number ?? '').trim();
    if (!typedEmail && !typedPhone) {
      return all('testNothing');
    }
    if (!hasCredentials(config)) {
      return all('noCredentials');
    }
    const lines = [];
    const tests = [];
    if (typedEmail) {
      const email = normalizeEmail(typedEmail);
      if (email) {
        tests.push({ channel: CHANNELS.EMAIL, recipient: email });
      } else {
        lines.push(all('invalidEmail', { email: typedEmail.slice(0, 60) }));
      }
    }
    if (typedPhone) {
      const phone = normalizePhone(typedPhone, config.countryCode);
      if (phone) {
        tests.push({ channel: CHANNELS.SMS, recipient: phone });
      } else {
        lines.push(all('invalidPhone', { phone: typedPhone.slice(0, 40) }));
      }
    }
    for (const test of tests) {
      try {
        await deliver(test.channel, [test.recipient], {
          subject: TEST_SUBJECT,
          text: TEST_MESSAGE,
          attachment: null,
        });
        lines.push(
          all(test.channel === CHANNELS.EMAIL ? 'testEmailSent' : 'testSmsSent', {
            recipient: maskRecipient(test.recipient),
          }),
        );
      } catch (err) {
        const failure = toBrevoError(err);
        lines.push(
          all('testNotSent', {
            channel: (language) => t(`channel_${test.channel}`, language),
            reason: (language) => t(`reason_${failure.reason}`, language),
          }),
        );
      }
    }
    return Object.fromEntries(
      Object.keys(lines[0]).map((language) => [
        language,
        lines.map((line) => line[language]).join(' '),
      ]),
    );
  });

  // --- Dashboard widgets -----------------------------------------------------------------
  gladys.onWidgetGet(WIDGETS.ACCOUNT, async ({ language } = {}) =>
    buildAccountWidget({
      snapshot: {
        account,
        readAt,
        readFailure,
        sender: brevo.sender(),
        lastFailure,
        counters: store.counters(),
        threshold: config.lowCreditsThreshold,
      },
      language,
      now: now(),
    }),
  );

  gladys.onWidgetGet(WIDGETS.ACTIVITY, async ({ language } = {}) =>
    buildActivityWidget({
      messages: store.recentMessages(),
      followDeliveries: config.followDeliveries,
      language,
    }),
  );

  // --- Configuration ---------------------------------------------------------------------

  /**
   * @description Read the configuration again.
   * @param {object} [fallback] - Raw values to use when the read fails.
   * @returns {Promise<void>}
   */
  async function loadConfig(fallback) {
    try {
      config = normalizeConfig(await gladys.getConfig());
    } catch (err) {
      if (fallback) {
        config = normalizeConfig(fallback);
      }
      logger.error('Unable to read the configuration', err);
    }
  }

  gladys.onConfigUpdated(async (rawConfig) => {
    const previousThreshold = config.lowCreditsThreshold;
    await loadConfig(rawConfig);
    // New key or sender: resolve everything again.
    brevo.reset();
    lastStatus = null;
    if (config.lowCreditsThreshold !== previousThreshold) {
      // A new threshold: the next reading compares again from scratch.
      await store.setLowCredits(null);
    }
    logger.info(
      `Configuration updated (delivery follow-up ${config.followDeliveries ? 'on' : 'off'})`,
    );
    await refreshAccount();
    schedule();
    refreshWidgets();
  });

  // --- Connection lifecycle --------------------------------------------------------------
  gladys.on('connected', async () => {
    await loadConfig();
    await store.load();
    lastStatus = null;
    await refreshAccount();
    await followDeliveries();
    schedule();
  });

  // --- Graceful shutdown -----------------------------------------------------------------
  gladys.handleShutdown(async (signal) => {
    logger.info(`Received ${signal} -> graceful shutdown`);
    clearInterval(accountTimer);
    clearInterval(deliveryTimer);
    await store.flush();
  });

  return {
    getConfig: () => config,
    store,
    brevo,
    refreshAccount,
    followDeliveries,
    schedule,
  };
}

export { createApp, ACTIONS, SCENE_ACTIONS, TEST_MESSAGE, TEST_SUBJECT, MAX_RECIPIENTS };
