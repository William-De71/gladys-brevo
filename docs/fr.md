# Brevo

## Présentation

Cette intégration envoie les notifications de Gladys **par e-mail, par SMS ou
les deux** grâce aux API transactionnelles de [Brevo](https://www.brevo.com)
(ex-Sendinblue). Chaque utilisateur de Gladys choisit son canal et saisit sa
propre adresse et/ou son numéro de mobile ; l’administrateur saisit une seule
fois la clé API Brevo pour la maison. Les images de caméra envoyées par une
scène partent en pièce jointe de l’e-mail.

Elle apporte aussi :

- trois **déclencheurs de scène** : message non envoyé, échec de remise,
  crédits SMS bas ;
- trois **actions de scène** : envoyer un e-mail, envoyer un SMS (à n’importe
  qui, même à quelqu’un qui n’utilise pas Gladys), lire le compte Brevo ;
- deux **widgets de tableau de bord** : le compte Brevo et les derniers
  messages avec leur état de remise.

![Les deux widgets de l’intégration : le compte Brevo avec ses crédits et compteurs, et les derniers messages avec leur état de remise (illustration générée, pas une capture d’écran)](https://raw.githubusercontent.com/William-De71/gladys-brevo/main/docs/assets/widgets.fr.png)

Transport : **cloud**. Les textes, les images, les adresses et les numéros
passent par l’API Brevo (`api.brevo.com`), puis par les serveurs de messagerie
et les opérateurs mobiles.

## Prérequis

- Gladys Assistant **5.1.0** ou plus récent.
- Un **compte Brevo**. L’offre gratuite envoie 300 e-mails par jour ; les SMS
  s’achètent en crédits (un compte neuf n’en a pas).
- Un **expéditeur e-mail** : une adresse vérifiée dans Brevo, ou une adresse
  d’un domaine authentifié dans Brevo (Expéditeurs, domaines, IP dédiées).
- L’**adresse IP publique de votre maison autorisée** dans Brevo, quand le
  compte bloque les adresses IP inconnues (actif par défaut sur les comptes
  créés depuis 2024) : Sécurité → IP autorisées.

## Configuration

1. Dans Brevo, ouvrez **SMTP et API → Clés API** et cliquez sur **Générer une
   nouvelle clé API**. Copiez-la : elle commence par `xkeysib-` et ne
   s’affiche qu’une fois.
2. Dans Gladys, ouvrez **Intégrations → Brevo → Configuration**, collez la clé
   et enregistrez.
3. Cliquez sur **Tester la connexion** : le compte, les crédits e-mail et SMS,
   les expéditeurs et celui utilisé s’affichent.
4. Si le test répond que Brevo bloque l’adresse IP, ouvrez **Sécurité → IP
   autorisées** dans Brevo (lien dans la configuration) et autorisez
   l’adresse affichée par Brevo, ou celle de l’e-mail que Brevo vous a envoyé.
5. Cliquez sur **Envoyer un test** avec votre adresse et/ou votre numéro pour
   vérifier toute la chaîne.
6. Chaque utilisateur ouvre le bloc **Mon compte** du même écran, choisit
   **E-mail**, **SMS** ou **E-mail et SMS**, et saisit son adresse et/ou son
   numéro de mobile.

| Champ                     | Rôle                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| Clé API                   | Depuis SMTP et API → Clés API, stockée chiffrée                                          |
| Adresse d’expédition      | Facultatif : un expéditeur vérifié ; vide = le premier expéditeur actif                  |
| Nom de l’expéditeur       | Le nom que voient les destinataires (`Gladys` par défaut)                                |
| Préfixe de l’objet        | Avant la première ligne de la notification : `Gladys: Porte d’entrée ouverte`            |
| Expéditeur des SMS        | 11 lettres et chiffres au plus, sans espace (`Gladys` par défaut)                        |
| Indicatif pays par défaut | Ajouté aux numéros saisis sans indicatif (`33` par défaut : 06… devient +336…)           |
| Alerte crédits SMS bas    | Sous ce nombre de crédits SMS, « Crédits SMS bas » se déclenche une fois ; 0 = désactivé |
| Suivre la remise          | Lit les événements de remise de Brevo, pour le widget et « Échec de remise »             |

## Utilisation

### Notifications

Toute notification Gladys adressée à un utilisateur qui a rempli « Mon
compte » part par son canal : alarmes, actions de scène « Envoyer un
message », réponses de Gladys. L’objet de l’e-mail est le préfixe suivi de la
première ligne du texte ; une image de caméra part en pièce jointe. Un SMS ne
transporte que le texte, coupé à 1 000 caractères : au-delà de 160 caractères
(70 avec des caractères comme ê, ç ou des emojis), il part en plusieurs
morceaux, chacun consommant des crédits. Avec **E-mail et SMS**, la
notification n’échoue que si aucun des deux canaux n’est parti.

### Déclencheurs de scène

| Déclencheur        | Quand il se déclenche                                                                                      | Variables                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Message non envoyé | Brevo a refusé une notification : une fois par canal, puis seulement après un message passé sur ce canal   | canal, raison, statut HTTP, erreur, destinataire masqué        |
| Échec de remise    | Brevo a accepté un message, puis signalé un rejet, un blocage, un signalement spam… ; une fois par message | canal, événement, destinataire masqué, objet, raison, id, date |
| Crédits SMS bas    | Les crédits SMS sont passés sous le seuil ; à nouveau seulement après une recharge au-dessus               | crédits restants, seuil                                        |

« Message non envoyé » et « Échec de remise » se filtrent par canal, raison
ou événement.

### Actions de scène

- **Envoyer un e-mail** : une ou plusieurs adresses séparées par des virgules
  (20 au plus, chaque destinataire reçoit son propre e-mail), un objet (vide =
  préfixe et première ligne) et un texte. Renvoie les e-mails envoyés, les
  adresses refusées et l’identifiant du message.
- **Envoyer un SMS** : un ou plusieurs numéros séparés par des virgules (20 au
  plus) et un texte. Renvoie les SMS envoyés et les numéros refusés.
- **Lire le compte Brevo** : renvoie les crédits e-mail et SMS, l’offre, et
  les e-mails et SMS envoyés aujourd’hui et ce mois-ci.

Les variables de scène sont permises dans chaque champ.

### Exemples de scènes

- _Quand l’alarme se déclenche_ → **Envoyer un SMS** au voisin : « Alarme à la
  maison, peux-tu jeter un œil ? ».
- _Quand un message n’est pas envoyé_ (canal SMS, raison « Crédits
  insuffisants ») → envoyer un message par e-mail à l’administrateur : « Plus
  de crédits SMS chez Brevo ».
- _Quand une remise échoue_ (événement « Rejet définitif ») → prévenir
  l’administrateur : « {{triggerEvent.data.recipient}} n’a pas reçu
  {{triggerEvent.data.subject}} ».

### Widgets du tableau de bord

- **Brevo** : crédits e-mail, crédits SMS (orange près du seuil, rouge en
  dessous), état de l’API, expéditeur, e-mails et SMS envoyés aujourd’hui et
  ce mois-ci, échecs du mois et le dernier.
- **Messages Brevo** : les derniers e-mails et SMS envoyés par Gladys, avec
  leur état (envoyé, remis, rejet définitif, bloqué…) ; touchez-en un pour le
  détail.

Les widgets n’appellent jamais Brevo : ils affichent ce que l’intégration sait
déjà. Le compte est lu toutes les 15 minutes ; les événements de remise toutes
les 5 minutes, seulement tant qu’un message des deux derniers jours attend son
état final.

## Dépannage

- **« Brevo refuse la clé API »** : vérifiez la clé (elle commence par
  `xkeysib-`), ou générez-en une nouvelle. Une clé SMTP (`xsmtpsib-`) ne
  fonctionne pas avec l’API.
- **« Brevo bloque l’adresse IP de votre maison »** : autorisez-la dans
  Sécurité → IP autorisées, ou désactivez le blocage des adresses IP
  inconnues. Avec une adresse IP dynamique, le problème revient à chaque
  changement : autorisez la plage, ou choisissez l’autorisation automatique.
- **« Aucun expéditeur e-mail actif »** : ajoutez un expéditeur dans Brevo et
  confirmez-le depuis l’e-mail que Brevo envoie, ou authentifiez votre
  domaine.
- **« Expéditeur refusé »** : l’adresse de la configuration n’est pas un
  expéditeur vérifié, ou l’expéditeur des SMS dépasse 11 caractères.
- **« Compte pas autorisé à envoyer »** : un compte Brevo neuf peut rester un
  moment en cours de validation, et les SMS demandent des crédits et parfois
  une activation : voyez l’application Brevo.
- **SMS non reçu** : certains pays remplacent le nom d’expéditeur par un
  numéro ; le widget « Messages Brevo » montre si Brevo l’a remis.
- **Journaux** : Intégrations → Brevo → onglet Supervision. Les adresses et
  numéros sont masqués ; la clé n’apparaît jamais.
