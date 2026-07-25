import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

@Injectable()
export class PostgresService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      host: process.env.DB_HOST ?? "127.0.0.1",
      port: Number(process.env.DB_PORT ?? "5432"),
      user: process.env.DB_USER ?? "postgres",
      password: process.env.DB_PASSWORD ?? "postgres",
      database: process.env.DB_NAME ?? "enterprise_resilience_agent",
      ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
    });
  }

  query<TRow extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
    return this.pool.query<TRow>(text, values);
  }

  async transaction<T>(work: (query: <TRow extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) => Promise<QueryResult<TRow>>) => Promise<T>) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work((text, values) => client.query(text, values));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
