# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

The **Hive** external integration of Gladys Assistant: a Node.js service (Node
22+, ESM, no build step) running in its own sandboxed Docker container, talking
to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js)
(its only runtime dependency) and to the Hive cloud (Cognito + beekeeper API)
with the global `fetch`. It started from the official JavaScript template.

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/auth.test.js             # one file
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store .   # store admission checks
```

The CI runs `format:check`, `lint` and `test` on Node 22 and 24 and builds the
Docker image: run the three commands before pushing.

## Architecture

```
index.js              SDK wiring only: handlers registered before connect()
src/controller.js     HiveController: session, cached home, refresh loop, commands, status
src/hive/srp.js       Cognito SRP maths (BigInt), vectors in test/srp.test.js
src/hive/cognito.js   Cognito JSON 1.1 client (InitiateAuth, RespondToAuthChallenge...)
src/hive/auth.js      HiveAuth: SRP login, SMS_MFA, remembered device, refresh token
src/hive/api.js       beekeeper API: nodes/all, POST nodes/<type>/<id>, PUT actions/<id>
src/hive/home.js      helpers over the nodes/all payload (hardware, battery, schedule, colours)
src/hive/store.js     session persistence in /data (file) or memory (tests)
src/devices/<x>.js    one blueprint per Hive product family; registry in src/devices/index.js
src/events.js         scene triggers: transitions between two reads of the home
src/scenes.js         scene action handlers (manifest `scene_actions`)
src/widgets.js        dashboard widgets (manifest `widgets`)
src/actions.js        Configuration screen buttons (manifest `actions`)
src/i18n.js           connection status / action messages, en fr de es
docs/{en,fr,de,es}.md user documentation, re-hosted by Gladys
test/helpers/fakeHive.js  fake SSO + Cognito (server-side SRP) + beekeeper
```

## Rules

- **External ids are forever.** Devices are `gladys.externalIds(<blueprint
key>, <Hive node id>)`; feature keys (`target-temperature`, `mode`,
  `binary`...) and blueprint keys (`heating`, `hot-water`, `light`, `plug`,
  `motion-sensor`, `contact-sensor`, `action`) are never renamed. Same for the
  manifest keys: `config_schema`, `actions`, `scene_triggers`,
  `scene_actions`, `widgets` and their fields.
- **Gladys values.** Thermostat mode uses THERMOSTAT_MODE (OFF 0, HEATING 1,
  AUTO 3), the water heater WATER_HEATER_MODE (OFF 0, MANUAL 4, PROGRAM 6),
  opening sensors 1 = closed, light temperature in mireds, colour as 0xRRGGBB.
- **Never send an SMS on our own.** A login that ends on SMS_MFA stops the
  loop; only a user action (config save, Test the connection, Forget the
  session) starts a login again. Keep it that way.
- **Secrets.** Never log or persist the password, tokens or SMS codes beyond
  what `src/hive/store.js` keeps (remembered device, refresh token, last SMS
  code used). The rootfs is read-only: write only under `/data`.
- **Tests never touch the network**: use `createFakeHive()` and
  `createFakeGladys()`.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or the manifest, nor the `docker_image` tag, by
  hand — except on the hand-pushed tag path, which bumps all three together.
- **Changelog.** Every user-visible change adds a line under `## [Unreleased]`
  in `CHANGELOG.md` (`### Added`, `Changed`, `Fixed`, `Removed`, `Security`).
- **Four languages.** Every user-facing text — manifest, status and action
  messages, widget content — exists in English, French, German and Spanish
  (`test/manifest.test.js` checks the manifest), and `docs/*.md` stay in sync.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English.
