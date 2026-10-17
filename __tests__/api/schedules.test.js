import { jest } from '@jest/globals';
import { mockSql, mockGetDbUser, resetMocks, makeRequest } from '../setup.js';

const USER = { id: 12, clerk_user_id: 'user_12' };
const context = (id = 'schedule-1') => ({ params: Promise.resolve({ id }) });

describe('/api/schedules', () => {
  let GET, POST;
  beforeEach(async () => {
    resetMocks();
    ({ GET, POST } = await import('@/app/api/schedules/route.js'));
  });

  it('requires authentication before reading or writing', async () => {
    mockGetDbUser.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(makeRequest('http://localhost', { method: 'POST', body: '{}' }))).status).toBe(401);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('lists only schedules scoped to the authenticated owner', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ id: 's1', template_name: 'Push', weekday: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).schedules).toHaveLength(1);
    expect(mockSql.mock.calls[0].slice(1)).toEqual([USER.id, USER.id]);
  });

  it('validates input before querying', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    const response = await POST(makeRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ template_id: 't1', weekday: 9, local_time: '18:00' }),
    }));
    expect(response.status).toBe(400);
    expect(mockSql).not.toHaveBeenCalled();
  });

  it('upserts a slot only from an owned active template', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ id: 's1', template_id: 't1', weekday: 2, local_time: '18:30' }]);
    const response = await POST(makeRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ template_id: 't1', weekday: 2, local_time: '18:30' }),
    }));
    expect(response.status).toBe(201);
    const values = mockSql.mock.calls[0].slice(1);
    expect(values).toEqual(expect.arrayContaining([USER.id, 't1', 2, '18:30']));
  });

  it('returns 404 rather than exposing an unavailable template', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const response = await POST(makeRequest('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ template_id: 'foreign', weekday: 2 }),
    }));
    expect(response.status).toBe(404);
  });

  it('returns 500 when the database fails', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockRejectedValue(new Error('database unavailable'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect((await GET()).status).toBe(500);
    errorSpy.mockRestore();
  });
});

describe('DELETE /api/schedules/:id', () => {
  let DELETE;
  beforeEach(async () => {
    resetMocks();
    ({ DELETE } = await import('@/app/api/schedules/[id]/route.js'));
  });

  it('requires authentication', async () => {
    mockGetDbUser.mockResolvedValue(null);
    expect((await DELETE(makeRequest('http://localhost'), context())).status).toBe(401);
  });

  it('returns 404 for another user schedule', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([]);
    const response = await DELETE(makeRequest('http://localhost'), context('foreign'));
    expect(response.status).toBe(404);
    expect(mockSql.mock.calls[0].slice(1)).toEqual(['foreign', USER.id]);
  });

  it('deletes an owned schedule', async () => {
    mockGetDbUser.mockResolvedValue(USER);
    mockSql.mockResolvedValue([{ id: 'schedule-1' }]);
    expect((await DELETE(makeRequest('http://localhost'), context())).status).toBe(200);
  });
});
