import { ArrowRight, Brain, Check, Flame, HeartHandshake, Leaf, Sparkles, Sprout, Upload, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import type { CacheOption, StudentIntent } from "../../api/types";

type TopicIntentScreenProps = {
  topic: string;
  setTopic: (topic: string) => void;
  intent: StudentIntent;
  setIntent: (intent: StudentIntent) => void;
  learnerMode: string;
  setLearnerMode: (mode: string) => void;
  cacheOptions: CacheOption[];
  selectedCacheId: string;
  setSelectedCacheId: (cacheId: string) => void;
  onStart: () => void;
  onImageStart: (file: File) => void;
  busy: boolean;
};

export function TopicIntentScreen({ topic, setTopic, cacheOptions, selectedCacheId, setSelectedCacheId, onStart, onImageStart, busy }: TopicIntentScreenProps) {
  const presets = [
    { label: "Probability class 10", why: "Build sample space and exam practice", xp: 60 },
    { label: "Photosynthesis", why: "Turn process steps into a map", xp: 50 },
    { label: "Quadratic equations", why: "Factor, formula, and repair traps", xp: 70 },
    { label: "Momentum", why: "Connect formula to real motion", xp: 55 }
  ];
  const quests = [
    { label: "Start one focused path", sub: "A short map, no clutter", reward: "+15", done: false },
    { label: "Repair a shaky idea", sub: "Mistakes become support nodes", reward: "+20", done: true },
    { label: "Finish with application", sub: "One final usable task", reward: "+35", done: false }
  ];

  return (
    <main className="home-shell scroll">
      <section className="home-garden">
        <div className="garden-bloom" />
        <div className="local-pill"><span /> Gemma 4 · local</div>
        <div className="home-brand">
          <span className="brand-orbit hero" />
          <strong>aura</strong>
          <p>Local tutor for neurodivergent minds.</p>
        </div>

        <div className="level-card">
          <div>
            <span>Level 4</span>
            <strong>312 XP</strong>
            <div className="level-bar"><i style={{ width: "42%" }} /></div>
            <small>88 XP to level 5</small>
          </div>
          <div className="streak-chip"><Flame size={18} /> 5d</div>
        </div>

        <div className="quest-block">
          <div className="home-eyebrow">Today's quests</div>
          {quests.map((quest) => (
            <div key={quest.label} className={quest.done ? "quest-row done" : "quest-row"}>
              <span>{quest.done ? <Check size={13} /> : <Sparkles size={13} />}</span>
              <div>
                <strong>{quest.label}</strong>
                <small>{quest.sub}</small>
              </div>
              <b>{quest.reward}</b>
            </div>
          ))}
        </div>

        <div className="badge-row" aria-label="Learning badges">
          <Badge icon={<Sprout size={15} />} label="First bloom" active />
          <Badge icon={<Brain size={15} />} label="Pattern" active />
          <Badge icon={<HeartHandshake size={15} />} label="Repair" active />
          <Badge icon={<WandSparkles size={15} />} label="Mastery" />
        </div>
      </section>

      <section className="home-composer">
        <div className="composer-head">
          <div>
            <span className="home-eyebrow">Begin a session</span>
            <h1>Plant something to grow.</h1>
          </div>
          <div className="step-dots"><i /><i /><i /><i /></div>
        </div>

        <label className="composer-field">
          <span>Topic</span>
          <div className="topic-entry">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="A chapter, a concept, a question..." autoFocus />
            <button disabled={!topic.trim() || busy} onClick={onStart} title="Start lesson"><ArrowRight size={18} /></button>
          </div>
        </label>

        <div className="preset-list">
          <div className="home-eyebrow">Familiar seeds</div>
          {presets.map((preset) => (
            <button key={preset.label} className="preset-row" onClick={() => setTopic(preset.label)}>
              <Leaf size={15} />
              <div>
                <strong>{preset.label}</strong>
                <small>{preset.why}</small>
              </div>
              <b>+{preset.xp}</b>
            </button>
          ))}
        </div>

        <div className="cache-picker home-cache">
          <label htmlFor="cacheSelect">Optional cache for testing</label>
          <select id="cacheSelect" value={selectedCacheId} onChange={(event) => setSelectedCacheId(event.target.value)}>
            <option value="">Gemma-only main path</option>
            {cacheOptions.map((cache) => (
              <option key={cache.id} value={cache.id} disabled={!cache.usable}>
                {cache.usable ? "" : "[incomplete] "}{cache.topic || cache.id} · {cache.subject} {cache.gradeLevel}
              </option>
            ))}
          </select>
          <div className="cache-hint">
            {selectedCacheId ? `Selected ${selectedCacheId}` : "Cache only bypasses fetch when explicitly selected."}
          </div>
        </div>

        <div className="home-actions">
          <button className="start-button home-start" disabled={!topic.trim() || busy} onClick={onStart}>
            <Sparkles size={18} /> Build my map
          </button>
          <label className="image-start">
            <Upload size={16} />
            <span>Build from textbook photo</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              disabled={busy}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) onImageStart(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </main>
  );
}

function Badge({ icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean }) {
  return <span className={active ? "badge-chip active" : "badge-chip"} title={label}>{icon}</span>;
}
