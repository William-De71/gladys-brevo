# Brevo

## Überblick

Diese Integration sendet die Benachrichtigungen von Gladys **per E-Mail, per
SMS oder auf beiden Wegen** über die Transaktions-APIs von
[Brevo](https://www.brevo.com) (früher Sendinblue). Jeder Gladys-Benutzer
wählt seinen Kanal und gibt seine eigene Adresse und/oder Handynummer ein; der
Administrator gibt den Brevo-API-Schlüssel einmal für das Haus ein. Von einer
Szene gesendete Kamerabilder gehen als E-Mail-Anhang mit.

Außerdem bringt sie:

- drei **Szenenauslöser**: Nachricht nicht gesendet, Zustellung
  fehlgeschlagen, SMS-Guthaben niedrig;
- drei **Szenenaktionen**: E-Mail senden, SMS senden (an jeden, auch an
  jemanden ohne Gladys-Konto), Brevo-Konto lesen;
- zwei **Dashboard-Widgets**: das Brevo-Konto und die letzten Nachrichten mit
  ihrem Zustellstatus.

![Die zwei Widgets der Integration: das Brevo-Konto mit seinem Guthaben und seinen Zählern sowie die letzten Nachrichten mit ihrem Zustellstatus (generierte Illustration, kein Screenshot)](https://raw.githubusercontent.com/William-De71/gladys-brevo/main/docs/assets/widgets.de.png)

Transport: **Cloud**. Die Texte, die Bilder, die Adressen und die Nummern
laufen über die Brevo-API (`api.brevo.com`) und dann über die Mailserver und
die Mobilfunkanbieter.

## Voraussetzungen

- Gladys Assistant **5.3.0** oder neuer.
- Ein **Brevo-Konto**. Der kostenlose Tarif sendet 300 E-Mails pro Tag; SMS
  werden als Guthaben gekauft (ein neues Konto hat keins).
- Ein **E-Mail-Absender**: eine in Brevo bestätigte Adresse oder eine Adresse
  einer in Brevo authentifizierten Domain (Absender, Domains, IPs).
- Die **öffentliche IP-Adresse Ihres Hauses in Brevo autorisiert**, wenn das
  Konto unbekannte IP-Adressen blockiert (bei seit 2024 erstellten Konten
  standardmäßig aktiv): Sicherheit → Autorisierte IPs.

## Konfiguration

1. Öffnen Sie in Brevo **SMTP & API → API-Schlüssel** und klicken Sie auf
   **Neuen API-Schlüssel generieren**. Kopieren Sie ihn: Er beginnt mit
   `xkeysib-` und wird nur einmal angezeigt.
2. Öffnen Sie in Gladys **Integrationen → Brevo → Konfiguration**, fügen Sie
   den Schlüssel ein und speichern Sie.
3. Klicken Sie auf **Verbindung testen**: Es zeigt das Konto, das E-Mail- und
   SMS-Guthaben, die Absender und den verwendeten.
4. Antwortet der Test, dass Brevo die IP-Adresse blockiert, öffnen Sie in
   Brevo **Sicherheit → Autorisierte IPs** (Link in der Konfiguration) und
   autorisieren Sie die Adresse, die Brevo anzeigt, oder die aus der E-Mail,
   die Brevo Ihnen geschickt hat.
5. Klicken Sie auf **Test senden** mit Ihrer Adresse und/oder Nummer, um die
   ganze Kette zu prüfen.
6. Jeder Benutzer öffnet den Block **Mein Konto** desselben Bildschirms, wählt
   **E-Mail**, **SMS** oder **E-Mail und SMS** und gibt seine Adresse und/oder
   Handynummer ein.

| Feld                           | Verwendung                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| API-Schlüssel                  | Aus SMTP & API → API-Schlüssel, verschlüsselt gespeichert                             |
| Absenderadresse                | Optional: ein bestätigter Absender; leer = der erste aktive Absender des Kontos       |
| Absendername                   | Der Name, den die Empfänger sehen (standardmäßig `Gladys`)                            |
| Betreff-Präfix                 | Vor der ersten Zeile der Benachrichtigung: `Gladys: Haustür offen`                    |
| SMS-Absender                   | Höchstens 11 Buchstaben und Ziffern, ohne Leerzeichen (standardmäßig `Gladys`)        |
| Standard-Ländervorwahl         | Wird Nummern ohne Vorwahl vorangestellt (standardmäßig `33`: 06… wird zu +336…)       |
| Warnung bei wenig SMS-Guthaben | Unter dieser Anzahl SMS-Guthaben löst „SMS-Guthaben niedrig“ einmal aus; 0 = aus      |
| Zustellung verfolgen           | Liest die Zustellereignisse von Brevo, für das Widget und „Zustellung fehlgeschlagen“ |

## Verwendung

### Benachrichtigungen

Jede Gladys-Benachrichtigung an einen Benutzer, der „Mein Konto“ ausgefüllt
hat, geht über seinen Kanal raus: Alarme, Szenenaktionen „Nachricht senden“,
die Antworten von Gladys. Der Betreff der E-Mail besteht aus dem Präfix und
der ersten Zeile des Textes; ein Kamerabild geht als Anhang mit. Eine SMS
enthält nur den Text, gekürzt auf 1.000 Zeichen: Ab 160 Zeichen (70 mit
Zeichen wie ê, ç oder Emojis) wird sie in mehreren Teilen gesendet, von denen
jeder Guthaben verbraucht. Mit **E-Mail und SMS** schlägt die Benachrichtigung
nur fehl, wenn keiner der beiden Kanäle durchgegangen ist.

### Szenenauslöser

| Auslöser                  | Wann er auslöst                                                                                                           | Variablen                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Nachricht nicht gesendet  | Brevo hat eine Benachrichtigung abgelehnt: einmal pro Kanal, erneut erst nach einer Nachricht dieses Kanals               | Kanal, Grund, HTTP-Status, Fehler, maskierter Empfänger          |
| Zustellung fehlgeschlagen | Brevo hat eine Nachricht angenommen und dann einen Bounce, eine Sperre, eine Spam-Meldung… gemeldet; einmal pro Nachricht | Kanal, Ereignis, maskierter Empfänger, Betreff, Grund, ID, Datum |
| SMS-Guthaben niedrig      | Das SMS-Guthaben ist unter die Schwelle gefallen; erneut erst nach einer Aufladung darüber                                | verbleibendes Guthaben, Schwelle                                 |

„Nachricht nicht gesendet“ und „Zustellung fehlgeschlagen“ lassen sich nach
Kanal, Grund oder Ereignis filtern.

### Szenenaktionen

- **E-Mail senden**: eine oder mehrere durch Kommas getrennte Adressen
  (höchstens 20, jeder Empfänger bekommt seine eigene E-Mail), ein Betreff
  (leer = Präfix und erste Zeile) und ein Text. Liefert die gesendeten
  E-Mails, die abgelehnten Adressen und die Nachrichten-ID.
- **SMS senden**: eine oder mehrere durch Kommas getrennte Nummern (höchstens 20) und ein Text. Liefert die gesendeten SMS und die abgelehnten Nummern.
- **Brevo-Konto lesen**: liefert das E-Mail- und SMS-Guthaben, den Tarif sowie
  die heute und diesen Monat gesendeten E-Mails und SMS.

Szenenvariablen sind in jedem Feld erlaubt.

### Szenenbeispiele

- _Wenn der Alarm ausgelöst wird_ → **SMS senden** an den Nachbarn: „Alarm bei
  uns zu Hause, kannst du mal nachsehen?“.
- _Wenn eine SMS nicht gesendet wird_ (Kanal SMS, Grund „Nicht genug
  Guthaben“) → dem Administrator eine Nachricht per E-Mail senden: „Brevo hat
  kein SMS-Guthaben mehr“.
- _Wenn eine Zustellung fehlschlägt_ (Ereignis „Hard Bounce“) → den
  Administrator benachrichtigen: „{{triggerEvent.data.recipient}} hat
  {{triggerEvent.data.subject}} nicht erhalten“.

### Dashboard-Widgets

- **Brevo**: E-Mail-Guthaben, SMS-Guthaben (orange nahe der Schwelle, rot
  darunter), der Zustand der API, der Absender, die heute und diesen Monat
  gesendeten E-Mails und SMS, die Fehler des Monats und der letzte davon.
- **Brevo-Nachrichten**: die letzten von Gladys gesendeten E-Mails und SMS mit
  ihrem Status (gesendet, zugestellt, Hard Bounce, blockiert…); tippen Sie auf
  eine für die Details.

Die Widgets fragen nie Brevo ab: Sie zeigen, was die Integration bereits weiß.
Das Konto wird alle 15 Minuten gelesen, die Zustellereignisse alle 5 Minuten,
und nur solange eine Nachricht der letzten zwei Tage auf ihren endgültigen
Status wartet.

## Fehlerbehebung

- **„Brevo lehnt den API-Schlüssel ab“**: Prüfen Sie den Schlüssel (er beginnt
  mit `xkeysib-`) oder generieren Sie einen neuen. Ein SMTP-Schlüssel
  (`xsmtpsib-`) funktioniert nicht mit der API.
- **„Brevo blockiert die IP-Adresse Ihres Hauses“**: Autorisieren Sie sie
  unter Sicherheit → Autorisierte IPs oder schalten Sie die Sperre unbekannter
  IP-Adressen aus. Bei einer dynamischen IP-Adresse kehrt das Problem nach
  jedem Wechsel zurück: Autorisieren Sie den Adressbereich oder wählen Sie die
  automatische Autorisierung.
- **„Kein aktiver E-Mail-Absender“**: Fügen Sie in Brevo einen Absender hinzu
  und bestätigen Sie ihn über die E-Mail, die Brevo sendet, oder
  authentifizieren Sie Ihre Domain.
- **„Absender abgelehnt“**: Die Adresse der Konfiguration ist kein bestätigter
  Absender, oder der SMS-Absender hat mehr als 11 Zeichen.
- **„Konto darf nicht senden“**: Ein neues Brevo-Konto kann eine Zeit lang in
  Prüfung bleiben, und SMS brauchen Guthaben und manchmal eine Aktivierung:
  siehe die Brevo-App.
- **SMS nicht empfangen**: Manche Länder ersetzen einen Namen als Absender
  durch eine Nummer; das Widget „Brevo-Nachrichten“ zeigt, ob Brevo sie
  zugestellt hat.
- **Protokolle**: Integrationen → Brevo → Reiter Überwachung. Adressen und
  Nummern sind maskiert; der Schlüssel erscheint nie.
