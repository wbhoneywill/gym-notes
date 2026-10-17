import { formatScheduleTime, validateSchedule, WEEKDAYS } from '@/app/lib/schedules.js';

describe('workout schedules', () => {
  it('accepts a weekly slot with an optional HH:MM time', () => {
    expect(validateSchedule({ template_id: 'template-1', weekday: 1, local_time: '18:30' })).toBeNull();
    expect(validateSchedule({ template_id: 'template-1', weekday: 0, local_time: null })).toBeNull();
  });

  it('rejects missing plans, invalid weekdays, and invalid times', () => {
    expect(validateSchedule({ weekday: 1 })).toMatch(/template_id/i);
    expect(validateSchedule({ template_id: 't1', weekday: 7 })).toMatch(/weekday/i);
    expect(validateSchedule({ template_id: 't1', weekday: 2, local_time: '25:00' })).toMatch(/HH:MM/i);
  });

  it('provides all weekday labels and formats an optional time', () => {
    expect(WEEKDAYS).toHaveLength(7);
    expect(formatScheduleTime(null)).toBe('Any time');
    expect(formatScheduleTime('18:30')).toMatch(/6:30|18:30/);
  });
});
