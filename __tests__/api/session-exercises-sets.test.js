import { jest } from '@jest/globals';
import {
  mockSql,
  mockGetDbUser,
  resetMocks,
  makeRequest,
} from '../setup.js';

const USER = { id: 5, clerk_user_id: 'u5' };
const params = (obj) => ({ params: Promise.resolve(obj) });

describe('session exercises', () => {
  let POST, PATCH, DELETE;
  beforeEach(async () => {
    resetMocks();
    ({ POST } = await import('@/app/api/sessions/[id]/exercises/route.js'));
    ({ PATCH, DELETE } = await import(
      '@/app/api/sessions/[id]/exercises/[seId]/route.js'
    ));
  });

  it('POST 404 when session not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]); // session ownership fails
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ exercise_id: 'e1' }),
      }),
      params({ id: 'foreign' })
    );
    expect(res.status).toBe(404);
  });

  it('POST 404 when the owned session is no longer in progress', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]); // status-scoped session lookup fails
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ exercise_id: 'e1' }),
      }),
      params({ id: 'completed-session' })
    );
    expect(res.status).toBe(404);
    expect(mockSql.mock.calls[0].slice(1)).toContain('completed-session');
  });

  it('POST 400 when exercise not visible', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ id: 'sess1' }]) // session owned
      .mockResolvedValueOnce([]); // exercise not visible
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ exercise_id: 'foreign-ex' }),
      }),
      params({ id: 'sess1' })
    );
    expect(res.status).toBe(400);
  });

  it('POST adds the exercise at the end', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ id: 'sess1' }]) // session owned
      .mockResolvedValueOnce([{ id: 'e1' }]) // exercise visible
      .mockResolvedValueOnce([{ next: 0 }]) // next position
      .mockResolvedValueOnce([{ id: 'se1', exercise_id: 'e1', position: 0 }]);
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ exercise_id: 'e1' }),
      }),
      params({ id: 'sess1' })
    );
    expect(res.status).toBe(201);
  });

  it('PATCH skip 404 when not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ skipped: true }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(404);
  });

  it('PATCH updates the rest timer for an owned in-progress exercise', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ id: 'se1', rest_seconds: 90 }]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ rest_seconds: 90 }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(200);
    expect(mockSql.mock.calls[0].slice(1)).toContain(90);
  });

  it('PATCH rejects an invalid rest timer before querying', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ rest_seconds: 3601 }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('DELETE 404 when not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await DELETE(
      makeRequest('http://localhost'),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(404);
  });
});

describe('previous performance', () => {
  let GET;
  beforeEach(async () => {
    resetMocks();
    ({ GET } = await import(
      '@/app/api/sessions/[id]/exercises/[seId]/previous/route.js'
    ));
  });

  it('404 when the current session-exercise is not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]);
    const res = await GET(
      makeRequest('http://localhost'),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(404);
  });

  it('returns null when there is no prior history', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ exercise_id: 'e1' }]) // current
      .mockResolvedValueOnce([]); // no prior
    const res = await GET(
      makeRequest('http://localhost'),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ previous: null });
  });

  it('returns the latest prior session sets', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ exercise_id: 'e1' }]) // current
      .mockResolvedValueOnce([
        { session_id: 'prev', started_at: '2026-01-01', session_exercise_id: 'sePrev' },
      ]) // prior
      .mockResolvedValueOnce([{ set_order: 0, weight: 100, reps: 5 }]); // sets
    const res = await GET(
      makeRequest('http://localhost'),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.previous.session_id).toBe('prev');
    expect(data.previous.sets).toHaveLength(1);
  });
});

describe('sets', () => {
  let POST, PATCH, DELETE;
  beforeEach(async () => {
    resetMocks();
    ({ POST } = await import(
      '@/app/api/sessions/[id]/exercises/[seId]/sets/route.js'
    ));
    ({ PATCH, DELETE } = await import(
      '@/app/api/sessions/[id]/exercises/[seId]/sets/[setId]/route.js'
    ));
  });

  it('POST 404 when the session-exercise is not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]); // ownership fails
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ weight: 100, reps: 5 }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(404);
  });

  it('POST 404 when the parent session is completed', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([]); // in-progress ownership guard fails
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ weight: 100, reps: 5 }),
      }),
      params({ id: 'completed-session', seId: 'se1' })
    );
    expect(res.status).toBe(404);
  });

  it('POST 400 on negative weight', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ weight: -5 }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('POST adds a set with defaults', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql
      .mockResolvedValueOnce([{ id: 'se1' }]) // owned
      .mockResolvedValueOnce([{ next: 0 }]) // next order
      .mockResolvedValueOnce([
        { id: 'ws1', weight: 100, reps: 5, weight_unit: 'kg', set_type: 'working' },
      ]);
    const res = await POST(
      makeRequest('http://localhost', {
        method: 'POST',
        body: JSON.stringify({ weight: 100, reps: 5 }),
      }),
      params({ id: 's', seId: 'se1' })
    );
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.set.weight_unit).toBe('kg');
  });

  it('PATCH 404 when the set is not in an owned session', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      }),
      params({ id: 's', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(404);
  });

  it('PATCH marks a set complete for an owned session', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ id: 'ws1', completed: true }]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      }),
      params({ id: 's', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(200);
    expect(mockSql.mock.calls[0].slice(1)).toContain(USER.id);
    expect(mockSql.mock.calls[0].slice(1)).toContain('s');
  });

  it('PATCH records actual and planned rest for a completed set', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{
      id: 'ws1',
      planned_rest_seconds: 90,
      rest_duration_seconds: 82,
      rest_outcome: 'started_early',
    }]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({
          planned_rest_seconds: 90,
          rest_duration_seconds: 82,
          rest_outcome: 'started_early',
        }),
      }),
      params({ id: 's', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(200);
    expect(mockSql.mock.calls[0].slice(1)).toEqual(expect.arrayContaining([90, 82, 'started_early']));
  });

  it('PATCH rejects invalid rest measurements before querying', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ rest_duration_seconds: -1 }),
      }),
      params({ id: 's', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('PATCH 404 when the set is addressed through a different session', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await PATCH(
      makeRequest('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ completed: true }),
      }),
      params({ id: 'wrong-session', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(404);
    expect(mockSql.mock.calls[0].slice(1)).toContain('wrong-session');
  });

  it('DELETE 404 when not owned', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const res = await DELETE(
      makeRequest('http://localhost'),
      params({ id: 's', seId: 'se1', setId: 'ws1' })
    );
    expect(res.status).toBe(404);
  });
});
