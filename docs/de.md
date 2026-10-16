# Hive

Steuern Sie Ihre **Hive**-Geräte (Centrica / British Gas) mit Gladys
Assistant: Heizung, Warmwasser, Heizkörperthermostate, Lampen, Steckdosen,
Bewegungs- und Tür-/Fenstersensoren sowie die Automationen („Aktionen“) der
Hive-App.

Dies ist eine **Cloud**-Integration: Gladys spricht mit der Hive-Cloud, die
auch die Hive-App nutzt, und benötigt eine Internetverbindung.

## Unterstützte Geräte

| Hive-Produkt                                 | In Gladys                                                      |
| -------------------------------------------- | -------------------------------------------------------------- |
| Active Heating (Thermostat)                  | Thermostat: Temperatur, Sollwert, Modus, Heizen, Batterie      |
| Heizkörperthermostat-Zone (TRV)              | Thermostat: Temperatur, Sollwert, Modus, Heizen, Batterie      |
| Warmwasser                                   | Warmwasserbereiter: Modus (Zeitplan / an / aus), Boost, Heizen |
| Active Light (warmweiß, einstellbar, farbig) | Lampe: an/aus, Helligkeit, Weißton, Farbe                      |
| Active Plug                                  | Steckdose: an/aus, Leistung (W)                                |
| Bewegungsmelder                              | Bewegung, Temperatur, Batterie                                 |
| Tür-/Fenstersensor                           | Öffnung, Batterie                                              |
| Hive-Aktionen (Automationen)                 | Ein Schalter, um jede Aktion zu aktivieren oder deaktivieren   |

Thermostatmodi: **Zeitplan** (folgt dem Hive-Zeitplan), **Manuell** (hält den
Sollwert) und **Aus** (Frostschutz). Wird bei ausgeschalteter Heizung eine
Temperatur eingestellt, wechselt sie zu Manuell.

## Konfiguration

1. Öffnen Sie den Reiter **Konfiguration** der Integration.
2. Geben Sie **E-Mail-Adresse** und **Passwort** Ihres Hive-Kontos ein und
   speichern Sie.
3. Hive bestätigt eine neue Anmeldung meist mit einem **per SMS gesendeten
   Code**. Der Verbindungsstatus zeigt das an: Geben Sie den Code im Feld
   **SMS-Code** ein und speichern Sie **innerhalb von 3 Minuten**.
4. Gladys ist danach ein _gemerktes Gerät_ Ihres Hive-Kontos (es erscheint als
   „Gladys Assistant“ in der Geräteliste des Kontos): Spätere Anmeldungen
   brauchen keinen Code mehr, auch nicht nach einem Neustart.
5. Ihre Geräte erscheinen im Reiter **Erkennung** und können hinzugefügt
   werden.

Weitere Einstellungen:

- **Aktualisierungsintervall** (standardmäßig 60 s, mindestens 30 s): wie oft
  Gladys die Hive-Cloud liest. Sensoren (Bewegung, Tür) werden mit dieser
  Verzögerung erkannt — Hive sendet keine Ereignisse an Dritte.
- **Standard-Boost-Dauer / -Temperatur**: für den Warmwasser-Boost, die
  Widget-Tasten und leer gelassene Szenenaktionen.
- **Schwelle für schwache Batterie**: Wert, unter dem der Auslöser „Hive-
  Batterie schwach“ auslöst.

### Tasten

- **Verbindung testen** — meldet sich mit den gespeicherten Einstellungen neu
  an (kann einen neuen SMS-Code senden) und zählt die Geräte.
- **Hive-Geräte aktualisieren** — liest das Zuhause neu ein, z. B. nach dem
  Hinzufügen einer Lampe in der Hive-App.
- **Hive-Sitzung vergessen** — vergisst das gemerkte Gerät und die Sitzung:
  Die nächste Anmeldung fragt nach einem neuen SMS-Code.

## Szenen

Die Integration fügt dem Szeneneditor eigene Karten hinzu (Gladys 5.1 oder
neuer).

Auslöser: **Hive-Bewegung erkannt**, **Hive-Tür oder -Fenster** (geöffnet /
geschlossen), **Hive-Boost beendet**, **Hive-Gerät online / offline**,
**Hive-Batterie schwach** (`{{triggerEvent.data.battery}}`). Der Gerätename
steht in `{{triggerEvent.data.device_name}}`.

Aktionen: **Hive-Heizung boosten** (Zone, Dauer, Temperatur) und beenden,
**Hive-Warmwasser boosten** (Dauer) und beenden, **Hive-Heizmodus
einstellen** (Zeitplan, manuell mit Temperatur, aus), **Hive-Warmwassermodus
einstellen** (Zeitplan, immer an, aus). Eine leere Zone bedeutet die erste des
Zuhauses. Jede Aktion meldet, ob sie funktioniert hat.

## Dashboard

- Widget **Hive-Heizung**: Live-Temperatur und Sollwert einer Zone, Modus,
  verbleibende Boost-Zeit, Kesselaktivität, Batterie, mit den Tasten
  **Boost** / **Boost beenden** / **Zurück zum Zeitplan**.
- Widget **Hive-Zuhause**: Verbindung, Warmwasser, eingeschaltete Lampen,
  offene Türen und Fenster, Offline-Geräte und schwache Batterien, mit einer
  Warmwasser-Boost-Taste.

## Fehlerbehebung

- **„Hive hat die E-Mail-Adresse oder das Passwort abgelehnt“**: Prüfen Sie
  sie in der Hive-App.
- **„Falscher SMS-Code“** / **„Der SMS-Code ist abgelaufen“**: Nutzen Sie
  **Verbindung testen**, um einen neuen Code zu erhalten.
- **Ein Gerät ist „nicht erreichbar“**: Hive meldet es offline.

Die Sitzung (gemerktes Gerät, Erneuerungstoken) wird im privaten
`/data`-Volume der Integration gespeichert, niemals das Passwort.
