"use client";
import { useState, useEffect, useMemo } from 'react';
import Alert from '../components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

const PEOPLE_IDS = ["Mamu", "Son", "Saani", "Naani"] as const;
type Person = typeof PEOPLE_IDS[number];

interface TimeWindow {
  start: number;
  end: number;
  count?: number;
}

export default function Scheduler() {
  const [activeUser, setActiveUser] = useState<Person | null>(null);
  const [data, setData] = useState<any>({});
  const [alertMsg, setAlertMsg] = useState("");
  const [results, setResults] = useState<TimeWindow[]>([]);
  const [showNukeConfirm, setShowNukeConfirm] = useState(false);
  const [showSmartModal, setShowSmartModal] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [is24Hour, setIs24Hour] = useState(false); 
  const [draft, setDraft] = useState({ 
    date: new Date().toISOString().split('T')[0], start: "09:00", end: "10:00" 
  });

  const now = Date.now();
  const getUserData = (p: Person) => data[p] || { timezone: "America/New_York", availabilities: [] };

  // --- Persistence & Sync ---
  useEffect(() => {
    const savedToggle = localStorage.getItem('is24Hour');
    if (savedToggle !== null) setIs24Hour(savedToggle === 'true');

    const loadData = async () => {
      setIsSyncing(true);
      try {
        const res = await fetch('/api/sync');
        const parsed = await res.json();
        const checkedData = { ...parsed };
        PEOPLE_IDS.forEach(p => {
          if (!checkedData[p]) checkedData[p] = { timezone: "America/New_York", availabilities: [] };
        });
        setData(checkedData);
      } catch (e) { setAlertMsg("Cloud sync failed."); }
      finally { setIsSyncing(false); }
    };
    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem('is24Hour', is24Hour.toString());
  }, [is24Hour]);

  const persist = async (newData: any) => {
    setData(newData);
    setIsSyncing(true);
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData),
      });
    } catch (e) { setAlertMsg("Cloud save failed!"); }
    finally { setIsSyncing(false); }
  };

  const formatTime = (date: Date, tz?: string) => {
    return date.toLocaleTimeString('en-US', {
      timeZone: tz || undefined,
      hour: 'numeric',
      minute: '2-digit',
      hour12: !is24Hour
    }).toLowerCase();
  };

  const normalizeToUTC = (slot: any, timezone: string) => {
    const s = new Date(`${slot.date}T${slot.start}:00`);
    const sLoc = new Date(s.toLocaleString('en-US', { timeZone: timezone }));
    const sDiff = sLoc.getTime() - s.getTime();
    const e = new Date(`${slot.date}T${slot.end}:00`);
    const eLoc = new Date(e.toLocaleString('en-US', { timeZone: timezone }));
    const eDiff = eLoc.getTime() - e.getTime();
    return { start: s.getTime() - sDiff, end: e.getTime() - eDiff };
  };

  const calculateOverlap = () => {
    setIsCalculating(true);
    setTimeout(() => {
        const minMs = 45 * 60000;
        const allNormalized = PEOPLE_IDS.map(p => ({
            p, slots: getUserData(p).availabilities.map((s: any) => normalizeToUTC(s, getUserData(p).timezone))
        }));

        const checkpoints = Array.from(new Set(allNormalized.flatMap(u => u.slots.flatMap(s => [s.start, s.end])))).sort();
        let rankedWindows: TimeWindow[] = [];

        for (let i = 0; i < checkpoints.length - 1; i++) {
            const start = checkpoints[i];
            const end = checkpoints[i+1];
            if (end - start < minMs) continue;
            const count = allNormalized.filter(u => u.slots.some(s => s.start <= start && s.end >= end)).length;
            if (count > 0) rankedWindows.push({ start, end, count });
        }

        const merged: TimeWindow[] = [];
        rankedWindows.forEach(w => {
            const last = merged[merged.length - 1];
            if (last && last.end === w.start && last.count === w.count) {
                last.end = w.end;
            } else { merged.push(w); }
        });

        const sorted = merged.sort((a, b) => (b.count || 0) - (a.count || 0) || (b.end - b.start) - (a.end - a.start));
        setResults(sorted.slice(0, 3));
        setIsCalculating(false);
    }, 450);
  };

  const suggestions = useMemo(() => {
    if (!activeUser) return [];
    
    const others = PEOPLE_IDS.filter(p => p !== activeUser);
    const otherSlots = others.map(p => ({
        p, slots: getUserData(p).availabilities.map((s: any) => normalizeToUTC(s, getUserData(p).timezone))
    }));
    
    // Get active user's current slots to avoid suggesting times they're already busy
    const mySlots = getUserData(activeUser).availabilities.map((s: any) => normalizeToUTC(s, getUserData(activeUser).timezone));

    const checkpoints = Array.from(new Set(otherSlots.flatMap(u => u.slots.flatMap(s => [s.start, s.end])))).sort();
    let options: TimeWindow[] = [];

    for (let i = 0; i < checkpoints.length - 1; i++) {
        const start = checkpoints[i];
        const end = checkpoints[i+1];
        if (start < now) continue;

        // Don't suggest times the user already has marked as free
        const iAmBusy = mySlots.some(s => s.start <= start && s.end >= end);
        if (iAmBusy) continue;

        const matchCount = otherSlots.filter(u => u.slots.some(s => s.start <= start && s.end >= end)).length;
        if (matchCount > 0) options.push({ start, end, count: matchCount });
    }
    return options.sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 3);
  }, [data, activeUser, now]);

  const hasFullOverlap = results.some(r => r.count === 4);

  return (
    <main className="app-container">
      <Alert message={alertMsg} onClose={() => setAlertMsg("")} />
      
      <div className="header-meta">
        <div className="sync-indicator">
            {isSyncing ? <span className="sync-dot pulse" /> : <span className="sync-dot" />}
            {isSyncing ? 'Syncing...' : 'Cloud Connected'}
        </div>
        <div className="toggle-container" onClick={() => setIs24Hour(!is24Hour)}>
            <span className="toggle-label">24h</span>
            <div className={`toggle-track ${is24Hour ? 'on' : 'off'}`}>
                <div className="toggle-thumb" />
            </div>
        </div>
      </div>

      <ConfirmDialog 
        isOpen={showNukeConfirm}
        title="Reset All Cloud Data?"
        message="This will permanently delete everyone's saved slots. This cannot be undone."
        onConfirm={async () => {
            const reset = PEOPLE_IDS.reduce((acc, p) => ({ ...acc, [p]: { timezone: "America/New_York", availabilities: [] } }), {});
            await persist(reset);
            setResults([]);
            setShowNukeConfirm(false);
        }}
        onCancel={() => setShowNukeConfirm(false)}
      />

      {!activeUser ? (
        <>
          <h1 className="main-title">VidChat Time-Finder</h1>
          {PEOPLE_IDS.map(p => (
            <div key={p} className="user-row" onClick={() => setActiveUser(p)}>
              <span className="user-name">{p}</span>
              <span className={`slot-badge ${getUserData(p).availabilities.length ? 'active' : ''}`}>
                {getUserData(p).availabilities.length} Slots
              </span>
            </div>
          ))}

          <button 
            className={`btn-primary ${isCalculating ? 'btn-loading' : ''}`} 
            onClick={calculateOverlap} 
            disabled={isCalculating}
            style={{marginTop: '20px'}}
          >
            {isCalculating ? <span className="spinner" /> : 'Find Overlaps ✨'}
          </button>

          {results.length > 0 && !isCalculating && (
            <div className="results-area" style={{marginTop: '25px'}}>
              {!hasFullOverlap && <h3 className="sub-heading">No perfect overlap yet...</h3>}
              {results.map((res, i) => (
                <div key={i} className={`result-card-v2 ${res.count === 4 ? 'match-full' : 'match-partial'}`}>
                  <div className="result-date">
                    {new Date(res.start).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                    <span className="match-pill">{res.count}/4 matched</span>
                  </div>
                  <div className="time-secondary-row">
                    {formatTimeRow(res, is24Hour)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button className="btn-nuke" onClick={() => setShowNukeConfirm(true)}>Delete All Data</button>
        </>
      ) : (
        <>
          <button className="btn-ghost" onClick={() => setActiveUser(null)}>← Back to Overview</button>
          <h2 className="main-title">{activeUser}'s Times</h2>
          
          <div className="editor-card">
            <div style={{marginBottom:'15px'}}>
              <label className="field-label">Your Timezone</label>
              <select className="tz-select" value={getUserData(activeUser).timezone} 
                onChange={e => {
                  const next = { ...data };
                  next[activeUser].timezone = e.target.value;
                  persist(next);
                }}>
                <option value="America/New_York">Virginia (VA)</option>
                <option value="America/Chicago">Texas (TX)</option>
                <option value="America/Vancouver">Washington (WA)</option>
              </select>
            </div>

            <label className="field-label">Add Slot</label>
            <input type="date" className="date-input" value={draft.date} onChange={e => setDraft({...draft, date: e.target.value})} />
            <div className="time-flex" style={{margin:'10px 0'}}>
              <input type="time" value={draft.start} onChange={e => {
                const [h, m] = e.target.value.split(':');
                const endH = (parseInt(h) + 1).toString().padStart(2, '0');
                setDraft({...draft, start: e.target.value, end: `${endH === '24' ? '00' : endH}:${m}`});
              }} />
              <span className="time-to-text">to</span>
              <input type="time" value={draft.end} onChange={e => setDraft({...draft, end: e.target.value})} />
            </div>
            
            <button className="btn-primary" style={{width:'100%'}} onClick={() => {
              const next = { ...data };
              next[activeUser].availabilities.push({ ...draft, id: Math.random().toString(36).substring(7) });
              persist(next);
            }}>Save Window</button>
            
            <div className="tertiary-row">
                <button className="btn-tertiary" onClick={() => setShowSmartModal(true)}>SmartSuggest ✨</button>
                <button className="btn-info-icon" onClick={() => setShowInfoModal(true)}>ⓘ</button>
            </div>
          </div>

          <h3 className="section-label">Your Saved Windows</h3>
          {getUserData(activeUser).availabilities.map((slot: any) => {
            const startObj = new Date(`${slot.date}T${slot.start}`);
            const endObj = new Date(`${slot.date}T${slot.end}`);
            const normalized = normalizeToUTC(slot, getUserData(activeUser).timezone);
            const isPast = normalized.end < now;
            return (
              <div key={slot.id} className="user-row-v2 compact">
                <div className="row-content">
                  <div className="time-main">
                    {slot.date} <span className="lite-text">at</span> {is24Hour ? slot.start : formatTime(startObj)} <span className="lite-text">to</span> {is24Hour ? slot.end : formatTime(endObj)}
                  </div>
                  <div className="time-secondary">{formatSlotSecondary(slot, getUserData(activeUser).timezone, is24Hour)}</div>
                  {isPast && <div className="past-warning">⚠️ This is a past time.</div>}
                </div>
                <button className="btn-del" onClick={() => {
                  const next = { ...data };
                  next[activeUser].availabilities = next[activeUser].availabilities.filter((s:any) => s.id !== slot.id);
                  persist(next);
                }}>Remove</button>
              </div>
            );
          })}
        </>
      )}

      {showSmartModal && (
        <div className="modal-overlay" onClick={() => setShowSmartModal(false)}>
            <div className="modal-content dark-theme" onClick={e => e.stopPropagation()}>
                <h3 style={{marginBottom:'4px'}}>Top Suggestions</h3>
                <p style={{fontSize:'0.8rem', color:'#888', marginBottom:'15px'}}>Based on other people's free slots:</p>
                <div className="suggestion-list">
                  {suggestions.length > 0 ? suggestions.map((s, i) => {
                    const userTz = getUserData(activeUser!).timezone;
                    const tzLabel = userTz === 'America/New_York' ? 'VA' : userTz === 'America/Chicago' ? 'TX' : 'WA';
                    const d = new Date(s.start);

                    return (
                        <div key={i} className="suggestion-item">
                            <div className="sug-info">
                              <div style={{display:'flex', gap:'5px', alignItems:'baseline'}}>
                                <span className="sug-date">{d.toLocaleDateString([], {month: 'short', day: 'numeric', timeZone: userTz})}</span>
                                <span className="sug-time">@ {formatTime(d, userTz)} ({tzLabel})</span>
                              </div>
                              <span className="sug-count">{s.count} others free</span>
                            </div>
                            <button className="btn-primary-sm" onClick={() => {
                                 const locStr = d.toLocaleString('sv-SE', { timeZone: userTz }); 
                                 const [locDate, locTime] = locStr.split(' ');
                                 const endD = new Date(s.start + 3600000);
                                 const locEndTime = endD.toLocaleString('sv-SE', { timeZone: userTz }).split(' ')[1];

                                 setDraft({ 
                                    date: locDate, 
                                    start: locTime.slice(0,5), 
                                    end: locEndTime.slice(0,5) 
                                 });
                                 setShowSmartModal(false);
                            }}>Select</button>
                        </div>
                    );
                  }) : <p className="empty-msg">No future matches found.</p>}
                </div>
                <button className="btn-ghost" style={{width:'100%', marginTop:'15px'}} onClick={() => setShowSmartModal(false)}>Close</button>
            </div>
        </div>
      )}

      {showInfoModal && (
        <div className="modal-overlay" onClick={() => setShowInfoModal(false)}>
            <div className="modal-content dark-theme" onClick={e => e.stopPropagation()}>
                <h3 style={{marginBottom:'10px'}}>About SmartSuggest</h3>
                <p style={{fontSize:'0.85rem', lineHeight:'1.5', color:'#bbb'}}>Calculates future 1-hour gaps where the most people are free. Select one to automatically fill your "Add Slot" fields.</p>
                <button className="btn-primary" style={{width:'100%', marginTop:'20px'}} onClick={() => setShowInfoModal(false)}>Got it</button>
            </div>
        </div>
      )}

      <style jsx>{`
        .header-meta { display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; padding: 0 5px; }
        .sync-indicator { font-size: 0.75rem; color: #888; display: flex; align-items: center; gap: 6px; }
        .sync-dot { width: 8px; height: 8px; background: #28a745; border-radius: 50%; opacity: 0.6; }
        .pulse { animation: pulse-animation 1.5s infinite; }
        @keyframes pulse-animation { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }

        .toggle-container { display: flex; align-items: center; gap: 8px; cursor: pointer; }
        .toggle-label { font-size: 0.75rem; color: #888; font-weight: bold; }
        .toggle-track { width: 34px; height: 18px; border-radius: 10px; padding: 2px; transition: background 0.3s; position: relative; }
        .toggle-track.off { background: #444; }
        .toggle-track.on { background: #007bff; }
        .toggle-thumb { width: 14px; height: 14px; background: white; border-radius: 50%; transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
        .toggle-track.on .toggle-thumb { transform: translateX(16px); }

        .spinner { width: 18px; height: 18px; border: 2px solid rgba(255,255,255,0.3); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; display: inline-block; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .btn-loading { opacity: 0.8; cursor: wait; }

        .result-card-v2 { background: #1e1e1e; padding: 15px; border-radius: 8px; border-left: 5px solid transparent; margin-bottom: 12px; }
        .match-full { border-left-color: #28a745; }
        .match-partial { border-left-color: #ffc107; }
        .time-secondary-row { font-size: 0.8rem; color: #888; margin-top: 8px; }
        .sub-heading { color: #ffc107; font-size: 0.9rem; text-align: center; margin-bottom: 15px; }
        .match-pill { font-size: 0.7rem; background: #333; padding: 2px 8px; border-radius: 10px; margin-left: 10px; color: #fff; }
        .tertiary-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
        .btn-tertiary { flex: 1; background: transparent; border: 1px solid #007bff; color: #007bff; padding: 8px; border-radius: 4px; cursor: pointer; }
        .btn-info-icon { background: #333; border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; }
        
        .user-row-v2 { background: #1a1a1a; padding: 12px; border-radius: 8px; display: flex; justify-content: space-between; margin-bottom: 10px; border: 1px solid #222; }
        .user-row-v2.compact { padding: 8px 12px; }
        .lite-text { opacity: 0.6; font-size: 0.85rem; }
        .time-main { font-weight: 500; font-size: 0.95rem; }
        .time-secondary { font-size: 0.75rem; color: #666; margin-top: 4px; }
        .past-warning { color: #ffc107; font-size: 0.7rem; margin-top: 4px; }
        
        .modal-overlay { position: fixed; top:0; left:0; right:0; bottom:0; background: rgba(0,0,0,0.85); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .modal-content.dark-theme { background: #1a1a1a; color: white; padding: 25px; border-radius: 12px; width: 90%; max-width: 400px; border: 1px solid #333; }
        .suggestion-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #222; }
        .sug-date { font-weight: bold; color: #eee; }
        .sug-time { color: #888; font-size: 0.85rem; }
        .sug-count { font-size: 0.75rem; color: #28a745; font-weight: 600; display: block; margin-top: 2px; }
        .btn-primary-sm { background: #007bff; border: none; color: white; padding: 6px 12px; border-radius: 4px; font-size: 0.75rem; cursor: pointer; font-weight: 600; }
      `}</style>
    </main>
  );
}

function formatTimeRow(res: TimeWindow, is24h: boolean) {
    const tzs = [{ zone: 'America/New_York', label: 'VA' }, { zone: 'America/Chicago', label: 'TX' }, { zone: 'America/Vancouver', label: 'WA' }];
    return tzs.map((tz, i) => {
        const fmt = (d: number) => new Date(d).toLocaleTimeString('en-US', { timeZone: tz.zone, hour: 'numeric', minute: '2-digit', hour12: !is24h }).toLowerCase();
        return <span key={tz.label}>{fmt(res.start)}-{fmt(res.end)} {tz.label}{i < 2 ? ' | ' : ''}</span>;
    });
}

function formatSlotSecondary(slot: any, userTz: string, is24h: boolean) {
    const dateObj = new Date(`${slot.date}T${slot.start}`);
    const zones = [
        { tz: 'America/New_York', label: 'VA', zoneId: 'America/New_York' }, 
        { tz: 'America/Chicago', label: 'TX', zoneId: 'America/Chicago' }, 
        { tz: 'America/Vancouver', label: 'WA', zoneId: 'America/Vancouver' }
    ];
    return zones.map(z => {
        const local = new Date(dateObj.toLocaleString('en-US', { timeZone: z.tz }));
        const timeStr = local.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: !is24h }).toLowerCase();
        const isYou = z.zoneId === userTz;
        return `${timeStr} ${z.label}${isYou ? ' (you)' : ''}`;
    }).join(' | ');
}