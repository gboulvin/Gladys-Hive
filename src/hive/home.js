// -----------------------------------------------------------------------------
// Helpers over the Hive "nodes/all" payload.
//
// Hive splits a home in two lists that share ids:
//   - products: what the user controls (a heating zone, the hot water, a
//     bulb, a plug, a sensor) with `state` (what was asked) and `props` (what
//     is measured);
//   - devices: the hardware behind them (thermostat, receiver, TRV, bulb...)
//     with `props.battery`, `props.signal`, `props.online`.
// A bulb, a plug or a sensor is product and device under the same id; a
// heating zone and the hot water are driven by a receiver ("boilermodule")
// and read by a thermostat ("thermostatui") of the same zone; a TRV zone
// ("trvcontrol") lists its radiator valves in `props.trvs`.
// -----------------------------------------------------------------------------

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Index the raw payload.
 * @param {object} raw - answer of GET /nodes/all
 */
export function indexHome(raw = {}) {
  const products = (raw.products ?? []).filter((p) => p && p.id && p.type);
  const devices = new Map((raw.devices ?? []).filter((d) => d && d.id).map((d) => [d.id, d]));
  const actions = (raw.actions ?? []).filter((a) => a && a.id);
  const timeZone =
    raw.homes?.homes?.[0]?.location?.timeZone ?? raw.user?.timezone ?? 'Europe/London';
  return { products, devices, actions, timeZone };
}

/**
 * The hardware that powers / measures a product (for battery, signal...).
 * @param {ReturnType<typeof indexHome>} home
 * @param {object} product
 */
export function hardwareOf(home, product) {
  if (product.type === 'heating' || product.type === 'hotwater') {
    const zone = product.props?.zone;
    const sameZone = [...home.devices.values()].filter((d) => zone && d.props?.zone === zone);
    // The thermostat (battery powered) first: it is what the user sees.
    return (
      sameZone.find((d) => d.type === 'thermostatui') ??
      sameZone.find((d) => d.type === 'boilermodule') ??
      home.devices.get(product.parent) ??
      null
    );
  }
  if (product.type === 'trvcontrol') {
    return home.devices.get(product.props?.trvs?.[0]) ?? null;
  }
  return home.devices.get(product.id) ?? null;
}

/** Name of a product as the user named it in the Hive app. */
export function productName(product) {
  const name = product.state?.name ?? product.props?.zoneName;
  if (!name || name === 'Receiver') {
    return product.type === 'hotwater' ? 'Hot water' : 'Heating';
  }
  return name;
}

/** Is the product reachable (Hive says `online`)? */
export function isOnline(home, product) {
  const hardware = hardwareOf(home, product);
  const online = product.props?.online ?? hardware?.props?.online;
  return online !== false;
}

/**
 * Battery level (%) of the hardware behind the product, if battery powered.
 * @returns {number | null}
 */
export function batteryOf(home, product) {
  const value = product.props?.battery ?? hardwareOf(home, product)?.props?.battery;
  return Number.isFinite(value) ? value : null;
}

/**
 * Weekday and minutes since midnight of `date` in the home's time zone (the
 * Hive schedules are written in local time).
 */
export function localTime(date, timeZone) {
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
  } catch {
    return localTime(date, 'Europe/London');
  }
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return {
    day: get('weekday').toLowerCase(),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/**
 * Value of the schedule slot running at `date`: the last slot started today,
 * or the last slot of the previous days (a slot runs until the next one).
 * @param {Record<string, Array<{ start: number, value: object }>>} schedule
 * @returns {object | null}
 */
export function scheduleNow(schedule, timeZone, date = new Date()) {
  if (!schedule) {
    return null;
  }
  const { day, minutes } = localTime(date, timeZone);
  const today = DAYS.indexOf(day);
  for (let back = 0; back < 7; back += 1) {
    const slots = [...(schedule[DAYS[(today - back + 7) % 7]] ?? [])].sort(
      (a, b) => a.start - b.start,
    );
    const started = back === 0 ? slots.filter((slot) => slot.start <= minutes) : slots;
    if (started.length > 0) {
      return started[started.length - 1].value ?? null;
    }
  }
  return null;
}

/**
 * Remaining minutes of a boost, or 0. Hive reports `state.boost` in minutes
 * while the product is in mode BOOST.
 */
export function boostMinutes(product) {
  if (product.state?.mode !== 'BOOST') {
    return 0;
  }
  const minutes = Number(product.state?.boost);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 0;
}

/**
 * Is the hot water being heated right now? `state.status` follows the
 * manual modes; under SCHEDULE the running slot decides.
 */
export function hotWaterIsOn(product, timeZone, date = new Date()) {
  const mode = product.state?.mode;
  if (mode === 'BOOST') {
    return true;
  }
  if (mode === 'OFF') {
    return false;
  }
  if (mode === 'SCHEDULE') {
    const slot = scheduleNow(product.state?.schedule, timeZone, date);
    if (slot?.status) {
      return slot.status === 'ON';
    }
  }
  return product.state?.status === 'ON' || mode === 'MANUAL' || mode === 'ON';
}

// --- Colours ------------------------------------------------------------------

/** Gladys light colour (0xRRGGBB integer) -> Hive HSV (0-360, 0-100, 0-100). */
export function rgbIntToHsv(color) {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta) % 6;
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
  }
  return {
    hue: Math.round((hue * 60 + 360) % 360),
    saturation: Math.round(max === 0 ? 0 : (delta / max) * 100),
    value: Math.round(max * 100),
  };
}

/** Hive HSV -> Gladys light colour (0xRRGGBB integer). */
export function hsvToRgbInt(hue, saturation, value) {
  const s = saturation / 100;
  const v = value / 100;
  const f = (n) => {
    const k = (n + hue / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return (f(5) << 16) + (f(3) << 8) + f(1);
}

/** Kelvin <-> mired (Gladys light temperatures are in mireds). */
export const kelvinToMired = (kelvin) => Math.round(1_000_000 / kelvin);
export const miredToKelvin = (mired) => Math.round(1_000_000 / mired);
