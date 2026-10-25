# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** that sends the notifications of
Gladys by email and SMS through the transactional APIs of Brevo: a Node.js
service (Node 22+, ESM, no build step) that runs in its own sandboxed Docker
container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. A send-only communication integration
(`type: "communication"`, `messaging: { receive: false }`): the Brevo API key
and the senders in the `config_schema` (administrator), the channel (email,
SMS, both), the address and the number of each user in the `contact_schema`.
On top: scene triggers, scene actions and dashboard widgets. Transport: cloud
only (`api.brevo.com`, `api-key` header).

## Commands

```bash
npm install
npm test                                  # node --test, never touches the network
node --test test/app.test.js              # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); timers
src/brevo-api.js        Brevo API v3 client (api-key header, error kinds, 429 reset)
src/brevo.js            the account: plan and credits, email sender, send email and
                        SMS, delivery events, failure reasons (BrevoError)
src/recipients.js       typed addresses and numbers -> what Brevo expects, masking
src/store.js            /data/state.json: day and month counters, low credits state,
                        last messages (masked) and their delivery status
src/events.js           scene triggers message_not_sent (transitions), delivery_failed
src/widgets.js          account and activity dashboard widgets
src/config.js           configuration and per-user contact values
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **Keys are forever**: every key users store — `config_schema` and
  `contact_schema` keys and types, the `channel` values (`email`, `sms`,
  `both`), the Configuration screen buttons, widget keys, scene triggers
  (fields, options, variables), scene actions (fields, outputs), the failure
  reasons (`FAILURE_REASONS`) and the delivery events (`DELIVERY_FAILURES`) of
  `src/brevo.js`, stored by scenes filtering on them.
  `test/structure.test.js` compares them to
  `test/fixtures/manifest.baseline.json` (0.1.0): never update the baseline to
  make a test pass without a documented migration.
- **Secrets**: the API key only travels in the `api-key` header; it never
  appears in a log line, an error message, a scene event or a URL. Addresses
  and numbers are masked (`maskRecipient`) in the logs, the scene events and
  `/data/state.json`. Fake keys in tests must not look like real ones
  (`xkeysib-not-a-real-key`): GitHub push protection blocks real-looking ones.
- **Retries**: a send is retried only on 429 (not accepted), after
  `x-sib-ratelimit-reset`, at most twice. Never on a timeout or a 5xx: a
  duplicate alert is worse than a reported failure.
- **Rate limits** (free plan): 100 calls an hour on `/account`, `/senders` and
  the SMS events, 300 on `/smtp/*` reads. The account is read every 15
  minutes; the delivery events every 5 minutes per channel, only while a
  message of the last 48 hours waits for its final status. Keep it that way.
- **Emails**: one call per recipient (nobody sees the others), tag `gladys`,
  the text escaped in the HTML (never HTML from a user), the camera image of
  `message.file` as an attachment (jpg, png, gif; Brevo refuses webp).
- **SMS**: transactional, sender up to 11 letters and digits, `unicodeEnabled`
  only when the text leaves the GSM alphabet, cut at 1,000 characters.
- **Unknown IP address**: Brevo answers 401 with a message about the IP; it is
  `ip_not_authorized`, not a wrong key. The docs explain Security → Authorized
  IPs; never suggest working around it.
- **Scene events**: `message_not_sent` fires once per scope (channel, or a
  refused recipient) until a message of that channel goes through;
  `delivery_failed` once per message (state in /data); `credits_low` once
  below the threshold, armed again above it, state kept in /data. A scene
  ACTION never fires a trigger. Flat scalar data, declared keys only.
- **Widgets never call Brevo**: they read what the integration knows.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it.
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. A field older cores do not know needs a higher `gladys_version`
  minimum (see `src/constants.js` of the integration-store): a widget button
  with a form would need 5.2.0. Transport: `["cloud"]`. The manifest is
  written by hand; keep the descriptions of the catalog under 100 characters.
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake Brevo of
  `test/helpers/fake-brevo.js`).
