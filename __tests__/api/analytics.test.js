import { jest } from '@jest/globals';
import {
  mockSql,
  mockGetDbUser,
  resetMocks,
  makeRequest,
} from '../setup.js';

const USER = { id: 7, clerk_user_id: 'u7' };
const params = (obj) => ({ params: Promise.resolve(obj) });

describe('GET /api/analytics/volume-by-muscle', () => {
  let GET;
  beforeEach(async () => {
    resetMocks();
    ({ GET } = await import('@/app/api/analytics/volume-by-muscle/route.js'));
  });

  it('401 when unauthenticated', async () => {
    mockGetDbUser.mockResolvedValue(null);
    const res = await GET(makeRequest('http://localhost/api/analytics/volume-by-muscle'));
    expect(res.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('400 on an out-of-range weeks param', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await GET(
      makeRequest('http://localhost/api/analytics/volume-by-muscle?weeks=99')
    );
    expect(res.status).toBe(400);
  });

  it('returns weekly muscle-group volume scoped to the user', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([
      { week: '2026-10-05', muscle_group: 'Chest', volume_kg: 4200 },
    ]);
    const res = await GET(
      makeRequest('http://localhost/api/analytics/volume-by-muscle?weeks=4')
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.weeks).toBe(4);
    expect(data.unit).toBe('kg');
    expect(data.data).toHaveLength(1);
    // Query must be scoped by the authenticated user id.
    expect(mockSql.mock.calls[0].slice(1)).toContain(USER.id);
  });

  it('defaults to an 8-week window', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await GET(
      makeRequest('http://localhost/api/analytics/volume-by-muscle')
    );
    const data = await res.json();
    expect(data.weeks).toBe(8);
  });
});

describe('GET /api/analytics/exercise/:exerciseId', () => {
  let GET;
  beforeEach(async () => {
    resetMocks();
    ({ GET } = await import('@/app/api/analytics/exercise/[exerciseId]/route.js'));
  });

  it('401 when unauthenticated', async () => {
    mockGetDbUser.mockResolvedValue(null);
    const res = await GET(
      makeRequest('http://localhost'),
      params({ exerciseId: 'e1' })
    );
    expect(res.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('404 when the exercise is not visible to the user', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]); // visibility check fails
    const res = await GET(
      makeRequest('http://localhost'),
      params({ exerciseId: 'foreign' })
    );
    expect(res.status).toBe(404);
  });

  it('returns progression points for a visible exercise', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{
        id: 'e1',
        name: 'Bench',
        primary_muscle_group: 'Chest',
        equipment: 'Barbell',
      }]) // visible
      .mockResolvedValueOnce([
        {
          session_id: 's1',
          session_name: 'Push A',
          started_at: '2026-10-01',
          set_count: 3,
          volume_kg: 2000,
          top_weight_kg: 100,
          top_reps: 8,
        },
      ]);
    const res = await GET(
      makeRequest('http://localhost'),
      params({ exerciseId: 'e1' })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.exercise.name).toBe('Bench');
    expect(data.exercise.primary_muscle_group).toBe('Chest');
    expect(data.exercise.equipment).toBe('Barbell');
    expect(data.points).toHaveLength(1);
    expect(data.points[0]).toMatchObject({
      session_name: 'Push A',
      set_count: 3,
      top_reps: 8,
    });
    // Visibility query scoped by user id.
    expect(mockSql.mock.calls[0].slice(1)).toContain(USER.id);
  });
});
