import { describe, it, expect, beforeAll } from "vitest";

// Run against a throwaway in-memory DB so the test never touches ./aura.db.
process.env.DB_PATH = ":memory:";

type Store = typeof import("../src/db/store.js");
type Db = typeof import("../src/db/db.js");

let store: Store;
let dbmod: Db;

beforeAll(async () => {
  dbmod = await import("../src/db/db.js");
  const { migrate } = await import("../src/db/migrate.js");
  migrate();
  store = await import("../src/db/store.js");
});

function minimalGraph(id: string) {
  return { id, topic: "t", sourcePacketIds: [], nodes: [], edges: [] } as any;
}
function minimalPath() {
  return { graphId: "g", items: [], currentIndex: 0, skippedNodeIds: [], insertedNodeIds: [], reasonByNodeId: {} } as any;
}

describe("saveSessionArtifacts atomicity", () => {
  it("commits all three artifacts on success", () => {
    const sessionId = store.createSession("profile_001", "topic", {} as any, "explore");
    store.saveSessionArtifacts(sessionId, minimalGraph("g_ok"), minimalPath(), { foo: "bar" } as any);
    expect(() => store.loadGraph("g_ok")).not.toThrow();
    expect(store.loadGraph("g_ok").id).toBe("g_ok");
  });

  it("rolls back every write when one fails mid-transaction", () => {
    const sessionId = store.createSession("profile_001", "topic", {} as any, "explore");
    // A BigInt cannot be JSON.stringified, so saveGameState throws AFTER the
    // graph and path have already been written inside the transaction.
    const poisonedGameState = { bad: 10n } as any;

    const before = (dbmod.db.prepare("SELECT COUNT(*) c FROM knowledge_graphs").get() as any).c;
    expect(() => store.saveSessionArtifacts(sessionId, minimalGraph("g_rollback"), minimalPath(), poisonedGameState)).toThrow();
    const after = (dbmod.db.prepare("SELECT COUNT(*) c FROM knowledge_graphs").get() as any).c;

    // The graph insert must have been rolled back — no torn state.
    expect(after).toBe(before);
    expect(() => store.loadGraph("g_rollback")).toThrow();
    // And the session's graph_id pointer must not have been advanced.
    const session = store.loadSession(sessionId) as any;
    expect(session.graph_id == null || session.graph_id !== "g_rollback").toBe(true);
  });
});
