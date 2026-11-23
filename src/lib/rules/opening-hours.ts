export type GermanStateCode =
  | "BW"
  | "BY"
  | "BE"
  | "BB"
  | "HB"
  | "HH"
  | "HE"
  | "MV"
  | "NI"
  | "NW"
  | "RP"
  | "SL"
  | "SN"
  | "ST"
  | "SH"
  | "TH";

export interface GermanStateInfo {
  code: GermanStateCode;
  name: string;
}

const STATE_NAMES: Record<GermanStateCode, string> = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
};

/**
 * Ordnet eine 5-stellige deutsche PLZ näherungsweise dem Bundesland zu
 * (für bundeslandspezifische Feiertage wie Fronleichnam, Allerheiligen, Reformationstag).
 * Hinweis: PLZ-Präfix-Näherung – einzelne 2-/3-stellige Bereiche können über Landesgrenzen
 * gehen (z. B. 63xxx rund um Aschaffenburg = Bayern statt Hessen).
 */
export const resolveGermanStateForZip = (zipCode: string): GermanStateInfo => {
  const clean = zipCode.replace(/\D/g, "").slice(0, 5);
  const p2 = Number.parseInt(clean.slice(0, 2), 10);
  const p3 = Number.parseInt(clean.slice(0, 3), 10);

  let code: GermanStateCode = "BE";
  if (p2 === 3) code = "BB"; // 03xxx: Cottbus / Lausitz (Brandenburg)
  else if (p2 >= 1 && p2 <= 4) code = "SN";
  else if (p2 === 6) code = "ST";
  else if (p2 === 7) code = "TH";
  else if (p2 === 8 || p2 === 9) code = "SN";
  else if (p2 >= 10 && p2 <= 14) code = p2 <= 13 || p3 <= 141 ? "BE" : "BB";
  else if (p2 >= 15 && p2 <= 16) code = "BB";
  else if (p2 >= 17 && p2 <= 19) code = "MV";
  else if (p2 === 20) code = "HH";
  else if (p2 === 21) code = p3 <= 211 ? "HH" : "NI"; // 212xx–217xx überwiegend Lüneburg/Stade (NI)
  else if (p2 === 22) code = p3 <= 227 ? "HH" : "SH";
  else if (p2 >= 23 && p2 <= 25) code = "SH";
  else if (p2 >= 26 && p2 <= 27) code = "NI";
  else if (p2 === 28) code = p3 <= 287 ? "HB" : "NI";
  else if (p2 >= 29 && p2 <= 31) code = "NI";
  else if (p2 >= 32 && p2 <= 33) code = "NW";
  else if (p2 >= 34 && p2 <= 36) code = "HE";
  else if (p2 === 37) code = "NI";
  else if (p2 === 38) code = p3 >= 388 ? "ST" : "NI";
  else if (p2 === 39) code = "ST";
  else if (p2 >= 40 && p2 <= 48) code = "NW";
  else if (p2 >= 49 && p2 <= 49) code = "NI";
  else if (p2 >= 50 && p2 <= 53) code = "NW";
  else if (p2 >= 54 && p2 <= 56) code = "RP";
  else if (p2 >= 57 && p2 <= 59) code = "NW";
  else if (p2 >= 60 && p2 <= 65) code = "HE";
  else if (p2 === 66) code = "SL";
  else if (p2 === 67) code = "RP";
  else if (p2 >= 68 && p2 <= 79) code = "BW";
  else if (p2 >= 80 && p2 <= 87) code = "BY";
  else if (p2 >= 88 && p2 <= 89) code = "BW";
  else if (p2 >= 90 && p2 <= 97) code = "BY";
  else if (p2 >= 98 && p2 <= 99) code = "TH";

  return { code, name: STATE_NAMES[code] };
};

/** Ostersonntag nach dem Gauß-/Meeus-Algorithmus (UTC-Datum) */
const computeEasterSundayUtc = (year: number): Date => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
};

const addDaysIso = (base: Date, days: number): string => {
  const copy = new Date(base.getTime() + days * 86_400_000);
  return copy.toISOString().slice(0, 10);
};

/** Buß- und Bettag (Sachsen): Mittwoch vor dem 23. November */
const computeBussUndBettagIso = (year: number): string => {
  const nov22 = new Date(Date.UTC(year, 10, 22));
  const dow = nov22.getUTCDay(); // 0=So..3=Mi..6=Sa
  const delta = (dow + 7 - 3) % 7;
  return addDaysIso(nov22, -delta);
};

/**
 * Prüft deterministisch, ob ein Datum (YYYY-MM-DD) im jeweiligen deutschen Bundesland
 * ein gesetzlicher Feiertag ist (bundesweit + regional).
 */
export const getGermanHolidayForDate = (
  isoDate: string,
  stateCode: GermanStateCode,
): string | null => {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const mmdd = `${match[2]}-${match[3]}`;

  // Bundesweite feste Feiertage
  if (mmdd === "01-01") return "Neujahr";
  if (mmdd === "05-01") return "Tag der Arbeit";
  if (mmdd === "10-03") return "Tag der Deutschen Einheit";
  if (mmdd === "12-25") return "1. Weihnachtsfeiertag";
  if (mmdd === "12-26") return "2. Weihnachtsfeiertag";

  // Regionale feste Feiertage
  if (mmdd === "01-06" && (stateCode === "BW" || stateCode === "BY" || stateCode === "ST")) {
    return "Heilige Drei Könige";
  }
  if (mmdd === "03-08" && (stateCode === "BE" || stateCode === "MV")) {
    return "Internationaler Frauentag";
  }
  if (mmdd === "08-15" && (stateCode === "SL" || stateCode === "BY")) {
    return "Mariä Himmelfahrt";
  }
  if (mmdd === "09-20" && stateCode === "TH") {
    return "Weltkindertag";
  }
  if (
    mmdd === "10-31" &&
    ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"].includes(stateCode)
  ) {
    return "Reformationstag";
  }
  if (mmdd === "11-01" && ["BW", "BY", "NW", "RP", "SL"].includes(stateCode)) {
    return "Allerheiligen";
  }

  // Bewegliche Feiertage rund um Ostern
  const easter = computeEasterSundayUtc(year);
  if (isoDate === addDaysIso(easter, -2)) return "Karfreitag";
  if (isoDate === addDaysIso(easter, 1)) return "Ostermontag";
  if (isoDate === addDaysIso(easter, 39)) return "Christi Himmelfahrt";
  if (isoDate === addDaysIso(easter, 50)) return "Pfingstmontag";
  if (
    isoDate === addDaysIso(easter, 60) &&
    ["BW", "BY", "HE", "NW", "RP", "SL"].includes(stateCode)
  ) {
    return "Fronleichnam";
  }

  if (stateCode === "SN" && isoDate === computeBussUndBettagIso(year)) {
    return "Buß- und Bettag";
  }

  return null;
};

type OsmDayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mo .. 6=So

const OSM_DAY_MAP: Record<string, OsmDayIndex> = {
  mo: 0,
  tu: 1,
  di: 1,
  we: 2,
  mi: 2,
  th: 3,
  do: 3,
  fr: 4,
  sa: 5,
  su: 6,
  so: 6,
};

const DAY_SHORT_DE: readonly string[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

interface TimeRange {
  startMinutes: number;
  endMinutes: number;
}

const parseHmToMinutes = (hm: string): number | null => {
  const m = hm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (h < 0 || h > 24 || min < 0 || min > 59) return null;
  return h * 60 + min;
};

const formatMinutesHm = (totalMinutes: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const parseDaySelector = (selector: string): OsmDayIndex[] => {
  const days = new Set<OsmDayIndex>();
  for (const part of selector.split(",")) {
    const trimmed = part.trim().toLowerCase();
    if (!trimmed) continue;
    const rangeMatch = trimmed.match(/^([a-z]{2})\s*-\s*([a-z]{2})$/);
    if (rangeMatch) {
      const start = OSM_DAY_MAP[rangeMatch[1]];
      const end = OSM_DAY_MAP[rangeMatch[2]];
      if (start != null && end != null) {
        let cur = start;
        for (let guard = 0; guard < 7; guard++) {
          days.add(cur);
          if (cur === end) break;
          cur = ((cur + 1) % 7) as OsmDayIndex;
        }
      }
      continue;
    }
    const single = OSM_DAY_MAP[trimmed];
    if (single != null) days.add(single);
  }
  return Array.from(days);
};

/**
 * Parst eine OpenStreetMap `opening_hours`-Zeichenkette in eine Wochentags-Tabelle (0=Mo..6=So).
 */
export const parseOsmOpeningHoursSchedule = (
  raw: string,
): { schedule: Record<OsmDayIndex, TimeRange[]>; closedOnHolidays: boolean } | null => {
  const text = raw.trim();
  if (!text) return null;

  const schedule: Record<OsmDayIndex, TimeRange[]> = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
    6: [],
  };

  if (text === "24/7") {
    for (let d = 0 as OsmDayIndex; d <= 6; d = (d + 1) as OsmDayIndex) {
      schedule[d] = [{ startMinutes: 0, endMinutes: 24 * 60 }];
    }
    return { schedule, closedOnHolidays: false };
  }

  let closedOnHolidays = true;
  let parsedAny = false;

  // Sowohl Semikolon- als auch Komma-getrennte Tagesgruppen unterstützen
  // (z. B. "Mo-Fr 07:00-20:00; Sa 07:00-18:00" oder "Mo-Fr 07:00-20:00, Sa 07:00-18:00")
  const normalizedRules = text.replace(
    /(\d{1,2}:\d{2}|off|closed)\s*,\s*(?=(?:mo|tu|di|we|mi|th|do|fr|sa|su|so|ph)\b)/gi,
    "$1; ",
  );

  for (const rawRule of normalizedRules.split(";")) {
    const rule = rawRule.trim();
    if (!rule) continue;

    if (/^ph\b/i.test(rule)) {
      if (/\boff\b|\bclosed\b/i.test(rule)) {
        closedOnHolidays = true;
      } else if (/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/.test(rule)) {
        closedOnHolidays = false;
      }
      parsedAny = true;
      continue;
    }

    // Beispiel: "Mo-Sa 07:00-21:00", "Su off" oder "Mo-Fr 07:00-20:00; Sa 07:00-18:00"
    const match = rule.match(
      /^([A-Za-z,\-\s]+?)\s+(off|closed|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/i,
    );
    if (!match) continue;

    const days = parseDaySelector(match[1]);
    if (days.length === 0) continue;

    const timePart = match[2].trim().toLowerCase();
    if (timePart === "off" || timePart === "closed") {
      for (const day of days) schedule[day] = [];
      parsedAny = true;
      continue;
    }

    const ranges: TimeRange[] = [];
    for (const seg of timePart.split(",")) {
      const hmMatch = seg.trim().match(/^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
      if (!hmMatch) continue;
      const startMinutes = parseHmToMinutes(hmMatch[1]);
      const endMinutes = parseHmToMinutes(hmMatch[2]);
      if (startMinutes != null && endMinutes != null && endMinutes > startMinutes) {
        ranges.push({ startMinutes, endMinutes });
      }
    }

    if (ranges.length > 0) {
      for (const day of days) schedule[day] = ranges;
      parsedAny = true;
    }
  }

  return parsedAny ? { schedule, closedOnHolidays } : null;
};

export type OpeningState = "open" | "closing_soon" | "closed" | "holiday_closed" | "unknown";

export interface OpeningEvaluation {
  state: OpeningState;
  label: string;
  dayHoursText: string;
  holidayName: string | null;
}

const isoDateToOsmDayIndex = (isoDate: string): OsmDayIndex | null => {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(
    Date.UTC(Number.parseInt(m[1], 10), Number.parseInt(m[2], 10) - 1, Number.parseInt(m[3], 10)),
  );
  // getUTCDay(): 0=So, 1=Mo..6=Sa -> OSM: 0=Mo..6=So
  return ((dt.getUTCDay() + 6) % 7) as OsmDayIndex;
};

/**
 * Bewertet die Öffnungszeiten einer Filiale für ein Datum (und optional eine konkrete
 * Uhrzeit in Minuten seit Mitternacht) unter Berücksichtigung deutscher Feiertage.
 */
export const evaluateOpeningHours = (params: {
  openingHours: string | null | undefined;
  dateIso: string;
  stateCode: GermanStateCode;
  /** Optionale aktuelle Uhrzeit in Minuten seit 00:00 (z. B. 1140 = 19:00) */
  currentTimeMinutes?: number | null;
}): OpeningEvaluation => {
  const holidayName = getGermanHolidayForDate(params.dateIso, params.stateCode);
  const parsed = params.openingHours ? parseOsmOpeningHoursSchedule(params.openingHours) : null;
  const dayIdx = isoDateToOsmDayIndex(params.dateIso);

  if (holidayName && (!parsed || parsed.closedOnHolidays)) {
    return {
      state: "holiday_closed",
      label: `Feiertag (${holidayName}) – geschlossen`,
      dayHoursText: "Feiertag geschlossen",
      holidayName,
    };
  }

  if (!parsed || dayIdx == null) {
    return {
      state: "unknown",
      label: params.openingHours?.trim() || "Öffnungszeiten nicht hinterlegt",
      dayHoursText: params.openingHours?.trim() || "unbekannt",
      holidayName,
    };
  }

  const todayRanges = parsed.schedule[dayIdx];
  if (!todayRanges || todayRanges.length === 0) {
    // Nächsten offenen Tag finden
    let nextHint = "";
    for (let offset = 1; offset <= 7; offset++) {
      const nextIdx = ((dayIdx + offset) % 7) as OsmDayIndex;
      const nextRanges = parsed.schedule[nextIdx];
      if (nextRanges && nextRanges.length > 0) {
        nextHint = ` (öffnet ${DAY_SHORT_DE[nextIdx]} ${formatMinutesHm(nextRanges[0].startMinutes)})`;
        break;
      }
    }
    return {
      state: "closed",
      label: `${dayIdx === 6 ? "Sonntag geschlossen" : "Geschlossen"}${nextHint}`,
      dayHoursText: "geschlossen",
      holidayName,
    };
  }

  const dayHoursText = todayRanges
    .map((r) => `${formatMinutesHm(r.startMinutes)}–${formatMinutesHm(r.endMinutes)}`)
    .join(", ");

  // Wenn keine Live-Uhrzeit übergeben wurde (z. B. Planung für Samstag), Tageszeiten ausgeben
  if (params.currentTimeMinutes == null) {
    return {
      state: "open",
      label: `Geöffnet ${dayHoursText}`,
      dayHoursText,
      holidayName,
    };
  }

  const nowMin = params.currentTimeMinutes;
  const activeRange = todayRanges.find(
    (r) => nowMin >= r.startMinutes && nowMin < r.endMinutes,
  );

  if (activeRange) {
    const minutesLeft = activeRange.endMinutes - nowMin;
    if (minutesLeft <= 45) {
      return {
        state: "closing_soon",
        label: `Schließt in ${minutesLeft} Min. (${formatMinutesHm(activeRange.endMinutes)})`,
        dayHoursText,
        holidayName,
      };
    }
    return {
      state: "open",
      label: `Offen bis ${formatMinutesHm(activeRange.endMinutes)}`,
      dayHoursText,
      holidayName,
    };
  }

  const nextToday = todayRanges.find((r) => r.startMinutes > nowMin);
  if (nextToday) {
    return {
      state: "closed",
      label: `Geschlossen (öffnet ${formatMinutesHm(nextToday.startMinutes)})`,
      dayHoursText,
      holidayName,
    };
  }

  return {
    state: "closed",
    label: `Geschlossen (heute ${dayHoursText})`,
    dayHoursText,
    holidayName,
  };
};
