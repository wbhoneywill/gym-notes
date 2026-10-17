import { filterHelpSections, helpSections } from '@/app/lib/help-content.js';

describe('help content', () => {
  it('contains practical guidance for every main app area', () => {
    expect(helpSections.map((section) => section.id)).toEqual(expect.arrayContaining([
      'plans', 'training', 'exercises', 'history', 'progress', 'account',
    ]));
    expect(helpSections.every((section) => section.items.length > 0)).toBe(true);
  });

  it('filters questions and answers case-insensitively', () => {
    const results = filterHelpSections(helpSections, 'VOLUME');
    expect(results.length).toBeGreaterThan(0);
    expect(results.flatMap((section) => section.items).some((item) =>
      item.answer.toLowerCase().includes('volume') || item.question.toLowerCase().includes('volume')
    )).toBe(true);
  });

  it('returns all sections for an empty query', () => {
    expect(filterHelpSections(helpSections, '  ')).toBe(helpSections);
  });

  it('distinguishes installation from offline support', () => {
    const answers = helpSections.flatMap((section) => section.items);
    expect(answers.some((item) => item.question.includes('install GymNotes'))).toBe(true);
    const offlineAnswer = answers.find((item) => item.question === 'Does GymNotes work offline?').answer;
    expect(offlineAnswer).toContain('after preparation');
    expect(offlineAnswer).toContain('still require connectivity');
  });
});
