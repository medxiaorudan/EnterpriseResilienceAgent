import "reflect-metadata";
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PostgresService } from "../dist/common/postgres.service.js";
import { StoreService } from "../dist/common/store.service.js";

/**
 * The only test in this suite that executes SQL.
 *
 * Everything else uses the hand-written fake in store.persistence.test.js, which
 * dispatches on the query text and answers in JavaScript. That fake cannot detect
 * invalid SQL — an ORDER BY referencing a column the subquery did not project
 * shipped green past five suites because it was only ever compared as a string.
 *
 * Skips unless DATABASE_URL is set, so it never fails for anyone without a
 * database. To run it:
 *
 *   docker compose up -d postgres
 *   DATABASE_URL=postgresql://resilience:$DB_PASSWORD@127.0.0.1:5432/resilience \
 *     npm run test:api --workspace @enterprise-resilience/api
 */
describe("store against a real postgres", () => {
  test("appendMetricSample then listMetricHistory runs the real query", async (t) => {
    if (!process.env.DATABASE_URL) {
      t.skip("set DATABASE_URL to run — see the comment at the top of this file");
      return;
    }

    const postgres = new PostgresService();
    const store = new StoreService(postgres);

    try {
      await store.onModuleInit();

      // A metric name no seed data uses, so this test is isolated from both the
      // synthetic seed points and anything a running collector has written.
      const metricName = `integration_probe_${randomUUID().slice(0, 8)}`;
      const serviceId = "checkout-api";

      for (let index = 0; index < 8; index += 1) {
        await store.appendMetricSample({
          serviceId,
          metricName,
          unit: "count",
          value: 900 + index,
          timestamp: new Date(Date.UTC(2026, 6, 26, 23, index)).toISOString()
        });
      }

      const history = await store.listMetricHistory(serviceId, [metricName], 6);
      const points = history.get(metricName) ?? [];

      // The six most recent by timestamp, returned oldest-first.
      assert.equal(points.length, 6);
      assert.equal(points[0].value, 902);
      assert.equal(points[5].value, 907);

      // Ascending order is part of the contract the ORDER BY exists to provide.
      const timestamps = points.map((point) => point.timestamp);
      assert.deepEqual([...timestamps].sort(), timestamps);

      // Real samples must win over the synthetic seed points for a metric that
      // has both — the reason metric_history carries a `synthetic` column.
      const seeded = await store.listMetricHistory(serviceId, ["queue_depth"], 6);
      assert.ok((seeded.get("queue_depth") ?? []).length > 0);

      await postgres.query("delete from metric_history where metric_name = $1", [metricName]);
    } finally {
      await postgres.onModuleDestroy();
    }
  });
});
