import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════════════
   CARS24 INVENTORY COMMAND CENTER v3
   ───────────────────────────────────────────────────────────────────────
   Tab 1 — Stuck Inventory: Google Sheet live mirror with full table
   Tab 2 — Quote Submission: Sales team submits quotes on App IDs
   ═══════════════════════════════════════════════════════════════════════ */

// ── Google Sheets CSV fetcher ────────────────────────────────────────
function extractSheetId(input) {
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input.trim())) return input.trim();
  return null;
}

async function fetchSheetData(url) {
  const id = extractSheetId(url);
  if (!id) throw new Error("Invalid Google Sheet link. Paste the full URL from your browser.");
  const csvUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=0`;
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`;
  const res = await fetch(proxy);
  if (!res.ok) throw new Error(`Failed to fetch (${res.status}). Ensure sheet is shared as "Anyone with the link → Viewer".`);
  const text = await res.text();
  if (text.includes("<!DOCTYPE") || text.includes("<html"))
    throw new Error('Got HTML instead of data. Make sure the sheet sharing is set to "Anyone with the link".');
  const wb = XLSX.read(text, { type: "string" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

// ── Number helpers ───────────────────────────────────────────────────
const toNum = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[₹,\s%]/g, "")) : Number(v);
  return isNaN(n) ? null : n;
};
const INR = (n) => {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`;
  return `${s}₹${a.toLocaleString("en-IN")}`;
};

// ── Key columns for Quote Submission card ────────────────────────────
const QUOTE_DISPLAY_FIELDS = [
  { key: "LEAD_ID", label: "Lead / App ID" },
  { key: "MAKE", label: "Make" },
  { key: "MODEL", label: "Model" },
  { key: "Year", label: "Year" },
  { key: "BUYING_PRICE", label: "Buying Price", format: "inr" },
  { key: "NEW_MSP", label: "MSP (New)", format: "inr" },
  { key: "AGE_BUCKET", label: "Age Bucket" },
  { key: "SALE_CANCEL_DATE", label: "Cancel Date" },
  { key: "PARKING_REGION", label: "Parking Region" },
  { key: "C24", label: "C24 Quote" },
  { key: "Anchor", label: "Anchor", format: "inr" },
  { key: "TP", label: "Target Price", format: "inr" },
  { key: "REGION", label: "Region" },
  { key: "SI_AGE", label: "SI Age" },
  { key: "C2D Flag", label: "C2D Flag" },
  { key: "C2D Price", label: "C2D Price", format: "inr" },
  { key: "Reg No", label: "Reg No" },
  { key: "fuel_type", label: "Fuel Type" },
  { key: "Odometer", label: "Odometer" },
];

// ── Priority columns for Stuck Inventory table ──────────────────────
const SI_PRIORITY_COLS = [
  "LEAD_ID", "REGION", "MAKE", "MODEL", "BUYING_PRICE", "NEW_MSP", "Anchor",
  "TP", "AGE_BUCKET", "SI_AGE", "PARKING_REGION", "SALE_CANCEL_DATE",
  "C24", "C2D Flag", "C2D Price", "Owner", "Auction Stop", "RI Pending",
  "Year", "Odometer", "fuel_type", "AUCTION", "BID_AMOUNT",
  "AUCTION_BIDDING_STATUS",
];

// ═════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("inventory");
  const [sheetUrl, setSheetUrl] = useState("");
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);

  const connectSheet = async () => {
    if (!sheetUrl.trim()) return;
    setLoading(true);
    setError("");
    try {
      const data = await fetchSheetData(sheetUrl);
      if (!data.length) throw new Error("Sheet is empty or headers couldn't be parsed.");
      setRows(data);
      setConnected(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const refresh = () => { if (connected) connectSheet(); };

  return (
    <div style={styles.app}>
      <style>{globalCSS}</style>

      {/* ── HEADER ─────────────────────────────────────────── */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <div style={styles.logoMark}>C24</div>
          <div>
            <div style={styles.logoText}>Inventory Command Center</div>
            <div style={styles.logoSub}>
              {rows ? `${rows.length.toLocaleString()} stuck` : "Not connected"}
            </div>
          </div>
        </div>

        <nav style={styles.tabs}>
          {[
            { id: "inventory", icon: "📋", label: "Stuck Inventory" },
            { id: "quotes", icon: "💰", label: "Quote Submission" },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={tab === t.id ? styles.tabActive : styles.tab}
            >
              <span style={{ marginRight: 6 }}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        {connected && (
          <button onClick={refresh} style={styles.refreshBtn} title="Refresh from Google Sheet">
            🔄 Refresh
          </button>
        )}
      </header>

      {/* ── CONNECT BAR (when not connected) ───────────────── */}
      {!connected && (
        <div style={styles.connectBar}>
          <div style={styles.connectInner}>
            <div style={styles.connectIcon}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={styles.connectTitle}>Connect Stuck Inventory Google Sheet</div>
              <div style={styles.connectDesc}>
                Share your sheet as <strong>"Anyone with the link → Viewer"</strong>, then paste the link below.
              </div>
              <div style={styles.connectRow}>
                <input
                  style={styles.connectInput}
                  placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connectSheet()}
                />
                <button
                  style={styles.connectBtn}
                  onClick={connectSheet}
                  disabled={loading}
                >
                  {loading ? "Connecting..." : "Connect Sheet →"}
                </button>
              </div>
              {error && <div style={styles.connectError}>⚠ {error}</div>}
            </div>
          </div>
        </div>
      )}

      {/* ── CONTENT ─────────────────────────────────────────── */}
      <main style={styles.main}>
        {!rows && connected === false && (
          <div style={styles.empty}>
            <div style={{ fontSize: 56, marginBottom: 16, opacity: 0.4 }}>📊</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No Data Connected</div>
            <div style={{ color: "#8896AB" }}>Paste your Google Sheet link above to get started</div>
          </div>
        )}
        {rows && tab === "inventory" && <InventoryTab rows={rows} />}
        {rows && tab === "quotes" && <QuoteTab rows={rows} />}
      </main>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1 — STUCK INVENTORY (full table mirror)
// ═════════════════════════════════════════════════════════════════════
function InventoryTab({ rows }) {
  const [search, setSearch] = useState("");
  const [regionF, setRegionF] = useState("ALL");
  const [ageF, setAgeF] = useState("ALL");
  const [c2dF, setC2dF] = useState("ALL");
  const [parkF, setParkF] = useState("ALL");
  const [page, setPage] = useState(0);
  const [showAllCols, setShowAllCols] = useState(false);
  const PAGE = 100;

  const allCols = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  const displayCols = useMemo(() => {
    if (showAllCols) return allCols;
    return SI_PRIORITY_COLS.filter((c) => allCols.includes(c));
  }, [allCols, showAllCols]);

  const regions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.REGION).filter(Boolean))].sort(), [rows]);
  const ages = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.AGE_BUCKET).filter(Boolean))], [rows]);
  const parks = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.PARKING_REGION).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    let f = rows;
    if (regionF !== "ALL") f = f.filter((r) => r.REGION === regionF);
    if (ageF !== "ALL") f = f.filter((r) => r.AGE_BUCKET === ageF);
    if (parkF !== "ALL") f = f.filter((r) => r.PARKING_REGION === parkF);
    if (c2dF !== "ALL") f = f.filter((r) => String(r["C2D Flag"]) === c2dF);
    if (search) {
      const s = search.toLowerCase();
      f = f.filter((r) =>
        String(r.LEAD_ID || "").toLowerCase().includes(s) ||
        String(r.MAKE || "").toLowerCase().includes(s) ||
        String(r.MODEL || "").toLowerCase().includes(s) ||
        String(r["Reg No"] || "").toLowerCase().includes(s)
      );
    }
    return f;
  }, [rows, regionF, ageF, parkF, c2dF, search]);

  const paged = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const totalPages = Math.ceil(filtered.length / PAGE);

  const stats = useMemo(() => {
    const n = filtered.length;
    const bp = filtered.reduce((s, r) => s + (toNum(r.BUYING_PRICE) || 0), 0);
    const ri = filtered.filter((r) => String(r["RI Pending"]).toLowerCase() === "yes" || String(r["RI Pending"]) === "1").length;
    const auctStop = filtered.filter((r) => String(r["Auction Stop"]).toLowerCase() === "yes" || String(r["Auction Stop"]) === "1").length;
    const c2d = filtered.filter((r) => String(r["C2D Flag"]) === "1" || String(r["C2D Flag"]).toLowerCase() === "yes").length;
    const regs = new Set(filtered.map((r) => r.REGION).filter(Boolean)).size;
    return { n, bp, ri, auctStop, c2d, regs, avgBp: n ? bp / n : 0 };
  }, [filtered]);

  // Currency columns for right-align + INR formatting
  const inrCols = new Set(["BUYING_PRICE", "NEW_MSP", "Anchor", "TP", "BID_AMOUNT", "C2D Price", "HAB_AMOUNT", "LVB_BID_AMOUNT", "HBTP", "MSP1", "MSP2", "MSP3", "NEW_MSP_old"]);

  return (
    <div>
      {/* ── Metrics Row ──────────────────────────────── */}
      <div style={styles.metricsRow}>
        {[
          { label: "TOTAL CARS", val: stats.n.toLocaleString(), color: "#4F8EF7" },
          { label: "REGIONS", val: stats.regs, color: "#A78BFA" },
          { label: "AVG BUYING PRICE", val: INR(stats.avgBp), color: "#F59E0B" },
          { label: "C2D FLAGGED", val: stats.c2d.toLocaleString(), color: "#10B981" },
          { label: "RI PENDING", val: stats.ri.toLocaleString(), color: "#EF4444" },
          { label: "AUCTION STOP", val: stats.auctStop.toLocaleString(), color: "#F97316" },
        ].map((m) => (
          <div key={m.label} style={styles.metricCard}>
            <div style={{ ...styles.metricVal, color: m.color }}>{m.val}</div>
            <div style={styles.metricLabel}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ──────────────────────────────────── */}
      <div style={styles.filterBar}>
        <input
          style={styles.searchInput}
          placeholder="🔍  Search Lead ID, Make, Model, Reg No..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select style={styles.filterSelect} value={regionF} onChange={(e) => { setRegionF(e.target.value); setPage(0); }}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "📍 All Regions" : r}</option>)}
        </select>
        <select style={styles.filterSelect} value={ageF} onChange={(e) => { setAgeF(e.target.value); setPage(0); }}>
          {ages.map((a) => <option key={a} value={a}>{a === "ALL" ? "📅 All Age Buckets" : a}</option>)}
        </select>
        <select style={styles.filterSelect} value={parkF} onChange={(e) => { setParkF(e.target.value); setPage(0); }}>
          {parks.map((p) => <option key={p} value={p}>{p === "ALL" ? "🅿️ All Parking" : p}</option>)}
        </select>
        <select style={styles.filterSelect} value={c2dF} onChange={(e) => { setC2dF(e.target.value); setPage(0); }}>
          <option value="ALL">🏷️ C2D: All</option>
          <option value="1">C2D: Yes</option>
          <option value="0">C2D: No</option>
        </select>
        <button
          style={styles.colToggle}
          onClick={() => setShowAllCols(!showAllCols)}
        >
          {showAllCols ? `📊 Key Cols (${SI_PRIORITY_COLS.length})` : `📋 All Cols (${allCols.length})`}
        </button>
        <div style={styles.filterCount}>
          {filtered.length.toLocaleString()} of {rows.length.toLocaleString()}
        </div>
      </div>

      {/* ── Data Table ───────────────────────────────── */}
      <div style={styles.tableWrap}>
        <div style={styles.tableScroll}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, position: "sticky", left: 0, zIndex: 3, background: "#131B2E" }}>#</th>
                {displayCols.map((c) => (
                  <th key={c} style={styles.th}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr key={i} className="trow">
                  <td style={{ ...styles.td, position: "sticky", left: 0, zIndex: 1, background: "#0D1321", color: "#64748B", fontSize: 11 }}>
                    {page * PAGE + i + 1}
                  </td>
                  {displayCols.map((c) => {
                    const v = row[c];
                    const isInr = inrCols.has(c);
                    return (
                      <td key={c} style={{ ...styles.td, ...(isInr ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : {}) }}>
                        {c === "LEAD_ID" ? <span style={{ color: "#4F8EF7", fontWeight: 600 }}>{v}</span>
                          : c === "C2D Flag" ? <span style={{ ...styles.badge, background: String(v) === "1" ? "#10B98122" : "#64748B22", color: String(v) === "1" ? "#10B981" : "#64748B" }}>{String(v) === "1" ? "Yes" : v || "—"}</span>
                          : c === "RI Pending" ? <span style={{ color: String(v).toLowerCase() === "yes" || v === "1" ? "#EF4444" : "#94A3B8" }}>{v || "—"}</span>
                          : c === "Auction Stop" ? <span style={{ color: String(v).toLowerCase() === "yes" || v === "1" ? "#F97316" : "#94A3B8" }}>{v || "—"}</span>
                          : isInr ? (INR(toNum(v)))
                          : (String(v || "—"))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={styles.pagination}>
          <button style={styles.pageBtn} onClick={() => setPage(0)} disabled={page === 0}>⟨⟨</button>
          <button style={styles.pageBtn} onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← Prev</button>
          <span style={styles.pageInfo}>
            Page <strong>{page + 1}</strong> of <strong>{totalPages || 1}</strong>
            <span style={{ margin: "0 8px", color: "#475569" }}>|</span>
            Showing {page * PAGE + 1}–{Math.min((page + 1) * PAGE, filtered.length)} of {filtered.length.toLocaleString()}
          </span>
          <button style={styles.pageBtn} onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>Next →</button>
          <button style={styles.pageBtn} onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>⟩⟩</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2 — QUOTE SUBMISSION
// ═════════════════════════════════════════════════════════════════════
function QuoteTab({ rows }) {
  const [appId, setAppId] = useState("");
  const [car, setCar] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [quote, setQuote] = useState({ dealer: "", amount: "", notes: "" });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const lookup = () => {
    const id = appId.trim();
    if (!id) return;
    const found = rows.find(
      (r) => String(r.LEAD_ID || "").trim() === id || String(r.CAR_ID || "").trim() === id
    );
    if (found) { setCar(found); setNotFound(false); setResult(null); }
    else { setCar(null); setNotFound(true); }
  };

  const submit = () => {
    if (!car || !quote.amount) return;
    const bid = toNum(quote.amount);
    const msp = toNum(car.NEW_MSP) || toNum(car.Anchor) || 0;
    const buy = toNum(car.BUYING_PRICE) || 0;
    const pnl = bid - buy;

    let status;
    if (msp && bid >= msp) status = "APPROVED";
    else if (msp && bid >= msp * 0.90) status = "ESCALATED";
    else status = "REJECTED";

    const entry = {
      id: Date.now(),
      appId: car.LEAD_ID,
      make: car.MAKE,
      model: car.MODEL,
      dealer: quote.dealer,
      bid, msp, buy, pnl, status,
      time: new Date().toLocaleString("en-IN"),
    };
    setResult(entry);
    setHistory((h) => [entry, ...h]);
    setQuote({ dealer: "", amount: "", notes: "" });
  };

  const statusColor = { APPROVED: "#10B981", ESCALATED: "#F59E0B", REJECTED: "#EF4444" };
  const statusIcon = { APPROVED: "✅", ESCALATED: "⚠️", REJECTED: "❌" };

  return (
    <div className="quote-layout" style={styles.quoteLayout}>
      {/* ── LEFT: Lookup + Car Card + Submit ─────────── */}
      <div style={styles.quoteLeft}>
        {/* Search */}
        <div style={styles.card}>
          <div style={styles.cardHead}>🔍 Find Car</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input
              style={{ ...styles.input, flex: 1 }}
              placeholder="Enter App ID / Lead ID..."
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
            />
            <button style={styles.primaryBtn} onClick={lookup}>Search</button>
          </div>
          {notFound && (
            <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10 }}>
              ⚠ No car found with ID "{appId}". Check the Lead ID and try again.
            </div>
          )}
        </div>

        {/* Car detail card */}
        {car && (
          <div style={styles.card}>
            <div style={styles.carHeader}>
              <div>
                <div style={styles.carTitle}>{car.MAKE} {car.MODEL}</div>
                <div style={styles.carSub}>
                  {car.Year} • {car.fuel_type || "—"} • {car["Reg No"] || car.Registration_No || "—"}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "#8896AB", textTransform: "uppercase" }}>Lead ID</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#4F8EF7", fontVariantNumeric: "tabular-nums" }}>{car.LEAD_ID}</div>
              </div>
            </div>

            <div style={styles.detailGrid}>
              {QUOTE_DISPLAY_FIELDS.filter((f) => f.key !== "LEAD_ID" && f.key !== "MAKE" && f.key !== "MODEL").map((f) => {
                const raw = car[f.key];
                const val = f.format === "inr" ? INR(toNum(raw)) : (String(raw || "—"));
                const isHighlight = ["BUYING_PRICE", "NEW_MSP", "C24"].includes(f.key);
                return (
                  <div key={f.key} style={styles.detailItem}>
                    <div style={styles.detailLabel}>{f.label}</div>
                    <div style={{
                      ...styles.detailVal,
                      ...(isHighlight ? { color: f.key === "BUYING_PRICE" ? "#F59E0B" : f.key === "NEW_MSP" ? "#10B981" : "#4F8EF7", fontWeight: 700 } : {}),
                    }}>{val}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quote form */}
        {car && (
          <div style={styles.card}>
            <div style={styles.cardHead}>💰 Submit Dealer Quote</div>
            <div style={styles.formGrid}>
              <div>
                <label style={styles.formLabel}>Dealer Name</label>
                <input style={styles.input} placeholder="Enter dealer name" value={quote.dealer} onChange={(e) => setQuote({ ...quote, dealer: e.target.value })} />
              </div>
              <div>
                <label style={styles.formLabel}>Bid Amount (₹)</label>
                <input style={styles.input} placeholder="e.g. 450000" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={styles.formLabel}>Notes (optional)</label>
              <textarea style={{ ...styles.input, minHeight: 56, resize: "vertical" }} placeholder="Any additional details..." value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
            </div>
            <button style={{ ...styles.primaryBtn, width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15 }} onClick={submit}>
              Submit Quote →
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT: Result + History ──────────────────── */}
      <div style={styles.quoteRight}>
        {/* Latest result */}
        {result && (
          <div style={{
            ...styles.card,
            background: `${statusColor[result.status]}08`,
            border: `2px solid ${statusColor[result.status]}55`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 52, marginBottom: 4 }}>{statusIcon[result.status]}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: statusColor[result.status], letterSpacing: "2px" }}>
              {result.status}
            </div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 24, color: "#94A3B8", fontSize: 13 }}>
              <div>Bid: <strong style={{ color: "#F1F5F9" }}>{INR(result.bid)}</strong></div>
              <div>MSP: <strong style={{ color: "#F1F5F9" }}>{INR(result.msp)}</strong></div>
              <div>P&L: <strong style={{ color: result.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(result.pnl)}</strong></div>
            </div>
            <div style={{ color: "#64748B", fontSize: 12, marginTop: 8 }}>
              {result.make} {result.model} — {result.dealer} — {result.time}
            </div>
          </div>
        )}

        {/* Quote history */}
        <div style={styles.card}>
          <div style={styles.cardHead}>📋 Quote History ({history.length})</div>
          {!history.length ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#64748B" }}>
              No quotes submitted yet. Search for a car and submit a quote.
            </div>
          ) : (
            <div style={{ maxHeight: 500, overflowY: "auto" }}>
              {history.map((h) => (
                <div key={h.id} style={styles.historyRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>
                      {h.make} {h.model}
                      <span style={{ color: "#64748B", fontWeight: 400, marginLeft: 8, fontSize: 12 }}>#{h.appId}</span>
                    </div>
                    <div style={{ color: "#8896AB", fontSize: 12, marginTop: 2 }}>
                      {h.dealer} • {h.time}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{
                      ...styles.badge,
                      background: `${statusColor[h.status]}22`,
                      color: statusColor[h.status],
                      border: `1px solid ${statusColor[h.status]}44`,
                    }}>{h.status}</span>
                    <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 4 }}>
                      Bid: {INR(h.bid)} | P&L: <span style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  STYLES
// ═════════════════════════════════════════════════════════════════════
const styles = {
  app: {
    background: "#080C18",
    color: "#E2E8F0",
    minHeight: "100vh",
    fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
    fontSize: 14,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 28px",
    height: 64,
    background: "linear-gradient(180deg, #0D1321 0%, #0B0F1A 100%)",
    borderBottom: "1px solid #1A2236",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  headerLeft: { display: "flex", alignItems: "center", gap: 14 },
  logoMark: {
    width: 38, height: 38, borderRadius: 10,
    background: "linear-gradient(135deg, #F59E0B, #EF4444)",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontWeight: 900, fontSize: 14, color: "#fff", letterSpacing: "-0.5px",
  },
  logoText: { fontSize: 17, fontWeight: 800, color: "#F1F5F9", letterSpacing: "-0.3px" },
  logoSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  tabs: { display: "flex", gap: 4 },
  tab: {
    padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: 600, fontSize: 13, color: "#8896AB", background: "transparent",
    transition: "all 0.2s", fontFamily: "inherit",
  },
  tabActive: {
    padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 13, color: "#fff", background: "#1E293B",
    boxShadow: "0 0 0 1px #334155", fontFamily: "inherit",
  },
  refreshBtn: {
    padding: "7px 14px", borderRadius: 8, border: "1px solid #1E293B",
    background: "#0D1321", color: "#94A3B8", cursor: "pointer", fontSize: 13,
    fontFamily: "inherit", fontWeight: 600,
  },
  connectBar: { background: "#0D1321", borderBottom: "1px solid #1A2236", padding: "20px 28px" },
  connectInner: { display: "flex", gap: 20, alignItems: "flex-start", maxWidth: 900 },
  connectIcon: { fontSize: 36, marginTop: 4 },
  connectTitle: { fontSize: 17, fontWeight: 800, marginBottom: 4 },
  connectDesc: { fontSize: 13, color: "#8896AB", marginBottom: 12 },
  connectRow: { display: "flex", gap: 10 },
  connectInput: {
    flex: 1, padding: "11px 16px", borderRadius: 8, border: "1px solid #1E293B",
    background: "#131B2E", color: "#E2E8F0", fontSize: 14, outline: "none",
    fontFamily: "inherit", minWidth: 300,
  },
  connectBtn: {
    padding: "11px 24px", borderRadius: 8, border: "none", background: "#4F8EF7",
    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
    fontFamily: "inherit", whiteSpace: "nowrap",
  },
  connectError: { color: "#EF4444", fontSize: 13, marginTop: 8 },
  main: { padding: "20px 28px" },
  empty: { textAlign: "center", padding: "80px 0" },
  metricsRow: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 16 },
  metricCard: {
    background: "#0D1321", border: "1px solid #1A2236", borderRadius: 10,
    padding: "16px 14px", textAlign: "center",
  },
  metricVal: { fontSize: 22, fontWeight: 900, letterSpacing: "-1px", fontVariantNumeric: "tabular-nums" },
  metricLabel: { fontSize: 10, color: "#64748B", marginTop: 4, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 },
  filterBar: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" },
  searchInput: {
    padding: "9px 14px", borderRadius: 8, border: "1px solid #1E293B",
    background: "#131B2E", color: "#E2E8F0", fontSize: 13, outline: "none",
    width: 280, fontFamily: "inherit",
  },
  filterSelect: {
    padding: "9px 12px", borderRadius: 8, border: "1px solid #1E293B",
    background: "#131B2E", color: "#C8D1E0", fontSize: 13, outline: "none",
    fontFamily: "inherit", cursor: "pointer",
  },
  colToggle: {
    padding: "8px 14px", borderRadius: 8, border: "1px solid #334155",
    background: "#1A2236", color: "#94A3B8", fontSize: 12, cursor: "pointer",
    fontWeight: 600, fontFamily: "inherit",
  },
  filterCount: { marginLeft: "auto", color: "#64748B", fontSize: 13, fontVariantNumeric: "tabular-nums" },
  tableWrap: { background: "#0D1321", border: "1px solid #1A2236", borderRadius: 12, overflow: "hidden" },
  tableScroll: { overflowX: "auto", maxHeight: "calc(100vh - 340px)", overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: {
    padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#8896AB",
    borderBottom: "1px solid #1A2236", fontSize: 11, textTransform: "uppercase",
    letterSpacing: "0.5px", whiteSpace: "nowrap", position: "sticky", top: 0,
    background: "#131B2E", zIndex: 2,
  },
  td: {
    padding: "9px 14px", borderBottom: "1px solid #1A223610",
    whiteSpace: "nowrap", color: "#C8D1E0", fontSize: 13,
  },
  badge: {
    display: "inline-block", padding: "2px 10px", borderRadius: 20,
    fontSize: 11, fontWeight: 700,
  },
  pagination: {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    padding: "12px 16px", borderTop: "1px solid #1A2236",
  },
  pageBtn: {
    padding: "6px 14px", borderRadius: 6, border: "1px solid #1E293B",
    background: "#131B2E", color: "#94A3B8", fontSize: 13, cursor: "pointer",
    fontWeight: 600, fontFamily: "inherit",
  },
  pageInfo: { color: "#64748B", fontSize: 13, margin: "0 8px" },
  quoteLayout: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" },
  quoteLeft: { display: "flex", flexDirection: "column", gap: 16 },
  quoteRight: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#0D1321", border: "1px solid #1A2236", borderRadius: 12, padding: 20 },
  cardHead: { fontSize: 16, fontWeight: 800, marginBottom: 14, color: "#F1F5F9" },
  carHeader: {
    display: "flex", justifyContent: "space-between", alignItems: "flex-start",
    marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #1A2236",
  },
  carTitle: { fontSize: 22, fontWeight: 900, color: "#F1F5F9", letterSpacing: "-0.5px" },
  carSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  detailGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" },
  detailItem: {},
  detailLabel: { fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 2 },
  detailVal: { fontSize: 14, color: "#C8D1E0", fontVariantNumeric: "tabular-nums" },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  formLabel: { fontSize: 11, color: "#8896AB", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600, marginBottom: 4, display: "block" },
  input: {
    padding: "11px 14px", borderRadius: 8, border: "1px solid #1E293B",
    background: "#131B2E", color: "#E2E8F0", fontSize: 14, outline: "none",
    width: "100%", boxSizing: "border-box", fontFamily: "inherit",
  },
  primaryBtn: {
    padding: "11px 24px", borderRadius: 8, border: "none", background: "#4F8EF7",
    color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit",
  },
  historyRow: {
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "12px 0", borderBottom: "1px solid #1A223620",
  },
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,500;0,9..40,700;0,9..40,900&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #080C18; }
  .trow:hover td { background: #131B2E !important; }
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: #0B0F1A; }
  ::-webkit-scrollbar-thumb { background: #2D3B55; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #3E5070; }
  button:hover { opacity: 0.88; }
  button:active { transform: scale(0.97); }
  input:focus, textarea:focus, select:focus { border-color: #4F8EF7 !important; box-shadow: 0 0 0 2px #4F8EF720; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  @media (max-width: 1100px) {
    .quote-layout { grid-template-columns: 1fr !important; }
  }
`;
