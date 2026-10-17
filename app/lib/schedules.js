export const WEEKDAYS = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

export function validateSchedule(input = {}) {
  if (typeof input.template_id !== 'string' || !input.template_id.trim()) {
    return 'template_id is required';
  }
  const weekday = Number(input.weekday);
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
    return 'weekday must be between 0 and 6';
  }
  if (input.local_time !== null && input.local_time !== undefined && input.local_time !== '') {
    if (typeof input.local_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.local_time)) {
      return 'local_time must use HH:MM';
    }
  }
  return null;
}

export function formatScheduleTime(value) {
  if (!value) return 'Any time';
  const [hour, minute] = String(value).slice(0, 5).split(':').map(Number);
  const date = new Date(2000, 0, 1, hour, minute);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}
