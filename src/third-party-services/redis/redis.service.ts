import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);
  private dataRedis: Redis;

  constructor(@InjectRedis() private readonly redis: Redis) {
    // Crear cliente separado para operaciones de datos
    this.dataRedis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.dataRedis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}:`, error);
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      if (ttl) {
        await this.dataRedis.setex(key, ttl, value);
      } else {
        await this.dataRedis.set(key, value);
      }
    } catch (error) {
      this.logger.error(`Error setting key ${key}:`, error);
      throw error;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.dataRedis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}:`, error);
      throw error;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.dataRedis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking existence of key ${key}:`, error);
      throw error;
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.dataRedis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error setting expiration for key ${key}:`, error);
      throw error;
    }
  }

  async getClient(): Promise<Redis> {
    return this.redis;
  }

  async subscribe(
    topic: string,
    callback: (message: string) => void,
  ): Promise<void> {
    try {
      this.logger.log(`Subscribing to topic: ${topic}`);
      await this.redis.subscribe(topic);

      this.redis.on('message', (channel, message) => {
        if (channel === topic) {
          callback(message);
        }
      });
    } catch (error) {
      this.logger.error(`Error subscribing to topic ${topic}:`, error);
      throw error;
    }
  }

  async publish(topic: string, message: string): Promise<number> {
    try {
      return await this.redis.publish(topic, message);
    } catch (error) {
      this.logger.error(`Error publishing to topic ${topic}:`, error);
      throw error;
    }
  }

  async unsubscribe(topic: string): Promise<void> {
    try {
      await this.redis.unsubscribe(topic);
    } catch (error) {
      this.logger.error(`Error unsubscribing from topic ${topic}:`, error);
      throw error;
    }
  }
}
