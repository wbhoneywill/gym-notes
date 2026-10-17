import { jest } from '@jest/globals';
import { makeRequest, mockGetDbUser, mockSql, resetMocks } from '../setup.js';

const USER = {
  id: 9,
  preferred_unit: 'kg',
  onboarding_completed: false,
  training_goal: null,
  experience_level: null,
  training_days_per_week: null,
};

const validBody = {
  preferred_unit: 'kg',
  training_goal: 'general_fitness',
  experience_level: 'beginner',
  training_days_per_week: 3,
  starter_plan: 'full_body',
};

const request = (body) => makeRequest('http://localhost/api/onboarding', {
  method: 'POST',
  body: JSON.stringify(body),
});

describe('/api/onboarding', () => {
  let GET, POST;

  beforeEach(async () => {
    resetMocks();
    ({ GET, POST } = await import('@/app/api/onboarding/route.js'));
  });

  it('returns 401 when unauthenticated', async () => {
    mockGetDbUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request(validBody))).status).toBe(401);
  });

  it('returns the current persisted state', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      onboarding: {
        completed: false,
        preferred_unit: 'kg',
        training_goal: null,
        experience_level: null,
        training_days_per_week: null,
      },
    });
  });

  it('returns 400 for an incomplete profile', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await POST(request({ preferred_unit: 'kg' }));
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('allows onboarding to be skipped without creating a plan', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await POST(request({ skip: true }));
    expect(res.status).toBe(200);
    expect(mockSql).toHaveBeenCalledTimes(1);
    expect(mockSql.transaction).toBeUndefined();
  });

  it('atomically creates the selected starter plan and completes onboarding', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    mockSql.transaction = jest.fn().mockResolvedValue([]);
    const res = await POST(request(validBody));
    expect(res.status).toBe(200);
    expect(mockSql.transaction).toHaveBeenCalledTimes(1);
    const data = await res.json();
    expect(data.template.name).toBe('Full Body Starter');
    expect(data.onboarding.completed).toBe(true);
    const values = mockSql.mock.calls.flatMap((call) => call.slice(1));
    expect(values).toContain(USER.id);
    expect(values).toContain('general_fitness');
  });

  it('updates an existing profile without creating another starter plan', async () => {
    mockGetDbUser.mockResolvedValue({ ...USER, onboarding_completed: true });
    mockSql.mockResolvedValue([]);
    const res = await POST(request({ ...validBody, mode: 'edit' }));
    expect(res.status).toBe(200);
    expect((await res.json()).template).toBeNull();
    expect(mockSql.transaction).toBeUndefined();
  });

  it('returns 500 when persistence fails', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockRejectedValue(new Error('db down'));
    const res = await POST(request({ ...validBody, starter_plan: 'none' }));
    expect(res.status).toBe(500);
  });
});
