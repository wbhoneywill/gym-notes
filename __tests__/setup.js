import { jest } from '@jest/globals';

/**
 * Shared Jest ESM mocks and helpers.
 *
 * These mocks are registered with jest.unstable_mockModule BEFORE any route
 * module is imported. Route handlers under test must therefore be imported
 * dynamically (await import(...)) inside a beforeEach, after resetMocks().
 */

export const mockSql = jest.fn();
export const mockGetDbUser = jest.fn();
export const mockAuth = jest.fn();
export const mockCurrentUser = jest.fn();
export const mockVerifyWebhook = jest.fn();
export const mockDeleteUser = jest.fn();
export const mockClerkClient = jest.fn(async () => ({
  users: { deleteUser: mockDeleteUser },
}));

jest.unstable_mockModule('@/app/lib/db', () => ({
  sql: mockSql,
}));

jest.unstable_mockModule('@/app/lib/auth', () => ({
  getDbUser: mockGetDbUser,
}));

jest.unstable_mockModule('@clerk/nextjs/server', () => ({
  auth: mockAuth,
  currentUser: mockCurrentUser,
  clerkClient: mockClerkClient,
}));

jest.unstable_mockModule('@clerk/nextjs/webhooks', () => ({
  verifyWebhook: mockVerifyWebhook,
}));

/** Reset all shared mocks to a clean state between tests. */
export function resetMocks() {
  mockSql.mockReset();
  delete mockSql.transaction;
  mockGetDbUser.mockReset();
  mockAuth.mockReset();
  mockCurrentUser.mockReset();
  mockVerifyWebhook.mockReset();
  mockDeleteUser.mockReset();
  mockClerkClient.mockClear();
}

/** Build a Request with a JSON content-type header. */
export function makeRequest(url, opts = {}) {
  const headers = new Headers(opts.headers);
  headers.set('content-type', 'application/json');
  return new Request(url, { ...opts, headers });
}
