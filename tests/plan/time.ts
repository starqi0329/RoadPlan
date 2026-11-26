import type { Minute, Timestamp } from "./types.ts";

const STAMP =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})([+-]\d{2}:\d{2})$/;

export type Clock = {
  timestamp: Timestamp;
  date: string;
  minute: Minute;
  offset: string;
  epochMs: number;
};

export function parseClock(timestamp: Timestamp): Clock {
  const matched = STAMP.exec(timestamp);
  if (!matched) {
    throw new Error(`时间不是带数字时区的 RFC 3339：${timestamp}`);
  }
  const [, year, month, day, hour, minute, second, offset] = matched;
  const epochMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  ) - offsetMinutes(offset) * 60_000;
  return {
    timestamp,
    date: `${year}-${month}-${day}`,
    minute: Number(hour) * 60 + Number(minute),
    offset,
    epochMs,
  };
}

/** 把日期和当天分钟数拼成与给定偏移一致的时间点。1440 分钟落到次日 00:00。 */
export function atMinute(date: string, minute: Minute, offset: string): Timestamp {
  if (minute < 0) {
    throw new Error(`分钟不能为负：${minute}`);
  }
  const [year, month, day] = date.split("-").map(Number);
  const extraDays = Math.floor(minute / 1440);
  const within = minute % 1440;
  const epochMs =
    Date.UTC(year, month - 1, day + extraDays, Math.floor(within / 60), within % 60, 0) -
    offsetMinutes(offset) * 60_000;
  return formatClock(epochMs, offset);
}

export function shiftSeconds(timestamp: Timestamp, seconds: number): Timestamp {
  const clock = parseClock(timestamp);
  return formatClock(clock.epochMs + seconds * 1000, clock.offset);
}

export function formatClock(epochMs: number, offset: string): Timestamp {
  const shifted = new Date(epochMs + offsetMinutes(offset) * 60_000);
  const year = shifted.getUTCFullYear();
  const month = pad(shifted.getUTCMonth() + 1);
  const day = pad(shifted.getUTCDate());
  const hour = pad(shifted.getUTCHours());
  const minute = pad(shifted.getUTCMinutes());
  const second = pad(shifted.getUTCSeconds());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offset}`;
}

export function minutes(hour: number, minute: number): Minute {
  return hour * 60 + minute;
}

function offsetMinutes(offset: string): number {
  const matched = /^([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (!matched) {
    throw new Error(`时区偏移无法识别：${offset}`);
  }
  const sign = matched[1] === "-" ? -1 : 1;
  return sign * (Number(matched[2]) * 60 + Number(matched[3]));
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
