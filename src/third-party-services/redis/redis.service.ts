import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.redis.setex(key, ttl, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
      throw error;
    }
  }

  async getClient(): Promise<Redis> {
    return this.redis;
  }
}
