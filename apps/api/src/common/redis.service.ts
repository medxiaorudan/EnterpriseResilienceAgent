import { Injectable, OnModuleDestroy } from "@nestjs/common";
import IORedis from "ioredis";

type RedisClient = {
  status: string;
  connect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: string, ttl: number, condition?: string): Promise<string | null>;
  eval(script: string, numKeys: number, ...args: string[]): Promise<unknown>;
  quit(): Promise<string>;
};

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: RedisClient;
  private ready = false;

  constructor() {
    const RedisConstructor = IORedis as unknown as new (...args: unknown[]) => RedisClient;
    this.client = new RedisConstructor(
      process.env.REDIS_URL ?? {
        host: process.env.REDIS_HOST ?? "127.0.0.1",
        port: Number(process.env.REDIS_PORT ?? "6379"),
        password: process.env.REDIS_PASSWORD || undefined,
        db: Number(process.env.REDIS_DB ?? "0")
      },
      {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1
      }
    );
  }

  async getJson<T>(key: string) {
    await this.ensureConnected();
    const value = await this.client.get(key);
    if (!value) {
      return undefined;
    }

    return JSON.parse(value) as T;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    await this.ensureConnected();
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  async acquireLock(key: string, owner: string, ttlMs: number) {
    await this.ensureConnected();
    const result = await this.client.set(key, owner, "PX", ttlMs, "NX");
    return result === "OK";
  }

  async releaseLock(key: string, owner: string) {
    await this.ensureConnected();
    await this.client.eval(
      `
        if redis.call("get", KEYS[1]) == ARGV[1] then
          return redis.call("del", KEYS[1])
        else
          return 0
        end
      `,
      1,
      key,
      owner
    );
  }

  private async ensureConnected() {
    if (this.ready) {
      return;
    }

    if (this.client.status === "wait") {
      await this.client.connect();
    }

    this.ready = true;
  }

  async onModuleDestroy() {
    if (this.client.status !== "end") {
      await this.client.quit();
    }
  }
}
