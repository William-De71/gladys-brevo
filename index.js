// -----------------------------------------------------------------------------
// Entry point of the Brevo external integration.
//
// Sends the notifications of Gladys by email and SMS through the transactional
// APIs of Brevo (cloud, API key):
//   - communication channel (send-only): each user picks email, SMS or both
//     and enters an address and/or a number in the "My account" block;
//   - scene triggers: message not sent, delivery failed, SMS credits low;
//   - scene actions: send an email, send an SMS, read the account;
//   - dashboard widgets: Brevo account, last messages.
//
// This file only wires the SDK client: the handlers are in src/app.js.
//
// Environment variables provided by the Gladys supervisor:
//   GLADYS_HOST_API_URL / GLADYS_INTEGRATION_TOKEN / GLADYS_INTEGRATION_SELECTOR
// The SDK reads them automatically: `new GladysIntegration()` is enough.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { createApp } from './src/app.js';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

const gladys = new GladysIntegration();
createApp(gladys);

// --- Startup -----------------------------------------------------------------------
logger.info(`Starting the Brevo integration ${version}...`);
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
