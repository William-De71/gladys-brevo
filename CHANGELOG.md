# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- Gladys notifications by email, by SMS or both through the transactional APIs of Brevo: each user picks the channel and enters an address and/or a mobile number in the "My account" block, the administrator the Brevo API key once.
- Camera snapshots sent by a scene travel as email attachments; the subject is a prefix followed by the first line of the notification.
- Automatic choice of the email sender (the first active one of the account) or the one of the configuration; SMS sender name checked against the Brevo rules; national numbers get the default country code.
- Delivery follow-up: the events of Brevo are read while a message waits for its final status, and the activity widget shows sent, delivered or bounced.
- Scene triggers: message not sent (once per failure and channel, never looping), delivery failed (bounce, block, spam report…), SMS credits low.
- Scene actions: send an email, send an SMS (to anyone, even someone who is not a Gladys user), read the Brevo account.
- Dashboard widgets: the Brevo account (email and SMS credits, messages of the day and of the month, sender, failures) and the last messages with their delivery status.
- Configuration screen buttons: test the connection, send a test email and/or SMS.
- Cloud transport only; English, French, German and Spanish everywhere.

[0.1.0]: https://github.com/William-De71/gladys-brevo/releases/tag/v0.1.0
