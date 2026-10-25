# Brevo

## Overview

This integration sends the notifications of Gladys **by email, by SMS or
both** through the transactional APIs of [Brevo](https://www.brevo.com)
(formerly Sendinblue). Each user of Gladys picks their channel and enters
their own address and/or mobile number; the administrator enters the Brevo API
key once for the house. Camera snapshots sent by a scene travel as email
attachments.

It also brings:

- three **scene triggers**: message not sent, delivery failed, SMS credits
  low;
- three **scene actions**: send an email, send an SMS (to anyone, even
  someone who is not a Gladys user), read the Brevo account;
- two **dashboard widgets**: the Brevo account and the last messages with
  their delivery status.

![The two widgets of the integration: the Brevo account with its credits and counters, and the last messages with their delivery status (generated illustration, not a screenshot)](https://raw.githubusercontent.com/William-De71/gladys-brevo/main/docs/assets/widgets.en.png)

Transport: **cloud**. The texts, the images, the addresses and the numbers go
through the Brevo API (`api.brevo.com`), then the mail servers and the mobile
operators.

## Prerequisites

- Gladys Assistant **5.1.0** or later.
- A **Brevo account**. The free plan sends 300 emails a day; SMS are bought as
  credits (a new account has none).
- An **email sender**: an address verified in Brevo, or an address of a domain
  authenticated in Brevo (Senders, domains, IPs).
- The **public IP address of your house authorized** in Brevo, when the
  account blocks unknown IP addresses (on by default on accounts created since
  2024): Security → Authorized IPs.

## Configuration

1. In Brevo, open **SMTP & API → API keys** and click **Generate a new API
   key**. Copy it: it starts with `xkeysib-` and is shown only once.
2. In Gladys, open **Integrations → Brevo → Configuration**, paste the key and
   save.
3. Click **Test the connection**: it shows the account, the email and SMS
   credits, the senders and the one used.
4. If the test answers that Brevo blocks the IP address, open **Security →
   Authorized IPs** in Brevo (link in the configuration) and authorize the
   address Brevo shows, or the one written in the email Brevo sent you.
5. Click **Send a test** with your address and/or number to check the whole
   chain.
6. Each user opens the **My account** block of the same screen, chooses
   **Email**, **SMS** or **Email and SMS**, and enters their address and/or
   mobile number.

| Field                 | Use                                                                         |
| --------------------- | --------------------------------------------------------------------------- |
| API key               | From SMTP & API → API keys, stored encrypted                                |
| Sender address        | Optional: a verified sender; empty = the first active sender of the account |
| Sender name           | The name recipients see (`Gladys` by default)                               |
| Subject prefix        | Before the first line of the notification: `Gladys: Front door open`        |
| SMS sender            | Up to 11 letters and digits, no spaces (`Gladys` by default)                |
| Default country code  | Added to numbers typed without one (`33` by default: 06… becomes +336…)     |
| Low SMS credits alert | Below this number of SMS credits, "SMS credits low" fires once; 0 = off     |
| Follow the delivery   | Reads the delivery events of Brevo, for the widget and "Delivery failed"    |

## Usage

### Notifications

Every Gladys notification addressed to a user who filled in "My account"
leaves through their channel: alarms, "Send a message" scene actions, the
answers of Gladys. The email subject is the prefix and the first line of the
text; a camera image goes as an attachment. An SMS carries the text only, cut
at 1,000 characters: past 160 characters (70 with characters such as ê, ç or
emojis) it is sent in several parts, each one using credits. With **Email and
SMS**, the notification fails only when neither channel went out.

### Scene triggers

| Trigger          | When it fires                                                                                   | Variables                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Message not sent | Brevo refused a notification: once per channel, then again only after a message of that channel | channel, reason, HTTP status, error, masked recipient       |
| Delivery failed  | Brevo accepted a message, then reported a bounce, a block, a spam report…; once per message     | channel, event, masked recipient, subject, reason, id, date |
| SMS credits low  | The SMS credits went below the threshold; again only after a top-up above it                    | credits left, threshold                                     |

"Message not sent" and "Delivery failed" can be filtered by channel, reason
or event.

### Scene actions

- **Send an email**: one or several addresses separated by commas (20 at
  most, each recipient gets their own email), a subject (empty = prefix and
  first line) and a text. Returns the emails sent, the addresses refused and
  the message id.
- **Send an SMS**: one or several numbers separated by commas (20 at most)
  and a text. Returns the SMS sent and the numbers refused.
- **Read the Brevo account**: returns the email and SMS credits, the plan,
  and the emails and SMS sent today and this month.

Scene variables are allowed in every field.

### Scene examples

- _When the alarm goes off_ → **Send an SMS** to the neighbor: "Alarm at home,
  can you take a look?".
- _When an SMS is not sent_ (channel SMS, reason "Not enough credits") → send
  a message by email to the administrator: "Brevo has no SMS credits left".
- _When a delivery fails_ (event "Hard bounce") → notify the administrator:
  "{{triggerEvent.data.recipient}} did not receive
  {{triggerEvent.data.subject}}".

### Dashboard widgets

- **Brevo**: email credits, SMS credits (orange near the threshold, red
  below), the state of the API, the sender, the emails and SMS sent today and
  this month, the failures of the month and the last one.
- **Brevo messages**: the last emails and SMS Gladys sent, with their status
  (sent, delivered, hard bounce, blocked…); tap one for the details.

The widgets never call Brevo: they show what the integration already knows.
The account is read every 15 minutes; the delivery events every 5 minutes,
only while a message of the last two days waits for its final status.

## Troubleshooting

- **"Brevo refuses the API key"**: check the key (it starts with `xkeysib-`),
  or generate a new one. An SMTP key (`xsmtpsib-`) does not work with the API.
- **"Brevo blocks the IP address of your house"**: authorize it in Security →
  Authorized IPs, or turn off the blocking of unknown IP addresses. With a
  dynamic IP address, the problem comes back after each change: authorize the
  range, or choose the automatic authorization.
- **"No active email sender"**: add a sender in Brevo and confirm it from the
  email Brevo sends, or authenticate your domain.
- **"Sender refused"**: the address of the configuration is not a verified
  sender, or the SMS sender has more than 11 characters.
- **"Account not allowed to send"**: a new Brevo account can stay under
  validation for a while, and the SMS need credits and sometimes an
  activation: see the Brevo app.
- **SMS not received**: some countries replace the name sender by a number;
  the "Brevo messages" widget shows whether Brevo delivered it.
- **Logs**: Integrations → Brevo → Supervision tab. Addresses and numbers are
  masked; the key never appears.
