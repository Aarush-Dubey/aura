import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  ChevronLeft,
  ChevronRight,
  Eye,
  Gauge,
  HelpCircle,
  Layers3,
  Map,
  Moon,
  RotateCcw,
  Settings2,
  Terminal,
  Volume2,
  X
} from "lucide-react";
import { api } from "./api/client";
import type { CacheOption, DevLogEntry, LessonCard, LessonResponse, MapNode, StudentIntent } from "./api/types";
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
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [loadingNodeId, setLoadingNodeId] = useState("");
  const [devOpen, setDevOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cardCursorByNode, setCardCursorByNode] = useState<Record<string, number>>({});
  const [focusMode, setFocusMode] = useState(true);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.setAttribute("data-reading", learnerMode === "Dyslexia" || learnerMode === "Both" ? "dyslexia" : "default");
    document.documentElement.setAttribute("data-focus", focusMode ? "on" : "off");
    api.health().then((health) => setLlmState(health.llm.ready ? `local ${health.llm.expectedModel}` : health.llm.state)).catch(() => setLlmState("backend offline"));
  }, [learnerMode, focusMode]);

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

  const pathNodeIds = useMemo(() => lesson?.lessonPath.items.map((item) => item.nodeId) ?? [], [lesson]);
  const selectedNode = lesson?.graph.nodes.find((node) => node.id === selectedNodeId) ?? lesson?.graph.nodes.find((node) => node.id === lesson.mapState.activeNodeId);
  const selectedMapNode = lesson?.mapState.nodes.find((node) => node.id === selectedNode?.id);
  const selectedNodeIndex = Math.max(0, pathNodeIds.indexOf(selectedNode?.id ?? selectedNodeId));
  const visibleCards = selectedNode ? cards.filter((card) => card.nodeId === selectedNode.id) : cards;
  const currentCardIndex = selectedNode ? Math.min(cardCursorByNode[selectedNode.id] ?? 0, Math.max(visibleCards.length - 1, 0)) : 0;
  const currentCard = visibleCards[currentCardIndex];
  const masteredCount = lesson?.graph.nodes.filter((node) => node.mastery >= 0.85).length ?? 0;
  const progressPct = lesson ? Math.round(((selectedNodeIndex + 1) / Math.max(lesson.lessonPath.items.length, 1)) * 100) : 0;

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
    setToast(`Gemma is writing ${selectedNode?.topicName ?? "this node"}.`);
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
    for (const step of ["Planning map", "Choosing nodes", "Tracing prerequisites", "Writing first card"]) {
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
      <div className="aura" data-font={learnerMode === "Dyslexia" ? "opendyslexic" : "lexend"}>
        <TopicIntentScreen topic={topic} setTopic={setTopic} intent={intent} setIntent={setIntent} learnerMode={learnerMode} setLearnerMode={setLearnerMode} cacheOptions={cacheOptions} selectedCacheId={selectedCacheId} setSelectedCacheId={setSelectedCacheId} onStart={start} busy={busy} />
        {busy && <BuildProgress step={loadingStep || "Building lesson"} logs={logs} />}
        <DebugControl open={devOpen} setOpen={setDevOpen} logs={logs} />
      </div>
    );
  }

  return (
    <div className="window-stage aura-standalone-shell">
      <div className="aura-window">
        <main className="aura-workspace">
          <aside className="aura-rail left-rail">
            <div className="app-mark-row">
              <AuraMark />
              <span>aura</span>
            </div>
            <RailHeader label="Knowledge map" value={`${lesson.graph.nodes.length} nodes`} />
            <DynamicConstellation
              mapNodes={lesson.mapState.nodes}
              activeNodeId={selectedNode?.id ?? ""}
              onSelect={setSelectedNodeId}
            />
            <div className="rail-node-list scroll">
              {lesson.graph.nodes.map((node, index) => {
                const mapNode = lesson.mapState.nodes.find((candidate) => candidate.id === node.id);
                const active = node.id === selectedNode?.id;
                return (
                  <button key={node.id} className={active ? "rail-node active" : "rail-node"} onClick={() => setSelectedNodeId(node.id)}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{node.topicName}</strong>
                      <small>{nodeStatusLabel(mapNode)} · {node.keyTerms.slice(0, 2).join(", ")}</small>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="lesson-main">
            <div className="lesson-tools">
              <span>{llmState}</span>
              <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}><Settings2 size={15} /></button>
              <button className="icon-btn" title="Debug" onClick={() => setDevOpen(!devOpen)}><Terminal size={14} /></button>
            </div>
            <div className="lesson-hero">
              <div>
                <span className="eyebrow">Current node</span>
                <h1>{selectedNode?.topicName ?? "Lesson node"}</h1>
                <p>{selectedNode?.teachingGoal ?? "Aura is preparing the next useful step."}</p>
              </div>
              <div className="mastery-card">
                <span>{progressPct}%</span>
                <small>path progress</small>
              </div>
            </div>

            <div className="path-strip" aria-label="Linear lesson path">
              <button disabled={selectedNodeIndex <= 0} title="Previous node" onClick={() => setSelectedNodeId(pathNodeIds[selectedNodeIndex - 1])}><ChevronLeft size={17} /></button>
              <div className="path-dots">
                {lesson.lessonPath.items.map((item, index) => {
                  const node = lesson.graph.nodes.find((candidate) => candidate.id === item.nodeId);
                  return (
                    <button
                      key={`${item.nodeId}-${index}`}
                      className={item.nodeId === selectedNode?.id ? "path-dot active" : index < selectedNodeIndex ? "path-dot done" : "path-dot"}
                      onClick={() => setSelectedNodeId(item.nodeId)}
                      title={node?.topicName ?? item.nodeId}
                    >
                      <span>{index + 1}</span>
                    </button>
                  );
                })}
              </div>
              <button disabled={selectedNodeIndex >= pathNodeIds.length - 1} title="Next node" onClick={() => setSelectedNodeId(pathNodeIds[selectedNodeIndex + 1])}><ChevronRight size={17} /></button>
            </div>

            <div className="card-stage">
              {currentCard ? (
                <LessonCardRenderer key={currentCard.id} card={currentCard} onAnswer={answer} busy={busy} cardIndex={currentCardIndex} cardCount={visibleCards.length} onContinue={advanceCard} />
              ) : loadingNodeId === selectedNode?.id ? (
                <div className="lesson-card node-loading-card">
                  <div className="card-topline"><div className="card-kicker">Gemma is writing</div><span>local</span></div>
                  <h2>{selectedNode?.topicName ?? "Node lecture"}</h2>
                  <p>The map is ready. This node's lecture cards are being generated locally now.</p>
                  <div className="mini-log-list">
                    {logs.slice(0, 4).map((log, index) => <span key={`${log.at}-${index}`}>{log.scope}: {log.message}</span>)}
                  </div>
                </div>
              ) : (
                <div className="lesson-card">
                  <div className="card-topline"><div className="card-kicker">Node ready</div><span>{selectedMapNode?.state ?? "active"}</span></div>
                  <h2>{selectedNode?.topicName ?? "Waiting for node"}</h2>
                  <p>Aura has this node in the graph. Select it again if the lecture does not start.</p>
                </div>
              )}
            </div>
          </section>

          <aside className="aura-rail right-rail">
            <RailHeader label="Companion" value={selectedMapNode?.state ?? "ready"} />
            <div className="companion-card">
              <span className="eyebrow">Node role</span>
              <strong>{selectedMapNode?.type ?? "core"}</strong>
              <p>{lesson.lessonPath.items[selectedNodeIndex]?.reason || selectedNode?.teachingGoal}</p>
            </div>
            <div className="quick-grid">
              <button title="Hint"><HelpCircle size={18} /><span>Hint</span></button>
              <button title="Example"><Brain size={18} /><span>Example</span></button>
              <button title="Visualize"><Eye size={18} /><span>Visual</span></button>
              <button title="Slow down"><Gauge size={18} /><span>Slow</span></button>
              <button title="Read aloud"><Volume2 size={18} /><span>Read</span></button>
              <button title="Focus" onClick={() => setFocusMode(!focusMode)}><Moon size={18} /><span>Focus</span></button>
            </div>
            <div className="companion-card">
              <span className="eyebrow">Mastery</span>
              <strong>{masteredCount}/{lesson.graph.nodes.length} nodes</strong>
              <div className="mastery-bar"><i style={{ width: `${Math.round((masteredCount / Math.max(lesson.graph.nodes.length, 1)) * 100)}%` }} /></div>
            </div>
            <button className="btn primary full" onClick={() => setMapOpen(true)}><Map size={16} /> Open full map</button>
            <button className="btn ghost full" onClick={() => setLesson(null)}><RotateCcw size={16} /> New topic</button>
          </aside>
        </main>

        {settingsOpen && <SettingsOverlay learnerMode={learnerMode} setLearnerMode={setLearnerMode} focusMode={focusMode} setFocusMode={setFocusMode} onClose={() => setSettingsOpen(false)} />}
        {mapOpen && <MapOverlay lesson={lesson} selectedNodeId={selectedNode?.id ?? ""} onSelect={(nodeId) => { setSelectedNodeId(nodeId); setMapOpen(false); }} onClose={() => setMapOpen(false)} />}
        {devOpen && <DevLogBox logs={logs} />}
        {toast && <button className="toast" onClick={() => setToast(null)}>{toast}</button>}
      </div>
    </div>
  );
}

function AuraMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <path d="M12 2 C6.8 6.8 6.8 14.2 12 22 C17.2 14.2 17.2 6.8 12 2Z" fill="url(#auraMarkGradient)" />
        <circle cx="12" cy="12.3" r="2.2" fill="#fbf7f1" opacity=".92" />
        <defs>
          <radialGradient id="auraMarkGradient" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="#c9a97a" />
            <stop offset="55%" stopColor="#8fa37a" />
            <stop offset="100%" stopColor="#3d4a3a" />
          </radialGradient>
        </defs>
      </svg>
    </span>
  );
}

function RailHeader({ label, value }: { label: string; value: string }) {
  return (
    <div className="rail-header">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DynamicConstellation({ mapNodes, activeNodeId, onSelect }: { mapNodes: MapNode[]; activeNodeId: string; onSelect: (nodeId: string) => void }) {
  const nodes = mapNodes.length ? mapNodes : [];
  return (
    <div className="constellation-card">
      <svg viewBox="0 0 360 260" role="img" aria-label="Dynamic knowledge graph">
        {nodes.slice(1).map((node, index) => {
          const previous = nodes[index];
          return <line key={`${previous.id}-${node.id}`} x1={previous.x * 0.34} y1={previous.y * 0.44} x2={node.x * 0.34} y2={node.y * 0.44} />;
        })}
        {nodes.map((node) => (
          <g key={node.id} className={node.id === activeNodeId ? "constellation-node active" : `constellation-node ${node.state}`} onClick={() => onSelect(node.id)} transform={`translate(${node.x * 0.34},${node.y * 0.44})`}>
            <circle r={node.id === activeNodeId ? 12 : 9} />
            <text y="27">{node.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function MapOverlay({ lesson, selectedNodeId, onSelect, onClose }: { lesson: LessonResponse; selectedNodeId: string; onSelect: (nodeId: string) => void; onClose: () => void }) {
  return (
    <aside className="map-overlay">
      <div className="overlay-head">
        <div>
          <span className="eyebrow">Knowledge map</span>
          <strong>{lesson.graph.nodes.length} nodes · {lesson.lessonPath.items.length} path steps</strong>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <div className="map-overlay-grid">
        <AuraMap nodes={lesson.mapState.nodes} edges={lesson.mapState.edges} />
        <div className="overlay-node-list scroll">
          {lesson.graph.nodes.map((node, index) => (
            <button key={node.id} className={node.id === selectedNodeId ? "overlay-node active" : "overlay-node"} onClick={() => onSelect(node.id)}>
              <span>{index + 1}</span>
              <div>
                <strong>{node.topicName}</strong>
                <small>{node.teachingGoal}</small>
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}

function SettingsOverlay({ learnerMode, setLearnerMode, focusMode, setFocusMode, onClose }: {
  learnerMode: string;
  setLearnerMode: (mode: string) => void;
  focusMode: boolean;
  setFocusMode: (value: boolean) => void;
  onClose: () => void;
}) {
  return (
    <aside className="settings-overlay">
      <div className="overlay-head">
        <div>
          <span className="eyebrow">Reading and focus</span>
          <strong>Comfort controls</strong>
        </div>
        <button className="icon-btn" onClick={onClose}><X size={18} /></button>
      </div>
      <label className="setting-row">
        <span>Learner mode</span>
        <select value={learnerMode} onChange={(event) => setLearnerMode(event.target.value)}>
          <option>Both</option>
          <option>ADHD</option>
          <option>Dyslexia</option>
        </select>
      </label>
      <label className="setting-row">
        <span>Focus mode</span>
        <input type="checkbox" checked={focusMode} onChange={(event) => setFocusMode(event.target.checked)} />
      </label>
    </aside>
  );
}

function nodeStatusLabel(node?: MapNode) {
  if (!node) return "planned";
  return node.state.replaceAll("_", " ");
}

function DebugControl({ open, setOpen, logs }: { open: boolean; setOpen: (open: boolean) => void; logs: DevLogEntry[] }) {
  return (
    <>
      <button className="dev-dot" title="Developer logs" onClick={() => setOpen(!open)}>D</button>
      {open ? <DevLogBox logs={logs} /> : null}
    </>
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

function DevLogBox({ logs }: { logs: DevLogEntry[] }) {
  return (
    <section className="debug-tray fade-in">
      <div className="debug-title"><span>aura.debug</span><strong>{logs.length}</strong></div>
      {logs.length ? logs.slice(0, 12).map((log, index) => (
        <div key={`${log.at}-${index}`} className={`debug-line dev-${log.level}`}>
          <span>{new Date(log.at).toLocaleTimeString()}</span>
          <b>{log.scope}</b>
          <p>{log.message}</p>
        </div>
      )) : <div className="dev-empty">No backend logs yet.</div>}
    </section>
  );
}
