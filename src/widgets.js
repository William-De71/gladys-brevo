// -----------------------------------------------------------------------------
// Dashboard widgets of the Brevo integration.
//
//   - `account`   the Brevo account at a glance: email and SMS credits (the
//                 SMS ones colored against the low credits threshold), the
//                 state of the API, the sender, what Gladys sent today and
//                 this month, the failures of the month and the last one;
//   - `activity`  the last messages Gladys sent through Brevo, newest first,
//                 with their delivery status (sent, delivered, bounced…);
//                 a tap opens the details.
//
// The contents come from what the integration already knows (the last
// reading of the account, /data/state.json): a widget never costs a Brevo
// call. Every text exists in the four languages (contents are cached per
// language). Budget of a card: 8 components, 1 main one (card-list), 6 tiles,
// 2 texts of which one body, 1 status, 4 buttons.
// -----------------------------------------------------------------------------

import { t, ago, formatNumber } from './i18n.js';
import { DELIVERED } from './brevo.js';
import { SENT, NOT_SENT } from './store.js';

const WIDGETS = Object.freeze({ ACCOUNT: 'account', ACTIVITY: 'activity' });
const MAX_ACTIVITY_ITEMS = 8;
const TTL = { account: 300, activity: 60, message: 30 };

/**
 * @description Truncate a text to a bound, with an ellipsis.
 * @param {string} value - The text.
 * @param {number} max - The bound.
 * @returns {string} The text.
 * @example
 * clip('A very long title', 10); // -> 'A very lo…'
 */
function clip(value, max) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * @description A widget content made of one message.
 * @param {string} message - The message.
 * @param {number} [ttl] - Its freshness.
 * @returns {object} The content.
 */
function messageContent(message, ttl = TTL.message) {
  return {
    ttl_seconds: ttl,
    components: [{ type: 'text', variant: 'body', text: clip(message, 300) }],
  };
}

/**
 * @description The color of the SMS credits tile.
 * @param {number|null} credits - Credits left.
 * @param {number} threshold - Low credits threshold.
 * @returns {string} The color.
 */
function creditsColor(credits, threshold) {
  if (typeof credits !== 'number') {
    return 'neutral';
  }
  if (credits < threshold || credits <= 0) {
    return 'danger';
  }
  return credits < threshold * 2 ? 'warning' : 'success';
}

/**
 * @description The color of a delivery status.
 * @param {string} status - The status of a message.
 * @returns {string} The color.
 */
function statusColor(status) {
  if (status === DELIVERED) {
    return 'success';
  }
  if (status === SENT) {
    return 'info';
  }
  return 'danger';
}

/**
 * @description The `account` widget.
 * @param {object} options - Options.
 * @param {object} options.snapshot - What the integration knows.
 * @param {string} options.language - The user language.
 * @param {number} options.now - Now, in ms.
 * @returns {object} The content.
 * @example
 * buildAccountWidget({ snapshot, language: 'fr', now: Date.now() });
 */
function buildAccountWidget({ snapshot, language, now }) {
  const { account, readAt, readFailure, sender, lastFailure, counters, threshold } = snapshot;
  if (!account && !readFailure) {
    return messageContent(t('notReadYet', language));
  }

  const components = [];
  if (account) {
    components.push({
      type: 'text',
      variant: 'caption',
      text: clip(
        t('accountCaption', language, {
          account: account.company || account.email || 'Brevo',
          ago: ago(readAt, now, language),
        }),
        80,
      ),
    });
    components.push({
      type: 'value',
      value: account.emailCredits ?? '?',
      label: clip(t('tileEmailCredits', language), 24),
      icon: 'mail',
      color: account.emailCredits === 0 ? 'danger' : 'primary',
    });
    components.push({
      type: 'value',
      value: account.smsCredits ?? '?',
      label: clip(t('tileSmsCredits', language), 24),
      icon: 'message-square',
      color: creditsColor(account.smsCredits, threshold),
    });
  }
  if (account && typeof account.smsCredits === 'number' && account.smsCredits < threshold) {
    components.push({
      type: 'text',
      variant: 'body',
      text: t('creditsLowText', language, { threshold }),
    });
  }

  const rows = [
    {
      label: t('rowConnection', language),
      value: clip(
        readFailure ? t(`reason_${readFailure}`, language) : t('connectionOk', language),
        40,
      ),
      color: readFailure ? 'danger' : 'success',
    },
  ];
  if (sender) {
    rows.push({ label: t('rowSender', language), value: clip(sender.email, 40), color: 'neutral' });
  }
  rows.push({
    label: t('rowToday', language),
    value: t('sentValue', language, { email: counters.dayEmail, sms: counters.daySms }),
    color: 'primary',
  });
  rows.push({
    label: t('rowMonth', language),
    value: t('sentValue', language, { email: counters.monthEmail, sms: counters.monthSms }),
    color: 'primary',
  });
  rows.push({
    label: t('rowFailures', language),
    value: formatNumber(counters.monthFailed, language, 0),
    color: counters.monthFailed > 0 ? 'warning' : 'neutral',
  });
  if (lastFailure) {
    rows.push({
      label: clip(t('rowLastFailure', language, { ago: ago(lastFailure.at, now, language) }), 40),
      value: clip(t(`reason_${lastFailure.reason}`, language), 40),
      color: 'warning',
    });
  }
  components.push({ type: 'status', items: rows });

  return { ttl_seconds: TTL.account, components };
}

/**
 * @description The text of the status of a message.
 * @param {object} message - The message (store).
 * @param {string} language - The language.
 * @returns {string} The status.
 */
function statusText(message, language) {
  if (message.status === NOT_SENT) {
    return t('status_not_sent', language);
  }
  return t(`delivery_${message.status}`, language);
}

/**
 * @description The `activity` widget.
 * @param {object} options - Options.
 * @param {object[]} options.messages - The last messages, newest first.
 * @param {boolean} options.followDeliveries - Whether the delivery is followed.
 * @param {string} options.language - The user language.
 * @returns {object} The content.
 * @example
 * buildActivityWidget({ messages, followDeliveries: true, language: 'en' });
 */
function buildActivityWidget({ messages, followDeliveries, language }) {
  if (messages.length === 0) {
    return messageContent(t('activityEmpty', language), TTL.activity);
  }
  return {
    ttl_seconds: TTL.activity,
    components: [
      {
        type: 'text',
        variant: 'caption',
        text: clip(
          t(followDeliveries ? 'activityCaption' : 'activityCaptionNoFollow', language),
          80,
        ),
      },
      {
        type: 'card-list',
        display: 'list',
        // In a list, the date takes the place of the subtitle: the status goes
        // in the badge, the subject in the title, the rest in the panel.
        items: messages.slice(0, MAX_ACTIVITY_ITEMS).map((message) => {
          const channel = t(`channel_${message.channel}`, language);
          const reason =
            message.status === NOT_SENT
              ? t(`reason_${message.reason}`, language)
              : (message.reason ?? '');
          return {
            title: clip(`${channel} · ${message.label || '…'}`, 60),
            date: message.at,
            badge: {
              text: clip(statusText(message, language), 16),
              color: statusColor(message.status),
            },
            description: [
              `${t('detailChannel', language)}: ${channel}`,
              `${t('detailRecipient', language)}: ${message.recipient}`,
              `${t('detailStatus', language)}: ${statusText(message, language)}`,
              ...(reason ? [`${t('detailReason', language)}: ${reason}`] : []),
              ...(message.label ? ['', message.label] : []),
            ]
              .join('\n')
              .slice(0, 2000),
          };
        }),
      },
    ],
  };
}

export { buildAccountWidget, buildActivityWidget, WIDGETS, creditsColor, statusColor, clip };
