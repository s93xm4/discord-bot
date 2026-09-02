import { taipeiOffsetHours } from '../config.js';

export function parseTaipeiDateTime(dateValue, timeValue) {
  const dateMatch = dateValue.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  const timeMatch = timeValue.match(/^(\d{1,2})[:：](\d{2})$/);

  if (!dateMatch || !timeMatch) {
    return null;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  const scheduledAt = new Date(Date.UTC(year, month - 1, day, hour - taipeiOffsetHours, minute));
  const taipeiDate = new Date(scheduledAt.getTime() + taipeiOffsetHours * 60 * 60 * 1000);
  const isSameInputDate = taipeiDate.getUTCFullYear() === year
    && taipeiDate.getUTCMonth() + 1 === month
    && taipeiDate.getUTCDate() === day
    && taipeiDate.getUTCHours() === hour
    && taipeiDate.getUTCMinutes() === minute;

  return isSameInputDate ? scheduledAt : null;
}

export function formatTaipeiDateTime(date) {
  const taipeiDate = new Date(date.getTime() + taipeiOffsetHours * 60 * 60 * 1000);
  const year = taipeiDate.getUTCFullYear();
  const month = String(taipeiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(taipeiDate.getUTCDate()).padStart(2, '0');
  const hour = String(taipeiDate.getUTCHours()).padStart(2, '0');
  const minute = String(taipeiDate.getUTCMinutes()).padStart(2, '0');

  return `${year}/${month}/${day} ${hour}:${minute}`;
}
