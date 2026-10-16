// -----------------------------------------------------------------------------
// Hive Active Light bulbs:
//   - "warmwhitelight"      dimmable;
//   - "tuneablelight"       dimmable + white temperature (Kelvin);
//   - "colourtuneablelight" dimmable + white temperature + colour (HSV).
// Gladys speaks mireds for the temperature and 0xRRGGBB for the colour.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { hsvToRgbInt, kelvinToMired, miredToKelvin, rgbIntToHsv } from '../hive/home.js';
import { baseDevice, clamp, idsOf, onOff, unknownFeature } from './common.js';

const KEY = 'light';

// Hive bulbs dim from 5 to 100 %.
const MIN_BRIGHTNESS = 5;
const DEFAULT_KELVIN = { min: 2700, max: 6500 };

const isTuneable = (product) => product.type !== 'warmwhitelight';
const isColour = (product) => product.type === 'colourtuneablelight';

function kelvinRange(product) {
  const range = product.props?.colourTemperature ?? {};
  return {
    min: Number(range.min) || DEFAULT_KELVIN.min,
    max: Number(range.max) || DEFAULT_KELVIN.max,
  };
}

export const light = {
  key: KEY,
  hiveTypes: ['warmwhitelight', 'tuneablelight', 'colourtuneablelight'],

  buildDevice(gladys, product, home) {
    const ids = idsOf(gladys, KEY, product);
    const features = [
      {
        name: 'On/Off',
        external_id: ids.feature('binary'),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.BINARY,
        min: 0,
        max: 1,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
      {
        name: 'Brightness',
        external_id: ids.feature('brightness'),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS,
        unit: DEVICE_FEATURE_UNITS.PERCENT,
        min: 0,
        max: 100,
        read_only: false,
        has_feedback: true,
        keep_history: true,
      },
    ];
    if (isTuneable(product)) {
      const kelvin = kelvinRange(product);
      features.push({
        name: 'Colour temperature',
        external_id: ids.feature('temperature'),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.TEMPERATURE,
        // Warmest = most mireds.
        min: kelvinToMired(kelvin.max),
        max: kelvinToMired(kelvin.min),
        read_only: false,
        has_feedback: true,
        keep_history: false,
      });
    }
    if (isColour(product)) {
      features.push({
        name: 'Colour',
        external_id: ids.feature('color'),
        category: DEVICE_FEATURE_CATEGORIES.LIGHT,
        type: DEVICE_FEATURE_TYPES.LIGHT.COLOR,
        min: 0,
        max: 0xffffff,
        read_only: false,
        has_feedback: true,
        keep_history: false,
      });
    }
    return baseDevice(gladys, KEY, product, home, features);
  },

  readStates(product) {
    const state = product.state ?? {};
    const states = {
      binary: onOff(state.status),
      brightness: Number.isFinite(Number(state.brightness)) ? Number(state.brightness) : null,
    };
    if (isTuneable(product)) {
      const kelvin = Number(state.colourTemperature);
      states.temperature = kelvin > 0 ? kelvinToMired(kelvin) : null;
    }
    if (isColour(product)) {
      const { hue, saturation, value } = state;
      states.color =
        hue === undefined || saturation === undefined
          ? null
          : hsvToRgbInt(Number(hue), Number(saturation), Number(value ?? 100));
    }
    return states;
  },

  command(product, featureKey, value) {
    switch (featureKey) {
      case 'binary':
        return { status: Number(value) === 1 ? 'ON' : 'OFF' };
      case 'brightness': {
        const level = Math.round(Number(value));
        if (level <= 0) {
          return { status: 'OFF' };
        }
        return { status: 'ON', brightness: clamp(level, MIN_BRIGHTNESS, 100) };
      }
      case 'temperature': {
        if (!isTuneable(product)) {
          throw unknownFeature(featureKey);
        }
        const range = kelvinRange(product);
        const kelvin = clamp(miredToKelvin(Number(value)), range.min, range.max);
        // A colour bulb only shows the white temperature in WHITE mode.
        return isColour(product)
          ? { colourMode: 'WHITE', colourTemperature: kelvin }
          : { colourTemperature: kelvin };
      }
      case 'color': {
        if (!isColour(product)) {
          throw unknownFeature(featureKey);
        }
        const { hue, saturation, value: level } = rgbIntToHsv(Number(value));
        return {
          status: 'ON',
          colourMode: 'COLOUR',
          hue,
          saturation,
          value: clamp(level, MIN_BRIGHTNESS, 100),
        };
      }
      default:
        throw unknownFeature(featureKey);
    }
  },
};
