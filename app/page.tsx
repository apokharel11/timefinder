"use client";
import { useState, useEffect } from 'react';
import Alert from '../components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

const PEOPLE_IDS = ["Mamu", "Son", "Naani", "Saani"] as const;
type Person = typeof PEOPLE_IDS[number];

interface TimeWindow {
  start: number;
  end: number;
}

export default function Scheduler() {
  const [activeUser, setActiveUser] = useState<Person | null>(null);
  const [data, setData] = useState<any>({});
  const [alertMsg, setAlertMsg] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);
  const [draft, setDraft] = useState({ 
    date: new Date().toISOString().split('T')[0], start: "09:00", end: "10:00" 
  });

  // Hydration
  useEffect(() => {
    const saved = localStorage.getItem('shazam_sync_v1');
    let parsed = saved ? JSON.parse(saved) : {};
    PEOPLE_IDS.forEach(p => {
      if (!parsed[p]) parsed[p] = { timezone: "America/New_York", availabilities: [] };
    });
    setData(parsed);
  }, []);

  // HASH CHECK: If data changes, clear stale results immediately
  useEffect(() => {
    setResults([]);
  }, [JSON.stringify(data)]);

  const persist = (newData: any) => {
    setData(newData);
    localStorage.setItem('shazam_sync_v1', JSON.stringify(newData));
  };

  // This just triggers the UI
  const handleNukeClick = () => setShowNukeConfirm(true);

  // This is the actual execution
  const executeNuke = () => {
    const reset = PEOPLE_IDS.reduce((acc, p) => ({ 
      ...acc, [p]: { timezone: "America/New_York", availabilities: [] } 
    }), {});
    persist(reset);
    setResults([]);
    setShowNukeConfirm(false); // Close modal
    setAlertMsg("All data cleared.");
  };

  const calculateOverlap = () => {
    const minMs = 45 * 60000;

    const allNormalized: TimeWindow[][] = PEOPLE_IDS.map(p => {
      const uData = getUserData(p);
      return uData.availabilities.map((slot: any) => {
        const dateStr = `${slot.date}T${slot.start}:00`;
        const s = new Date(dateStr);
        const sLoc = new Date(s.toLocaleString('en-US', { timeZone: uData.timezone }));
        const sDiff = sLoc.getTime() - s.getTime();
        
        const e = new Date(`${slot.date}T${slot.end}:00`);
        const eLoc = new Date(e.toLocaleString('en-US', { timeZone: uData.timezone }));
        const eDiff = eLoc.getTime() - e.getTime();

        return { 
          start: s.getTime() - sDiff, 
          end: e.getTime() - eDiff 
        };
      });
    });

    if (allNormalized.some(slots => slots.length === 0)) {
      setAlertMsg("Everyone needs at least one slot!");
      return;
    }

    let finalWindows: TimeWindow[] = allNormalized[0];

    for (let i = 1; i < allNormalized.length; i++) {
      let nextRound: TimeWindow[] = [];
      finalWindows.forEach((existing: TimeWindow) => {
        allNormalized[i].forEach((current: TimeWindow) => {
          const start = Math.max(existing.start, current.start);
          const end = Math.min(existing.end, current.end);
          if (end - start >= minMs) {
            nextRound.push({ start, end });
          }
        });
      });
      finalWindows = nextRound;
    }

    if (finalWindows.length === 0) {
      setAlertMsg("No 4-way overlap found.");
    }
    setResults(finalWindows);
  };

  const getUserData = (p: Person) => data[p] || { timezone: "America/New_York", availabilities: [] };

  return (
    <main className="app-container">
      <Alert message={alertMsg} onClose={() => setAlertMsg("")} />

      <ConfirmDialog 
        isOpen={showNukeConfirm}
        title="Reset All Data?"
        message="This will permanently delete all saved availability slots for every user. You cannot undo this."
        onConfirm={executeNuke}
        onCancel={() => setShowNukeConfirm(false)}
      />

      {!activeUser ? (
        <>
          <h1 className="main-title">VidChat Time-Finder</h1>
          <p className="main-subtitle">Click your row, input times, return with '← Back To Overview', and then .. huzzah - find the time!</p>
          
          {PEOPLE_IDS.map(p => (
            <div key={p} className="user-row" onClick={() => setActiveUser(p)}>
              <span className="user-name">{p}</span>
              <span className={`slot-badge ${getUserData(p).availabilities.length ? 'active' : ''}`}>
                {getUserData(p).availabilities.length} Slots
              </span>
            </div>
          ))}

          <button className="btn-primary" onClick={calculateOverlap}>Find Overlaps ✨</button>

          {results.map((res, i) => {
            const diff = (res.end - res.start) / 60000;
            const getTimeString = (tz: string, label: string) => {
              const timeStr = new Date(res.start).toLocaleTimeString('en-US', {
                timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true
              }).toLowerCase();
              return <span className="time-segment">{timeStr} <span className="tz-tag">{label}</span></span>;
            };

            return (
              <div key={i} className="result-card">
                <div className="result-date">
                  {new Date(res.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div className="duration-pill">{Math.floor(diff/60)}h {diff%60}m Window</div>
                <div className="time-string-row">
                  {getTimeString('America/Vancouver', 'WA')}
                  <span className="time-divider"> / </span>
                  {getTimeString('America/Chicago', 'TX')}
                  <span className="time-divider"> / </span>
                  {getTimeString('America/New_York', 'VA')}
                </div>
              </div>
            );
          })}

          <button className="btn-nuke" onClick={handleNukeClick}>Delete All Saved Data</button>
        </>
      ) : (
        <>
          <button className="btn-ghost" onClick={() => setActiveUser(null)}>← Back to Overview</button>
          <h2 className="main-title">User {activeUser}</h2>
          
          <div className="editor-card">
            <div>
              <label className="field-label">Timezone</label>
              <select value={getUserData(activeUser).timezone} onChange={e => {
                const next = { ...data };
                next[activeUser].timezone = e.target.value;
                persist(next);
              }}>
                <option value="America/New_York">Virginia (EST)</option>
                <option value="America/Chicago">Texas (CST)</option>
                <option value="America/Vancouver">Washington (PST)</option>
              </select>
            </div>

            <div>
              <label className="field-label">Add Slot</label>
              <input type="date" value={draft.date} onChange={e => setDraft({...draft, date: e.target.value})} />
              <div className="time-flex" style={{marginTop:'10px'}}>
                <input type="time" value={draft.start} onChange={e => setDraft({...draft, start: e.target.value})} />
                <span className="time-to-text">to</span>
                <input type="time" value={draft.end} onChange={e => setDraft({...draft, end: e.target.value})} />
              </div>
              <button className="btn-primary" onClick={() => {
                const next = { ...data };
                next[activeUser].availabilities.push({ ...draft, id: Math.random().toString(36).substring(7) });
                persist(next);
              }}>Save Window</button>
            </div>
          </div>

          <h3 className="section-label">Your Saved Windows</h3>
          {getUserData(activeUser).availabilities.map((slot: any) => (
            <div key={slot.id} className="user-row" style={{cursor:'default'}}>
              <div>
                <div className="user-name" style={{fontSize:'1rem'}}>{slot.date}</div>
                <div style={{fontSize:'0.8rem', color:'#888'}}>{slot.start} - {slot.end}</div>
              </div>
              <button className="btn-del" onClick={() => {
                const next = { ...data };
                next[activeUser].availabilities = next[activeUser].availabilities.filter((s:any) => s.id !== slot.id);
                persist(next);
              }}>Remove</button>
            </div>
          ))}
        </>
      )}
    </main>
  );
}