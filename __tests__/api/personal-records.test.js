import { jest } from '@jest/globals';
import { mockSql, mockGetDbUser, resetMocks, makeRequest } from '../setup.js';

const USER = { id: 7, clerk_user_id: 'u7' };
const context = (id = 'session-1') => ({ params: Promise.resolve({ id }) });

describe('GET /api/sessions/:id/records', () => {
  let GET;

  beforeEach(async () => {
    resetMocks();
    ({ GET } = await import('@/app/api/sessions/[id]/records/route.js'));
  });

  it('returns 401 before querying when unauthenticated', async () => {
    mockGetDbUser.mockResolvedValue(null);
    const response = await GET(makeRequest('http://localhost'), context());
    expect(response.status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('returns 404 when the owned session does not exist', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]);
    const response = await GET(makeRequest('http://localhost'), context('foreign'));
    expect(response.status).toBe(404);
    expect(mockSql.mock.calls[0].slice(1)).toEqual(expect.arrayContaining(['foreign', USER.id]));
  });

  it('does not calculate records for an unfinished or abandoned session', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ id: 'session-1', status: 'abandoned', started_at: new Date() }]);
    const response = await GET(makeRequest('http://localhost'), context());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ eligible: false, records: [], workoutRecord: null });
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('derives records from owned completed working sets', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ id: 'session-1', status: 'completed', started_at: '2026-10-17' }])
      .mockResolvedValueOnce([
        { session_id: 'prior', session_name: 'Push Previous', started_at: '2026-10-10', exercise_id: 'bench', exercise_name: 'Bench Press', weight_kg: 80, reps: 5 },
        { session_id: 'session-1', session_name: 'Push Today', started_at: '2026-10-17', exercise_id: 'bench', exercise_name: 'Bench Press', weight_kg: 80, reps: 7 },
      ]);

    const response = await GET(makeRequest('http://localhost'), context());
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.eligible).toBe(true);
    expect(data.records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'reps_at_weight', reps: 7, previous_reps: 5,
        previous_session: expect.objectContaining({ session_id: 'prior', session_name: 'Push Previous' }),
      }),
      expect.objectContaining({ type: 'best_set_volume', volume_kg: 560, previous_volume_kg: 400 }),
    ]));
    expect(mockSql.mock.calls[1].slice(1)).toEqual(expect.arrayContaining([USER.id, 'session-1']));
  });

  it('returns 500 when the database read fails', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const response = await GET(makeRequest('http://localhost'), context());
    expect(response.status).toBe(500);
    errorSpy.mockRestore();
  });
});
