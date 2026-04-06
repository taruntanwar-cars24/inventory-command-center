import React, { useState, useMemo } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════════════
   CARS24 INVENTORY COMMAND CENTER v4
   ───────────────────────────────────────────────────────────────────────
   Data: Stuck Inventory Excel upload (drag-drop or browse)
   Tab 1 — Stuck Inventory: full table with filters, search, metrics
   Tab 2 — Quote Submission: sales team submits dealer quotes
   ═══════════════════════════════════════════════════════════════════════ */

// ── Number helpers ───────────────────────────────────────────────────
const toNum = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[₹,\s%]/g, "")) : Number(v);
  return isNaN(n) ? null : n;
};
const INR = (n) => {
  if (n == null || isNaN(n)) return "\u2014";
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}\u20B9${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}\u20B9${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}\u20B9${(a / 1e3).toFixed(1)} K`;
  return `${s}\u20B9${a.toLocaleString("en-IN")}`;
};

// ── Key columns for Quote Submission card ────────────────────────────
const QUOTE_FIELDS = [
  { key: "Year", label: "Year" },
  { key: "BUYING_PRICE", label: "Buying Price", fmt: "inr" },
  { key: "NEW_MSP", label: "MSP (New)", fmt: "inr" },
  { key: "AGE_BUCKET", label: "Age Bucket" },
  { key: "SALE_CANCEL_DATE", label: "Cancel Date" },
  { key: "PARKING_REGION", label: "Parking Region" },
  { key: "C24", label: "C24 Quote" },
  { key: "Anchor", label: "Anchor", fmt: "inr" },
  { key: "TP", label: "Target Price", fmt: "inr" },
  { key: "REGION", label: "Region" },
  { key: "SI_AGE", label: "SI Age" },
  { key: "C2D Flag", label: "C2D Flag" },
  { key: "C2D Price", label: "C2D Price", fmt: "inr" },
  { key: "Reg No", label: "Reg No" },
  { key: "fuel_type", label: "Fuel Type" },
  { key: "Odometer", label: "Odometer" },
];

// ── Priority columns for the table ──────────────────────────────────
const KEY_COLS = [
  "LEAD_ID", "REGION", "MAKE", "MODEL", "BUYING_PRICE", "NEW_MSP", "Anchor",
  "TP", "AGE_BUCKET", "SI_AGE", "PARKING_REGION", "SALE_CANCEL_DATE",
  "C24", "C2D Flag", "C2D Price", "Auction Stop", "RI Pending",
  "Year", "Odometer", "fuel_type", "AUCTION", "BID_AMOUNT",
  "AUCTION_BIDDING_STATUS",
];

const INR_COLS = new Set([
  "BUYING_PRICE", "NEW_MSP", "Anchor", "TP", "BID_AMOUNT", "C2D Price",
  "HAB_AMOUNT", "LVB_BID_AMOUNT", "HBTP", "MSP1", "MSP2", "MSP3", "NEW_MSP_old",
]);

// ═════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("inventory");
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // ── File handler ───────────────────────────────────────
  const handleFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { defval: "" });
        if (!data.length) { alert("File appears empty."); return; }
        setRows(data);
      } catch (err) {
        alert("Error reading file: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer?.files?.[0]);
  };

  const browse = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".xlsx,.xls,.csv";
    inp.onchange = (e) => handleFile(e.target.files?.[0]);
    inp.click();
  };

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* ─── HEADER ────────────────────────────────────── */}
      <header style={S.header}>
        <div style={S.hLeft}>
          <div style={S.logo}>C24</div>
          <div>
            <div style={S.logoTitle}>Inventory Command Center</div>
            <div style={S.logoSub}>{rows ? `${rows.length.toLocaleString()} stuck` : "No file loaded"}</div>
          </div>
        </div>
        <nav style={S.nav}>
          {[
            { id: "inventory", icon: "\uD83D\uDCCB", label: "Stuck Inventory" },
            { id: "quotes", icon: "\uD83D\uDCB0", label: "Quote Submission" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.navActive : S.navBtn}>
              {t.icon} {t.label}
            </button>
          ))}
        </nav>
        {rows && (
          <div style={S.fileBadge}>
            <span style={{ color: "#10B981", marginRight: 6 }}>\u2713</span>
            {fileName}
            <button onClick={() => { setRows(null); setFileName(""); }} style={S.removeBtn}>\u2715</button>
          </div>
        )}
      </header>

      {/* ─── UPLOAD AREA (when no data) ────────────────── */}
      {!rows && (
        <div style={S.uploadWrap}>
          <div
            style={{ ...S.dropzone, ...(dragOver ? S.dropzoneHover : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={browse}
          >
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>{dragOver ? "\uD83D\uDCE5" : "\uD83D\uDCC2"}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
              {dragOver ? "Drop it here!" : "Upload Stuck Inventory"}
            </div>
            <div style={{ color: "#8896AB", fontSize: 14, marginBottom: 16 }}>
              Drag & drop your .xlsx / .csv file, or click to browse
            </div>
            <div style={S.uploadBtn}>Choose File</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 16 }}>
              Data stays in your browser \u2014 nothing is uploaded to any server
            </div>
          </div>
        </div>
      )}

      {/* ─── CONTENT ───────────────────────────────────── */}
      {rows && (
        <main style={S.main}>
          {tab === "inventory" && <InventoryTab rows={rows} />}
          {tab === "quotes" && <QuoteTab rows={rows} />}
        </main>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1 \u2014 STUCK INVENTORY
// ═════════════════════════════════════════════════════════════════════
function InventoryTab({ rows }) {
  const [search, setSearch] = useState("");
  const [regionF, setRegionF] = useState("ALL");
  const [ageF, setAgeF] = useState("ALL");
  const [parkF, setParkF] = useState("ALL");
  const [c2dF, setC2dF] = useState("ALL");
  const [page, setPage] = useState(0);
  const [allCols, setAllCols] = useState(false);
  const PG = 100;

  const cols = useMemo(() => (rows.length ? Object.keys(rows[0]) : []), [rows]);
  const visCols = useMemo(() => allCols ? cols : KEY_COLS.filter((c) => cols.includes(c)), [cols, allCols]);

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

  const paged = filtered.slice(page * PG, (page + 1) * PG);
  const tp = Math.ceil(filtered.length / PG);

  const stats = useMemo(() => {
    const n = filtered.length;
    const bp = filtered.reduce((s, r) => s + (toNum(r.BUYING_PRICE) || 0), 0);
    const ri = filtered.filter((r) => ["yes", "1", "true"].includes(String(r["RI Pending"]).toLowerCase())).length;
    const ast = filtered.filter((r) => ["yes", "1", "true"].includes(String(r["Auction Stop"]).toLowerCase())).length;
    const c2d = filtered.filter((r) => ["yes", "1", "true"].includes(String(r["C2D Flag"]).toLowerCase())).length;
    const regs = new Set(filtered.map((r) => r.REGION).filter(Boolean)).size;
    return { n, bp, ri, ast, c2d, regs, avg: n ? bp / n : 0 };
  }, [filtered]);

  return (
    <div>
      {/* Metrics */}
      <div style={S.metrics}>
        {[
          { l: "TOTAL CARS", v: stats.n.toLocaleString(), c: "#4F8EF7" },
          { l: "REGIONS", v: stats.regs, c: "#A78BFA" },
          { l: "AVG BUYING PRICE", v: INR(stats.avg), c: "#F59E0B" },
          { l: "C2D FLAGGED", v: stats.c2d.toLocaleString(), c: "#10B981" },
          { l: "RI PENDING", v: stats.ri.toLocaleString(), c: "#EF4444" },
          { l: "AUCTION STOP", v: stats.ast.toLocaleString(), c: "#F97316" },
        ].map((m) => (
          <div key={m.l} style={S.mCard}>
            <div style={{ fontSize: 22, fontWeight: 900, color: m.c, letterSpacing: "-1px" }}>{m.v}</div>
            <div style={S.mLabel}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input style={S.searchBox} placeholder="\uD83D\uDD0D  Search Lead ID, Make, Model, Reg No..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select style={S.sel} value={regionF} onChange={(e) => { setRegionF(e.target.value); setPage(0); }}>
          {regions.map((r) => <option key={r}>{r === "ALL" ? "\uD83D\uDCCD All Regions" : r}</option>)}
        </select>
        <select style={S.sel} value={ageF} onChange={(e) => { setAgeF(e.target.value); setPage(0); }}>
          {ages.map((a) => <option key={a}>{a === "ALL" ? "\uD83D\uDCC5 All Age Buckets" : a}</option>)}
        </select>
        <select style={S.sel} value={parkF} onChange={(e) => { setParkF(e.target.value); setPage(0); }}>
          {parks.map((p) => <option key={p}>{p === "ALL" ? "\uD83C\uDD7F\uFE0F All Parking" : p}</option>)}
        </select>
        <select style={S.sel} value={c2dF} onChange={(e) => { setC2dF(e.target.value); setPage(0); }}>
          <option value="ALL">{"\uD83C\uDFF7\uFE0F"} C2D: All</option>
          <option value="1">C2D: Yes</option>
          <option value="0">C2D: No</option>
        </select>
        <button style={S.colBtn} onClick={() => setAllCols(!allCols)}>
          {allCols ? `\uD83D\uDCCA Key (${KEY_COLS.length})` : `\uD83D\uDCCB All (${cols.length})`}
        </button>
        <span style={S.fCount}>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()}</span>
      </div>

      {/* Table */}
      <div style={S.tWrap}>
        <div style={S.tScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, position: "sticky", left: 0, zIndex: 3, background: "#131B2E", width: 44 }}>#</th>
                {visCols.map((c) => <th key={c} style={S.th}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr key={i} className="tr">
                  <td style={{ ...S.td, position: "sticky", left: 0, background: "#0D1321", color: "#475569", fontSize: 11, zIndex: 1 }}>{page * PG + i + 1}</td>
                  {visCols.map((c) => {
                    const v = row[c];
                    const money = INR_COLS.has(c);
                    return (
                      <td key={c} style={{ ...S.td, ...(money ? { textAlign: "right", fontVariantNumeric: "tabular-nums" } : {}) }}>
                        {c === "LEAD_ID" ? <span style={{ color: "#4F8EF7", fontWeight: 600 }}>{v}</span>
                        : c === "C2D Flag" ? <span className={String(v) === "1" ? "badge-g" : "badge-d"}>{String(v) === "1" ? "Yes" : v || "\u2014"}</span>
                        : c === "RI Pending" ? <span style={{ color: ["yes","1","true"].includes(String(v).toLowerCase()) ? "#EF4444" : "#64748B" }}>{v || "\u2014"}</span>
                        : c === "Auction Stop" ? <span style={{ color: ["yes","1","true"].includes(String(v).toLowerCase()) ? "#F97316" : "#64748B" }}>{v || "\u2014"}</span>
                        : money ? INR(toNum(v))
                        : String(v || "\u2014")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={S.pag}>
          <button style={S.pgBtn} disabled={page === 0} onClick={() => setPage(0)}>{"\u27E8\u27E8"}</button>
          <button style={S.pgBtn} disabled={page === 0} onClick={() => setPage(page - 1)}>{"\u2190"} Prev</button>
          <span style={S.pgInfo}>Page <b>{page + 1}</b> of <b>{tp || 1}</b> <span style={{ color: "#334155" }}>|</span> {page * PG + 1}\u2013{Math.min((page + 1) * PG, filtered.length)} of {filtered.length.toLocaleString()}</span>
          <button style={S.pgBtn} disabled={page >= tp - 1} onClick={() => setPage(page + 1)}>Next {"\u2192"}</button>
          <button style={S.pgBtn} disabled={page >= tp - 1} onClick={() => setPage(tp - 1)}>{"\u27E9\u27E9"}</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2 \u2014 QUOTE SUBMISSION
// ═════════════════════════════════════════════════════════════════════
function QuoteTab({ rows }) {
  const [appId, setAppId] = useState("");
  const [car, setCar] = useState(null);
  const [miss, setMiss] = useState(false);
  const [q, setQ] = useState({ dealer: "", amt: "", notes: "" });
  const [res, setRes] = useState(null);
  const [hist, setHist] = useState([]);

  const find = () => {
    const id = appId.trim();
    if (!id) return;
    const f = rows.find((r) => String(r.LEAD_ID || "").trim() === id || String(r.CAR_ID || "").trim() === id);
    if (f) { setCar(f); setMiss(false); setRes(null); }
    else { setCar(null); setMiss(true); }
  };

  const submit = () => {
    if (!car || !q.amt) return;
    const bid = toNum(q.amt);
    const msp = toNum(car.NEW_MSP) || toNum(car.Anchor) || 0;
    const buy = toNum(car.BUYING_PRICE) || 0;
    const pnl = bid - buy;
    let st;
    if (msp && bid >= msp) st = "APPROVED";
    else if (msp && bid >= msp * 0.9) st = "ESCALATED";
    else st = "REJECTED";
    const e = { id: Date.now(), appId: car.LEAD_ID, make: car.MAKE, model: car.MODEL, dealer: q.dealer, bid, msp, buy, pnl, st, time: new Date().toLocaleString("en-IN") };
    setRes(e);
    setHist((h) => [e, ...h]);
    setQ({ dealer: "", amt: "", notes: "" });
  };

  const stCol = { APPROVED: "#10B981", ESCALATED: "#F59E0B", REJECTED: "#EF4444" };
  const stIco = { APPROVED: "\u2705", ESCALATED: "\u26A0\uFE0F", REJECTED: "\u274C" };

  return (
    <div className="ql" style={S.ql}>
      {/* LEFT */}
      <div style={S.qlL}>
        <div style={S.card}>
          <div style={S.cHead}>{"\uD83D\uDD0D"} Find Car</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input style={{ ...S.inp, flex: 1 }} placeholder="Enter Lead ID / App ID..." value={appId} onChange={(e) => setAppId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
            <button style={S.pri} onClick={find}>Search</button>
          </div>
          {miss && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10 }}>{"\u26A0"} No car found with ID "{appId}"</div>}
        </div>

        {car && (
          <div style={S.card}>
            <div style={S.carTop}>
              <div>
                <div style={S.carName}>{car.MAKE} {car.MODEL}</div>
                <div style={S.carSub}>{car.Year} {"\u2022"} {car.fuel_type || "\u2014"} {"\u2022"} {car["Reg No"] || car.Registration_No || "\u2014"}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>Lead ID</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#4F8EF7" }}>{car.LEAD_ID}</div>
              </div>
            </div>
            <div style={S.dGrid}>
              {QUOTE_FIELDS.map((f) => {
                const raw = car[f.key];
                const val = f.fmt === "inr" ? INR(toNum(raw)) : String(raw || "\u2014");
                const hl = { BUYING_PRICE: "#F59E0B", NEW_MSP: "#10B981", C24: "#4F8EF7" }[f.key];
                return (
                  <div key={f.key} style={S.dItem}>
                    <div style={S.dLabel}>{f.label}</div>
                    <div style={{ ...S.dVal, ...(hl ? { color: hl, fontWeight: 700 } : {}) }}>{val}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {car && (
          <div style={S.card}>
            <div style={S.cHead}>{"\uD83D\uDCB0"} Submit Dealer Quote</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={S.fLabel}>Dealer Name</label>
                <input style={S.inp} placeholder="Dealer name" value={q.dealer} onChange={(e) => setQ({ ...q, dealer: e.target.value })} />
              </div>
              <div>
                <label style={S.fLabel}>Bid Amount ({"\u20B9"})</label>
                <input style={S.inp} placeholder="e.g. 450000" value={q.amt} onChange={(e) => setQ({ ...q, amt: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={S.fLabel}>Notes (optional)</label>
              <textarea style={{ ...S.inp, minHeight: 50, resize: "vertical" }} placeholder="Additional notes..." value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} />
            </div>
            <button style={{ ...S.pri, width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15 }} onClick={submit}>Submit Quote {"\u2192"}</button>
          </div>
        )}
      </div>

      {/* RIGHT */}
      <div style={S.qlR}>
        {res && (
          <div style={{ ...S.card, background: `${stCol[res.st]}08`, border: `2px solid ${stCol[res.st]}55`, textAlign: "center" }}>
            <div style={{ fontSize: 50, marginBottom: 4 }}>{stIco[res.st]}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: stCol[res.st], letterSpacing: "2px" }}>{res.st}</div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20, color: "#94A3B8", fontSize: 13 }}>
              <span>Bid: <b style={{ color: "#E2E8F0" }}>{INR(res.bid)}</b></span>
              <span>MSP: <b style={{ color: "#E2E8F0" }}>{INR(res.msp)}</b></span>
              <span>P&L: <b style={{ color: res.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(res.pnl)}</b></span>
            </div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 8 }}>{res.make} {res.model} {"\u2014"} {res.dealer} {"\u2014"} {res.time}</div>
          </div>
        )}

        <div style={S.card}>
          <div style={S.cHead}>{"\uD83D\uDCCB"} Quote History ({hist.length})</div>
          {!hist.length ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#475569" }}>No quotes yet</div>
          ) : (
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {hist.map((h) => (
                <div key={h.id} style={S.hRow}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{h.make} {h.model} <span style={{ color: "#475569", fontWeight: 400, fontSize: 12 }}>#{h.appId}</span></div>
                    <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{h.dealer} {"\u2022"} {h.time}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.st]}22`, color: stCol[h.st], border: `1px solid ${stCol[h.st]}44` }}>{h.st}</span>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Bid: {INR(h.bid)} | P&L: <span style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</span></div>
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
const S = {
  app: { background: "#080C18", color: "#E2E8F0", minHeight: "100vh", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", fontSize: 14 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: 64, background: "linear-gradient(180deg,#0D1321,#0B0F1A)", borderBottom: "1px solid #1A2236", position: "sticky", top: 0, zIndex: 50 },
  hLeft: { display: "flex", alignItems: "center", gap: 14 },
  logo: { width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#F59E0B,#EF4444)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, color: "#fff" },
  logoTitle: { fontSize: 17, fontWeight: 800, color: "#F1F5F9" },
  logoSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  nav: { display: "flex", gap: 4 },
  navBtn: { padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#8896AB", background: "transparent", fontFamily: "inherit" },
  navActive: { padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#fff", background: "#1E293B", boxShadow: "0 0 0 1px #334155", fontFamily: "inherit" },
  fileBadge: { padding: "6px 14px", borderRadius: 8, background: "#10B98112", border: "1px solid #10B98133", color: "#10B981", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  removeBtn: { background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: "0 4px", fontFamily: "inherit" },

  // Upload
  uploadWrap: { display: "flex", justifyContent: "center", padding: "60px 28px" },
  dropzone: { width: 540, padding: "48px 32px", border: "2px dashed #1E293B", borderRadius: 16, textAlign: "center", cursor: "pointer", transition: "all .3s", background: "#0D1321" },
  dropzoneHover: { borderColor: "#4F8EF7", background: "#4F8EF710" },
  uploadBtn: { display: "inline-block", padding: "10px 28px", borderRadius: 8, background: "#4F8EF7", color: "#fff", fontWeight: 700, fontSize: 14 },

  // Main
  main: { padding: "20px 28px" },

  // Metrics
  metrics: { display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 16 },
  mCard: { background: "#0D1321", border: "1px solid #1A2236", borderRadius: 10, padding: "16px 14px", textAlign: "center" },
  mLabel: { fontSize: 10, color: "#64748B", marginTop: 4, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 },

  // Filters
  filters: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" },
  searchBox: { padding: "9px 14px", borderRadius: 8, border: "1px solid #1E293B", background: "#131B2E", color: "#E2E8F0", fontSize: 13, outline: "none", width: 280, fontFamily: "inherit" },
  sel: { padding: "9px 12px", borderRadius: 8, border: "1px solid #1E293B", background: "#131B2E", color: "#C8D1E0", fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" },
  colBtn: { padding: "8px 14px", borderRadius: 8, border: "1px solid #334155", background: "#1A2236", color: "#94A3B8", fontSize: 12, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" },
  fCount: { marginLeft: "auto", color: "#64748B", fontSize: 13 },

  // Table
  tWrap: { background: "#0D1321", border: "1px solid #1A2236", borderRadius: 12, overflow: "hidden" },
  tScroll: { overflowX: "auto", maxHeight: "calc(100vh - 340px)", overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#8896AB", borderBottom: "1px solid #1A2236", fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#131B2E", zIndex: 2 },
  td: { padding: "9px 14px", borderBottom: "1px solid #1A223610", whiteSpace: "nowrap", color: "#C8D1E0", fontSize: 13 },

  // Pagination
  pag: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "12px 16px", borderTop: "1px solid #1A2236" },
  pgBtn: { padding: "6px 14px", borderRadius: 6, border: "1px solid #1E293B", background: "#131B2E", color: "#94A3B8", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" },
  pgInfo: { color: "#64748B", fontSize: 13, margin: "0 8px" },

  // Quote
  ql: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" },
  qlL: { display: "flex", flexDirection: "column", gap: 16 },
  qlR: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#0D1321", border: "1px solid #1A2236", borderRadius: 12, padding: 20 },
  cHead: { fontSize: 16, fontWeight: 800, marginBottom: 14, color: "#F1F5F9" },
  carTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #1A2236" },
  carName: { fontSize: 22, fontWeight: 900, color: "#F1F5F9", letterSpacing: "-.5px" },
  carSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  dGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" },
  dItem: {},
  dLabel: { fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600, marginBottom: 2 },
  dVal: { fontSize: 14, color: "#C8D1E0", fontVariantNumeric: "tabular-nums" },
  fLabel: { fontSize: 11, color: "#8896AB", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600, marginBottom: 4, display: "block" },
  inp: { padding: "11px 14px", borderRadius: 8, border: "1px solid #1E293B", background: "#131B2E", color: "#E2E8F0", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  pri: { padding: "11px 24px", borderRadius: 8, border: "none", background: "#4F8EF7", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  hRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #1A223620" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:#080C18}
  .tr:hover td{background:#131B2E!important}
  .badge-g{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#10B98122;color:#10B981}
  .badge-d{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#64748B22;color:#64748B}
  ::-webkit-scrollbar{width:6px;height:6px}
  ::-webkit-scrollbar-track{background:#0B0F1A}
  ::-webkit-scrollbar-thumb{background:#2D3B55;border-radius:3px}
  ::-webkit-scrollbar-thumb:hover{background:#3E5070}
  button:hover{opacity:.88}
  button:active{transform:scale(.97)}
  input:focus,textarea:focus,select:focus{border-color:#4F8EF7!important;box-shadow:0 0 0 2px #4F8EF720}
  button:disabled{opacity:.4;cursor:not-allowed}
  @media(max-width:1100px){.ql{grid-template-columns:1fr!important}}
`;
