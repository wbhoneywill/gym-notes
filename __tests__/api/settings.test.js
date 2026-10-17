import { jest } from '@jest/globals';
import {
  mockSql,
  mockGetDbUser,
  resetMocks,
  makeRequest,
} from '../setup.js';

const USER = {
  id: 3,
  clerk_user_id: 'u3',
  preferred_unit: 'kg',
  training_goal: 'muscle',
  experience_level: 'intermediate',
  training_days_per_week: 4,
  onboarding_completed: true,
};

describe('/api/settings', () => {
  let GET, PATCH;
  beforeEach(async () => {
    resetMocks();
    ({ GET, PATCH } = await import('@/app/api/settings/route.js'));
  });

  it('GET 401 when unauthenticated', async () => {
    mockGetDbUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it('GET returns the saved training profile', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      settings: {
        preferred_unit: 'kg',
        training_goal: 'muscle',
        experience_level: 'intermediate',
        training_days_per_week: 4,
        onboarding_completed: true,
      },
    });
  });

  it('PATCH 400 when preferred_unit missing', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await PATCH(
      makeRequest('http://localhost/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('PATCH 400 on an invalid unit', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await PATCH(
      makeRequest('http://localhost/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ preferred_unit: 'stone' }),
      })
    );
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('PATCH updates to lb, scoped to the user', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ preferred_unit: 'lb' }]);
    const res = await PATCH(
      makeRequest('http://localhost/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({ preferred_unit: 'lb' }),
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      settings: { preferred_unit: 'lb' },
    });
    const values = mockSql.mock.calls[0].slice(1);
    expect(values).toContain('lb');
    expect(values).toContain(USER.id);
  });
});
