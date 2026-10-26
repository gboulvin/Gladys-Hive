# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.1.0] - 2026-10-26

### Changed

- Requires Gladys 5.3.0 or later: the manifest declares search keywords and
  the countries where the integration works, for the new catalog of Gladys
  5.3.
- Integration SDK 0.16.

## [1.0.2] - 2026-10-22

### Security

- `brace-expansion`, pulled in by ESLint, raised to 5.0.12 against the
  high-severity denial-of-service advisories (GHSA-mh99-v99m-4gvg and
  related). A development tool only: the published image never shipped it.
- The image is rebuilt on the latest `node:24-alpine` (Node.js and Alpine
  security patches); development tools and CI actions up to date.

## [1.0.1] - 2026-10-16

## [1.0.0] - 2026-10-16

### Added

- Hive account login (AWS Cognito SRP), with the SMS code confirmation and a
  remembered device, so later logins and restarts need no new code. The
  password is never stored nor logged.
- Heating zones (Active Heating thermostat and radiator valve zones) as Gladys
  thermostats: temperature, target, mode (schedule / manual / off), heating
  state, battery.
- Hot water as a Gladys water heater: mode (schedule / on / off), boost,
  heating state.
- Active Light bulbs (warm white, tuneable, colour): on/off, brightness, white
  temperature, colour.
- Active Plugs: on/off and power.
- Motion sensors (motion, temperature, battery) and window / door sensors
  (opening, battery).
- Hive actions (automations) as switches enabling or disabling them.
- Scene triggers: motion detected, door or window opened / closed, boost
  ended, device online / offline, battery low.
- Scene actions: heating boost and its cancellation, hot water boost and its
  cancellation, heating mode, hot water mode.
- Dashboard widgets: "Hive heating" (one zone, with boost buttons) and "Hive
  home" (the home at a glance, with the hot water boost).
- Cloud transport badge: devices Hive reports offline show as unreachable.
- English, French, German and Spanish texts and documentation.

[Unreleased]: https://github.com/gboulvin/Gladys-Hive/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/gboulvin/Gladys-Hive/compare/v1.0.2...v1.1.0
[1.0.2]: https://github.com/gboulvin/Gladys-Hive/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/gboulvin/Gladys-Hive/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/gboulvin/Gladys-Hive/releases/tag/v1.0.0
