import { ArrowRight, Brain, Check, Flame, HeartHandshake, Leaf, Sparkles, Sprout, Upload, WandSparkles } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("dashboard");

  const presets = [
    { labelKey: "presetProbability", whyKey: "presetProbabilitySub", xp: 60 },
    { labelKey: "presetPhotosynthesis", whyKey: "presetPhotosynthesisSub", xp: 50 },
    { labelKey: "presetQuadratic", whyKey: "presetQuadraticSub", xp: 70 },
    { labelKey: "presetMomentum", whyKey: "presetMomentumSub", xp: 55 }
  ];
  const quests = [
    { labelKey: "questFocusedPath", subKey: "questFocusedPathSub", reward: "+15", done: false },
    { labelKey: "questRepairShaky", subKey: "questRepairShakySub", reward: "+20", done: true },
    { labelKey: "questFinishApp", subKey: "questFinishAppSub", reward: "+35", done: false }
  ];

  return (
    <main className="home-shell scroll">
      <section className="home-garden">
        <div className="garden-bloom" />
        <div className="local-pill"><span /> {t('gemmaLocal')}</div>
        <div className="home-brand">
          <span className="brand-orbit hero" />
          <strong>{t('aura')}</strong>
          <p>{t('tagline')}</p>
        </div>

        <div className="level-card">
          <div>
            <span>{t('level', { n: 4 })}</span>
            <strong>{t('xp', { n: 312 })}</strong>
            <div className="level-bar"><i style={{ width: "42%" }} /></div>
            <small>{t('xpToLevel', { n: 88, level: 5 })}</small>
          </div>
          <div className="streak-chip"><Flame size={18} /> 5d</div>
        </div>

        <div className="quest-block">
          <div className="home-eyebrow">{t('todaysQuests')}</div>
          {quests.map((quest) => (
            <div key={quest.labelKey} className={quest.done ? "quest-row done" : "quest-row"}>
              <span>{quest.done ? <Check size={13} /> : <Sparkles size={13} />}</span>
              <div>
                <strong>{t(quest.labelKey)}</strong>
                <small>{t(quest.subKey)}</small>
              </div>
              <b>{quest.reward}</b>
            </div>
          ))}
        </div>

        <div className="badge-row" aria-label="Learning badges">
          <Badge icon={<Sprout size={15} />} label={t('badgeFirstBloom')} active />
          <Badge icon={<Brain size={15} />} label={t('badgePattern')} active />
          <Badge icon={<HeartHandshake size={15} />} label={t('badgeRepair')} active />
          <Badge icon={<WandSparkles size={15} />} label={t('badgeMastery')} />
        </div>
      </section>

      <section className="home-composer">
        <div className="composer-head">
          <div>
            <span className="home-eyebrow">{t('beginSession')}</span>
            <h1>{t('plantToGrow')}</h1>
          </div>
          <div className="step-dots"><i /><i /><i /><i /></div>
        </div>

        <label className="composer-field">
          <span>{t('topic')}</span>
          <div className="topic-entry">
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('topicPlaceholder')} autoFocus />
            <button disabled={!topic.trim() || busy} onClick={onStart} title="Start lesson"><ArrowRight size={18} /></button>
          </div>
        </label>

        <div className="preset-list">
          <div className="home-eyebrow">{t('familiarSeeds')}</div>
          {presets.map((preset) => (
            <button key={preset.labelKey} className="preset-row" onClick={() => setTopic(t(preset.labelKey))}>
              <Leaf size={15} />
              <div>
                <strong>{t(preset.labelKey)}</strong>
                <small>{t(preset.whyKey)}</small>
              </div>
              <b>+{preset.xp}</b>
            </button>
          ))}
        </div>

        <div className="cache-picker home-cache">
          <label htmlFor="cacheSelect">{t('optionalCache')}</label>
          <select id="cacheSelect" value={selectedCacheId} onChange={(event) => setSelectedCacheId(event.target.value)}>
            <option value="">{t('gemmaOnlyPath')}</option>
            {cacheOptions.map((cache) => (
              <option key={cache.id} value={cache.id} disabled={!cache.usable}>
                {cache.usable ? "" : "[incomplete] "}{cache.topic || cache.id} · {cache.subject} {cache.gradeLevel}
              </option>
            ))}
          </select>
          <div className="cache-hint">
            {selectedCacheId ? t('selectedCache', { id: selectedCacheId }) : t('cacheHint')}
          </div>
        </div>

        <div className="home-actions">
          <button className="start-button home-start" disabled={!topic.trim() || busy} onClick={onStart}>
            <Sparkles size={18} /> {t('buildMyMap')}
          </button>
          <label className="image-start">
            <Upload size={16} />
            <span>{t('buildFromPhoto')}</span>
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
