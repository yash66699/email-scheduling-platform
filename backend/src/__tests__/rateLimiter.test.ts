import { describe, it, expect, afterEach, afterAll } from 'vitest';
import { RateLimiterService } from '../services/rateLimiterService';
import { EmailService } from '../services/emailService';
describe('RateLimiter & Email Helper Unit Tests', () => {
  it('should calculate correct milliseconds until the next UTC hour', () => {
    const fakeNow = new Date('2026-09-01T10:15:30.000Z');
    const msUntilNextHour = RateLimiterService.getMsUntilNextHour(fakeNow);
    // 44 minutes and 30 seconds = (44 * 60 + 30) * 1000 = 2670000ms
    expect(msUntilNextHour).toBe(2670000);
  });
  it('should validate and normalize recipient email list', () => {
    const rawRecipients = [
      '  user1@domain.com ',
      'USER2@DOMAIN.COM',
      'invalid-email-address',
      'user1@domain.com', // Duplicate
      '',
    ];
    const cleaned = EmailService.normalizeAndValidateRecipients(rawRecipients);
    expect(cleaned).toEqual(['user1@domain.com', 'user2@domain.com']);
  });
});
import { redisClient } from '../config/redis';
describe('Atomic Inter-Email Minimum Delay Throttling', () => {
  const SENDER_ID = 'test-sender-1';
  const SENDER_ID_2 = 'test-sender-2';
  afterEach(async () => {
    // Clean up keys
    await redisClient.del(`sender:next_available_ts:${SENDER_ID}`);
    await redisClient.del(`sender:next_available_ts:${SENDER_ID_2}`);
  });
  afterAll(async () => {
    await redisClient.quit();
  });
  it('1. First reservation is immediately available', async () => {
    const result = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, 2000);
    expect(result.allowedNow).toBe(true);
    expect(result.delayMs).toBe(0);
    // Reserved at should be roughly Date.now()
    expect(Math.abs(result.reservedAt - Date.now())).toBeLessThan(50);
  });
  it('2. Second reservation for same sender requires approx minDelayMs', async () => {
    const minDelayMs = 2000;
    const res1 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    const res2 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    expect(res1.allowedNow).toBe(true);
    expect(res2.allowedNow).toBe(false);
    expect(res2.delayMs).toBeGreaterThan(0);
    // The delay should be very close to minDelayMs (since we just ran res1)
    expect(Math.abs(res2.delayMs - minDelayMs)).toBeLessThan(50);
    // reservedAt for res2 should be exactly res1.reservedAt + minDelayMs
    expect(res2.reservedAt).toBe(res1.reservedAt + minDelayMs);
  });
  it('3. Third reservation for same sender is scheduled after the second reservation', async () => {
    const minDelayMs = 1500;
    const res1 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    const res2 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    const res3 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    expect(res3.allowedNow).toBe(false);
    expect(res3.reservedAt).toBe(res2.reservedAt + minDelayMs);
    expect(res3.reservedAt).toBe(res1.reservedAt + minDelayMs * 2);
  });
  it('4. Reservations for different senders do not interfere', async () => {
    const minDelayMs = 3000;
    const resA = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    const resB = await RateLimiterService.reserveInterEmailSlot(SENDER_ID_2, minDelayMs);
    expect(resA.allowedNow).toBe(true);
    expect(resB.allowedNow).toBe(true); // Should also be allowed now!
    expect(Math.abs(resA.reservedAt - resB.reservedAt)).toBeLessThan(50);
  });
  it('5. minDelayMs = 0 does not delay', async () => {
    const res1 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, 0);
    const res2 = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, 0);
    expect(res1.allowedNow).toBe(true);
    expect(res2.allowedNow).toBe(true);
    expect(res1.delayMs).toBe(0);
    expect(res2.delayMs).toBe(0);
  });
  it('6. Concurrent reservations for same sender cannot receive the same slot', async () => {
    const minDelayMs = 2500;
    const results = await Promise.all([
      RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs),
      RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs),
      RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs)
    ]);
    // Sort by reservedAt
    results.sort((a, b) => a.reservedAt - b.reservedAt);
    // First one should be allowed now (or very close)
    expect(results[0].allowedNow).toBe(true);
    // Check that each slot is separated by exactly minDelayMs
    expect(results[1].reservedAt).toBe(results[0].reservedAt + minDelayMs);
    expect(results[2].reservedAt).toBe(results[1].reservedAt + minDelayMs);
    // Only the first is allowedNow
    expect(results[1].allowedNow).toBe(false);
    expect(results[2].allowedNow).toBe(false);
  });
  it('7. Redis key expiration/TTL is reasonable', async () => {
    const minDelayMs = 5000;
    await RateLimiterService.reserveInterEmailSlot(SENDER_ID, minDelayMs);
    const ttl = await redisClient.ttl(`sender:next_available_ts:${SENDER_ID}`);
    // TTL should be around 5 + 60 = 65 seconds
    expect(ttl).toBeGreaterThan(60);
    expect(ttl).toBeLessThanOrEqual(70);
  });
  it('8. Redis/Lua result is parsed correctly', async () => {
     // tested intrinsically by the property checks in the above tests.
     const res = await RateLimiterService.reserveInterEmailSlot(SENDER_ID, 1000);
     expect(typeof res.allowedNow).toBe('boolean');
     expect(typeof res.delayMs).toBe('number');
     expect(typeof res.reservedAt).toBe('number');
  });
});
