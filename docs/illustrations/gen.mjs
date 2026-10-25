// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a made-up Brevo account (fixed date): free plan, SMS
// credits close to the low credits threshold, the messages of the day and of
// the month, and the last messages with their delivery status. Every number
// and text is made up; the contents around them come from src/widgets.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildAccountWidget, buildActivityWidget } = await load('src/widgets.js');
const { LANGUAGES } = await load('src/i18n.js');
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Sunday 25 October 2026, 19:00 in Paris.
const NOW = Date.parse('2026-10-25T18:00:00Z');
const MINUTE = 60000;

const snapshot = {
  account: {
    email: 'owner@example.com',
    company: 'Maison Martin',
    planType: 'free',
    emailCredits: 288,
    smsCredits: 34,
    relayEnabled: true,
  },
  readAt: NOW - 6 * MINUTE,
  readFailure: null,
  sender: { email: 'gladys@maison-martin.fr', name: 'Gladys' },
  lastFailure: null,
  counters: { dayEmail: 12, daySms: 2, monthEmail: 214, monthSms: 18, monthFailed: 1 },
  threshold: 20,
};

// The last messages, per language (subjects of notifications).
const SUBJECTS = {
  en: [
    'Gladys: Motion in the garden',
    'Washing machine done',
    'Gladys: Front door open',
    'Gladys: Water leak in the basement',
  ],
  fr: [
    'Gladys: Mouvement dans le jardin',
    'Machine à laver terminée',
    'Gladys: Porte d’entrée ouverte',
    'Gladys: Fuite d’eau à la cave',
  ],
  de: [
    'Gladys: Bewegung im Garten',
    'Waschmaschine fertig',
    'Gladys: Haustür offen',
    'Gladys: Wasserleck im Keller',
  ],
  es: [
    'Gladys: Movimiento en el jardín',
    'Lavadora terminada',
    'Gladys: Puerta de entrada abierta',
    'Gladys: Fuga de agua en el sótano',
  ],
};
const messages = (language) => {
  const [garden, washer, door, leak] = SUBJECTS[language];
  return [
    {
      id: '<4>',
      channel: 'email',
      recipient: 'a***@maison-martin.fr',
      label: garden,
      at: new Date(NOW - 9 * MINUTE).toISOString(),
      status: 'sent',
    },
    {
      id: '1511882900100031',
      channel: 'sms',
      recipient: '+336******78',
      label: washer,
      at: new Date(NOW - 74 * MINUTE).toISOString(),
      status: 'delivered',
    },
    {
      id: '<3>',
      channel: 'email',
      recipient: 'a***@maison-martin.fr',
      label: door,
      at: new Date(NOW - 210 * MINUTE).toISOString(),
      status: 'delivered',
    },
    {
      id: '<2>',
      channel: 'email',
      recipient: 'b***@exemple.fr',
      label: leak,
      at: new Date(NOW - 26 * 60 * MINUTE).toISOString(),
      status: 'hard_bounce',
      reason: '550 5.1.1 mailbox unavailable',
    },
  ];
};

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    account: buildAccountWidget({ snapshot, language, now: NOW }),
    activity: buildActivityWidget({
      messages: messages(language),
      followDeliveries: true,
      language,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
