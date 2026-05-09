import { useEffect, useMemo, useState } from "react";
import { Brain, ChevronLeft, ChevronRight, Eye, Gauge, HelpCircle, Layers3, Map, Moon, RotateCcw, Volume2, X } from "lucide-react";
import { api } from "./api/client";
import type { CacheOption, DevLogEntry, LessonCard, LessonResponse, StudentIntent } from "./api/types";
import { LessonCardRenderer } from "./components/cards/LessonCardRenderer";
import { AuraMap } from "./components/map/AuraMap";
import { TopicIntentScreen } from "./components/setup/TopicIntentScreen";

export function App() {
  const [topic, setTopic] = useState("trigonometry");
  const [intent, setIntent] = useState<StudentIntent>({ goalType: "exam", timeHorizon: "single_session", depthPreference: "working_knowledge" });
  const [learnerMode, setLearnerMode] = useState("Both");
  const [lesson, setLesson] = useState<LessonResponse | null>(null);
  const [cards, setCards] = useState<LessonCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [llmState, setLlmState] = useState("checking");
  const [toast, setToast] = useState<string | null>(null);
  const [cacheOptions, setCacheOptions] = useState<CacheOption[]>([]);
  const [selectedCacheId, setSelectedCacheId] = useState("");
  const [logs, setLogs] = useState<DevLogEntry[]>([]);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapPanel, setMapPanel] = useState<"map" | "plan">("map");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [loadingNodeId, setLoadingNodeId] = useState("");
  const [devOpen, setDevOpen] = useState(false);
  const [cardCursorByNode, setCardCursorByNode] = useState<Record<string, number>>({});

  useEffect(() => {
    document.documentElement.setAttribute("data-palette", "aurora");
    document.documentElement.setAttribute("data-font", learnerMode === "Dyslexia" || learnerMode === "Both" ? "lexend" : "sans");
    api.health().then((health) => setLlmState(health.llm.ready ? `local ${health.llm.expectedModel}` : health.llm.state)).catch(() => setLlmState("backend offline"));
  }, [learnerMode]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      api.caches(topic).then((result) => setCacheOptions(result.caches)).catch(() => setCacheOptions([]));
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [topic]);

  useEffect(() => {
    const load = () => api.logs().then((result) => setLogs(result.logs)).catch(() => setLogs([]));
    load();
    const interval = window.setInterval(load, 1800);
    return () => window.clearInterval(interval);
  }, []);

  const activeMission = useMemo(() => {
    if (!lesson) return null;
    const active = selectedNodeId || lesson.mapState.activeNodeId;
    return lesson.missionMetadata[active];
  }, [lesson, selectedNodeId]);

  const pathNodeIds = useMemo(() => lesson?.lessonPath.items.map((item) => item.nodeId) ?? [], [lesson]);
  const selectedNodeIndex = Math.max(0, pathNodeIds.indexOf(selectedNodeId));
  const selectedNode = lesson?.graph.nodes.find((node) => node.id === selectedNodeId) ?? lesson?.graph.nodes.find((node) => node.id === lesson.mapState.activeNodeId);
  const visibleCards = selectedNode ? cards.filter((card) => card.nodeId === selectedNode.id) : cards;
  const currentCardIndex = selectedNode ? Math.min(cardCursorByNode[selectedNode.id] ?? 0, Math.max(visibleCards.length - 1, 0)) : 0;
  const currentCard = visibleCards[currentCardIndex];
  const completedNodes = useMemo(() => new Set(lesson?.gameState.recentEvents.filter((event) => event.type === "MISSION_COMPLETED").map((event) => event.nodeId) ?? []), [lesson]);

  function streamCards(nextCards: LessonCard[], replaceNodeId?: string) {
    if (replaceNodeId) {
      setCards((current) => current.filter((card) => card.nodeId !== replaceNodeId));
      setCardCursorByNode((current) => ({ ...current, [replaceNodeId]: 0 }));
    }
    nextCards.forEach((card, index) => {
      window.setTimeout(() => {
        setCards((current) => current.some((existing) => existing.id === card.id) ? current : [...current, card]);
      }, index * 420);
    });
  }

  function advanceCard() {
    if (!selectedNode || !visibleCards.length) return;
    setCardCursorByNode((current) => ({
      ...current,
      [selectedNode.id]: Math.min((current[selectedNode.id] ?? 0) + 1, visibleCards.length - 1)
    }));
  }

  useEffect(() => {
    if (!lesson || !selectedNodeId || cards.some((card) => card.nodeId === selectedNodeId) || loadingNodeId === selectedNodeId) return;
    let cancelled = false;
    setLoadingNodeId(selectedNodeId);
    setToast(`Gemma is writing this node: ${selectedNode?.topicName ?? selectedNodeId}`);
    api.generateNodeCards(lesson.sessionId, selectedNodeId)
      .then((result) => {
        if (cancelled) return;
        streamCards(result.cards, selectedNodeId);
        setToast(`Node ready: ${selectedNode?.topicName ?? selectedNodeId}`);
      })
      .catch((error) => {
        if (cancelled) return;
        setToast(error instanceof Error ? error.message : "Gemma stopped while writing this node.");
      })
      .finally(() => {
        if (!cancelled) setLoadingNodeId("");
      });
    return () => {
      cancelled = true;
    };
  }, [lesson, selectedNodeId, cards, loadingNodeId, selectedNode?.topicName]);

  async function start() {
    setBusy(true);
    for (const step of ["Finding sources", "Finding concepts", "Tracing prerequisites", "Choosing your first path"]) {
      setLoadingStep(step);
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    try {
      const selected = cacheOptions.find((cache) => cache.id === selectedCacheId);
      const effectiveTopic = selected?.topic || topic;
      const next = await api.generateLesson(effectiveTopic, intent, selectedCacheId);
      setLesson({ ...next, cards: [] });
      setCards([]);
      const firstNodeId = next.mapState.activeNodeId || next.lessonPath.items[0]?.nodeId || next.graph.nodes[0]?.id || "";
      setCardCursorByNode(firstNodeId ? { [firstNodeId]: 0 } : {});
      setSelectedNodeId(firstNodeId);
      streamCards(next.cards);
      setToast(next.openingMessage);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "Lesson generation stopped unexpectedly.");
    } finally {
      setBusy(false);
      setLoadingStep("");
    }
  }

  async function answer(value: string) {
    if (!lesson) return;
    setBusy(true);
    try {
      const next = await api.respond(lesson.sessionId, value);
      setLesson({ ...lesson, mapState: next.mapState, cards: next.cards ?? lesson.cards, gameState: { ...lesson.gameState, recentEvents: next.gameEvents ?? [] } });
      setSelectedNodeId(next.mapState.activeNodeId);
      setCardCursorByNode((current) => ({ ...current, [next.mapState.activeNodeId]: 0 }));
      if (next.cards?.length) streamCards(next.cards, next.mapState.activeNodeId);
      setToast(next.assistantMessage);
    } finally {
      setBusy(false);
    }
  }

  if (!lesson) {
    return (
      <div className="aura app-shell" data-bg="cream" data-font={learnerMode === "Dyslexia" ? "opendyslexic" : "lexend"}>
        <TopicIntentScreen topic={topic} setTopic={setTopic} intent={intent} setIntent={setIntent} learnerMode={learnerMode} setLearnerMode={setLearnerMode} cacheOptions={cacheOptions} selectedCacheId={selectedCacheId} setSelectedCacheId={setSelectedCacheId} onStart={start} busy={busy} />
        {busy && <BuildProgress step={loadingStep || "Building lesson"} logs={logs} />}
        <DevButton open={devOpen} setOpen={setDevOpen} logs={logs} />
      </div>
    );
  }

  return (
    <div className="aura cockpit" data-bg="cream" data-font={learnerMode === "Dyslexia" ? "opendyslexic" : "lexend"}>
      <header className="topbar">
        <div className="brand"><span className="brand-orbit small" /> aura</div>
        <div className="topbar-meta"><span>Learning</span><strong>{topic}</strong></div>
        <div className="topbar-meta"><span>Goal</span><strong>{intent.depthPreference.replaceAll("_", " ")}</strong></div>
        <button className="ghost-button" onClick={() => setLesson(null)}><RotateCcw size={16} /> New map</button>
      </header>
      <main className="stage">
        <div className="stage-ambient" />
        <section className="mission-strip">
          <div>
            <div className="card-kicker">Current node</div>
            <h1>{selectedNode?.topicName ?? activeMission?.missionTitle ?? "First block"}</h1>
          </div>
          <p>{selectedNode?.teachingGoal ?? activeMission?.objective ?? "Start with the warmest block on the map."}</p>
        </section>
        <div className="learning-shell">
          <section className="content-column">
            <div className="node-progress">
              <button disabled={selectedNodeIndex <= 0} title="Previous node" onClick={() => setSelectedNodeId(pathNodeIds[selectedNodeIndex - 1])}><ChevronLeft size={18} /></button>
              <div>
                <span>Node {selectedNodeIndex + 1} of {pathNodeIds.length}</span>
                <strong>{selectedNode?.status ?? "active"}</strong>
              </div>
              <button disabled={selectedNodeIndex >= pathNodeIds.length - 1} title="Next node" onClick={() => setSelectedNodeId(pathNodeIds[selectedNodeIndex + 1])}><ChevronRight size={18} /></button>
            </div>
            {currentCard ? (
              <div className="node-card-stack single-card-stack">
                <LessonCardRenderer key={currentCard.id} card={currentCard} onAnswer={answer} busy={busy} cardIndex={currentCardIndex} cardCount={visibleCards.length} onContinue={advanceCard} />
              </div>
            ) : loadingNodeId === selectedNode?.id ? (
              <div className="lesson-card node-loading-card">
                <div className="card-kicker">Gemma is writing</div>
                <h2>{selectedNode?.topicName ?? "Node lecture"}</h2>
                <p>The map is ready. This node's lecture cards are being generated locally now.</p>
                <div className="mini-log-list">
                  {logs.slice(0, 4).map((log, index) => <span key={`${log.at}-${index}`}>{log.scope}: {log.message}</span>)}
                </div>
              </div>
            ) : (
              <div className="lesson-card"><h2>{selectedNode?.topicName ?? "Node ready"}</h2><p>This node is in the graph. Its source-backed card is still being prepared.</p></div>
            )}
            <div className="event-stack">
              {lesson.gameState.recentEvents?.slice(0, 3).map((event, index) => <div key={index} className="event-pill">{event.type.replaceAll("_", " ").toLowerCase()}</div>)}
            </div>
          </section>
        </div>
      </main>
      <aside className="powerbar">
        <button title="Map" onClick={() => setMapOpen(true)}><Map /></button>
        <button title="Hint"><HelpCircle /></button>
        <button title="Example"><Brain /></button>
        <button title="Visualize"><Eye /></button>
        <button title="Slow down"><Gauge /></button>
        <button title="Read aloud"><Volume2 /></button>
        <button title="Zoned out"><Moon /></button>
      </aside>
      {mapOpen && (
        <aside className="map-drawer" aria-label="Hidden learning map">
          <div className="map-drawer-head">
            <div>
              <span>Knowledge and plan</span>
              <strong>{lesson.graph.nodes.length} graph nodes · {lesson.lessonPath.items.length} plan steps</strong>
            </div>
            <div className="map-tabs" role="tablist" aria-label="Map views">
              <button className={mapPanel === "map" ? "selected" : ""} onClick={() => setMapPanel("map")}>Knowledge Map</button>
              <button className={mapPanel === "plan" ? "selected" : ""} onClick={() => setMapPanel("plan")}>Lesson Plan</button>
            </div>
            <button title="Close map" onClick={() => setMapOpen(false)}><X size={18} /></button>
          </div>
          {mapPanel === "map" ? (
            <div className="map-menu-grid">
              <section className="map-panel-block">
                <div className="panel-label">Graph structure</div>
                <AuraMap nodes={lesson.mapState.nodes} edges={lesson.mapState.edges} />
              </section>
              <GraphNodeList lesson={lesson} selectedNodeId={selectedNodeId} completedNodes={completedNodes} onSelect={(nodeId) => { setSelectedNodeId(nodeId); setMapOpen(false); }} />
            </div>
          ) : (
            <LessonPlanPanel lesson={lesson} selectedNodeId={selectedNodeId} completedNodes={completedNodes} onSelect={(nodeId) => { setSelectedNodeId(nodeId); setMapOpen(false); }} />
          )}
        </aside>
      )}
      <DevButton open={devOpen} setOpen={setDevOpen} logs={logs} />
      {toast && <button className="toast" onClick={() => setToast(null)}>{toast}</button>}
    </div>
  );
}

function DevButton({ open, setOpen, logs }: { open: boolean; setOpen: (open: boolean) => void; logs: DevLogEntry[] }) {
  return (
    <>
      <button className="dev-dot" title="Developer logs" onClick={() => setOpen(!open)}>D</button>
      {open ? <DevLogBox logs={logs} floating /> : null}
    </>
  );
}

function GraphNodeList({ lesson, selectedNodeId, completedNodes, onSelect }: { lesson: LessonResponse; selectedNodeId: string; completedNodes: Set<string | undefined>; onSelect: (nodeId: string) => void }) {
  return (
    <section className="graph-list-panel">
      <div className="panel-label">All graph nodes</div>
      <div className="graph-node-list">
        {lesson.graph.nodes.map((node, index) => {
          const mapNode = lesson.mapState.nodes.find((candidate) => candidate.id === node.id);
          const active = node.id === selectedNodeId;
          const inPlanIndex = lesson.lessonPath.items.findIndex((item) => item.nodeId === node.id);
          return (
            <button key={node.id} className={active ? "graph-node-item active" : "graph-node-item"} onClick={() => onSelect(node.id)}>
              <span>{index + 1}</span>
              <div>
                <strong>{node.topicName}</strong>
                <small>{mapNode?.state ?? node.status}{inPlanIndex >= 0 ? ` · plan ${inPlanIndex + 1}` : " · not in plan"}</small>
              </div>
              {completedNodes.has(node.id) ? <b>done</b> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LessonPlanPanel({ lesson, selectedNodeId, completedNodes, onSelect }: { lesson: LessonResponse; selectedNodeId: string; completedNodes: Set<string | undefined>; onSelect: (nodeId: string) => void }) {
  return (
    <section className="plan-panel">
      <div className="panel-label">Linearized teaching order</div>
      <div className="plan-rail">
        {lesson.lessonPath.items.map((item, index) => {
          const node = lesson.graph.nodes.find((candidate) => candidate.id === item.nodeId);
          const active = item.nodeId === selectedNodeId;
          const current = index === lesson.lessonPath.currentIndex;
          return (
            <button key={`${item.nodeId}-${index}`} className={active ? "plan-step active" : "plan-step"} onClick={() => onSelect(item.nodeId)}>
              <span className={current ? "current" : ""}>{index + 1}</span>
              <div>
                <strong>{node?.topicName ?? item.nodeId}</strong>
                <p>{item.reason || lesson.lessonPath.reasonByNodeId[item.nodeId] || node?.teachingGoal}</p>
                <small>{item.deliveryMode.replaceAll("_", " ")}{item.required ? " · required" : " · optional"}</small>
              </div>
              {completedNodes.has(item.nodeId) ? <b>done</b> : current ? <b>current</b> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function BuildProgress({ step, logs }: { step: string; logs: DevLogEntry[] }) {
  const latestLogs = logs.slice(0, 4);
  return (
    <section className="build-progress">
      <div className="build-spinner"><Layers3 size={20} /></div>
      <div>
        <span>Building lesson</span>
        <strong>{step}</strong>
      </div>
      <div className="build-log-lines">
        {latestLogs.length ? latestLogs.map((log, index) => (
          <p key={`${log.at}-${index}`}>{log.scope}: {log.message}</p>
        )) : <p>Starting local pipeline...</p>}
      </div>
    </section>
  );
}

function DevLogBox({ logs, floating = false }: { logs: DevLogEntry[]; floating?: boolean }) {
  return (
    <section className={floating ? "dev-box dev-box-floating" : "dev-box"}>
      <div className="dev-head">
        <span>Backend dev logs</span>
        <strong>{logs.length}</strong>
      </div>
      <div className="dev-log-list">
        {logs.length ? logs.slice(0, 12).map((log, index) => (
          <div key={`${log.at}-${index}`} className={`dev-log dev-${log.level}`}>
            <span>{new Date(log.at).toLocaleTimeString()}</span>
            <b>{log.scope}</b>
            <p>{log.message}</p>
            {log.data ? <code>{JSON.stringify(log.data)}</code> : null}
          </div>
        )) : <div className="dev-empty">No backend logs yet.</div>}
      </div>
    </section>
  );
}
