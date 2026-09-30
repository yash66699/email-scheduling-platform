import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Lua Script for atomic hourly rate limiting per sender
const RATE_LIMIT_LUA_SCRIPT = `
local key = KEYS[1]
local max_limit = tonumber(ARGV[1])
local ttl_seconds = tonumber(ARGV[2])

local current = redis.call("INCR", key)
if tonumber(current) == 1 then
    redis.call("EXPIRE", key, ttl_seconds)
end

if tonumber(current) > max_limit then
    redis.call("DECR", key)
    return 0 -- Limit exceeded
else
    return 1 -- Allowed
end
`;

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxLimit: number;
  msUntilNextHour: number;
}

const INTER_EMAIL_LUA_SCRIPT = `
local key = KEYS[1]
local minDelayMs = tonumber(ARGV[1])
local now = tonumber(ARGV[2])

local storedNextAvailableAt = redis.call("GET", key)
if not storedNextAvailableAt then
    storedNextAvailableAt = 0
else
    storedNextAvailableAt = tonumber(storedNextAvailableAt)
end

local reservedAt = 0
local delayMs = 0

if storedNextAvailableAt <= now then
    reservedAt = now
    delayMs = 0
else
    reservedAt = storedNextAvailableAt
    delayMs = storedNextAvailableAt - now
end

local nextAvailableAt = reservedAt + minDelayMs
local ttl_seconds = math.ceil((nextAvailableAt - now) / 1000) + 60

redis.call("SET", key, tostring(nextAvailableAt), "EX", ttl_seconds)

return { delayMs, reservedAt }
`;

export interface InterEmailReservationResult {
  allowedNow: boolean;
  delayMs: number;
  reservedAt: number;
}

export class RateLimiterService {
  /**
   * Generates a key for the current hourly window.
   * Format: YYYYMMDDHH
   */
  private static getHourlyWindowKey(senderId: string, date: Date = new Date()): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hour = String(date.getUTCHours()).padStart(2, '0');
    return `rate_limit:sender:${senderId}:${year}${month}${day}${hour}`;
  }

  /**
   * Calculates milliseconds remaining until the start of the next UTC hour.
   */
  public static getMsUntilNextHour(now: Date = new Date()): number {
    const nextHour = new Date(now);
    nextHour.setUTCHours(now.getUTCHours() + 1, 0, 0, 0);
    return Math.max(1000, nextHour.getTime() - now.getTime());
  }

  /**
   * Checks if a sender has capacity in the current hourly window using an atomic Redis Lua script.
   */
  public static async checkAndIncrementRateLimit(
    senderId: string,
    maxHourlyLimit: number
  ): Promise<RateLimitCheckResult> {
    const key = this.getHourlyWindowKey(senderId);
    const ttlSeconds = 3600; // 1 hour TTL
    const msUntilNextHour = this.getMsUntilNextHour();

    try {
      const allowedResult = (await redisClient.eval(
        RATE_LIMIT_LUA_SCRIPT,
        1,
        key,
        maxHourlyLimit,
        ttlSeconds
      )) as number;

      const allowed = allowedResult === 1;
      const countRaw = await redisClient.get(key);
      const currentCount = countRaw ? parseInt(countRaw, 10) : 0;

      logger.debug(
        `Rate limit check for sender ${senderId}: count=${currentCount}/${maxHourlyLimit}, allowed=${allowed}`
      );

      return {
        allowed,
        currentCount,
        maxLimit: maxHourlyLimit,
        msUntilNextHour,
      };
    } catch (error) {
      logger.error(`Error in RateLimiterService for sender ${senderId}:`, error);
      // Fail safe: allow send if Redis error occurs to avoid silent drop, but log error
      return {
        allowed: true,
        currentCount: 0,
        maxLimit: maxHourlyLimit,
        msUntilNextHour,
      };
    }
  }

  /**
   * Atomically reserves a slot for sending the next email for a sender.
   */
  public static async reserveInterEmailSlot(
    senderId: string,
    minDelayMs: number
  ): Promise<InterEmailReservationResult> {
    if (minDelayMs <= 0) {
      return { allowedNow: true, delayMs: 0, reservedAt: Date.now() };
    }

    const key = `sender:next_available_ts:${senderId}`;
    const now = Date.now();

    try {
      const result = (await redisClient.eval(
        INTER_EMAIL_LUA_SCRIPT,
        1,
        key,
        minDelayMs,
        now
      )) as [number, number];

      const delayMs = result[0];
      const reservedAt = result[1];
      const allowedNow = delayMs === 0;

      if (!allowedNow) {
        logger.debug(`Inter-email throttling for sender ${senderId}: slot reserved at ${reservedAt} (delay ${delayMs}ms)`);
      }

      return { allowedNow, delayMs, reservedAt };
    } catch (error) {
      logger.warn(`Inter-email delay enforcement warning for sender ${senderId}:`, error);
      // Fallback: allow immediately on Redis failure
      return { allowedNow: true, delayMs: 0, reservedAt: now };
    }
  }

  /**
   * Helper to check if Slack has already been notified for this sender in this hour window.
   */
  public static async shouldNotifySlack(senderId: string): Promise<boolean> {
    const windowKey = this.getHourlyWindowKey(senderId);
    const notificationKey = `slack_notified:${windowKey}`;

    try {
      // SETNX (set if not exists) with 1 hour TTL
      const setSuccess = await redisClient.set(notificationKey, '1', 'EX', 3600, 'NX');
      return setSuccess === 'OK';
    } catch (error) {
      logger.error('Error checking Slack notification deduplication:', error);
      return false;
    }
  }
}
