import { Sparkles } from "lucide-react";
import type { CacheOption, StudentIntent } from "../../api/types";

export function TopicIntentScreen({ topic, setTopic, intent, setIntent, learnerMode, setLearnerMode, cacheOptions, selectedCacheId, setSelectedCacheId, onStart, busy }: {
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
  busy: boolean;
}) {
  return (
    <main className="setup-screen">
      <section className="setup-panel">
        <div className="standalone-mark" aria-label="Aura">
          <span className="brand-orbit hero" />
          <span>aura</span>
        </div>
        <label className="topic-label" htmlFor="topic">What should the map build?</label>
        <input id="topic" value={topic} onChange={(e) => setTopic(e.target.value)} className="topic-input" placeholder="Trigonometry, photosynthesis, recursion..." autoFocus />
        <div className="setup-grid">
          <Segment title="Goal" value={intent.goalType} options={["exam", "curiosity", "application", "foundation"]} onChange={(goalType) => setIntent({ ...intent, goalType: goalType as StudentIntent["goalType"] })} />
          <Segment title="Depth" value={intent.depthPreference} options={["intuition_only", "working_knowledge", "deep_mechanical"]} onChange={(depthPreference) => setIntent({ ...intent, depthPreference: depthPreference as StudentIntent["depthPreference"] })} />
          <Segment title="Learner mode" value={learnerMode} options={["Both", "ADHD", "Dyslexia"]} onChange={setLearnerMode} />
        </div>
        <div className="cache-picker">
          <label htmlFor="cacheSelect">Exa cache for test pipeline</label>
          <select id="cacheSelect" value={selectedCacheId} onChange={(event) => setSelectedCacheId(event.target.value)}>
            <option value="">Auto match by topic</option>
            {cacheOptions.map((cache) => (
              <option key={cache.id} value={cache.id} disabled={!cache.usable}>
                {cache.usable ? "" : "[incomplete] "}{cache.topic || cache.id} · {cache.subject} {cache.gradeLevel}
              </option>
            ))}
          </select>
          <div className="cache-hint">
            {selectedCacheId ? `Selected ${selectedCacheId}` : "Auto still uses topic overlap; selection is exact."}
          </div>
        </div>
        <button className="start-button" disabled={!topic.trim() || busy} onClick={onStart}><Sparkles size={20} /> Start map</button>
      </section>
    </main>
  );
}

function Segment({ title, value, options, onChange }: { title: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <div className="segment-block">
      <div className="segment-title">{title}</div>
      <div className="segmented">
        {options.map((option) => <button key={option} className={value === option ? "selected" : ""} onClick={() => onChange(option)}>{option.replaceAll("_", " ")}</button>)}
      </div>
    </div>
  );
}
