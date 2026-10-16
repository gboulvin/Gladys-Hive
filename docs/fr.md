# Hive

Pilotez vos appareils **Hive** (Centrica / British Gas) depuis Gladys
Assistant : chauffage, eau chaude, têtes thermostatiques, lampes, prises,
détecteurs de mouvement et d'ouverture, ainsi que les automatisations
(« actions ») de l'application Hive.

C'est une intégration **cloud** : Gladys dialogue avec le cloud Hive, le même
que l'application Hive, et nécessite une connexion Internet.

## Appareils pris en charge

| Produit Hive                                 | Dans Gladys                                                     |
| -------------------------------------------- | --------------------------------------------------------------- |
| Active Heating (thermostat)                  | Thermostat : température, consigne, mode, chauffe, batterie     |
| Zone de têtes thermostatiques (TRV)          | Thermostat : température, consigne, mode, chauffe, batterie     |
| Eau chaude                                   | Chauffe-eau : mode (programme / marche / arrêt), boost, chauffe |
| Active Light (blanc chaud, nuances, couleur) | Lampe : marche/arrêt, luminosité, température de blanc, couleur |
| Active Plug                                  | Prise : marche/arrêt, puissance (W)                             |
| Détecteur de mouvement                       | Mouvement, température, batterie                                |
| Capteur d'ouverture porte / fenêtre          | Ouverture, batterie                                             |
| Actions Hive (automatisations)               | Un interrupteur pour activer ou désactiver chaque action        |

Modes du thermostat : **Programme** (suit le programme Hive), **Manuel**
(maintient la consigne) et **Arrêt** (hors-gel). Régler une température quand
le chauffage est à l'arrêt le passe en Manuel.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. Saisissez l'**e-mail** et le **mot de passe** de votre compte Hive, puis
   enregistrez.
3. Hive confirme généralement une nouvelle connexion par un **code envoyé par
   SMS**. L'état de connexion l'indique alors : saisissez le code dans le
   champ **Code SMS** et enregistrez **sous 3 minutes**.
4. Gladys devient ensuite un _appareil mémorisé_ de votre compte Hive (il
   apparaît sous le nom « Gladys Assistant » dans la liste des appareils du
   compte) : les connexions suivantes ne demandent plus de code, même après un
   redémarrage.
5. Vos appareils apparaissent dans l'onglet **Découverte**, prêts à être
   ajoutés.

Autres réglages :

- **Intervalle de rafraîchissement** (60 s par défaut, 30 s minimum) :
  fréquence de lecture du cloud Hive. Les capteurs (mouvement, ouverture) sont
  vus avec ce délai — Hive ne pousse pas ses événements vers des tiers.
- **Durée / température du boost par défaut** : utilisées par la commande de
  boost de l'eau chaude, les boutons des widgets et les actions de scène
  laissées vides.
- **Seuil de batterie faible** : niveau sous lequel le déclencheur « Batterie
  Hive faible » se déclenche.

### Boutons

- **Tester la connexion** — se reconnecte avec les réglages enregistrés (peut
  envoyer un nouveau code SMS) et compte les appareils.
- **Actualiser les appareils Hive** — relit la maison, par exemple après
  l'ajout d'une ampoule dans l'application Hive.
- **Oublier la session Hive** — oublie l'appareil mémorisé et la session : la
  prochaine connexion demandera un nouveau code SMS. À utiliser avant de
  supprimer l'intégration, ou si la connexion est bloquée.

## Scènes

L'intégration ajoute ses propres cartes à l'éditeur de scènes (Gladys 5.1 ou
plus récent).

Déclencheurs :

- **Mouvement détecté (Hive)** — un détecteur a vu bouger quelque chose
  (`{{triggerEvent.data.device_name}}`).
- **Porte ou fenêtre (Hive)** — un capteur s'est ouvert ou fermé (filtre sur
  le changement).
- **Fin du boost Hive** — un boost du chauffage ou de l'eau chaude s'est
  terminé, minuterie écoulée ou annulé depuis l'application Hive.
- **Appareil Hive en / hors ligne** — Hive a perdu ou retrouvé un appareil.
- **Batterie Hive faible** — une batterie est passée sous le seuil
  (`{{triggerEvent.data.battery}}`).

Actions :

- **Booster le chauffage Hive** (zone, durée, température) et **Annuler le
  boost du chauffage Hive** ;
- **Booster l'eau chaude Hive** (durée) et **Annuler le boost de l'eau chaude
  Hive** ;
- **Changer le mode du chauffage Hive** (programme, manuel avec une
  température, arrêt) ;
- **Changer le mode de l'eau chaude Hive** (programme, toujours allumée,
  arrêt).

Laissez la zone vide pour viser la première de la maison. Chaque action
indique si elle a fonctionné (par exemple « Boost lancé »), pour que les
actions suivantes puissent en dépendre. Les commandes envoyées par Gladys ne
déclenchent jamais elles-mêmes les déclencheurs Hive.

## Tableau de bord

- Widget **Chauffage Hive** : température et consigne en direct d'une zone (à
  choisir dans les réglages du widget), mode, temps de boost restant, activité
  de la chaudière, batterie, et boutons **Boost** / **Annuler le boost** /
  **Reprendre le programme**.
- Widget **Maison Hive** : connexion Hive, eau chaude, lampes allumées, portes
  et fenêtres ouvertes, appareils hors ligne et piles faibles, avec un bouton
  de boost de l'eau chaude.

## Dépannage

- **« Hive a refusé l'e-mail ou le mot de passe »** : vérifiez-les dans
  l'application Hive ou sur my.hivehome.com.
- **« Code SMS erroné »** / **« Le code SMS a expiré »** : utilisez **Tester
  la connexion** pour recevoir un nouveau code, puis enregistrez-le sous 3
  minutes.
- **Un appareil est « injoignable »** : Hive le signale hors ligne (ampoule
  coupée à l'interrupteur, pile vide, hub débranché).
- Consultez les logs de l'intégration : mots de passe, jetons et codes n'y
  figurent jamais.

La session (appareil mémorisé, jeton de renouvellement) est stockée dans le
volume privé `/data` de l'intégration, jamais le mot de passe.
