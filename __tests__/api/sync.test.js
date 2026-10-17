import { mockGetDbUser, mockSql, resetMocks, makeRequest } from '../setup.js';

const USER = { id: 7, clerk_user_id: 'user_7' };
const CHANGE = {
  clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  operation: 'set.patch',
  entity: { sessionId: 's1', sessionExerciseId: 'se1', setId: 'ws1' },
  payload: { weight: 30, reps: 4 },
};

describe('POST /api/sync', () => {
  let POST;
  beforeEach(async () => {
    resetMocks();
    ({ POST } = await import('@/app/api/sync/route.js'));
  });

  it('returns 401 when signed out', async () => {
    mockGetDbUser.mockResolvedValue(null);
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [CHANGE] }) }));
    expect(response.status).toBe(401);
  });

  it('validates changes before querying', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [{ ...CHANGE, payload: { reps: -1 } }] }) }));
    expect(response.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('applies an owned set change and records its id atomically', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: true, entity: { id: 'ws1', weight: 30, reps: 4 } }]);
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [CHANGE] }) }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ results: [{ clientChangeId: CHANGE.clientChangeId, status: 'applied', entity: { id: 'ws1', weight: 30, reps: 4 } }] });
    expect(mockSql.mock.calls[0].slice(1)).toContain(USER.id);
    expect(mockSql.mock.calls[0].slice(1)).toContain('s1');
  });

  it('acknowledges a replay without applying it again', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: false, entity: null }]).mockResolvedValueOnce([{ client_change_id: CHANGE.clientChangeId }]);
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [CHANGE] }) }));
    await expect(response.json()).resolves.toEqual({ results: [{ clientChangeId: CHANGE.clientChangeId, status: 'duplicate' }] });
  });

  it('rejects a cross-user or finalized-session set without logging it', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: false, entity: null }]).mockResolvedValueOnce([]);
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [CHANGE] }) }));
    await expect(response.json()).resolves.toEqual({ results: [{
      clientChangeId: CHANGE.clientChangeId,
      status: 'rejected',
      code: 'not_editable',
      error: 'The workout changed or is no longer editable.',
    }] });
  });

  it('returns 500 when persistence fails', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockRejectedValue(new Error('db unavailable'));
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [CHANGE] }) }));
    expect(response.status).toBe(500);
  });

  it('creates a client-identified set', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: true, entity: { id: 'ws2', set_order: 1 } }]);
    const create = {
      ...CHANGE,
      clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430c9',
      operation: 'set.create',
      entity: { ...CHANGE.entity, setId: 'ws2' },
      payload: { set_order: 1, weight_unit: 'kg', set_type: 'working' },
    };
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [create] }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).results[0].status).toBe('applied');
  });

  it('finalizes an owned session after earlier queued changes', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: true, entity: { id: 's1', status: 'completed' } }]);
    const finish = {
      clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430ca',
      operation: 'session.patch',
      entity: { sessionId: 's1' },
      payload: { status: 'completed' },
    };
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [finish] }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).results[0].entity.status).toBe('completed');
  });

  it.each([
    ['session.create', { sessionId: 's2' }, { name: null, started_at: '2026-10-17T00:00:00.000Z' }],
    ['session_exercise.create', { sessionId: 's1', sessionExerciseId: 'se2' }, { exercise_id: 'e1', position: 0 }],
    ['session_exercise.delete', { sessionId: 's1', sessionExerciseId: 'se1' }, {}],
    ['set.delete', CHANGE.entity, {}],
  ])('applies %s through the ownership-scoped ledger', async (operation, entity, payload) => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: true, entity: { id: Object.values(entity).at(-1) } }]);
    const queued = { clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430cb', operation, entity, payload };
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [queued] }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).results[0].status).toBe('applied');
  });

  it('updates an exercise rest duration through the idempotent queue', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValueOnce([{ applied: true, entity: { id: 'se1', rest_seconds: 90 } }]);
    const restChange = {
      clientChangeId: '6ba7b810-9dad-41d1-80b4-00c04fd430cc',
      operation: 'session_exercise.patch',
      entity: { sessionId: 's1', sessionExerciseId: 'se1' },
      payload: { rest_seconds: 90 },
    };
    const response = await POST(makeRequest('http://localhost/api/sync', { method: 'POST', body: JSON.stringify({ changes: [restChange] }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).results[0]).toMatchObject({ status: 'applied', entity: { rest_seconds: 90 } });
    expect(mockSql.mock.calls[0].slice(1)).toContain(90);
  });
});
