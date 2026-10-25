// -----------------------------------------------------------------------------
// Texts of the integration, in English, French, German and Spanish (English
// fallback).
//
// The manifest carries its own labels; these are the texts the code writes at
// runtime: the connection status of the Configuration screen, the results of
// its buttons, the widget contents. Vocabulary of the Gladys interface
// (intégration, scène / Szene / escena) and of the Brevo app (clé API,
// expéditeur / Absender / remitente, crédits / Guthaben / créditos).
// -----------------------------------------------------------------------------

const LANGUAGES = ['en', 'fr', 'de', 'es'];

const TEXTS = {
  // connection status and Configuration screen buttons
  noCredentials: {
    en: 'Enter the Brevo API key in the configuration.',
    fr: 'Saisissez la clé API Brevo dans la configuration.',
    de: 'Geben Sie den Brevo-API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca la clave API de Brevo en la configuración.',
  },
  statusConnected: {
    en: 'Brevo account {account}: {email} email credits, {sms} SMS credits, sender {sender}.',
    fr: 'Compte Brevo {account} : {email} crédits e-mail, {sms} crédits SMS, expéditeur {sender}.',
    de: 'Brevo-Konto {account}: {email} E-Mail-Guthaben, {sms} SMS-Guthaben, Absender {sender}.',
    es: 'Cuenta de Brevo {account}: {email} créditos de email, {sms} créditos de SMS, remitente {sender}.',
  },
  statusConnectedNoSender: {
    en: 'Brevo account {account}: {email} email credits, {sms} SMS credits. No active email sender: add one in Brevo (Senders, domains, IPs) or emails cannot leave.',
    fr: 'Compte Brevo {account} : {email} crédits e-mail, {sms} crédits SMS. Aucun expéditeur e-mail actif : ajoutez-en un dans Brevo (Expéditeurs, domaines, IP dédiées), sinon les e-mails ne partent pas.',
    de: 'Brevo-Konto {account}: {email} E-Mail-Guthaben, {sms} SMS-Guthaben. Kein aktiver E-Mail-Absender: Legen Sie in Brevo einen an (Absender, Domains, IPs), sonst gehen keine E-Mails raus.',
    es: 'Cuenta de Brevo {account}: {email} créditos de email, {sms} créditos de SMS. Ningún remitente de email activo: añada uno en Brevo (Remitentes, dominios, IP), o los emails no saldrán.',
  },
  status_not_configured: {
    en: 'The Brevo API key is missing in the configuration.',
    fr: 'La clé API Brevo manque dans la configuration.',
    de: 'Der Brevo-API-Schlüssel fehlt in der Konfiguration.',
    es: 'Falta la clave API de Brevo en la configuración.',
  },
  status_access_denied: {
    en: 'Brevo refuses the API key: check it (it starts with xkeysib-), or create a new one in Brevo (SMTP & API).',
    fr: 'Brevo refuse la clé API : vérifiez-la (elle commence par xkeysib-), ou créez-en une nouvelle dans Brevo (SMTP et API).',
    de: 'Brevo lehnt den API-Schlüssel ab: Prüfen Sie ihn (er beginnt mit xkeysib-) oder erstellen Sie in Brevo einen neuen (SMTP & API).',
    es: 'Brevo rechaza la clave API: compruébela (empieza por xkeysib-) o cree una nueva en Brevo (SMTP y API).',
  },
  status_ip_not_authorized: {
    en: 'Brevo blocks the IP address of your house: authorize it in Brevo (Security, Authorized IPs), or turn off the blocking of unknown IP addresses.',
    fr: 'Brevo bloque l’adresse IP de votre maison : autorisez-la dans Brevo (Sécurité, IP autorisées), ou désactivez le blocage des adresses IP inconnues.',
    de: 'Brevo blockiert die IP-Adresse Ihres Hauses: Erlauben Sie sie in Brevo (Sicherheit, Autorisierte IPs) oder schalten Sie das Blockieren unbekannter IP-Adressen ab.',
    es: 'Brevo bloquea la dirección IP de su casa: autorícela en Brevo (Seguridad, IP autorizadas) o desactive el bloqueo de direcciones IP desconocidas.',
  },
  status_account_restricted: {
    en: 'Brevo does not allow this sending yet: the account is under validation, suspended, or the transactional emails or SMS are not activated.',
    fr: 'Brevo n’autorise pas encore cet envoi : le compte est en cours de validation, suspendu, ou les e-mails ou SMS transactionnels ne sont pas activés.',
    de: 'Brevo erlaubt diesen Versand noch nicht: Das Konto wird geprüft, ist gesperrt, oder Transaktions-E-Mails bzw. -SMS sind nicht aktiviert.',
    es: 'Brevo aún no permite este envío: la cuenta está en validación, suspendida, o los emails o SMS transaccionales no están activados.',
  },
  status_no_sender: {
    en: 'No active email sender on the Brevo account: add and verify one in Brevo (Senders, domains, IPs), or enter it in the configuration.',
    fr: 'Aucun expéditeur e-mail actif sur le compte Brevo : ajoutez-en un et vérifiez-le dans Brevo (Expéditeurs, domaines, IP dédiées), ou saisissez-le dans la configuration.',
    de: 'Kein aktiver E-Mail-Absender im Brevo-Konto: Legen Sie in Brevo einen an und bestätigen Sie ihn (Absender, Domains, IPs) oder tragen Sie ihn in der Konfiguration ein.',
    es: 'Ningún remitente de email activo en la cuenta de Brevo: añada y verifique uno en Brevo (Remitentes, dominios, IP) o introdúzcalo en la configuración.',
  },
  status_rate_limited: {
    en: 'Brevo limits the calls for now: the integration tries again later.',
    fr: 'Brevo limite les appels pour le moment : l’intégration réessaie plus tard.',
    de: 'Brevo begrenzt die Aufrufe gerade: Die Integration versucht es später erneut.',
    es: 'Brevo limita las llamadas por ahora: la integración lo intentará más tarde.',
  },
  status_unreachable: {
    en: 'Brevo cannot be reached: check the Internet connection of Gladys.',
    fr: 'Brevo est injoignable : vérifiez la connexion Internet de Gladys.',
    de: 'Brevo ist nicht erreichbar: Prüfen Sie die Internetverbindung von Gladys.',
    es: 'No se puede contactar con Brevo: compruebe la conexión a Internet de Gladys.',
  },
  status_error: {
    en: 'Brevo answered with an error: see the logs of the integration.',
    fr: 'Brevo a répondu par une erreur : consultez les journaux de l’intégration.',
    de: 'Brevo hat mit einem Fehler geantwortet: Siehe die Protokolle der Integration.',
    es: 'Brevo respondió con un error: consulte los registros de la integración.',
  },
  testOk: {
    en: 'Connected to {account}: {email} email credits, {sms} SMS credits, active senders: {active}/{total}. Emails leave from {sender}.',
    fr: 'Connecté à {account} : {email} crédits e-mail, {sms} crédits SMS, expéditeurs actifs : {active}/{total}. Les e-mails partent de {sender}.',
    de: 'Verbunden mit {account}: {email} E-Mail-Guthaben, {sms} SMS-Guthaben, aktive Absender: {active}/{total}. E-Mails gehen von {sender} aus.',
    es: 'Conectado a {account}: {email} créditos de email, {sms} créditos de SMS, remitentes activos: {active}/{total}. Los emails salen de {sender}.',
  },
  senderNone: {
    en: 'nowhere (no active sender)',
    fr: 'nulle part (aucun expéditeur actif)',
    de: 'nirgendwo (kein aktiver Absender)',
    es: 'ninguna parte (ningún remitente activo)',
  },
  testNothing: {
    en: 'Enter an email address, a mobile number, or both.',
    fr: 'Saisissez une adresse e-mail, un numéro de mobile, ou les deux.',
    de: 'Geben Sie eine E-Mail-Adresse, eine Handynummer oder beides ein.',
    es: 'Introduzca una dirección de email, un número de móvil o ambos.',
  },
  invalidEmail: {
    en: '“{email}” is not an email address.',
    fr: '« {email} » n’est pas une adresse e-mail.',
    de: '„{email}“ ist keine E-Mail-Adresse.',
    es: '«{email}» no es una dirección de email.',
  },
  invalidPhone: {
    en: '“{phone}” is not a phone number: use the international format, e.g. +33612345678.',
    fr: '« {phone} » n’est pas un numéro de téléphone : utilisez le format international, par exemple +33612345678.',
    de: '„{phone}“ ist keine Telefonnummer: Nutzen Sie das internationale Format, z. B. +4915112345678.',
    es: '«{phone}» no es un número de teléfono: use el formato internacional, por ejemplo +34612345678.',
  },
  testEmailSent: {
    en: 'Test email sent to {recipient}.',
    fr: 'E-mail de test envoyé à {recipient}.',
    de: 'Test-E-Mail an {recipient} gesendet.',
    es: 'Email de prueba enviado a {recipient}.',
  },
  testSmsSent: {
    en: 'Test SMS sent to {recipient}.',
    fr: 'SMS de test envoyé au {recipient}.',
    de: 'Test-SMS an {recipient} gesendet.',
    es: 'SMS de prueba enviado al {recipient}.',
  },
  testNotSent: {
    en: '{channel} not sent: {reason}.',
    fr: '{channel} non envoyé : {reason}.',
    de: '{channel} nicht gesendet: {reason}.',
    es: '{channel} no enviado: {reason}.',
  },

  // failure reasons (FAILURE_REASONS of brevo.js)
  reason_not_configured: {
    en: 'API key missing',
    fr: 'clé API manquante',
    de: 'API-Schlüssel fehlt',
    es: 'falta la clave API',
  },
  reason_access_denied: {
    en: 'API key refused',
    fr: 'clé API refusée',
    de: 'API-Schlüssel abgelehnt',
    es: 'clave API rechazada',
  },
  reason_ip_not_authorized: {
    en: 'IP address not authorized',
    fr: 'adresse IP non autorisée',
    de: 'IP-Adresse nicht erlaubt',
    es: 'dirección IP no autorizada',
  },
  reason_account_restricted: {
    en: 'account not allowed to send',
    fr: 'compte pas autorisé à envoyer',
    de: 'Konto darf nicht senden',
    es: 'cuenta sin permiso de envío',
  },
  reason_not_enough_credits: {
    en: 'not enough credits',
    fr: 'crédits insuffisants',
    de: 'nicht genug Guthaben',
    es: 'créditos insuficientes',
  },
  reason_no_sender: {
    en: 'no active email sender',
    fr: 'aucun expéditeur actif',
    de: 'kein aktiver Absender',
    es: 'ningún remitente activo',
  },
  reason_invalid_sender: {
    en: 'sender refused',
    fr: 'expéditeur refusé',
    de: 'Absender abgelehnt',
    es: 'remitente rechazado',
  },
  reason_invalid_recipient: {
    en: 'recipient refused',
    fr: 'destinataire refusé',
    de: 'Empfänger abgelehnt',
    es: 'destinatario rechazado',
  },
  reason_rejected: {
    en: 'refused by Brevo',
    fr: 'refusé par Brevo',
    de: 'von Brevo abgelehnt',
    es: 'rechazado por Brevo',
  },
  reason_rate_limited: {
    en: 'too many calls',
    fr: 'trop d’appels',
    de: 'zu viele Aufrufe',
    es: 'demasiadas llamadas',
  },
  reason_server_error: {
    en: 'Brevo server error',
    fr: 'erreur du serveur Brevo',
    de: 'Brevo-Serverfehler',
    es: 'error del servidor de Brevo',
  },
  reason_timeout: {
    en: 'no answer in time',
    fr: 'pas de réponse à temps',
    de: 'keine Antwort rechtzeitig',
    es: 'sin respuesta a tiempo',
  },
  reason_unreachable: {
    en: 'Brevo unreachable',
    fr: 'Brevo injoignable',
    de: 'Brevo nicht erreichbar',
    es: 'Brevo inaccesible',
  },
  reason_unexpected: {
    en: 'unexpected answer',
    fr: 'réponse inattendue',
    de: 'unerwartete Antwort',
    es: 'respuesta inesperada',
  },

  // channels
  channel_email: { en: 'Email', fr: 'E-mail', de: 'E-Mail', es: 'Email' },
  channel_sms: { en: 'SMS', fr: 'SMS', de: 'SMS', es: 'SMS' },

  // account widget
  notReadYet: {
    en: 'The Brevo account has not been read yet.',
    fr: 'Le compte Brevo n’a pas encore été lu.',
    de: 'Das Brevo-Konto wurde noch nicht gelesen.',
    es: 'La cuenta de Brevo aún no se ha leído.',
  },
  accountCaption: {
    en: '{account} · read {ago}',
    fr: '{account} · lu {ago}',
    de: '{account} · gelesen {ago}',
    es: '{account} · leído {ago}',
  },
  tileEmailCredits: {
    en: 'Emails left',
    fr: 'E-mails restants',
    de: 'E-Mails übrig',
    es: 'Emails restantes',
  },
  tileSmsCredits: { en: 'SMS credits', fr: 'Crédits SMS', de: 'SMS-Guthaben', es: 'Créditos SMS' },
  creditsLowText: {
    en: 'Fewer than {threshold} SMS credits left: top up the Brevo account.',
    fr: 'Moins de {threshold} crédits SMS restants : rechargez le compte Brevo.',
    de: 'Weniger als {threshold} SMS-Guthaben übrig: Laden Sie das Brevo-Konto auf.',
    es: 'Quedan menos de {threshold} créditos SMS: recargue la cuenta de Brevo.',
  },
  rowConnection: { en: 'Brevo API', fr: 'API Brevo', de: 'Brevo-API', es: 'API de Brevo' },
  connectionOk: { en: 'connected', fr: 'connectée', de: 'verbunden', es: 'conectada' },
  rowSender: { en: 'Sender', fr: 'Expéditeur', de: 'Absender', es: 'Remitente' },
  rowToday: { en: 'Today', fr: 'Aujourd’hui', de: 'Heute', es: 'Hoy' },
  rowMonth: { en: 'This month', fr: 'Ce mois-ci', de: 'Diesen Monat', es: 'Este mes' },
  sentValue: {
    en: '{email} emails · {sms} SMS',
    fr: '{email} e-mails · {sms} SMS',
    de: '{email} E-Mails · {sms} SMS',
    es: '{email} emails · {sms} SMS',
  },
  rowFailures: {
    en: 'Failures this month',
    fr: 'Échecs ce mois-ci',
    de: 'Fehler diesen Monat',
    es: 'Fallos este mes',
  },
  rowLastFailure: {
    en: 'Last failure ({ago})',
    fr: 'Dernier échec ({ago})',
    de: 'Letzter Fehler ({ago})',
    es: 'Último fallo ({ago})',
  },

  // activity widget
  activityEmpty: {
    en: 'Gladys has not sent anything through Brevo yet.',
    fr: 'Gladys n’a encore rien envoyé par Brevo.',
    de: 'Gladys hat noch nichts über Brevo gesendet.',
    es: 'Gladys aún no ha enviado nada por Brevo.',
  },
  activityCaption: {
    en: 'Last messages, delivery followed for 2 days',
    fr: 'Derniers messages, remise suivie 2 jours',
    de: 'Letzte Nachrichten, Zustellung 2 Tage verfolgt',
    es: 'Últimos mensajes, entrega seguida 2 días',
  },
  activityCaptionNoFollow: {
    en: 'Last messages (delivery not followed)',
    fr: 'Derniers messages (remise non suivie)',
    de: 'Letzte Nachrichten (Zustellung nicht verfolgt)',
    es: 'Últimos mensajes (entrega no seguida)',
  },
  status_not_sent: { en: 'not sent', fr: 'non envoyé', de: 'nicht gesendet', es: 'no enviado' },
  delivery_sent: { en: 'sent', fr: 'envoyé', de: 'gesendet', es: 'enviado' },
  delivery_delivered: { en: 'delivered', fr: 'remis', de: 'zugestellt', es: 'entregado' },
  delivery_hard_bounce: {
    en: 'hard bounce',
    fr: 'rejet définitif',
    de: 'Hard Bounce',
    es: 'rebote duro',
  },
  delivery_soft_bounce: {
    en: 'soft bounce',
    fr: 'rejet temporaire',
    de: 'Soft Bounce',
    es: 'rebote suave',
  },
  delivery_blocked: { en: 'blocked', fr: 'bloqué', de: 'blockiert', es: 'bloqueado' },
  delivery_invalid: { en: 'invalid', fr: 'invalide', de: 'ungültig', es: 'no válido' },
  delivery_spam: { en: 'spam report', fr: 'signalé spam', de: 'Spam-Meldung', es: 'marcado spam' },
  delivery_error: { en: 'error', fr: 'erreur', de: 'Fehler', es: 'error' },
  delivery_rejected: { en: 'rejected', fr: 'rejeté', de: 'abgelehnt', es: 'rechazado' },
  delivery_skipped: { en: 'skipped', fr: 'ignoré', de: 'übersprungen', es: 'omitido' },
  detailChannel: { en: 'Channel', fr: 'Canal', de: 'Kanal', es: 'Canal' },
  detailRecipient: { en: 'Recipient', fr: 'Destinataire', de: 'Empfänger', es: 'Destinatario' },
  detailStatus: { en: 'Status', fr: 'État', de: 'Status', es: 'Estado' },
  detailReason: { en: 'Reason', fr: 'Raison', de: 'Grund', es: 'Motivo' },

  // relative times
  ago_now: { en: 'just now', fr: 'à l’instant', de: 'gerade eben', es: 'ahora mismo' },
  ago_minutes: { en: '{n} min ago', fr: 'il y a {n} min', de: 'vor {n} Min.', es: 'hace {n} min' },
  ago_hours: { en: '{n} h ago', fr: 'il y a {n} h', de: 'vor {n} Std.', es: 'hace {n} h' },
  ago_days: {
    en: '{n} days ago',
    fr: 'il y a {n} jours',
    de: 'vor {n} Tagen',
    es: 'hace {n} días',
  },
};

/**
 * @description Whether a value is one of the four languages.
 * @param {any} value - The value.
 * @returns {boolean} True for en, fr, de or es.
 */
function isLanguage(value) {
  return LANGUAGES.includes(value);
}

/**
 * @description A text in a language (English fallback), with its substitutions.
 * @param {string} key - The TEXTS key.
 * @param {string} language - The language.
 * @param {object} [values] - The substitutions.
 * @returns {string} The text.
 * @example
 * t('tileCredits', 'fr'); // -> 'Crédits restants'
 */
function t(key, language, values = {}) {
  const entry = TEXTS[key];
  if (!entry) {
    return key;
  }
  const template = entry[language] ?? entry.en;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

/**
 * @description The text in every language, for a multi-language message.
 * Substitutions may be functions of the language.
 * @param {string} key - The TEXTS key.
 * @param {object} [values] - The substitutions.
 * @returns {{ en: string, fr: string, de: string, es: string }} The message.
 * @example
 * all('testSent', { phone: '+336******78', credits: 1 });
 */
function all(key, values = {}) {
  return Object.fromEntries(
    LANGUAGES.map((language) => [
      language,
      t(
        key,
        language,
        Object.fromEntries(
          Object.entries(values).map(([name, value]) => [
            name,
            typeof value === 'function' ? value(language) : value,
          ]),
        ),
      ),
    ]),
  );
}

/**
 * @description A number written the way a language does, with at most
 * `digits` decimals ("12,5" in French).
 * @param {number|null} value - The number.
 * @param {string} language - The language.
 * @param {number} [digits] - The decimals.
 * @returns {string} The text, "?" when unknown.
 * @example
 * formatNumber(12.5, 'fr'); // -> '12,5'
 */
function formatNumber(value, language, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '?';
  }
  return new Intl.NumberFormat(isLanguage(language) ? language : 'en', {
    maximumFractionDigits: digits,
  }).format(value);
}

/**
 * @description "12 min ago" for an instant.
 * @param {number} instant - The instant, in ms.
 * @param {number} now - Now, in ms.
 * @param {string} language - The language.
 * @returns {string} The relative time.
 * @example
 * ago(Date.now() - 600000, Date.now(), 'en'); // -> '10 min ago'
 */
function ago(instant, now, language) {
  const minutes = Math.max(0, Math.floor((now - instant) / 60000));
  if (minutes < 1) {
    return t('ago_now', language);
  }
  if (minutes < 60) {
    return t('ago_minutes', language, { n: minutes });
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    return t('ago_hours', language, { n: hours });
  }
  return t('ago_days', language, { n: Math.floor(hours / 24) });
}

export { LANGUAGES, TEXTS, isLanguage, t, all, formatNumber, ago };
