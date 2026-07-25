declare module "pg" {
  import type { EventEmitter } from "node:events";

  export interface QueryResultRow {
    [column: string]: unknown;
  }

  export interface QueryResult<R extends QueryResultRow = QueryResultRow> {
    command: string;
    rowCount: number | null;
    oid: number;
    rows: R[];
    fields: Array<{
      name: string;
      dataTypeID: number;
    }>;
  }

  export class Pool extends EventEmitter {
    constructor(config?: Record<string, unknown>);
    query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
    connect(): Promise<{
      query<R extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<QueryResult<R>>;
      release(): void;
    }>;
    end(): Promise<void>;
  }
}
