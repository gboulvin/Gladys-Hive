// -----------------------------------------------------------------------------
// Dashboard widgets (manifest `widgets`, Gladys 5.1+). The content is
// declarative — the core renders it with its theme, dark mode and the user's
// language (multi-language objects) — and pulled by the core, cached until
// `ttl_seconds`; the controller nudges it after each change.
//
//   - hive_heating: one heating zone, live temperatures, mode, boost and
//     battery, with boost / cancel / schedule buttons;
//   - hive_home: the home at a glance — connection, hot water, lights, open
//     windows, offline devices, low batteries — with the hot water boost.
// -----------------------------------------------------------------------------

import { createLogger, WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { batteryOf, boostMinutes, hotWaterIsOn, isOnline } from './hive/home.js';
import { entriesOf } from './devices/index.js';
import { heating, heatingMode } from './devices/heating.js';
import { hotWater, hotWaterMode } from './devices/hotWater.js';
import { mapText, t } from './i18n.js';
import { resolveTarget, startBoost, stopBoost } from './scenes.js';

const logger = createLogger({ name: 'widgets' });

export const HEATING_WIDGET = 'hive_heating';
export const HOME_WIDGET = 'hive_home';

const ACTIONS = {
  BOOST: 'boost',
  CANCEL_BOOST: 'cancel_boost',
  SCHEDULE: 'schedule',
};

const MODE_LABELS = {
  SCHEDULE: t('Schedule', 'Programme', 'Zeitplan', 'Programa'),
  MANUAL: t('Manual', 'Manuel', 'Manuell', 'Manual'),
  ON: t('Always on', 'Toujours allumé', 'Immer an', 'Siempre encendido'),
  OFF: t('Off', 'Arrêt', 'Aus', 'Apagado'),
};

const ON_OFF = {
  on: t('On', 'Allumée', 'An', 'Encendida'),
  off: t('Off', 'Éteinte', 'Aus', 'Apagada'),
};

const minutesLeft = (minutes) =>
  t(
    `${minutes} min left`,
    `encore ${minutes} min`,
    `noch ${minutes} Min.`,
    `quedan ${minutes} min`,
  );

const NOT_CONNECTED = {
  type: 'text',
  variant: 'body',
  text: t(
    'Hive is not connected: open the integration configuration.',
    'Hive n’est pas connecté : ouvrez la configuration de l’intégration.',
    'Hive ist nicht verbunden: Öffnen Sie die Konfiguration der Integration.',
    'Hive no está conectado: abra la configuración de la integración.',
  ),
};

function connectionItem(controller) {
  const connected = controller.connected;
  const value =
    {
      connected: t('Connected', 'Connecté', 'Verbunden', 'Conectado'),
      sms_required: t(
        'SMS code needed',
        'Code SMS requis',
        'SMS-Code nötig',
        'Código SMS necesario',
      ),
      unavailable: t('Unreachable', 'Injoignable', 'Nicht erreichbar', 'Inaccesible'),
    }[controller.status.code] ??
    t('Not connected', 'Non connecté', 'Nicht verbunden', 'No conectado');
  return {
    label: t('Hive cloud', 'Cloud Hive', 'Hive-Cloud', 'Nube Hive'),
    icon: 'cloud',
    value,
    color: connected ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
  };
}

function heatingContent(controller, entry) {
  const { gladys, home } = controller;
  const { node } = entry;
  const ids = gladys.externalIds(heating.key, node.id);
  const mode = heatingMode(node);
  const boost = boostMinutes(node);
  const battery = batteryOf(home, node);
  const device = ids.device;

  const items = [
    {
      label: t('Mode', 'Mode', 'Modus', 'Modo'),
      icon: 'sliders',
      value: MODE_LABELS[mode] ?? String(mode ?? '-'),
      color: mode === 'OFF' ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.PRIMARY,
    },
    {
      label: t('Boost', 'Boost', 'Boost', 'Boost'),
      icon: 'zap',
      value: boost > 0 ? minutesLeft(boost) : t('Off', 'Inactif', 'Aus', 'Inactivo'),
      color: boost > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
    {
      label: t('Boiler', 'Chaudière', 'Heizkessel', 'Caldera'),
      icon: 'thermometer',
      value: node.props?.working
        ? t('Heating', 'En chauffe', 'Heizt', 'Calentando')
        : t('Idle', 'Au repos', 'Ruht', 'En reposo'),
      color: node.props?.working ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    },
  ];
  if (battery !== null) {
    items.push({
      label: t('Battery', 'Batterie', 'Batterie', 'Batería'),
      icon: 'battery',
      value: `${battery} %`,
      color:
        battery < controller.config.battery_low_threshold
          ? WIDGET_COLORS.DANGER
          : WIDGET_COLORS.SUCCESS,
    });
  }
  if (!isOnline(home, node)) {
    items.unshift({
      label: t('Thermostat', 'Thermostat', 'Thermostat', 'Termostato'),
      icon: 'wifi-off',
      value: t('Offline', 'Hors ligne', 'Offline', 'Desconectado'),
      color: WIDGET_COLORS.DANGER,
    });
  }

  const buttons = [];
  if (boost > 0) {
    buttons.push({
      type: 'button',
      label: t('Cancel boost', 'Annuler le boost', 'Boost beenden', 'Cancelar boost'),
      icon: 'x-circle',
      style: 'secondary',
      action: { key: ACTIONS.CANCEL_BOOST, params: { device } },
    });
  } else {
    const minutes = controller.config.boost_duration;
    buttons.push({
      type: 'button',
      label: mapText(t('Boost', 'Boost', 'Boost', 'Boost'), (text) => `${text} ${minutes} min`),
      icon: 'zap',
      style: 'primary',
      action: { key: ACTIONS.BOOST, params: { device } },
    });
  }
  if (mode !== 'SCHEDULE') {
    buttons.push({
      type: 'button',
      label: t(
        'Back to schedule',
        'Reprendre le programme',
        'Zurück zum Zeitplan',
        'Volver al programa',
      ),
      icon: 'calendar',
      style: 'secondary',
      action: { key: ACTIONS.SCHEDULE, params: { device } },
    });
  }

  return {
    ttl_seconds: 120,
    components: [
      {
        type: 'value',
        label: t('Temperature', 'Température', 'Temperatur', 'Temperatura'),
        icon: 'thermometer',
        device_feature: ids.feature('current-temperature'),
      },
      {
        type: 'value',
        label: t('Target', 'Consigne', 'Sollwert', 'Consigna'),
        icon: 'target',
        device_feature: ids.feature('target-temperature'),
      },
      { type: 'status', items },
      ...buttons,
    ],
  };
}

function homeContent(controller) {
  const { home, config } = controller;
  const entries = entriesOf(home).filter(({ blueprint }) => !blueprint.fromActions);
  const products = entries.map(({ node }) => node);
  const items = [connectionItem(controller)];

  const water = entries.find(({ blueprint }) => blueprint === hotWater)?.node;
  if (water) {
    const boost = boostMinutes(water);
    const on = hotWaterIsOn(water, home.timeZone);
    items.push({
      label: t('Hot water', 'Eau chaude', 'Warmwasser', 'Agua caliente'),
      icon: 'droplet',
      value:
        boost > 0
          ? mapText(t('Boost', 'Boost', 'Boost', 'Boost'), (text) => `${text}, ${boost} min`)
          : mapText(on ? ON_OFF.on : ON_OFF.off, (text, lang) => {
              const mode = MODE_LABELS[hotWaterMode(water)]?.[lang];
              return mode ? `${text} (${mode})` : text;
            }),
      color: on ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }

  const lights = products.filter((p) => p.type.endsWith('light'));
  if (lights.length > 0) {
    const lit = lights.filter((p) => p.state?.status === 'ON').length;
    items.push({
      label: t('Lights on', 'Lampes allumées', 'Lampen an', 'Luces encendidas'),
      icon: 'sun',
      value: `${lit} / ${lights.length}`,
      color: lit > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.NEUTRAL,
    });
  }

  const contacts = products.filter((p) => p.type === 'contactsensor');
  if (contacts.length > 0) {
    const open = contacts.filter((p) => p.props?.status === 'OPEN').length;
    items.push({
      label: t(
        'Doors & windows open',
        'Portes et fenêtres ouvertes',
        'Offene Türen & Fenster',
        'Puertas y ventanas abiertas',
      ),
      icon: 'square',
      value: `${open} / ${contacts.length}`,
      color: open > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
    });
  }

  const offline = products.filter((p) => !isOnline(home, p)).length;
  items.push({
    label: t(
      'Offline devices',
      'Appareils hors ligne',
      'Offline-Geräte',
      'Dispositivos desconectados',
    ),
    icon: 'wifi-off',
    value: offline,
    color: offline > 0 ? WIDGET_COLORS.DANGER : WIDGET_COLORS.SUCCESS,
  });

  const low = products.filter((p) => {
    const battery = batteryOf(home, p);
    return battery !== null && battery < config.battery_low_threshold;
  }).length;
  items.push({
    label: t('Low batteries', 'Piles faibles', 'Schwache Batterien', 'Baterías bajas'),
    icon: 'battery',
    value: low,
    color: low > 0 ? WIDGET_COLORS.WARNING : WIDGET_COLORS.SUCCESS,
  });

  const components = [{ type: 'status', items }];
  if (water) {
    components.push(
      boostMinutes(water) > 0
        ? {
            type: 'button',
            label: t('Stop water boost', 'Arrêter le boost', 'Boost beenden', 'Parar el boost'),
            icon: 'x-circle',
            style: 'secondary',
            action: { key: ACTIONS.CANCEL_BOOST, params: {} },
          }
        : {
            type: 'button',
            label: t(
              'Boost hot water',
              'Boost eau chaude',
              'Warmwasser-Boost',
              'Boost agua caliente',
            ),
            icon: 'droplet',
            style: 'primary',
            action: { key: ACTIONS.BOOST, params: {} },
          },
    );
  }
  return { ttl_seconds: 120, components };
}

const DONE = t('Done', 'C’est fait', 'Erledigt', 'Hecho');
const NOTHING = t('Nothing to do', 'Rien à faire', 'Nichts zu tun', 'Nada que hacer');

export function createWidgets(controller) {
  return {
    [HEATING_WIDGET]: {
      async get({ settings = {} } = {}) {
        logger.debug(`onWidgetGet <- ${HEATING_WIDGET}`);
        if (!controller.home) {
          return { ttl_seconds: 60, components: [NOT_CONNECTED] };
        }
        const entry = await resolveTarget(controller, heating, settings.device);
        if (!entry) {
          return {
            ttl_seconds: 300,
            components: [
              {
                type: 'text',
                variant: 'body',
                text: t(
                  'No Hive heating zone found: pick one in the widget settings.',
                  'Aucune zone de chauffage Hive trouvée : choisissez-en une dans les réglages du widget.',
                  'Keine Hive-Heizzone gefunden: Wählen Sie eine in den Widget-Einstellungen.',
                  'No se encontró ninguna zona de calefacción Hive: elija una en los ajustes del widget.',
                ),
              },
            ],
          };
        }
        return heatingContent(controller, entry);
      },

      async action({ actionKey, params }) {
        logger.info(`onWidgetAction <- ${HEATING_WIDGET}.${actionKey}`);
        let done;
        if (actionKey === ACTIONS.BOOST) {
          done = await startBoost(controller, heating, params.device);
        } else if (actionKey === ACTIONS.CANCEL_BOOST) {
          done = await stopBoost(controller, heating, params.device);
        } else if (actionKey === ACTIONS.SCHEDULE) {
          const entry = await resolveTarget(controller, heating, params.device);
          done = Boolean(entry);
          if (entry) {
            await controller.execute(entry, { mode: 'SCHEDULE' });
          }
        } else {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        return done ? DONE : NOTHING;
      },
    },

    [HOME_WIDGET]: {
      async get() {
        logger.debug(`onWidgetGet <- ${HOME_WIDGET}`);
        if (!controller.home) {
          return {
            ttl_seconds: 60,
            components: [NOT_CONNECTED, { type: 'status', items: [connectionItem(controller)] }],
          };
        }
        return homeContent(controller);
      },

      async action({ actionKey }) {
        logger.info(`onWidgetAction <- ${HOME_WIDGET}.${actionKey}`);
        let done;
        if (actionKey === ACTIONS.BOOST) {
          done = await startBoost(controller, hotWater);
        } else if (actionKey === ACTIONS.CANCEL_BOOST) {
          done = await stopBoost(controller, hotWater);
        } else {
          throw new Error(`Unknown widget action: ${actionKey}`);
        }
        return done ? DONE : NOTHING;
      },
    },
  };
}

/** Freshness nudge: re-pull every widget now (rate-limited core-side). */
export function refreshWidgets(gladys, widgets) {
  for (const key of Object.keys(widgets)) {
    gladys.requestWidgetRefresh(key);
  }
}
