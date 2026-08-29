"use client";

import { useEffect, useState } from "react";
import { useJournal } from "@/components/journal/JournalProvider";
import { PROMPTS, entryForDate, sortByDateDesc } from "@/lib/services/journalService";
import { todayKey } from "@/lib/utils/date";

const MOODS = ["😔", "😐", "🙂", "😄"];
const ENERGIES: { value: string; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

export default function JournalPage() {
  const { entries, loading, save } = useJournal();
  const today = todayKey();
  const todayEntry = entryForDate(entries, today);

  const [mood, setMood] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setMood(todayEntry?.mood ?? null);
    setEnergy(todayEntry?.energy ?? null);
    setAnswers(todayEntry?.answers ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntry?.id]);

  async function handleSave() {
    await save(today, { mood, energy, answers });
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  const pastEntries = sortByDateDesc(entries).filter((e) => e.entry_date !== today);

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow">Reflect</div>
          <h1 className="page-title">Journal</h1>
          <p className="sub">{new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="field-row" style={{ marginBottom: 18 }}>
          <div className="field">
            <label>Mood</label>
            <div className="chips">
              {MOODS.map((m) => (
                <button key={m} className={`chip-btn${mood === m ? " active" : ""}`} onClick={() => setMood(m)} style={{ fontSize: 16 }}>{m}</button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Energy</label>
            <div className="chips">
              {ENERGIES.map((e) => (
                <button key={e.value} className={`chip-btn${energy === e.value ? " active" : ""}`} onClick={() => setEnergy(e.value)}>{e.label}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="stack">
          {PROMPTS.map((p) => (
            <div className="field" key={p.key}>
              <label htmlFor={`prompt-${p.key}`}>{p.question}</label>
              <textarea
                id={`prompt-${p.key}`}
                rows={2}
                value={answers[p.key] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [p.key]: e.target.value }))}
                placeholder="…"
              />
            </div>
          ))}
        </div>

        <button className="primary" onClick={handleSave} style={{ marginTop: 6 }}>
          {saved ? "Saved ✓" : "Save today's entry"}
        </button>
      </div>

      {!loading && pastEntries.length > 0 && (
        <div className="card">
          <h3>Past entries</h3>
          <div className="stack">
            {pastEntries.slice(0, 14).map((e) => (
              <div key={e.id} style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>
                <div className="row between small" style={{ marginBottom: 4 }}>
                  <span style={{ fontWeight: 650 }}>{e.entry_date}</span>
                  <span>{e.mood} {e.energy && <span className="tag">{e.energy} energy</span>}</span>
                </div>
                {e.answers.what_mattered && <p className="small muted" style={{ margin: 0 }}>{e.answers.what_mattered}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
