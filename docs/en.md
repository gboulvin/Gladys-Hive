# Hive

Control your **Hive** (Centrica / British Gas) devices from Gladys Assistant:
heating, hot water, radiator valves, lights, plugs, motion and door/window
sensors, plus the automations ("actions") of the Hive app.

This is a **cloud** integration: Gladys talks to the Hive cloud, the same one
the Hive app uses, and needs an Internet connection.

## Supported devices

| Hive product                                | In Gladys                                                |
| ------------------------------------------- | -------------------------------------------------------- |
| Active Heating (thermostat)                 | Thermostat: temperature, target, mode, heating, battery  |
| Radiator Valve zone (TRV)                   | Thermostat: temperature, target, mode, heating, battery  |
| Hot water                                   | Water heater: mode (schedule / on / off), boost, heating |
| Active Light (warm white, tuneable, colour) | Light: on/off, brightness, white temperature, colour     |
| Active Plug                                 | Switch: on/off, power (W)                                |
| Motion sensor                               | Motion, temperature, battery                             |
| Window / door sensor                        | Opening, battery                                         |
| Hive actions (automations)                  | A switch to enable or disable each action                |

Thermostat modes: **Schedule** (follows the Hive schedule), **Manual** (holds
the target temperature) and **Off** (frost protection). Setting a temperature
while the heating is off switches it to Manual.

## Configuration

1. Open the **Configuration** tab of the integration.
2. Enter the **email** and **password** of your Hive account, then save.
3. Hive usually confirms a new login with a **code sent by SMS**. The
   connection status then says so: type the code in the **SMS code** field
   and save **within 3 minutes**.
4. Gladys is then a _remembered device_ of your Hive account (it appears as
   "Gladys Assistant" in the account's device list): later logins need no
   code, even after a restart.
5. Your devices appear in the **Discovery** tab, ready to be added.

Other settings:

- **Refresh interval** (60 s by default, 30 s minimum): how often Gladys reads
  the Hive cloud. Sensors (motion, door) are seen with this delay — Hive does
  not push events to third parties.
- **Default boost duration / temperature**: used by the hot water boost
  feature, the widget buttons and the scene actions left empty.
- **Low battery threshold**: level under which the "Hive battery low" scene
  trigger fires.

### Buttons

- **Test the connection** — logs in again with the saved settings (this may
  send a new SMS code) and counts the devices.
- **Refresh the Hive devices** — re-reads the home, e.g. after adding a bulb
  in the Hive app.
- **Forget the Hive session** — forgets the remembered device and the session:
  the next login asks for a new SMS code. Use it before removing the
  integration, or when the login is stuck.

## Scenes

The integration adds its own cards to the scene editor (Gladys 5.1 or later).

Triggers:

- **Hive motion detected** — a motion sensor saw something move
  (`{{triggerEvent.data.device_name}}`).
- **Hive door or window** — a sensor opened or closed (filter on the change).
- **Hive boost ended** — a heating or hot water boost ended, timer elapsed or
  cancelled from the Hive app.
- **Hive device online / offline** — Hive lost or found a device again.
- **Hive battery low** — a battery dropped under the threshold
  (`{{triggerEvent.data.battery}}`).

Actions:

- **Boost the Hive heating** (zone, duration, temperature) and **Cancel the
  Hive heating boost**;
- **Boost the Hive hot water** (duration) and **Cancel the Hive hot water
  boost**;
- **Set the Hive heating mode** (schedule, manual with a temperature, off);
- **Set the Hive hot water mode** (schedule, always on, off).

Leave the zone empty to target the first one of the home. Each action returns
whether it worked (e.g. "Boost started"), so the following actions can depend
on it. Commands sent by Gladys never fire the Hive triggers themselves.

## Dashboard

- **Hive heating** widget: live temperature and target of a zone (pick it in
  the widget settings), mode, remaining boost time, boiler activity, battery,
  and **Boost** / **Cancel boost** / **Back to schedule** buttons.
- **Hive home** widget: Hive connection, hot water, lights on, open doors and
  windows, offline devices and low batteries, with a hot water boost button.

## Troubleshooting

- **"Hive refused the email or password"**: check them in the Hive app or on
  my.hivehome.com.
- **"Wrong SMS code"** / **"The SMS code expired"**: use **Test the
  connection** to receive a new code, then save it within 3 minutes.
- **A device shows "unreachable"**: Hive reports it offline (bulb switched off
  at the wall, flat battery, hub disconnected).
- Look at the integration logs: passwords, tokens and codes are never logged.

The session (remembered device, renewal token) is stored in the integration's
private `/data` volume, never the password.
