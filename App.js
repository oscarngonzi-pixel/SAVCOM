import React, { useState, useMemo, useCallback } from "react";

// Frontend and backend are served from the same Render service, so API
// calls use relative paths — no separate base URL needed.
const API_BASE = "";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US");
}

// Deterministic, server-data-driven analysis note — the "AI-strong data
// analysis" read of the merged CRDB + NMB result set for the chosen range.
function buildAnalysisNote(summary, start, end) {
  if (!summary || summary.totalRecords === 0) {
    return `Hakuna miamala iliyopatikana CRDB au NMB kati ya ${start} na ${end}. Jaribu kupanua muda.`;
  }
  const crdbShare = ((summary.fromCrdb / summary.totalRecords) * 100).toFixed(0);
  const nmbShare = ((summary.fromNmb / summary.totalRecords) * 100).toFixed(0);
  const avg = summary.totalAmount / summary.totalRecords;

  return `Kati ya ${start} na ${end}, jumla ya miamala ${summary.totalRecords} imepatikana — ${summary.fromCrdb} (${crdbShare}%) kutoka CRDB na ${summary.fromNmb} (${nmbShare}%) kutoka NMB. Jumla ya kiasi kilichopokelewa ni TSh ${formatMoney(summary.totalAmount)} (wastani wa TSh ${formatMoney(avg)} kwa muamala). CRDB imeleta TSh ${formatMoney(summary.crdbAmount)} na NMB imeleta TSh ${formatMoney(summary.nmbAmount)}.`;
}

export default function App() {
  const [start, setStart] = useState(daysAgoISO(7));
  const [end, setEnd] = useState(todayISO());
  const [activeRange, setActiveRange] = useState("7d");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null);

  const setRange = useCallback((key) => {
    setActiveRange(key);
    const endVal = todayISO();
    let startVal = endVal;
    if (key === "today") startVal = todayISO();
    if (key === "7d") startVal = daysAgoISO(7);
    if (key === "30d") startVal = daysAgoISO(30);
    if (key === "mtd") {
      const d = new Date();
      startVal = new Date(d.getFullYear(), d.getMonth(), 1)
        .toISOString()
        .slice(0, 10);
    }
    setStart(startVal);
    setEnd(endVal);
  }, []);

  const runProcessor = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/overall?start=${start}&end=${end}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/overall/export?start=${start}&end=${end}`
      );
      if (!res.ok) throw new Error("Export imeshindwa");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `SAVCOM_OVERALL_${start}_to_${end}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(false);
    }
  }, [start, end]);

  const analysisNote = useMemo(() => {
    if (!data) return null;
    return buildAnalysisNote(data.summary, start, end);
  }, [data, start, end]);

  const now = useMemo(() => new Date(), []);

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-title">
          <span className="masthead-eyebrow">Elegansky Microfinance · Reconciliation</span>
          <h1>SAVCOM Overall Processor</h1>
          <p className="masthead-sub">
            Inachota miamala moja kwa moja kutoka CRDB (Passed SAV) na NMB
            (Passed SAV NMB) kwa muda uliochaguliwa, na kutengeneza SAVCOM
            OVERALL
          </p>
        </div>
        <div className="masthead-clock">
          <strong>
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </strong>
          <br />
          Dar es Salaam, TZ
        </div>
      </header>

      <section className="control-strip">
        <div className="field-group">
          <label htmlFor="start-date">Kuanzia</label>
          <input
            id="start-date"
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setActiveRange("custom");
            }}
          />
        </div>
        <div className="field-group">
          <label htmlFor="end-date">Hadi</label>
          <input
            id="end-date"
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setActiveRange("custom");
            }}
          />
        </div>
        <div className="field-group">
          <label>Muda wa haraka</label>
          <div className="quick-ranges">
            <button
              className={`quick-range-btn ${activeRange === "today" ? "active" : ""}`}
              onClick={() => setRange("today")}
            >
              Leo
            </button>
            <button
              className={`quick-range-btn ${activeRange === "7d" ? "active" : ""}`}
              onClick={() => setRange("7d")}
            >
              Siku 7
            </button>
            <button
              className={`quick-range-btn ${activeRange === "30d" ? "active" : ""}`}
              onClick={() => setRange("30d")}
            >
              Siku 30
            </button>
            <button
              className={`quick-range-btn ${activeRange === "mtd" ? "active" : ""}`}
              onClick={() => setRange("mtd")}
            >
              Mwezi huu
            </button>
          </div>
        </div>

        <button className="run-btn" onClick={runProcessor} disabled={loading}>
          {loading ? "Inachakata..." : "Pata Overall"}
        </button>
        <button
          className="export-btn"
          onClick={handleExport}
          disabled={!data || exporting}
        >
          {exporting ? "Inapakua..." : "Pakua Excel"}
        </button>
      </section>

      {error && <div className="error-state">Hitilafu: {error}</div>}

      {!data && !loading && !error && (
        <div className="empty-state">
          Chagua muda kisha bonyeza "Pata Overall" kuona miamala kutoka CRDB
          na NMB yakiunganishwa kwenye SAVCOM OVERALL.
        </div>
      )}

      {loading && (
        <div className="loading-state">
          Inasoma CRDB na NMB kutoka Google Sheets
          <span className="dots"></span>
        </div>
      )}

      {data && (
        <>
          <section className="summary-strip">
            <div className="summary-cell">
              <div className="summary-label">Jumla Miamala</div>
              <div className="summary-value">{data.summary.totalRecords}</div>
              <div className="summary-sub">TSh {formatMoney(data.summary.totalAmount)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Kutoka CRDB</div>
              <div className="summary-value pass">{data.summary.fromCrdb}</div>
              <div className="summary-sub">TSh {formatMoney(data.summary.crdbAmount)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Kutoka NMB</div>
              <div className="summary-value" style={{ color: "#7fb3e0" }}>
                {data.summary.fromNmb}
              </div>
              <div className="summary-sub">TSh {formatMoney(data.summary.nmbAmount)}</div>
            </div>
            <div className="summary-cell">
              <div className="summary-label">Muda</div>
              <div className="summary-value" style={{ fontSize: 18 }}>
                {start}
              </div>
              <div className="summary-sub">hadi {end}</div>
            </div>
          </section>

          {analysisNote && (
            <div className="analysis-note">
              <strong>Uchambuzi wa Data</strong>
              {analysisNote}
            </div>
          )}

          <section className="ledger-wrap">
            <div className="ledger-header-row">
              <span>Tarehe</span>
              <span>Amount</span>
              <span>Plate/Phone</span>
              <span>Name</span>
              <span>Refnumber</span>
              <span>Chanzo</span>
            </div>
            <div className="ledger-body">
              {data.results.length === 0 && (
                <div className="empty-state">Hakuna miamala katika muda huu.</div>
              )}
              {data.results.map((r, idx) => {
                const rowClass = r.source === "CRDB" ? "pass" : "fail";
                return (
                  <div
                    className={`ledger-row ${rowClass}`}
                    key={r.refNumber + r.date + idx}
                    title={r.message}
                  >
                    <span className="cell-date">{r.date}</span>
                    <span className="cell-amount">{formatMoney(r.amount)}</span>
                    <span className="cell-user">{r.plateOrPhone}</span>
                    <span className="cell-matched">
                      <span className="name">{r.name}</span>
                      {r.customerId}
                    </span>
                    <span className="cell-ref">{r.refNumber}</span>
                    <span>
                      <span className={`stamp ${rowClass}`}>{r.source}</span>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <footer className="app-footer">
        SAVCOM OVERALL Processor · Live kutoka CRDB (PASSED_SAV) na NMB
        (PASSED_SAV_NMB)
      </footer>
    </div>
  );
}
