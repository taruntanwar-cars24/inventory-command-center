import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════════════
   CARS24 INVENTORY COMMAND CENTER v6 — LIGHT THEME
   ───────────────────────────────────────────────────────────────────────
   Tabs:
     1. Stuck Inventory  — compact table (App ID, Make/Model, Year, SI Bucket, Buying Price)
                           click App ID → full details modal
     2. Quote Submission — submit quote, auto-approve logic, escalation, Start Auction button
     3. Quote History    — filterable log of all quotes (member, date, bucket, region)
     4. P&L Management — Inventory/Sold, SBND, SMC, P&L Hit waterfall
     5. Auction Console  — run bulk auctions by filter (anchor, bucket, SMC, stop, region, C2D/C2B)
     6. Settings         — Slack + Google Sheet
   ═══════════════════════════════════════════════════════════════════════ */

// ── Helpers ──────────────────────────────────────────────────────────
const toNum = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[₹,\s%]/g, "")) : Number(v);
  return isNaN(n) ? null : n;
};
const INR = (n) => {
  if (n == null || isNaN(n)) return "—";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}₹${(a / 1e3).toFixed(1)} K`;
  return `${s}₹${a.toLocaleString("en-IN")}`;
};
const truthy = (v) => ["yes", "1", "true"].includes(String(v).toLowerCase());

// Sort SI buckets by their leading number so "0-30" < "30-60" < "180+"
const sortBuckets = (arr) => [...arr].sort((a, b) => {
  const na = parseInt(String(a).match(/\d+/)?.[0] || "0", 10);
  const nb = parseInt(String(b).match(/\d+/)?.[0] || "0", 10);
  return na - nb;
});

// ── Approval Logic ───────────────────────────────────────────────────
function evaluateQuote(bid, buyingPrice, ageBucket) {
  const pnl = bid - buyingPrice;
  const lossPct = buyingPrice ? (pnl / buyingPrice) * 100 : 0;
  const bucket = String(ageBucket || "").trim().toLowerCase();

  if (bucket.includes("0-30")) {
    if (pnl >= -7000) return { status: "AUTO_APPROVED", reason: `Loss ₹${Math.abs(pnl).toLocaleString("en-IN")} within ₹7,000 limit for 0-30 days` };
    return { status: "REJECTED", reason: `Loss ₹${Math.abs(pnl).toLocaleString("en-IN")} exceeds ₹7,000 max for 0-30 days` };
  }
  if (bucket.includes("30-60")) {
    if (pnl >= -2500) return { status: "AUTO_APPROVED", reason: `Loss ₹${Math.abs(pnl).toLocaleString("en-IN")} within ₹2,500 limit for 30-60 days` };
    return { status: "REJECTED", reason: `Loss ₹${Math.abs(pnl).toLocaleString("en-IN")} exceeds ₹2,500 max for 30-60 days` };
  }
  if (bucket.includes("60-90")) {
    if (lossPct >= -20) return { status: "AUTO_APPROVED", reason: `Loss ${lossPct.toFixed(1)}% within -20% limit for 60-90 days` };
    return { status: "REJECTED", reason: `Loss ${lossPct.toFixed(1)}% exceeds -20% max for 60-90 days` };
  }
  return { status: "REJECTED", reason: `Bucket "${ageBucket}" requires manual review` };
}

// ── Slack + Sheet (no-cors to avoid preflight) ───────────────────────
async function sendSlackMessage(webhookUrl, message) {
  if (!webhookUrl) return { ok: false, error: "No Slack webhook configured" };
  try {
    const formData = new FormData();
    formData.append("payload", JSON.stringify({ text: message }));
    await fetch(webhookUrl, { method: "POST", mode: "no-cors", body: formData });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function appendToSheet(sheetWebhookUrl, rowData) {
  if (!sheetWebhookUrl) return { ok: false, error: "No sheet webhook configured" };
  try {
    await fetch(sheetWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rowData),
      mode: "no-cors",
    });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// ── Constants ────────────────────────────────────────────────────────
const INVENTORY_COLS = [
  { key: "LEAD_ID", label: "App ID", clickable: true },
  { key: "MAKE_MODEL", label: "Make / Model" },
  { key: "Year", label: "Year" },
  { key: "AGE_BUCKET", label: "SI Bucket" },
  { key: "BUYING_PRICE", label: "Buying Price", inr: true },
];

const DETAIL_GROUPS = [
  {
    title: "Identity",
    fields: [
      ["LEAD_ID", "Lead ID"], ["CAR_ID", "Car ID"], ["Reg No", "Reg No"],
      ["MAKE", "Make"], ["MODEL", "Model"], ["Year", "Year"],
      ["fuel_type", "Fuel"], ["Odometer", "Odometer"],
    ],
  },
  {
    title: "Pricing",
    fields: [
      ["BUYING_PRICE", "Buying Price", true], ["NEW_MSP", "New MSP", true],
      ["Anchor", "Anchor", true], ["TP", "Target Price", true],
      ["C24", "C24 Quote", true], ["C2D Price", "C2D Price", true],
    ],
  },
  {
    title: "Inventory Status",
    fields: [
      ["AGE_BUCKET", "SI Bucket"], ["SI_AGE", "SI Age"],
      ["SALE_CANCEL_DATE", "Cancel Date"], ["Auction Stop", "Auction Stop"],
      ["RI Pending", "RI Pending"], ["C2D Flag", "C2D Flag"],
    ],
  },
  {
    title: "Location",
    fields: [
      ["REGION", "Region"], ["PARKING_REGION", "Parking Region"],
      ["ZONE", "Zone"],
    ],
  },
];

// ═════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("inventory");
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentUser, setCurrentUser] = useState("");

  const [slackUrl, setSlackUrl] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [managerEmail, setManagerEmail] = useState("");

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
      } catch (err) { alert("Error: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer?.files?.[0]); };
  const browse = () => { const i = document.createElement("input"); i.type = "file"; i.accept = ".xlsx,.xls,.csv"; i.onchange = (e) => handleFile(e.target.files?.[0]); i.click(); };

  const pendingEsc = history.filter((h) => h.status === "ESCALATED").length;

  const TABS = [
    { id: "inventory", icon: "📋", label: "Stuck Inventory" },
    { id: "quotes", icon: "💰", label: "Submit Quote", badge: pendingEsc || null },
    { id: "history", icon: "📜", label: "Quote History" },
    { id: "dashboard", icon: "📊", label: "P&L Management" },
    { id: "auction", icon: "🔨", label: "Auction Console" },
    { id: "bizsnapshot", icon: "📈", label: "Biz Snapshot" },
    { id: "invsnapshot", icon: "🔍", label: "Inv Snapshot" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={S.app}>
      <style>{CSS}</style>
      <header style={S.header}>
        <div style={S.hLeft}>
          <div style={S.logo}>C24</div>
          <div>
            <div style={S.logoTitle}>Inventory Command Center</div>
            <div style={S.logoSub}>{rows ? `${rows.length.toLocaleString()} cars loaded` : "No file loaded"}</div>
          </div>
        </div>
        <nav style={S.nav}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.navActive : S.navBtn}>
              <span style={{ marginRight: 4 }}>{t.icon}</span>{t.label}
              {t.badge ? <span style={S.tabBadge}>{t.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div style={S.hRight}>
          <input style={S.userInp} placeholder="Your name..." value={currentUser} onChange={(e) => setCurrentUser(e.target.value)} />
          {rows && (
            <div style={S.fileBadge}>
              <span style={{ color: "#10B981" }}>✓</span> {fileName.length > 18 ? fileName.slice(0, 16) + "…" : fileName}
              <button onClick={() => { setRows(null); setFileName(""); }} style={S.removeBtn}>✕</button>
            </div>
          )}
        </div>
      </header>

      {!rows && !["settings", "dashboard", "bizsnapshot"].includes(tab) && (
        <div style={S.uploadWrap}>
          <div style={{ ...S.dropzone, ...(dragOver ? S.dzHover : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop} onClick={browse}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{dragOver ? "📥" : "📂"}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: "#0F172A" }}>{dragOver ? "Drop it here!" : "Upload Stuck Inventory"}</div>
            <div style={{ color: "#64748B", fontSize: 14, marginBottom: 16 }}>Drag & drop .xlsx / .csv, or click to browse</div>
            <div style={S.uploadBtn}>Choose File</div>
          </div>
        </div>
      )}

      <main style={S.main}>
        {rows && tab === "inventory" && <InventoryTab rows={rows} />}
        {rows && tab === "quotes" && <QuoteTab rows={rows} history={history} setHistory={setHistory} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />}
        {tab === "history" && <HistoryTab history={history} />}
        {tab === "dashboard" && <PnlManagementTab />}
        {rows && tab === "auction" && <AuctionTab rows={rows} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />}
        {tab === "bizsnapshot" && <BusinessSnapshotTab />}
        {rows && tab === "invsnapshot" && <InventorySnapshotTab rows={rows} />}
        {tab === "settings" && <SettingsTab slackUrl={slackUrl} setSlackUrl={setSlackUrl} sheetUrl={sheetUrl} setSheetUrl={setSheetUrl} managerEmail={managerEmail} setManagerEmail={setManagerEmail} />}
      </main>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  STUCK INVENTORY TAB
// ═════════════════════════════════════════════════════════════════════
function InventoryTab({ rows }) {
  const [search, setSearch] = useState("");
  const [regionF, setRegionF] = useState("ALL");
  const [ageF, setAgeF] = useState("ALL");
  const [page, setPage] = useState(0);
  const [detailCar, setDetailCar] = useState(null);
  const PG = 100;

  const regions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.REGION).filter(Boolean))].sort(), [rows]);
  const ages = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.AGE_BUCKET).filter(Boolean))], [rows]);

  const filtered = useMemo(() => {
    let f = rows;
    if (regionF !== "ALL") f = f.filter((r) => r.REGION === regionF);
    if (ageF !== "ALL") f = f.filter((r) => r.AGE_BUCKET === ageF);
    if (search) {
      const s = search.toLowerCase();
      f = f.filter((r) => String(r.LEAD_ID||"").toLowerCase().includes(s) || String(r.MAKE||"").toLowerCase().includes(s) || String(r.MODEL||"").toLowerCase().includes(s) || String(r["Reg No"]||"").toLowerCase().includes(s));
    }
    return f;
  }, [rows, regionF, ageF, search]);

  const pg = filtered.slice(page * PG, (page + 1) * PG);
  const tp = Math.ceil(filtered.length / PG);
  const stats = useMemo(() => {
    const bp = filtered.reduce((s, r) => s + (toNum(r.BUYING_PRICE) || 0), 0);
    return { n: filtered.length, bp, av: filtered.length ? bp / filtered.length : 0, c2d: filtered.filter(r => truthy(r["C2D Flag"])).length, ri: filtered.filter(r => truthy(r["RI Pending"])).length, as: filtered.filter(r => truthy(r["Auction Stop"])).length };
  }, [filtered]);

  return (
    <div>
      <div style={S.metrics}>
        {[{l:"Total Cars",v:stats.n.toLocaleString(),c:"#3B82F6"},{l:"Buying Value",v:INR(stats.bp),c:"#F59E0B"},{l:"Avg BP",v:INR(stats.av),c:"#8B5CF6"},{l:"C2D",v:stats.c2d,c:"#10B981"},{l:"RI Pending",v:stats.ri,c:"#EF4444"},{l:"Auction Stop",v:stats.as,c:"#F97316"}].map(m=>(
          <div key={m.l} style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: m.c }}>{m.v}</div><div style={S.mLabel}>{m.l}</div></div>
        ))}
      </div>
      <div style={S.filters}>
        <input style={S.searchBox} placeholder="🔍 Search App ID, Make, Model…" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
        <select style={S.sel} value={regionF} onChange={e => { setRegionF(e.target.value); setPage(0); }}>{regions.map(r => <option key={r} value={r}>{r === "ALL" ? "📍 All Regions" : r}</option>)}</select>
        <select style={S.sel} value={ageF} onChange={e => { setAgeF(e.target.value); setPage(0); }}>{ages.map(a => <option key={a} value={a}>{a === "ALL" ? "📅 All Buckets" : a}</option>)}</select>
        <span style={S.fCount}>{filtered.length} of {rows.length}</span>
      </div>
      <div style={S.tWrap}><div style={S.tScroll}>
        <table style={S.table}><thead><tr>
          <th style={{ ...S.th, width: 50 }}>#</th>
          {INVENTORY_COLS.map(c => <th key={c.key} style={S.th}>{c.label}</th>)}
        </tr></thead><tbody>
          {pg.map((row, i) => (
            <tr key={i} className="tr">
              <td style={{ ...S.td, color: "#94A3B8", fontSize: 12 }}>{page * PG + i + 1}</td>
              <td style={S.td}><button style={S.leadBtn} onClick={() => setDetailCar(row)}>{row.LEAD_ID || "—"}</button></td>
              <td style={{ ...S.td, fontWeight: 600, color: "#0F172A" }}>{row.MAKE} {row.MODEL}</td>
              <td style={S.td}>{row.Year || "—"}</td>
              <td style={S.td}><span style={S.bucketChip}>{row.AGE_BUCKET || "—"}</span></td>
              <td style={{ ...S.td, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{INR(toNum(row.BUYING_PRICE))}</td>
            </tr>
          ))}
        </tbody></table>
      </div>
      <div style={S.pag}>
        <button style={S.pgB} disabled={page === 0} onClick={() => setPage(0)}>⟨⟨</button>
        <button style={S.pgB} disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
        <span style={S.pgI}>Page <b>{page + 1}</b>/<b>{tp || 1}</b></span>
        <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(page + 1)}>Next →</button>
        <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(tp - 1)}>⟩⟩</button>
      </div></div>
      {detailCar && <CarDetailModal car={detailCar} onClose={() => setDetailCar(null)} />}
    </div>
  );
}

function CarDetailModal({ car, onClose }) {
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0F172A" }}>{car.MAKE} {car.MODEL}</div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>{car.Year} · {car.fuel_type || "—"} · {car["Reg No"] || "—"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>App ID</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: "#3B82F6" }}>{car.LEAD_ID}</div>
            </div>
            <button style={S.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          {DETAIL_GROUPS.map(g => (
            <div key={g.title} style={{ marginBottom: 20 }}>
              <div style={S.groupTitle}>{g.title}</div>
              <div style={S.detailGrid}>
                {g.fields.map(([key, label, isInr]) => (
                  <div key={key} style={S.detailItem}>
                    <div style={S.detailLabel}>{label}</div>
                    <div style={S.detailVal}>{isInr ? INR(toNum(car[key])) : String(car[key] || "—")}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  QUOTE SUBMISSION TAB
// ═════════════════════════════════════════════════════════════════════
function QuoteTab({ rows, history, setHistory, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [appId, setAppId] = useState("");
  const [car, setCar] = useState(null);
  const [miss, setMiss] = useState(false);
  const [q, setQ] = useState({ dealer: "", amt: "", notes: "" });
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState("submit");
  const escalated = history.filter(h => h.status === "ESCALATED");

  const find = () => { const id = appId.trim(); if (!id) return; const f = rows.find(r => String(r.LEAD_ID||"").trim() === id); if (f) { setCar(f); setMiss(false); setRes(null); } else { setCar(null); setMiss(true); } };

  const submit = async () => {
    if (!car || !q.amt || !currentUser) return;
    setSending(true);
    const bid = toNum(q.amt), buy = toNum(car.BUYING_PRICE) || 0, pnl = bid - buy;
    const { status, reason } = evaluateQuote(bid, buy, car.AGE_BUCKET || "");
    const entry = { id: Date.now(), appId: car.LEAD_ID, make: car.MAKE, model: car.MODEL, dealer: q.dealer, bid, buy, pnl, ageBucket: car.AGE_BUCKET || "", status, reason, region: car.REGION || "", submittedBy: currentUser, time: new Date().toLocaleString("en-IN"), timestamp: Date.now(), auctionStarted: false };
    setRes(entry); setHistory(h => [entry, ...h]); setQ({ dealer: "", amt: "", notes: "" }); setSending(false);
  };

  const escalate = async (id) => {
    const e = history.find(h => h.id === id); if (!e) return;
    await sendSlackMessage(slackUrl, `:rotating_light: *ESCALATION*\n*Car:* ${e.make} ${e.model} | *App:* ${e.appId}\n*By:* ${e.submittedBy} | *Bid:* ₹${e.bid?.toLocaleString("en-IN")} | *P&L:* ₹${e.pnl?.toLocaleString("en-IN")}\n*Reason:* ${e.reason}`);
    setHistory(h => h.map(x => x.id === id ? { ...x, status: "ESCALATED" } : x));
    if (res?.id === id) setRes({ ...res, status: "ESCALATED" });
  };
  const manualApprove = async (id) => { setHistory(h => h.map(x => x.id === id ? { ...x, status: "MANAGER_APPROVED" } : x)); };
  const manualReject = async (id) => { setHistory(h => h.map(x => x.id === id ? { ...x, status: "MANAGER_REJECTED" } : x)); };
  const startAuction = async (id) => {
    const e = history.find(h => h.id === id); if (!e) return;
    await appendToSheet(sheetUrl, { timestamp: new Date().toISOString(), appointmentId: e.appId, region: e.region, anchorPrice: e.bid, submittedBy: e.submittedBy, email: managerEmail, date: new Date().toLocaleDateString("en-IN") });
    setHistory(h => h.map(x => x.id === id ? { ...x, auctionStarted: true } : x));
    if (res?.id === id) setRes({ ...res, auctionStarted: true });
  };

  const stCol = { AUTO_APPROVED: "#10B981", REJECTED: "#EF4444", ESCALATED: "#F59E0B", MANAGER_APPROVED: "#10B981", MANAGER_REJECTED: "#EF4444" };
  const stLabel = { AUTO_APPROVED: "Auto Approved", REJECTED: "Rejected", ESCALATED: "Escalated", MANAGER_APPROVED: "Mgr Approved", MANAGER_REJECTED: "Mgr Rejected" };
  const isApproved = s => s === "AUTO_APPROVED" || s === "MANAGER_APPROVED";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={viewMode === "submit" ? S.navActive : S.navBtn} onClick={() => setViewMode("submit")}>💰 Submit Quote</button>
        <button style={viewMode === "escalations" ? S.navActive : S.navBtn} onClick={() => setViewMode("escalations")}>⚠️ Escalations {escalated.length ? <span style={S.tabBadge}>{escalated.length}</span> : null}</button>
      </div>

      {viewMode === "submit" && (
        <div className="ql" style={S.ql}>
          <div style={S.qlL}>
            <div style={S.card}>
              <div style={S.cHead}>🔍 Find Car</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...S.inp, flex: 1 }} placeholder="Enter App ID…" value={appId} onChange={e => setAppId(e.target.value)} onKeyDown={e => e.key === "Enter" && find()} />
                <button style={S.pri} onClick={find}>Search</button>
              </div>
              {miss && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10 }}>⚠ Not found</div>}
            </div>
            {car && (
              <div style={S.card}>
                <div style={S.carTop}>
                  <div><div style={S.carName}>{car.MAKE} {car.MODEL}</div><div style={S.carSub}>{car.Year} · {car.fuel_type || "—"}</div></div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase" }}>App ID</div><div style={{ fontSize: 20, fontWeight: 900, color: "#3B82F6" }}>{car.LEAD_ID}</div></div>
                </div>
                <div style={S.dGrid}>
                  {[["BUYING_PRICE","Buy",true,"#F59E0B"],["NEW_MSP","MSP",true],["Anchor","Anchor",true],["AGE_BUCKET","Bucket"],["REGION","Region"],["SI_AGE","SI Age"]].map(([k,l,inr,hl]) => (
                    <div key={k} style={S.dItem}><div style={S.dLabel}>{l}</div><div style={{ ...S.dVal, ...(hl?{color:hl,fontWeight:700}:{}) }}>{inr ? INR(toNum(car[k])) : (car[k]||"—")}</div></div>
                  ))}
                </div>
              </div>
            )}
            {car && (
              <div style={S.card}>
                <div style={S.cHead}>💰 Submit Quote</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={S.fLabel}>Dealer</label><input style={S.inp} value={q.dealer} onChange={e => setQ({ ...q, dealer: e.target.value })} /></div>
                  <div><label style={S.fLabel}>Bid (₹)</label><input style={S.inp} value={q.amt} onChange={e => setQ({ ...q, amt: e.target.value })} /></div>
                </div>
                <button style={{ ...S.pri, width: "100%", marginTop: 16, padding: "14px 0" }} onClick={submit} disabled={sending}>{sending ? "Processing…" : "Submit →"}</button>
              </div>
            )}
          </div>
          <div style={S.qlR}>
            {res && (
              <div style={{ ...S.card, textAlign: "center", border: `2px solid ${stCol[res.status]}55`, background: `${stCol[res.status]}0D` }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: stCol[res.status] }}>{stLabel[res.status]}</div>
                <div style={{ color: "#64748B", fontSize: 13, marginTop: 8 }}>{res.reason}</div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 16, fontSize: 13, color: "#475569" }}>
                  <span>Bid: <b>{INR(res.bid)}</b></span><span>P&L: <b style={{ color: res.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(res.pnl)}</b></span>
                </div>
                {isApproved(res.status) && !res.auctionStarted && <button style={{ ...S.pri, marginTop: 14, background: "#8B5CF6" }} onClick={() => startAuction(res.id)}>🔨 Start Auction</button>}
                {res.auctionStarted && <div style={{ color: "#10B981", fontWeight: 700, marginTop: 12 }}>✅ Auction Started</div>}
                {res.status === "REJECTED" && <button style={{ ...S.pri, marginTop: 14, background: "#F59E0B" }} onClick={() => escalate(res.id)}>⚠️ Escalate</button>}
              </div>
            )}
            <div style={S.card}>
              <div style={S.cHead}>📋 Recent ({history.length})</div>
              {!history.length ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>No quotes yet</div> :
                <div style={{ maxHeight: 400, overflowY: "auto" }}>
                  {history.slice(0, 20).map(h => (
                    <div key={h.id} style={S.hRow}>
                      <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: "#0F172A" }}>{h.make} {h.model} <span style={{ color: "#94A3B8", fontSize: 12 }}>#{h.appId}</span></div><div style={{ color: "#64748B", fontSize: 12 }}>{h.submittedBy} · {h.time}</div></div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.status]}1A`, color: stCol[h.status] }}>{stLabel[h.status]}</span>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Bid: {INR(h.bid)} · P&L: <span style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</span></div>
                        {isApproved(h.status) && !h.auctionStarted && <button style={{ ...S.pri, marginTop: 4, background: "#8B5CF6", padding: "3px 8px", fontSize: 11 }} onClick={() => startAuction(h.id)}>🔨 Auction</button>}
                        {h.auctionStarted && <div style={{ fontSize: 10, color: "#10B981", marginTop: 2 }}>✓ Running</div>}
                      </div>
                    </div>
                  ))}
                </div>
              }
            </div>
          </div>
        </div>
      )}

      {viewMode === "escalations" && (
        <div style={S.card}>
          <div style={S.cHead}>⚠️ Pending ({escalated.length})</div>
          {!escalated.length ? <div style={{ textAlign: "center", padding: 40, color: "#94A3B8" }}>None</div> :
            escalated.map(h => (
              <div key={h.id} style={{ ...S.hRow, padding: "16px 0" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{h.make} {h.model}</div>
                  <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>App: <b style={{ color: "#3B82F6" }}>{h.appId}</b> · {h.dealer} · {h.region} · By: {h.submittedBy}</div>
                  <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>Bid: <b>{INR(h.bid)}</b> · Buy: <b>{INR(h.buy)}</b> · P&L: <b style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</b></div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={{ ...S.pri, background: "#10B981", padding: "10px 20px" }} onClick={() => manualApprove(h.id)}>✅ Approve</button>
                  <button style={{ ...S.pri, background: "#EF4444", padding: "10px 20px" }} onClick={() => manualReject(h.id)}>❌ Reject</button>
                </div>
              </div>
            ))
          }
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  QUOTE HISTORY TAB
// ═════════════════════════════════════════════════════════════════════
function HistoryTab({ history }) {
  const [memberF, setMemberF] = useState("ALL");
  const [bucketF, setBucketF] = useState("ALL");
  const [regionF, setRegionF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");

  const members = useMemo(() => ["ALL", ...new Set(history.map(h => h.submittedBy).filter(Boolean))].sort(), [history]);
  const buckets = useMemo(() => ["ALL", ...new Set(history.map(h => h.ageBucket).filter(Boolean))], [history]);
  const regions = useMemo(() => ["ALL", ...new Set(history.map(h => h.region).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    let f = history;
    if (memberF !== "ALL") f = f.filter(h => h.submittedBy === memberF);
    if (bucketF !== "ALL") f = f.filter(h => h.ageBucket === bucketF);
    if (regionF !== "ALL") f = f.filter(h => h.region === regionF);
    if (statusF !== "ALL") f = f.filter(h => h.status === statusF);
    return f;
  }, [history, memberF, bucketF, regionF, statusF]);

  const stCol = { AUTO_APPROVED: "#10B981", REJECTED: "#EF4444", ESCALATED: "#F59E0B", MANAGER_APPROVED: "#10B981", MANAGER_REJECTED: "#EF4444" };
  const stLabel = { AUTO_APPROVED: "Approved", REJECTED: "Rejected", ESCALATED: "Escalated", MANAGER_APPROVED: "Mgr OK", MANAGER_REJECTED: "Mgr No" };
  const stats = useMemo(() => { const n = filtered.length, ap = filtered.filter(h => h.status === "AUTO_APPROVED" || h.status === "MANAGER_APPROVED").length, pnl = filtered.reduce((s, h) => s + (h.pnl || 0), 0); return { n, ap, pnl, rate: n ? (ap / n * 100).toFixed(0) : 0 }; }, [filtered]);

  return (
    <div>
      <div style={S.metrics}>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#3B82F6" }}>{stats.n}</div><div style={S.mLabel}>Total</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#10B981" }}>{stats.ap}</div><div style={S.mLabel}>Approved</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#8B5CF6" }}>{stats.rate}%</div><div style={S.mLabel}>Rate</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: stats.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(stats.pnl)}</div><div style={S.mLabel}>P&L</div></div>
      </div>
      <div style={S.filters}>
        <select style={S.sel} value={memberF} onChange={e => setMemberF(e.target.value)}>{members.map(m => <option key={m} value={m}>{m === "ALL" ? "👤 All" : m}</option>)}</select>
        <select style={S.sel} value={bucketF} onChange={e => setBucketF(e.target.value)}>{buckets.map(b => <option key={b} value={b}>{b === "ALL" ? "📅 All" : b}</option>)}</select>
        <select style={S.sel} value={regionF} onChange={e => setRegionF(e.target.value)}>{regions.map(r => <option key={r} value={r}>{r === "ALL" ? "📍 All" : r}</option>)}</select>
        <select style={S.sel} value={statusF} onChange={e => setStatusF(e.target.value)}><option value="ALL">📊 All Status</option><option value="AUTO_APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="ESCALATED">Escalated</option></select>
        <span style={S.fCount}>{filtered.length} of {history.length}</span>
      </div>
      <div style={S.tWrap}><div style={S.tScroll}>
        <table style={S.table}><thead><tr>
          {["Time","Member","App ID","Car","Dealer","Region","Bucket","Bid","Buy","P&L","Status"].map(h => <th key={h} style={S.th}>{h}</th>)}
        </tr></thead><tbody>
          {!filtered.length && <tr><td colSpan={11} style={{ ...S.td, textAlign: "center", padding: 40, color: "#94A3B8" }}>No quotes</td></tr>}
          {filtered.map(h => (
            <tr key={h.id} className="tr">
              <td style={{ ...S.td, fontSize: 11, color: "#64748B" }}>{h.time}</td>
              <td style={{ ...S.td, fontWeight: 600 }}>{h.submittedBy || "—"}</td>
              <td style={{ ...S.td, color: "#3B82F6", fontWeight: 600 }}>{h.appId}</td>
              <td style={S.td}>{h.make} {h.model}</td>
              <td style={S.td}>{h.dealer}</td>
              <td style={S.td}>{h.region || "—"}</td>
              <td style={S.td}><span style={S.bucketChip}>{h.ageBucket || "—"}</span></td>
              <td style={{ ...S.td, textAlign: "right" }}>{INR(h.bid)}</td>
              <td style={{ ...S.td, textAlign: "right" }}>{INR(h.buy)}</td>
              <td style={{ ...S.td, textAlign: "right", color: h.pnl >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{INR(h.pnl)}</td>
              <td style={S.td}><span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.status]}1A`, color: stCol[h.status] }}>{stLabel[h.status]}</span></td>
            </tr>
          ))}
        </tbody></table>
      </div></div>
    </div>
  );
}



// ═════════════════════════════════════════════════════════════════════
//  P&L MANAGEMENT — DUMMY DATA
//  Structured to mirror actual Cars24 stuck-inventory ops metrics.
//  Replace with API/query calls later.
// ═════════════════════════════════════════════════════════════════════
//  TAB 4 — P&L MANAGEMENT (v2 — matches actual Cars24 report format)
// ═════════════════════════════════════════════════════════════════════
const PNL_DATA = {
  stockOut: {
    MTD: [
      { bucket:"0-30",   openInv:285, sold:125, openASP:258491, soldASP:223386, loss:139,      lossPct:0.1 },
      { bucket:"30-60",  openInv:372, sold:136, openASP:284185, soldASP:235665, loss:-16871,   lossPct:-7.2 },
      { bucket:"60-90",  openInv:161, sold:81,  openASP:308918, soldASP:342672, loss:-61415,   lossPct:-17.9 },
      { bucket:"90-120", openInv:68,  sold:24,  openASP:311967, soldASP:303005, loss:-70154,   lossPct:-23.2 },
      { bucket:"120-150",openInv:33,  sold:5,   openASP:242986, soldASP:217767, loss:-67267,   lossPct:-30.9 },
      { bucket:"150-180",openInv:29,  sold:7,   openASP:273802, soldASP:339863, loss:-132649,  lossPct:-39.0 },
      { bucket:"180+",   openInv:348, sold:14,  openASP:368545, soldASP:317035, loss:-146850,  lossPct:-46.3 },
    ],
    LMTD: [
      { bucket:"0-30",   openInv:310, sold:138, openASP:255000, soldASP:220000, loss:520,      lossPct:0.2 },
      { bucket:"30-60",  openInv:395, sold:148, openASP:280000, soldASP:232000, loss:-18200,   lossPct:-7.8 },
      { bucket:"60-90",  openInv:175, sold:88,  openASP:305000, soldASP:338000, loss:-58000,   lossPct:-16.5 },
      { bucket:"90-120", openInv:72,  sold:28,  openASP:308000, soldASP:298000, loss:-68000,   lossPct:-22.1 },
      { bucket:"120-150",openInv:38,  sold:6,   openASP:248000, soldASP:220000, loss:-62000,   lossPct:-28.2 },
      { bucket:"150-180",openInv:32,  sold:8,   openASP:270000, soldASP:335000, loss:-128000,  lossPct:-37.5 },
      { bucket:"180+",   openInv:360, sold:16,  openASP:365000, soldASP:312000, loss:-142000,  lossPct:-44.8 },
    ],
  },
  sbnd: {
    MTD: [
      { bucket:"0-30",   count:41, sbndASP:322144, loss:3932,    lossPct:1.2 },
      { bucket:"30-60",  count:70, sbndASP:348856, loss:-11759,  lossPct:-3.4 },
      { bucket:"60-90",  count:24, sbndASP:347959, loss:-65739,  lossPct:-18.9 },
      { bucket:"90-120", count:6,  sbndASP:364474, loss:-102417, lossPct:-28.1 },
      { bucket:"120-150",count:3,  sbndASP:176734, loss:-53067,  lossPct:-30.0 },
      { bucket:"150-180",count:1,  sbndASP:201587, loss:-61087,  lossPct:-30.3 },
      { bucket:"180+",   count:9,  sbndASP:434018, loss:-169349, lossPct:-39.0 },
    ],
    LMTD: [
      { bucket:"0-30",   count:48, sbndASP:318000, loss:4200,    lossPct:1.3 },
      { bucket:"30-60",  count:75, sbndASP:345000, loss:-10500,  lossPct:-3.0 },
      { bucket:"60-90",  count:28, sbndASP:342000, loss:-62000,  lossPct:-17.8 },
      { bucket:"90-120", count:8,  sbndASP:358000, loss:-98000,  lossPct:-26.5 },
      { bucket:"120-150",count:4,  sbndASP:182000, loss:-50000,  lossPct:-28.0 },
      { bucket:"150-180",count:2,  sbndASP:198000, loss:-58000,  lossPct:-29.1 },
      { bucket:"180+",   count:10, sbndASP:428000, loss:-165000, lossPct:-38.2 },
    ],
  },
  smc: {
    MTD: {
      sold: [
        { bucket:"0-30", sold:28, openASP:275000, soldASP:268000, loss:-1_40_000, lossPct:-1.82 },
        { bucket:"30-60", sold:18, openASP:288000, soldASP:272000, loss:-1_80_000, lossPct:-3.47 },
        { bucket:"60-90", sold:12, openASP:305000, soldASP:280000, loss:-2_10_000, lossPct:-5.74 },
        { bucket:"90+", sold:6, openASP:340000, soldASP:295000, loss:-1_80_000, lossPct:-8.82 },
      ],
      sbnd: [
        { bucket:"0-30", count:15, sbndASP:280000, loss:1200, lossPct:0.4 },
        { bucket:"30-60", count:10, sbndASP:292000, loss:-8500, lossPct:-2.9 },
        { bucket:"60-90", count:6, sbndASP:310000, loss:-42000, lossPct:-13.5 },
        { bucket:"90+", count:3, sbndASP:345000, loss:-85000, lossPct:-24.6 },
      ],
    },
    LMTD: {
      sold: [
        { bucket:"0-30", sold:32, openASP:270000, soldASP:265000, loss:-1_20_000, lossPct:-1.38 },
        { bucket:"30-60", sold:20, openASP:282000, soldASP:268000, loss:-1_50_000, lossPct:-2.66 },
        { bucket:"60-90", sold:14, openASP:300000, soldASP:275000, loss:-1_95_000, lossPct:-4.64 },
        { bucket:"90+", sold:8, openASP:335000, soldASP:290000, loss:-2_10_000, lossPct:-7.84 },
      ],
      sbnd: [
        { bucket:"0-30", count:18, sbndASP:275000, loss:1500, lossPct:0.5 },
        { bucket:"30-60", count:12, sbndASP:285000, loss:-7800, lossPct:-2.7 },
        { bucket:"60-90", count:8, sbndASP:302000, loss:-38000, lossPct:-12.6 },
        { bucket:"90+", count:4, sbndASP:338000, loss:-80000, lossPct:-23.7 },
      ],
    },
  },
  pnlHit: {
    MTD: {
      soldCars:        { count:392, pnl:-31266*392, avgLoss:-31266 },
      provisionedCars: { count:142, provisionAmt:-38_00_000 },
      returnedCars:    { count:18, provisionAmt:-4_50_000 },
      smcSoldCars:     { count:64, pnl:-7_10_000 },
      leadFeeRevenue:  { amount:12_50_000, cars:392 },
      ninetyPlusSoldReversal: { count:28, reversalAmt:8_20_000 },
      depreciationCost: 2_40_000,
      parkingCost: 1_80_000,
      transportCost: 95_000,
    },
    LMTD: {
      soldCars:        { count:432, pnl:-28500*432, avgLoss:-28500 },
      provisionedCars: { count:165, provisionAmt:-42_00_000 },
      returnedCars:    { count:22, provisionAmt:-5_20_000 },
      smcSoldCars:     { count:74, pnl:-6_75_000 },
      leadFeeRevenue:  { amount:14_00_000, cars:432 },
      ninetyPlusSoldReversal: { count:32, reversalAmt:9_50_000 },
      depreciationCost: 2_60_000,
      parkingCost: 1_95_000,
      transportCost: 1_05_000,
    },
  },
};

function PnlManagementTab() {
  const [period, setPeriod] = useState("MTD");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [section, setSection] = useState("stockout");

  const D = PNL_DATA;
  const p = period === "LMTD" ? "LMTD" : "MTD";

  // ── STOCK OUT aggregation ─────────────────────────────────────
  const soData = D.stockOut[p] || [];
  const soTotals = useMemo(() => {
    const t = { openInv:0, sold:0, openBP:0, soldBP:0, loss:0 };
    for (const r of soData) { t.openInv+=r.openInv; t.sold+=r.sold; t.openBP+=r.openASP*r.openInv; t.soldBP+=r.soldASP*r.sold; t.loss+=r.loss; }
    t.openASP = t.openInv ? Math.round(t.openBP/t.openInv) : 0;
    t.soldASP = t.sold ? Math.round(t.soldBP/t.sold) : 0;
    t.soldPct = t.openInv ? ((t.sold/t.openInv)*100).toFixed(2)+"%" : "0%";
    t.lossPct = t.soldBP ? ((t.loss/t.soldBP)*100).toFixed(1)+"%" : "0%";
    t.aspRatio = t.openASP ? (t.soldASP/t.openASP).toFixed(2) : "—";
    return t;
  }, [soData]);

  // ── SBND aggregation ──────────────────────────────────────────
  const sbndData = D.sbnd[p] || [];
  const sbndTotals = useMemo(() => {
    const t = { count:0, bp:0, loss:0 };
    for (const r of sbndData) { t.count+=r.count; t.bp+=r.sbndASP*r.count; t.loss+=r.loss; }
    t.sbndASP = t.count ? Math.round(t.bp/t.count) : 0;
    t.sbndPct = soTotals.openInv ? ((t.count/soTotals.openInv)*100).toFixed(2)+"%" : "—";
    t.lossPct = t.bp ? ((t.loss/t.bp)*100).toFixed(2)+"%" : "0%";
    t.aspRatio = soTotals.openASP ? (t.sbndASP/soTotals.openASP).toFixed(2) : "—";
    return t;
  }, [sbndData, soTotals]);

  // ── P&L Hit ───────────────────────────────────────────────────
  const hit = D.pnlHit[p] || D.pnlHit.MTD;
  const grossPnL = (hit.soldCars?.pnl||0);
  const netPnL = grossPnL + (hit.provisionedCars?.provisionAmt||0) + (hit.returnedCars?.provisionAmt||0) + (hit.smcSoldCars?.pnl||0) + (hit.leadFeeRevenue?.amount||0) + (hit.ninetyPlusSoldReversal?.reversalAmt||0);
  const totalCosts = (hit.depreciationCost||0) + (hit.parkingCost||0) + (hit.transportCost||0);
  const finalPnL = netPnL - totalCosts;

  const sectionBtns = [
    { id:"stockout", icon:"📦", label:"Stock Out" },
    { id:"sbnd", icon:"🚛", label:"SBND" },
    { id:"smc", icon:"🔄", label:"Same Month Cancelled" },
    { id:"pnlhit", icon:"💰", label:"P&L Hit" },
  ];

  // Table header style matching screenshot (dark blue header)
  const tHead = { padding:"10px 14px", textAlign:"right", fontWeight:700, color:"#FFF", background:"#1E3A5F", fontSize:11, textTransform:"uppercase", letterSpacing:".3px", whiteSpace:"nowrap", position:"sticky", top:0, zIndex:2 };
  const tHeadL = { ...tHead, textAlign:"left" };
  const tCell = { padding:"9px 14px", borderBottom:"1px solid #E2E8F0", whiteSpace:"nowrap", color:"#0F172A", fontSize:13, textAlign:"right", fontVariantNumeric:"tabular-nums" };
  const tCellL = { ...tCell, textAlign:"left", fontWeight:600 };
  const tTotalCell = { ...tCell, fontWeight:900, background:"#F1F5F9", color:"#0F172A" };
  const tTotalCellL = { ...tTotalCell, textAlign:"left" };
  const lossColor = (v) => v > 0 ? "#10B981" : v < 0 ? "#EF4444" : "#0F172A";

  return (
    <div>
      {/* Period selector */}
      <div style={{ ...S.card, marginBottom:16, display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:6 }}>
          {["MTD","LMTD","Custom"].map(pr=>(
            <button key={pr} onClick={()=>setPeriod(pr==="Custom"?"custom":pr)} style={{
              padding:"9px 20px", borderRadius:8, border: period===(pr==="Custom"?"custom":pr)?"2px solid #1E3A5F":"2px solid #E2E8F0",
              background: period===(pr==="Custom"?"custom":pr)?"#EFF6FF":"#FFF", color: period===(pr==="Custom"?"custom":pr)?"#1E3A5F":"#64748B",
              fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
            }}>{pr}</button>
          ))}
        </div>
        {period==="custom"&&(
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            <input type="date" style={S.sel} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
            <span style={{ color:"#64748B" }}>to</span>
            <input type="date" style={S.sel} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
          </div>
        )}
        <div style={{ marginLeft:"auto", padding:"6px 14px", background:"#FEF3C7", borderRadius:8, fontSize:11, color:"#78350F", fontWeight:600 }}>
          ⚠️ Dummy data — connect to live query later
        </div>
      </div>

      {/* Section nav */}
      <div style={{ display:"flex", gap:6, marginBottom:20 }}>
        {sectionBtns.map(s=>(
          <button key={s.id} onClick={()=>setSection(s.id)} style={{
            padding:"10px 18px", borderRadius:8,
            border: section===s.id ? "2px solid #1E3A5F" : "1px solid #E2E8F0",
            background: section===s.id ? "#EFF6FF" : "#FFF",
            color: section===s.id ? "#1E3A5F" : "#64748B",
            fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
          }}><span style={{ marginRight:6 }}>{s.icon}</span>{s.label}</button>
        ))}
      </div>

      {/* ═══════ STOCK OUT ═══════ */}
      {section==="stockout"&&(
        <div>
          <div style={S.metrics}>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#1E3A5F" }}>{soTotals.openInv.toLocaleString()}</div><div style={S.mLabel}>Opening Inventory</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#10B981" }}>{soTotals.sold.toLocaleString()}</div><div style={S.mLabel}>Abs Sold</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#3B82F6" }}>{soTotals.soldPct}</div><div style={S.mLabel}>Sold %</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:lossColor(soTotals.loss) }}>{INR(soTotals.loss)}</div><div style={S.mLabel}>Total Loss</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#8B5CF6" }}>{soTotals.aspRatio}</div><div style={S.mLabel}>ASP Ratio</div></div>
          </div>
          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 20px", background:"#1E3A5F", color:"#FFF", fontWeight:800, fontSize:14, display:"flex", justifyContent:"space-between" }}>
              <span>STOCK_OUT</span>
              <span style={{ fontSize:12, opacity:0.8 }}>{p} · {new Date().toLocaleDateString("en-IN",{month:"short",year:"numeric"})}</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ ...S.table, fontSize:13 }}>
                <thead><tr>
                  <th style={tHeadL}>SI_BUCKET</th>
                  <th style={tHead}>Opening Inv Count</th>
                  <th style={tHead}>Abs Sold</th>
                  <th style={tHead}>Sold %</th>
                  <th style={tHead}>Opening Inv ASP</th>
                  <th style={tHead}>Sold ASP</th>
                  <th style={tHead}>Loss</th>
                  <th style={tHead}>Loss%</th>
                  <th style={tHead}>ASP Ratio</th>
                </tr></thead>
                <tbody>
                  {soData.map((r,i)=>{
                    const soldPct = r.openInv ? ((r.sold/r.openInv)*100).toFixed(1)+"%" : "0%";
                    const aspR = r.openASP ? (r.soldASP/r.openASP).toFixed(2) : "—";
                    return (
                      <tr key={r.bucket} style={{ background: i%2===0?"#FFF":"#F8FAFC" }}>
                        <td style={tCellL}>{r.bucket}</td>
                        <td style={tCell}>{r.openInv.toLocaleString()}</td>
                        <td style={tCell}>{r.sold.toLocaleString()}</td>
                        <td style={tCell}>{soldPct}</td>
                        <td style={tCell}>{r.openASP.toLocaleString("en-IN")}</td>
                        <td style={tCell}>{r.soldASP.toLocaleString("en-IN")}</td>
                        <td style={{ ...tCell, color:lossColor(r.loss), fontWeight:700 }}>{r.loss.toLocaleString("en-IN")}</td>
                        <td style={{ ...tCell, color:lossColor(r.lossPct), fontWeight:700 }}>{r.lossPct.toFixed(1)}%</td>
                        <td style={tCell}>{aspR}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={tTotalCellL}>Total</td>
                    <td style={tTotalCell}>{soTotals.openInv.toLocaleString()}</td>
                    <td style={tTotalCell}>{soTotals.sold.toLocaleString()}</td>
                    <td style={tTotalCell}>{soTotals.soldPct}</td>
                    <td style={tTotalCell}>{soTotals.openASP.toLocaleString("en-IN")}</td>
                    <td style={tTotalCell}>{soTotals.soldASP.toLocaleString("en-IN")}</td>
                    <td style={{ ...tTotalCell, color:lossColor(soTotals.loss) }}>{soTotals.loss.toLocaleString("en-IN")}</td>
                    <td style={{ ...tTotalCell, color:lossColor(parseFloat(soTotals.lossPct)) }}>{soTotals.lossPct}</td>
                    <td style={tTotalCell}>{soTotals.aspRatio}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SBND ═══════ */}
      {section==="sbnd"&&(
        <div>
          <div style={S.metrics}>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#F59E0B" }}>{sbndTotals.count}</div><div style={S.mLabel}>Total SBND</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#3B82F6" }}>{sbndTotals.sbndPct}</div><div style={S.mLabel}>SBND %</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#8B5CF6" }}>{INR(sbndTotals.sbndASP)}</div><div style={S.mLabel}>Avg SBND ASP</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:lossColor(sbndTotals.loss) }}>{INR(sbndTotals.loss)}</div><div style={S.mLabel}>Total Loss</div></div>
            <div style={S.mCard}><div style={{ fontSize:24, fontWeight:900, color:"#8B5CF6" }}>{sbndTotals.aspRatio}</div><div style={S.mLabel}>ASP Ratio</div></div>
          </div>
          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 20px", background:"#6B21A8", color:"#FFF", fontWeight:800, fontSize:14, display:"flex", justifyContent:"space-between" }}>
              <span>SBND</span>
              <span style={{ fontSize:12, opacity:0.8 }}>{p}</span>
            </div>
            <div style={{ overflowX:"auto" }}>
              <table style={{ ...S.table, fontSize:13 }}>
                <thead><tr>
                  <th style={{ ...tHeadL, background:"#6B21A8" }}>SI_BUCKET</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>SBND</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>SBND%</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>SBND ASP</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>Loss</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>Loss%</th>
                  <th style={{ ...tHead, background:"#6B21A8" }}>ASP Ratio</th>
                </tr></thead>
                <tbody>
                  {sbndData.map((r,i)=>{
                    const sbndPct = soTotals.openInv ? ((r.count/soTotals.openInv)*100).toFixed(2)+"%" : "—";
                    const aspR = soTotals.openASP ? (r.sbndASP/soTotals.openASP).toFixed(2) : "—";
                    return (
                      <tr key={r.bucket} style={{ background: i%2===0?"#FFF":"#FAF5FF" }}>
                        <td style={tCellL}>{r.bucket}</td>
                        <td style={tCell}>{r.count}</td>
                        <td style={tCell}>{sbndPct}</td>
                        <td style={tCell}>{r.sbndASP.toLocaleString("en-IN")}</td>
                        <td style={{ ...tCell, color:lossColor(r.loss), fontWeight:700 }}>{r.loss.toLocaleString("en-IN")}</td>
                        <td style={{ ...tCell, color:lossColor(r.lossPct), fontWeight:700 }}>{r.lossPct.toFixed(1)}%</td>
                        <td style={tCell}>{aspR}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td style={tTotalCellL}></td>
                    <td style={tTotalCell}>{sbndTotals.count}</td>
                    <td style={tTotalCell}>{sbndTotals.sbndPct}</td>
                    <td style={tTotalCell}>{sbndTotals.sbndASP.toLocaleString("en-IN")}</td>
                    <td style={{ ...tTotalCell, color:lossColor(sbndTotals.loss) }}>{sbndTotals.loss.toLocaleString("en-IN")}</td>
                    <td style={{ ...tTotalCell, color:lossColor(parseFloat(sbndTotals.lossPct)) }}>{sbndTotals.lossPct}</td>
                    <td style={tTotalCell}>{sbndTotals.aspRatio}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ SMC ═══════ */}
      {section==="smc"&&(
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 20px", background:"#1E3A5F", color:"#FFF", fontWeight:800, fontSize:14 }}>SMC — STOCK_OUT</div>
            <table style={S.table}>
              <thead><tr>
                <th style={tHeadL}>SI_BUCKET</th><th style={tHead}>Sold</th><th style={tHead}>Open ASP</th><th style={tHead}>Sold ASP</th><th style={tHead}>Loss</th><th style={tHead}>Loss%</th>
              </tr></thead>
              <tbody>
                {(D.smc[p]?.sold||[]).map((r,i)=>(
                  <tr key={r.bucket} style={{ background:i%2===0?"#FFF":"#F8FAFC" }}>
                    <td style={tCellL}>{r.bucket}</td>
                    <td style={tCell}>{r.sold}</td>
                    <td style={tCell}>{r.openASP.toLocaleString("en-IN")}</td>
                    <td style={tCell}>{r.soldASP.toLocaleString("en-IN")}</td>
                    <td style={{ ...tCell, color:lossColor(r.loss), fontWeight:700 }}>{INR(r.loss)}</td>
                    <td style={{ ...tCell, color:lossColor(r.lossPct), fontWeight:700 }}>{r.lossPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ ...S.card, padding:0, overflow:"hidden" }}>
            <div style={{ padding:"12px 20px", background:"#6B21A8", color:"#FFF", fontWeight:800, fontSize:14 }}>SMC — SBND</div>
            <table style={S.table}>
              <thead><tr>
                <th style={{ ...tHeadL,background:"#6B21A8" }}>SI_BUCKET</th><th style={{ ...tHead,background:"#6B21A8" }}>Count</th><th style={{ ...tHead,background:"#6B21A8" }}>SBND ASP</th><th style={{ ...tHead,background:"#6B21A8" }}>Loss</th><th style={{ ...tHead,background:"#6B21A8" }}>Loss%</th>
              </tr></thead>
              <tbody>
                {(D.smc[p]?.sbnd||[]).map((r,i)=>(
                  <tr key={r.bucket} style={{ background:i%2===0?"#FFF":"#FAF5FF" }}>
                    <td style={tCellL}>{r.bucket}</td>
                    <td style={tCell}>{r.count}</td>
                    <td style={tCell}>{r.sbndASP.toLocaleString("en-IN")}</td>
                    <td style={{ ...tCell, color:lossColor(r.loss), fontWeight:700 }}>{r.loss.toLocaleString("en-IN")}</td>
                    <td style={{ ...tCell, color:lossColor(r.lossPct), fontWeight:700 }}>{r.lossPct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════ P&L HIT — Finance-savvy view ═══════ */}
      {section==="pnlhit"&&(
        <div>
          {/* Big P&L summary strip */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:0, marginBottom:24, borderRadius:12, overflow:"hidden", border:"1px solid #E2E8F0" }}>
            <div style={{ padding:"20px 24px", background:"#0F172A", textAlign:"center" }}>
              <div style={{ fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"2px", fontWeight:700 }}>Gross P&L</div>
              <div style={{ fontSize:28, fontWeight:900, color:"#EF4444", marginTop:6 }}>{INR(grossPnL)}</div>
              <div style={{ fontSize:11, color:"#64748B", marginTop:4 }}>{hit.soldCars.count} cars · {INR(hit.soldCars.avgLoss)}/car</div>
            </div>
            <div style={{ padding:"20px 24px", background:"#1E293B", textAlign:"center" }}>
              <div style={{ fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"2px", fontWeight:700 }}>Adjustments</div>
              <div style={{ fontSize:28, fontWeight:900, color:"#F59E0B", marginTop:6 }}>{INR((hit.leadFeeRevenue?.amount||0)+(hit.ninetyPlusSoldReversal?.reversalAmt||0)+(hit.provisionedCars?.provisionAmt||0)+(hit.returnedCars?.provisionAmt||0)+(hit.smcSoldCars?.pnl||0))}</div>
              <div style={{ fontSize:11, color:"#64748B", marginTop:4 }}>Provision + Returns + SMC + Revenue</div>
            </div>
            <div style={{ padding:"20px 24px", background:"#1E293B", textAlign:"center" }}>
              <div style={{ fontSize:10, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"2px", fontWeight:700 }}>Opex Costs</div>
              <div style={{ fontSize:28, fontWeight:900, color:"#F97316", marginTop:6 }}>{INR(-totalCosts)}</div>
              <div style={{ fontSize:11, color:"#64748B", marginTop:4 }}>Depreciation + Parking + Transport</div>
            </div>
            <div style={{ padding:"20px 24px", background: finalPnL>=0?"#064E3B":"#7F1D1D", textAlign:"center" }}>
              <div style={{ fontSize:10, color:"#FFF", textTransform:"uppercase", letterSpacing:"2px", fontWeight:700, opacity:0.8 }}>Net P&L Impact</div>
              <div style={{ fontSize:32, fontWeight:900, color:"#FFF", marginTop:6 }}>{INR(finalPnL)}</div>
              <div style={{ fontSize:11, color:"#FFF", marginTop:4, opacity:0.7 }}>{p} · {new Date().toLocaleDateString("en-IN",{month:"long",year:"numeric"})}</div>
            </div>
          </div>

          {/* Waterfall table */}
          <div style={{ ...S.card, padding:0, overflow:"hidden", marginBottom:20 }}>
            <div style={{ padding:"14px 20px", background:"#0F172A", color:"#FFF", fontWeight:800, fontSize:14 }}>P&L WATERFALL</div>
            <table style={{ ...S.table, fontSize:13 }}>
              <thead><tr>
                <th style={{ ...tHeadL, background:"#0F172A" }}>Component</th>
                <th style={{ ...tHead, background:"#0F172A" }}>Cars</th>
                <th style={{ ...tHead, background:"#0F172A" }}>Amount</th>
                <th style={{ ...tHead, background:"#0F172A" }}>Per Car</th>
                <th style={{ ...tHead, background:"#0F172A" }}>Type</th>
                <th style={{ ...tHead, background:"#0F172A" }}>Running Total</th>
              </tr></thead>
              <tbody>
                {(() => {
                  let running = 0;
                  const rows = [
                    { label:"Sold Cars P&L", count:hit.soldCars.count, amt:hit.soldCars.pnl, type:"loss" },
                    { label:"Provision (Unsold)", count:hit.provisionedCars.count, amt:hit.provisionedCars.provisionAmt, type:"loss" },
                    { label:"Returned Cars Provision", count:hit.returnedCars.count, amt:hit.returnedCars.provisionAmt, type:"loss" },
                    { label:"SMC Sold P&L", count:hit.smcSoldCars.count, amt:hit.smcSoldCars.pnl, type:"loss" },
                    { label:"Lead Fee Revenue", count:hit.leadFeeRevenue.cars, amt:hit.leadFeeRevenue.amount, type:"gain" },
                    { label:"90+ Sold Reversal", count:hit.ninetyPlusSoldReversal.count, amt:hit.ninetyPlusSoldReversal.reversalAmt, type:"gain" },
                    { label:"Depreciation Cost", count:null, amt:-(hit.depreciationCost||0), type:"cost" },
                    { label:"Parking Cost", count:null, amt:-(hit.parkingCost||0), type:"cost" },
                    { label:"Transport Cost", count:null, amt:-(hit.transportCost||0), type:"cost" },
                  ];
                  return rows.map((r,i) => {
                    running += r.amt;
                    const typeColors = { loss:"#FEE2E2", gain:"#DCFCE7", cost:"#FEF3C7" };
                    const typeText = { loss:"▼ Loss", gain:"▲ Revenue", cost:"◆ Cost" };
                    const typeTextColor = { loss:"#991B1B", gain:"#166534", cost:"#92400E" };
                    return (
                      <tr key={r.label} style={{ background:i%2===0?"#FFF":"#F8FAFC" }}>
                        <td style={{ ...tCellL, fontSize:13 }}>{r.label}</td>
                        <td style={tCell}>{r.count!=null?r.count:"—"}</td>
                        <td style={{ ...tCell, fontWeight:800, color: r.amt>=0?"#10B981":"#EF4444" }}>{r.amt>=0?"+":""}{INR(r.amt)}</td>
                        <td style={tCell}>{r.count?INR(Math.round(r.amt/r.count)):"—"}</td>
                        <td style={tCell}>
                          <span style={{ padding:"3px 10px", borderRadius:20, fontSize:10, fontWeight:700, background:typeColors[r.type], color:typeTextColor[r.type] }}>{typeText[r.type]}</span>
                        </td>
                        <td style={{ ...tCell, fontWeight:800, color:running>=0?"#10B981":"#EF4444" }}>{INR(running)}</td>
                      </tr>
                    );
                  });
                })()}
                <tr style={{ background:"#0F172A" }}>
                  <td style={{ ...tTotalCellL, background:"#0F172A", color:"#FFF", fontSize:15 }}>NET P&L</td>
                  <td style={{ ...tTotalCell, background:"#0F172A", color:"#FFF" }}>—</td>
                  <td style={{ ...tTotalCell, background:"#0F172A", color: finalPnL>=0?"#10B981":"#EF4444", fontSize:18 }}>{INR(finalPnL)}</td>
                  <td style={{ ...tTotalCell, background:"#0F172A", color:"#FFF" }}>{hit.soldCars.count?INR(Math.round(finalPnL/hit.soldCars.count)):"—"}</td>
                  <td style={{ ...tTotalCell, background:"#0F172A" }}></td>
                  <td style={{ ...tTotalCell, background:"#0F172A", color: finalPnL>=0?"#10B981":"#EF4444", fontSize:18 }}>{INR(finalPnL)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Margin analysis cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }}>
            <div style={{ ...S.card, padding:16, borderTop:"3px solid #3B82F6" }}>
              <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Loss / Car (Gross)</div>
              <div style={{ fontSize:24, fontWeight:900, color:"#EF4444", marginTop:6 }}>{INR(hit.soldCars.avgLoss)}</div>
            </div>
            <div style={{ ...S.card, padding:16, borderTop:"3px solid #10B981" }}>
              <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Lead Fee / Car</div>
              <div style={{ fontSize:24, fontWeight:900, color:"#10B981", marginTop:6 }}>{INR(hit.leadFeeRevenue.cars?Math.round(hit.leadFeeRevenue.amount/hit.leadFeeRevenue.cars):0)}</div>
            </div>
            <div style={{ ...S.card, padding:16, borderTop:"3px solid #F59E0B" }}>
              <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Provision / Unsold Car</div>
              <div style={{ fontSize:24, fontWeight:900, color:"#F59E0B", marginTop:6 }}>{INR(hit.provisionedCars.count?Math.round(hit.provisionedCars.provisionAmt/hit.provisionedCars.count):0)}</div>
            </div>
            <div style={{ ...S.card, padding:16, borderTop:"3px solid #8B5CF6" }}>
              <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Net P&L / Car</div>
              <div style={{ fontSize:24, fontWeight:900, color: finalPnL>=0?"#10B981":"#EF4444", marginTop:6 }}>{INR(hit.soldCars.count?Math.round(finalPnL/hit.soldCars.count):0)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 5 — AUCTION CONSOLE
//  ┌─────────────────────────────────────────────────────────────────┐
//  │  Sub-tabs:                                                      │
//  │    (A) SCHEDULED AUCTIONS — time-slot based 9:30 AM → 7:30 PM  │
//  │    (B) OCB CONSOLE — Open Challenge Bids with nego-aware pricing│
//  └─────────────────────────────────────────────────────────────────┘
// ═════════════════════════════════════════════════════════════════════
const SLOT_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const CANONICAL_BUCKETS = ["0-30", "30-60", "60-90", "90-120", "120-150", "150-180", "180+"];

// Generate 30-min windows from 9:30 to 19:30
const generateTimeSlots = (numSlots) => {
  const slots = [];
  let h = 9, m = 30;
  while (h < 19 || (h === 19 && m === 0)) {
    const slotIdx = slots.length % numSlots;
    const slotLetter = SLOT_NAMES[slotIdx];
    const startStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    let eh = h, em = m + 30;
    if (em >= 60) { eh += 1; em -= 60; }
    const endStr = `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
    slots.push({ slot: slotLetter, start: startStr, end: endStr, index: slots.length });
    h = eh; m = em;
  }
  return slots;
};

// Which time-slot is active RIGHT NOW?
const getCurrentTimeSlot = (schedule) => {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  for (const ts of schedule) {
    const [sh, sm] = ts.start.split(":").map(Number);
    const [eh, em] = ts.end.split(":").map(Number);
    const s = sh * 60 + sm, e = eh * 60 + em;
    if (mins >= s && mins < e) return ts;
  }
  return null;
};

function AuctionTab({ rows, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [subTab, setSubTab] = useState("scheduled"); // "scheduled" | "ocb"

  return (
    <div>
      {/* Sub-tab toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button style={subTab === "scheduled" ? S.navActive : S.navBtn} onClick={() => setSubTab("scheduled")}>
          <span style={{ marginRight: 6 }}>⏱️</span>Scheduled Auctions
        </button>
        <button style={subTab === "ocb" ? S.navActive : S.navBtn} onClick={() => setSubTab("ocb")}>
          <span style={{ marginRight: 6 }}>🎯</span>OCB Console
        </button>
      </div>

      {subTab === "scheduled" && (
        <ScheduledAuctions rows={rows} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />
      )}
      {subTab === "ocb" && (
        <OCBConsole rows={rows} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  (A) SCHEDULED AUCTIONS — time-slot based
// ─────────────────────────────────────────────────────────────────────
function ScheduledAuctions({ rows, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [numSlots, setNumSlots] = useState(3);
  const [slotAssignments, setSlotAssignments] = useState({});
  const [bucketAnchors, setBucketAnchors] = useState({});
  const [scheduleActive, setScheduleActive] = useState(false);
  const [lastFired, setLastFired] = useState(null);
  const [firedSlots, setFiredSlots] = useState(new Set());
  const [now, setNow] = useState(new Date());

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(t);
  }, []);

  // Discover SI buckets
  const SI_BUCKETS = useMemo(() => {
    const found = new Set();
    for (const r of rows) {
      const b = String(r.AGE_BUCKET || "").trim();
      if (b) found.add(b);
    }
    return found.size ? sortBuckets([...found]) : CANONICAL_BUCKETS;
  }, [rows]);

  // Bucket stats
  const bucketStats = useMemo(() => {
    const map = {};
    for (const b of SI_BUCKETS) map[b] = { bucket: b, count: 0, totalBP: 0, cars: [] };
    for (const r of rows) {
      const b = String(r.AGE_BUCKET || "").trim();
      if (!map[b]) continue;
      const bp = toNum(r.BUYING_PRICE) || 0;
      map[b].count++;
      map[b].totalBP += bp;
      map[b].cars.push(r);
    }
    for (const b of SI_BUCKETS) {
      map[b].avgBP = map[b].count ? Math.round(map[b].totalBP / map[b].count) : 0;
    }
    return map;
  }, [rows, SI_BUCKETS]);

  // Default anchors
  useEffect(() => {
    setBucketAnchors((prev) => {
      const next = { ...prev };
      for (const b of SI_BUCKETS) {
        if (next[b] == null && bucketStats[b]?.avgBP > 0) {
          next[b] = Math.round(bucketStats[b].avgBP * 0.95);
        }
      }
      return next;
    });
  }, [bucketStats, SI_BUCKETS]);

  // Auto-distribute on first load
  useEffect(() => {
    setSlotAssignments((prev) => {
      const activeNow = SLOT_NAMES.slice(0, numSlots);
      const anyAssigned = Object.values(prev).some((s) => s && s.size > 0);
      const next = {};
      for (const s of activeNow) next[s] = prev[s] ? new Set(prev[s]) : new Set();
      if (!anyAssigned && SI_BUCKETS.length) {
        SI_BUCKETS.forEach((b, i) => {
          if (bucketStats[b]?.count > 0) next[activeNow[i % activeNow.length]].add(b);
        });
      }
      return next;
    });
  }, [numSlots, SI_BUCKETS.length]);

  const activeSlots = SLOT_NAMES.slice(0, numSlots);

  // Time schedule
  const schedule = useMemo(() => generateTimeSlots(numSlots), [numSlots]);
  const currentTS = useMemo(() => getCurrentTimeSlot(schedule), [schedule, now]);

  // Slot helpers
  const bucketOwner = (bucket) => {
    for (const s of activeSlots) if (slotAssignments[s]?.has(bucket)) return s;
    return null;
  };
  const toggleBucket = (slot, bucket) => {
    setSlotAssignments((prev) => {
      const next = {};
      for (const s of activeSlots) next[s] = new Set(prev[s] || []);
      const owner = activeSlots.find((s) => next[s].has(bucket));
      if (owner === slot) next[slot].delete(bucket);
      else { if (owner) next[owner].delete(bucket); next[slot].add(bucket); }
      return next;
    });
  };
  const setBucketAnchor = (bucket, val) => setBucketAnchors((prev) => ({ ...prev, [bucket]: Number(val) }));

  // Per-slot stats
  const slotStats = useMemo(() => {
    const out = {};
    for (const s of activeSlots) {
      const bs = [...(slotAssignments[s] || [])];
      let cars = 0, totalBP = 0, totalAnchor = 0;
      for (const b of bs) {
        const bkt = bucketStats[b]; if (!bkt) continue;
        cars += bkt.count; totalBP += bkt.totalBP;
        totalAnchor += (bucketAnchors[b] ?? bkt.avgBP) * bkt.count;
      }
      out[s] = { cars, totalBP, totalAnchor, avgBP: cars ? Math.round(totalBP / cars) : 0, avgAnchor: cars ? Math.round(totalAnchor / cars) : 0, pnl: totalAnchor - totalBP };
    }
    return out;
  }, [activeSlots, slotAssignments, bucketStats, bucketAnchors]);

  const globalStats = useMemo(() => {
    let cars = 0, bp = 0, anchor = 0;
    Object.values(slotStats).forEach((s) => { cars += s.cars; bp += s.totalBP; anchor += s.totalAnchor; });
    return { cars, bp, anchor, pnl: anchor - bp, avgPnL: cars ? (anchor - bp) / cars : 0 };
  }, [slotStats]);

  // Auto-fire: when schedule is active, fire the current slot every 30 min
  useEffect(() => {
    if (!scheduleActive || !currentTS) return;
    const key = `${currentTS.start}_${currentTS.slot}`;
    if (firedSlots.has(key)) return;
    // Fire this slot
    const slot = currentTS.slot;
    const buckets = [...(slotAssignments[slot] || [])];
    if (!buckets.length) return;

    (async () => {
      let sent = 0;
      for (const b of buckets) {
        const anchor = bucketAnchors[b] ?? bucketStats[b]?.avgBP ?? 0;
        for (const car of (bucketStats[b]?.cars || [])) {
          await appendToSheet(sheetUrl, {
            timestamp: new Date().toISOString(),
            appointmentId: car.LEAD_ID,
            region: car.REGION || "",
            anchorPrice: anchor,
            auctionStartFor: `SLOT_${slot}_${b}_${currentTS.start}`,
            submittedBy: currentUser || "Auto",
            email: managerEmail || "",
            date: new Date().toLocaleDateString("en-IN"),
          });
          sent++;
        }
      }
      if (slackUrl) {
        await sendSlackMessage(slackUrl,
          `:clock3: *AUTO AUCTION — Slot ${slot}* (${currentTS.start}–${currentTS.end})\n*Cars:* ${sent} | *Buckets:* ${buckets.join(", ")}\n*By:* ${currentUser || "Auto-scheduler"}`
        );
      }
      setFiredSlots((prev) => new Set([...prev, key]));
      setLastFired({ slot, time: currentTS.start, count: sent, ts: new Date().toLocaleString("en-IN") });
    })();
  }, [scheduleActive, currentTS, firedSlots, slotAssignments, bucketAnchors, bucketStats, sheetUrl, slackUrl, managerEmail, currentUser]);

  const slotColors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#EF4444", "#84CC16"];

  return (
    <div>
      {/* ── Schedule ON/OFF + Live clock ────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => { setScheduleActive(!scheduleActive); if (!scheduleActive) setFiredSlots(new Set()); }}
            style={{
              ...S.pri,
              padding: "14px 32px",
              fontSize: 16,
              background: scheduleActive ? "#EF4444" : "#10B981",
            }}
          >
            {scheduleActive ? "⏸️ Stop Schedule" : "▶️ Start Auto-Auction Schedule"}
          </button>
          <div>
            <div style={{ fontSize: 13, color: "#64748B" }}>Status</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: scheduleActive ? "#10B981" : "#64748B" }}>
              {scheduleActive ? "🟢 LIVE — Auto-firing every 30 min" : "⏹️ Stopped"}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "#64748B" }}>Current Time</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: "#0F172A", fontVariantNumeric: "tabular-nums" }}>
            {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
          </div>
          {currentTS && (
            <div style={{ fontSize: 12, color: slotColors[activeSlots.indexOf(currentTS.slot)] || "#3B82F6", fontWeight: 700, marginTop: 2 }}>
              Active Window: Slot {currentTS.slot} ({currentTS.start}–{currentTS.end})
            </div>
          )}
          {!currentTS && scheduleActive && (
            <div style={{ fontSize: 12, color: "#F59E0B", marginTop: 2 }}>Outside auction hours (9:30 AM–7:30 PM)</div>
          )}
        </div>
      </div>

      {/* ── Slot count selector ─────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>🎰 Number of Auction Slots</div>
        <div style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>
          Slots rotate every 30 min: A → B → C → A → B → C … from 9:30 AM to 7:30 PM ({Math.floor(20 / numSlots)} full cycles/day)
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => setNumSlots(n)} style={{ padding: "10px 22px", borderRadius: 10, border: numSlots === n ? "2px solid #3B82F6" : "2px solid #E2E8F0", background: numSlots === n ? "#EFF6FF" : "#FFF", color: numSlots === n ? "#1D4ED8" : "#64748B", fontWeight: 800, fontSize: 15, cursor: "pointer", fontFamily: "inherit", minWidth: 56 }}>
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* ── Time Schedule Visual ─────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>📅 Today's Auction Timeline</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {schedule.map((ts, i) => {
            const color = slotColors[activeSlots.indexOf(ts.slot)] || "#94A3B8";
            const isCurrent = currentTS && ts.start === currentTS.start;
            const isFired = firedSlots.has(`${ts.start}_${ts.slot}`);
            return (
              <div key={i} style={{
                padding: "8px 10px",
                borderRadius: 8,
                fontSize: 11,
                fontWeight: 700,
                textAlign: "center",
                minWidth: 70,
                border: isCurrent ? `2px solid ${color}` : "1px solid #E2E8F0",
                background: isCurrent ? `${color}1A` : (isFired ? "#ECFDF5" : "#FFF"),
                color: isCurrent ? color : (isFired ? "#10B981" : "#64748B"),
                position: "relative",
              }}>
                <div style={{ fontSize: 13, fontWeight: 900, color: isCurrent ? color : "#0F172A" }}>
                  {ts.slot}
                </div>
                <div>{ts.start}</div>
                {isFired && <span style={{ fontSize: 9 }}>✓ done</span>}
                {isCurrent && scheduleActive && <span style={{ fontSize: 9, color }}>● LIVE</span>}
              </div>
            );
          })}
        </div>
        {lastFired && (
          <div style={{ marginTop: 12, fontSize: 13, color: "#10B981", fontWeight: 600 }}>
            ✅ Last fired: Slot {lastFired.slot} at {lastFired.time} — {lastFired.count} cars — {lastFired.ts}
          </div>
        )}
      </div>

      {/* ── Global summary ──────────────────────────────────────── */}
      <div style={S.metrics}>
        <div style={S.mCard}><div style={{ fontSize: 26, fontWeight: 900, color: "#3B82F6" }}>{globalStats.cars.toLocaleString()}</div><div style={S.mLabel}>Cars in Auction</div></div>
        <div style={S.mCard}><div style={{ fontSize: 26, fontWeight: 900, color: "#F59E0B" }}>{INR(globalStats.bp)}</div><div style={S.mLabel}>Total Buying Value</div></div>
        <div style={S.mCard}><div style={{ fontSize: 26, fontWeight: 900, color: "#8B5CF6" }}>{INR(globalStats.anchor)}</div><div style={S.mLabel}>Total Anchor Value</div></div>
        <div style={S.mCard}><div style={{ fontSize: 26, fontWeight: 900, color: globalStats.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.pnl)}</div><div style={S.mLabel}>Expected P&L</div></div>
        <div style={S.mCard}><div style={{ fontSize: 26, fontWeight: 900, color: globalStats.avgPnL >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.avgPnL)}</div><div style={S.mLabel}>Avg P&L / Car</div></div>
      </div>

      {/* ── Slot Cards (same bucket picker as before) ────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
        {activeSlots.map((slot, idx) => {
          const color = slotColors[idx % slotColors.length];
          const st = slotStats[slot];
          const slotBuckets = slotAssignments[slot] || new Set();
          // How many windows this slot gets today
          const windowCount = schedule.filter((ts) => ts.slot === slot).length;
          const nextWindow = schedule.find((ts) => {
            const [sh, sm] = ts.start.split(":").map(Number);
            const smins = sh * 60 + sm;
            const nowMins = now.getHours() * 60 + now.getMinutes();
            return ts.slot === slot && smins > nowMins;
          });

          return (
            <div key={slot} style={{ ...S.card, borderLeft: `4px solid ${color}`, padding: 0, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: `${color}0D`, borderBottom: "1px solid #E2E8F0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: color, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900 }}>{slot}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>Slot {slot}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                      {slotBuckets.size ? [...slotBuckets].join(" · ") : "No buckets selected"} · {windowCount} windows today
                      {nextWindow && <span style={{ color }}> · Next: {nextWindow.start}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 24, textAlign: "right" }}>
                  <div><div style={S.slotMetricLabel}>Cars</div><div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{st.cars.toLocaleString()}</div></div>
                  <div><div style={S.slotMetricLabel}>Avg BP</div><div style={{ fontSize: 18, fontWeight: 900, color: "#F59E0B" }}>{INR(st.avgBP)}</div></div>
                  <div><div style={S.slotMetricLabel}>Avg Anchor</div><div style={{ fontSize: 18, fontWeight: 900, color }}>{INR(st.avgAnchor)}</div></div>
                  <div><div style={S.slotMetricLabel}>Slot P&L</div><div style={{ fontSize: 18, fontWeight: 900, color: st.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(st.pnl)}</div></div>
                </div>
              </div>

              {/* Bucket rows */}
              <div style={{ padding: "8px 20px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "180px 90px 140px 1fr 200px", gap: 16, padding: "10px 0 6px", borderBottom: "1px solid #E2E8F0" }}>
                  <div style={S.slotMetricLabel}>Bucket</div>
                  <div style={S.slotMetricLabel}>Cars</div>
                  <div style={S.slotMetricLabel}>Avg BP</div>
                  <div style={S.slotMetricLabel}>Avg Anchor (slide)</div>
                  <div style={{ ...S.slotMetricLabel, textAlign: "right" }}>Delta from BP</div>
                </div>

                {SI_BUCKETS.map((b) => {
                  const bkt = bucketStats[b]; if (!bkt) return null;
                  const owner = bucketOwner(b);
                  const checked = owner === slot;
                  const ownedElsewhere = owner && owner !== slot;
                  const disabled = bkt.count === 0;
                  const avgBP = bkt.avgBP;
                  const min = Math.max(1000, Math.round(avgBP * 0.70));
                  const max = Math.round(avgBP * 1.10);
                  const anchor = bucketAnchors[b] ?? avgBP;
                  const deltaAbs = anchor - avgBP;
                  const deltaPct = avgBP ? (deltaAbs / avgBP) * 100 : 0;

                  return (
                    <div key={b} style={{ display: "grid", gridTemplateColumns: "180px 90px 140px 1fr 200px", gap: 16, alignItems: "center", padding: "14px 0", borderBottom: "1px solid #F1F5F9", opacity: disabled ? 0.35 : (ownedElsewhere ? 0.45 : 1) }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer" }}>
                        <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggleBucket(slot, b)} style={{ width: 18, height: 18, accentColor: color, cursor: disabled ? "not-allowed" : "pointer" }} />
                        <span style={{ padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 800, background: checked ? `${color}1F` : "#F1F5F9", color: checked ? color : "#64748B", border: checked ? `1px solid ${color}55` : "1px solid transparent" }}>{b}</span>
                        {ownedElsewhere && <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>in {owner}</span>}
                      </label>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{bkt.count.toLocaleString()}</div>
                      <div style={{ padding: "8px 12px", background: "#FEF3C7", borderRadius: 8, fontSize: 14, fontWeight: 800, color: "#92400E", textAlign: "center", border: "1px solid #FDE68A" }}>{INR(avgBP)}</div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginBottom: 4 }}>
                          <span>{INR(min)}</span>
                          <span style={{ fontWeight: 800, color: "#0F172A", fontSize: 14 }}>{INR(anchor)}</span>
                          <span>{INR(max)}</span>
                        </div>
                        <input type="range" min={min} max={max} step={500} value={Math.min(max, Math.max(min, anchor))} disabled={!checked || disabled} onChange={(e) => setBucketAnchor(b, e.target.value)} style={{ width: "100%", accentColor: color, cursor: (checked && !disabled) ? "pointer" : "not-allowed" }} />
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ display: "inline-block", padding: "6px 14px", borderRadius: 8, background: deltaAbs >= 0 ? "#DCFCE7" : "#FEE2E2", color: deltaAbs >= 0 ? "#166534" : "#991B1B", fontWeight: 800, fontSize: 13 }}>
                          {deltaAbs >= 0 ? "▲ +" : "▼ "}{INR(Math.abs(deltaAbs))}
                          <span style={{ opacity: 0.75, marginLeft: 6, fontSize: 11 }}>({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
//  (B) OCB CONSOLE — Open Challenge Bids
//      Price logic: dealer can nego down by 10%, so if you run OCB at
//      price X, dealer actually bids ~X*0.90. So to not exceed your max
//      loss budget, OCB price must be ≥ BP − maxLoss + 10% buffer.
//      Formula: OCB Price = (BP − maxLoss) / 0.90
// ─────────────────────────────────────────────────────────────────────
function OCBConsole({ rows, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [search, setSearch] = useState("");
  const [bucketF, setBucketF] = useState("ALL");
  const [regionF, setRegionF] = useState("ALL");
  const [selectedCars, setSelectedCars] = useState(new Map()); // LEAD_ID → { ocbPrice, maxLoss, duration }
  const [globalMaxLoss, setGlobalMaxLoss] = useState(10000);
  const [globalDuration, setGlobalDuration] = useState(60);
  const [negoPercent, setNegoPercent] = useState(10);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);
  const [page, setPage] = useState(0);
  const PG = 50;

  const buckets = useMemo(() => ["ALL", ...new Set(rows.map((r) => String(r.AGE_BUCKET || "").trim()).filter(Boolean))], [rows]);
  const regions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.REGION).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    let f = rows;
    if (bucketF !== "ALL") f = f.filter((r) => String(r.AGE_BUCKET || "").trim() === bucketF);
    if (regionF !== "ALL") f = f.filter((r) => r.REGION === regionF);
    if (search) {
      const s = search.toLowerCase();
      f = f.filter((r) => String(r.LEAD_ID || "").toLowerCase().includes(s) || String(r.MAKE || "").toLowerCase().includes(s) || String(r.MODEL || "").toLowerCase().includes(s));
    }
    return f;
  }, [rows, bucketF, regionF, search]);

  const pg = filtered.slice(page * PG, (page + 1) * PG);
  const tp = Math.ceil(filtered.length / PG);

  // Compute OCB price: ensure dealer's 10%-down bid still covers BP − maxLoss
  // Dealer bids = OCB * (1 - negoPercent/100)
  // We need: OCB * (1 - nego%) >= BP - maxLoss
  // So: OCB >= (BP - maxLoss) / (1 - nego%)
  const computeOCBPrice = (bp, maxLoss, negoPct) => {
    const minAfterNego = bp - maxLoss;
    return Math.ceil(minAfterNego / (1 - negoPct / 100) / 100) * 100; // Round up to nearest 100
  };

  const toggleCar = (car) => {
    const id = car.LEAD_ID;
    setSelectedCars((prev) => {
      const next = new Map(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        const bp = toNum(car.BUYING_PRICE) || 0;
        const ocbPrice = computeOCBPrice(bp, globalMaxLoss, negoPercent);
        next.set(id, { car, ocbPrice, maxLoss: globalMaxLoss, duration: globalDuration, bp });
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedCars((prev) => {
      const next = new Map(prev);
      for (const car of filtered) {
        const id = car.LEAD_ID;
        if (!next.has(id)) {
          const bp = toNum(car.BUYING_PRICE) || 0;
          next.set(id, { car, ocbPrice: computeOCBPrice(bp, globalMaxLoss, negoPercent), maxLoss: globalMaxLoss, duration: globalDuration, bp });
        }
      }
      return next;
    });
  };

  const deselectAll = () => setSelectedCars(new Map());

  const updateCarOCB = (id, field, value) => {
    setSelectedCars((prev) => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (!entry) return next;
      const updated = { ...entry, [field]: Number(value) };
      // Recalc OCB price if maxLoss changed
      if (field === "maxLoss") {
        updated.ocbPrice = computeOCBPrice(updated.bp, updated.maxLoss, negoPercent);
      }
      next.set(id, updated);
      return next;
    });
  };

  // Apply global max loss to all selected
  const applyGlobalLoss = () => {
    setSelectedCars((prev) => {
      const next = new Map();
      for (const [id, entry] of prev) {
        const ocbPrice = computeOCBPrice(entry.bp, globalMaxLoss, negoPercent);
        next.set(id, { ...entry, maxLoss: globalMaxLoss, duration: globalDuration, ocbPrice });
      }
      return next;
    });
  };

  // OCB summary stats
  const ocbStats = useMemo(() => {
    let count = 0, totalBP = 0, totalOCB = 0, totalExpectedLoss = 0;
    for (const [, entry] of selectedCars) {
      count++;
      totalBP += entry.bp;
      totalOCB += entry.ocbPrice;
      const expectedDealerBid = entry.ocbPrice * (1 - negoPercent / 100);
      totalExpectedLoss += expectedDealerBid - entry.bp;
    }
    return { count, totalBP, totalOCB, totalExpectedLoss, avgLoss: count ? totalExpectedLoss / count : 0 };
  }, [selectedCars, negoPercent]);

  const runOCB = async () => {
    if (!selectedCars.size) { alert("No cars selected for OCB."); return; }
    if (!currentUser) { alert("Please enter your name in the header first."); return; }
    if (!confirm(`Run OCB on ${selectedCars.size} cars?\nExpected worst-case loss: ${INR(ocbStats.totalExpectedLoss)}`)) return;
    setRunning(true);

    let sent = 0;
    for (const [id, entry] of selectedCars) {
      await appendToSheet(sheetUrl, {
        timestamp: new Date().toISOString(),
        appointmentId: id,
        region: entry.car.REGION || "",
        anchorPrice: entry.ocbPrice,
        auctionStartFor: `OCB_${entry.duration}min`,
        submittedBy: currentUser,
        email: managerEmail || "",
        date: new Date().toLocaleDateString("en-IN"),
        maxLoss: entry.maxLoss,
        expectedDealerBid: Math.round(entry.ocbPrice * (1 - negoPercent / 100)),
      });
      sent++;
    }

    if (slackUrl) {
      await sendSlackMessage(slackUrl,
        `:dart: *OCB RUN STARTED*\n*Cars:* ${sent} | *Duration:* ${globalDuration} min\n*Nego assumption:* ${negoPercent}% | *Max loss/car:* ₹${globalMaxLoss.toLocaleString("en-IN")}\n*Expected total P&L:* ₹${ocbStats.totalExpectedLoss.toLocaleString("en-IN")}\n*By:* ${currentUser}`
      );
    }

    setLastRun({ count: sent, pnl: ocbStats.totalExpectedLoss, time: new Date().toLocaleString("en-IN") });
    setSelectedCars(new Map());
    setRunning(false);
  };

  return (
    <div>
      {/* ── OCB Pricing Logic Explainer ────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16, background: "#F0F9FF", border: "1px solid #BAE6FD" }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "#0369A1", marginBottom: 8 }}>🎯 How OCB Pricing Works</div>
        <div style={{ fontSize: 13, color: "#0C4A6E", lineHeight: 1.8 }}>
          You set an <b>OCB price</b>. The dealer can negotiate down by up to <b>{negoPercent}%</b>, so their actual bid = OCB × {(100 - negoPercent)}%.
          <br />
          If your <b>max acceptable loss</b> is ₹{globalMaxLoss.toLocaleString("en-IN")}/car, the system auto-calculates the minimum OCB price as:
          <br />
          <span style={{ fontFamily: "monospace", background: "#E0F2FE", padding: "2px 8px", borderRadius: 4, fontWeight: 700 }}>
            OCB Price ≥ (BP − MaxLoss) ÷ {((100 - negoPercent) / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* ── Global OCB Controls ──────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>⚙️ OCB Parameters</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr auto", gap: 14, alignItems: "end" }}>
          <div>
            <label style={S.fLabel}>Max Loss per Car (₹)</label>
            <input style={S.inp} type="number" value={globalMaxLoss} onChange={(e) => setGlobalMaxLoss(Number(e.target.value))} />
          </div>
          <div>
            <label style={S.fLabel}>Dealer Nego Range (%)</label>
            <input style={S.inp} type="number" min={0} max={30} value={negoPercent} onChange={(e) => setNegoPercent(Number(e.target.value))} />
          </div>
          <div>
            <label style={S.fLabel}>OCB Duration (min)</label>
            <select style={S.inp} value={globalDuration} onChange={(e) => setGlobalDuration(Number(e.target.value))}>
              <option value={30}>30 min</option>
              <option value={60}>60 min</option>
              <option value={90}>90 min</option>
              <option value={120}>120 min</option>
              <option value={180}>180 min</option>
              <option value={240}>240 min</option>
            </select>
          </div>
          <div>
            <label style={S.fLabel}>Example: ₹3L car</label>
            <div style={{ padding: "11px 14px", background: "#FEF3C7", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#92400E", border: "1px solid #FDE68A" }}>
              OCB = {INR(computeOCBPrice(300000, globalMaxLoss, negoPercent))} → Dealer bids ~{INR(Math.round(computeOCBPrice(300000, globalMaxLoss, negoPercent) * (1 - negoPercent / 100)))}
            </div>
          </div>
          <button style={{ ...S.pri, background: "#8B5CF6", padding: "11px 20px" }} onClick={applyGlobalLoss}>
            Apply to All Selected
          </button>
        </div>
      </div>

      {/* ── OCB Summary ──────────────────────────────────────────── */}
      <div style={S.metrics}>
        <div style={S.mCard}><div style={{ fontSize: 24, fontWeight: 900, color: "#3B82F6" }}>{ocbStats.count}</div><div style={S.mLabel}>Cars Selected</div></div>
        <div style={S.mCard}><div style={{ fontSize: 24, fontWeight: 900, color: "#F59E0B" }}>{INR(ocbStats.totalBP)}</div><div style={S.mLabel}>Total BP</div></div>
        <div style={S.mCard}><div style={{ fontSize: 24, fontWeight: 900, color: "#8B5CF6" }}>{INR(ocbStats.totalOCB)}</div><div style={S.mLabel}>Total OCB Value</div></div>
        <div style={S.mCard}><div style={{ fontSize: 24, fontWeight: 900, color: ocbStats.totalExpectedLoss >= 0 ? "#10B981" : "#EF4444" }}>{INR(ocbStats.totalExpectedLoss)}</div><div style={S.mLabel}>Expected P&L (worst case)</div></div>
        <div style={S.mCard}><div style={{ fontSize: 24, fontWeight: 900, color: ocbStats.avgLoss >= 0 ? "#10B981" : "#EF4444" }}>{INR(ocbStats.avgLoss)}</div><div style={S.mLabel}>Avg Loss / Car</div></div>
      </div>

      {/* ── Car Selector Table ────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
        <input style={S.searchBox} placeholder="🔍 Search App ID, Make, Model…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select style={S.sel} value={bucketF} onChange={(e) => { setBucketF(e.target.value); setPage(0); }}>
          {buckets.map((b) => <option key={b} value={b}>{b === "ALL" ? "📅 All Buckets" : b}</option>)}
        </select>
        <select style={S.sel} value={regionF} onChange={(e) => { setRegionF(e.target.value); setPage(0); }}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "📍 All Regions" : r}</option>)}
        </select>
        <button style={{ ...S.pri, padding: "8px 16px", fontSize: 12, background: "#10B981" }} onClick={selectAll}>Select All ({filtered.length})</button>
        <button style={{ ...S.pri, padding: "8px 16px", fontSize: 12, background: "#EF4444" }} onClick={deselectAll}>Clear All</button>
        <span style={S.fCount}>{selectedCars.size} selected / {filtered.length} shown</span>
      </div>

      <div style={S.tWrap}>
        <div style={{ ...S.tScroll, maxHeight: "50vh" }}>
          <table style={S.table}>
            <thead><tr>
              {["", "App ID", "Make / Model", "Year", "Bucket", "Region", "Buying Price", "OCB Price", "Dealer Bid (~)", "P&L", "Max Loss", "Duration"].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {pg.map((car) => {
                const id = car.LEAD_ID;
                const sel = selectedCars.get(id);
                const bp = toNum(car.BUYING_PRICE) || 0;
                const ocbPrice = sel ? sel.ocbPrice : computeOCBPrice(bp, globalMaxLoss, negoPercent);
                const dealerBid = Math.round(ocbPrice * (1 - negoPercent / 100));
                const pnl = dealerBid - bp;
                return (
                  <tr key={id} className="tr" style={{ background: sel ? "#EFF6FF" : "transparent" }}>
                    <td style={S.td}>
                      <input type="checkbox" checked={!!sel} onChange={() => toggleCar(car)} style={{ width: 16, height: 16, accentColor: "#3B82F6", cursor: "pointer" }} />
                    </td>
                    <td style={{ ...S.td, color: "#3B82F6", fontWeight: 700 }}>{id}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{car.MAKE} {car.MODEL}</td>
                    <td style={S.td}>{car.Year || "—"}</td>
                    <td style={S.td}><span style={S.bucketChip}>{car.AGE_BUCKET || "—"}</span></td>
                    <td style={S.td}>{car.REGION || "—"}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700 }}>{INR(bp)}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 800, color: "#8B5CF6" }}>{INR(ocbPrice)}</td>
                    <td style={{ ...S.td, textAlign: "right", color: "#64748B" }}>~{INR(dealerBid)}</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(pnl)}</td>
                    <td style={S.td}>
                      {sel ? (
                        <input type="number" value={sel.maxLoss} onChange={(e) => updateCarOCB(id, "maxLoss", e.target.value)}
                          style={{ ...S.inp, width: 80, padding: "6px 8px", fontSize: 12, textAlign: "right" }} />
                      ) : <span style={{ color: "#94A3B8" }}>₹{globalMaxLoss.toLocaleString("en-IN")}</span>}
                    </td>
                    <td style={S.td}>
                      {sel ? (
                        <select value={sel.duration} onChange={(e) => updateCarOCB(id, "duration", e.target.value)}
                          style={{ ...S.sel, padding: "6px 8px", fontSize: 12 }}>
                          <option value={30}>30m</option>
                          <option value={60}>60m</option>
                          <option value={90}>90m</option>
                          <option value={120}>2h</option>
                          <option value={180}>3h</option>
                          <option value={240}>4h</option>
                        </select>
                      ) : <span style={{ color: "#94A3B8" }}>{globalDuration}m</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={S.pag}>
          <button style={S.pgB} disabled={page === 0} onClick={() => setPage(0)}>⟨⟨</button>
          <button style={S.pgB} disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span style={S.pgI}>Page <b>{page + 1}</b>/<b>{tp || 1}</b></span>
          <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(page + 1)}>Next →</button>
          <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(tp - 1)}>⟩⟩</button>
        </div>
      </div>

      {/* ── RUN OCB ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 20, display: "flex", gap: 16, alignItems: "center", padding: 20, background: "#FFF", border: "1px solid #E2E8F0", borderRadius: 12, boxShadow: "0 1px 2px rgba(15,23,42,0.03)" }}>
        <button style={{ ...S.pri, background: "#DC2626", padding: "16px 36px", fontSize: 16 }} onClick={runOCB} disabled={running || !selectedCars.size}>
          {running ? "Running…" : `🎯 Run OCB on ${selectedCars.size} cars`}
        </button>
        <div style={{ color: "#64748B", fontSize: 13 }}>
          Max loss budget: <b style={{ color: "#EF4444" }}>{INR(ocbStats.totalExpectedLoss)}</b>
          {" · "}Avg: <b>{INR(ocbStats.avgLoss)}/car</b>
        </div>
        {lastRun && (
          <div style={{ marginLeft: "auto", color: "#10B981", fontSize: 13, fontWeight: 600 }}>
            ✅ Last: {lastRun.count} cars · {INR(lastRun.pnl)} · {lastRun.time}
          </div>
        )}
      </div>
    </div>
  );
}




// ═════════════════════════════════════════════════════════════════════
//  TAB 7 — BUSINESS SNAPSHOT (v2)
// ═════════════════════════════════════════════════════════════════════
const BIZ_SNAP_DATA = {
  MTD: {
    verificationTarget:1200, soTarget:950,
    verifications: { total:842, byBucket:[{b:"0-30",v:380},{b:"30-60",v:210},{b:"60-90",v:142},{b:"90-120",v:65},{b:"120-150",v:28},{b:"150-180",v:12},{b:"180+",v:5}] },
    liveCancellations:124,
    reCancellations: { total:68, byBucket:[{b:"0-30",v:22},{b:"30-60",v:18},{b:"60-90",v:14},{b:"90-120",v:8},{b:"120+",v:6}] },
    stockOuts: { total:718, byBucket:[{b:"0-30",v:320},{b:"30-60",v:178},{b:"60-90",v:118},{b:"90-120",v:58},{b:"120-150",v:28},{b:"150-180",v:10},{b:"180+",v:6}] },
    sbnd: {
      total:129,
      byBucket:[{b:"0-30",v:45},{b:"30-60",v:32},{b:"60-90",v:22},{b:"90-120",v:14},{b:"120-150",v:8},{b:"150-180",v:5},{b:"180+",v:3}],
      byAgeing:[{a:"0-3d",v:52},{a:"3-7d",v:38},{a:"7-10d",v:22},{a:"10+d",v:17}],
    },
    gfd: { total:48, byBucket:[{b:"0-30",v:18},{b:"30-60",v:12},{b:"60-90",v:8},{b:"90-120",v:5},{b:"120+",v:5}] },
    dealerActivity: {
      dayAuction: { cars:1840, auctions:8520, aucPerCar:4.6, impressions:42500, views:18200, bids:6340, avgImpr:23.1, avgViews:9.9, avgBids:3.4, i2v:42.8, v2b:34.8, i2b:14.9 },
      ocb:        { cars:420,  auctions:420,  aucPerCar:1.0, impressions:8800,  views:3200,  bids:1450, avgImpr:20.9, avgViews:7.6, avgBids:3.5, i2v:36.4, v2b:45.3, i2b:16.5 },
      touchBuy:   { cars:280,  auctions:280,  aucPerCar:1.0, impressions:5600,  views:2100,  bids:820,  avgImpr:20.0, avgViews:7.5, avgBids:2.9, i2v:37.5, v2b:39.0, i2b:14.6 },
    },
    leadFeeEarned:12_50_000, leadFeeRefunds:1_80_000, sbndOver10Days:17,
    leadFeeDetail: [
      { appId:"APP-10245", bp:285000, leadFee:3200, bucket:"0-30" },
      { appId:"APP-10312", bp:420000, leadFee:4800, bucket:"30-60" },
      { appId:"APP-10398", bp:195000, leadFee:2200, bucket:"0-30" },
      { appId:"APP-10455", bp:310000, leadFee:3500, bucket:"60-90" },
      { appId:"APP-10512", bp:148000, leadFee:1800, bucket:"90-120" },
      { appId:"APP-10589", bp:520000, leadFee:5500, bucket:"0-30" },
      { appId:"APP-10621", bp:275000, leadFee:3100, bucket:"30-60" },
      { appId:"APP-10678", bp:345000, leadFee:3800, bucket:"60-90" },
    ],
  },
  LMTD: {
    verificationTarget:1200, soTarget:950,
    verifications: { total:910, byBucket:[{b:"0-30",v:415},{b:"30-60",v:228},{b:"60-90",v:152},{b:"90-120",v:68},{b:"120-150",v:30},{b:"150-180",v:12},{b:"180+",v:5}] },
    liveCancellations:108,
    reCancellations: { total:58, byBucket:[{b:"0-30",v:18},{b:"30-60",v:16},{b:"60-90",v:12},{b:"90-120",v:7},{b:"120+",v:5}] },
    stockOuts: { total:782, byBucket:[{b:"0-30",v:350},{b:"30-60",v:195},{b:"60-90",v:128},{b:"90-120",v:62},{b:"120-150",v:30},{b:"150-180",v:11},{b:"180+",v:6}] },
    sbnd: {
      total:118,
      byBucket:[{b:"0-30",v:42},{b:"30-60",v:28},{b:"60-90",v:20},{b:"90-120",v:12},{b:"120-150",v:8},{b:"150-180",v:5},{b:"180+",v:3}],
      byAgeing:[{a:"0-3d",v:48},{a:"3-7d",v:35},{a:"7-10d",v:20},{a:"10+d",v:15}],
    },
    gfd: { total:42, byBucket:[{b:"0-30",v:16},{b:"30-60",v:10},{b:"60-90",v:7},{b:"90-120",v:5},{b:"120+",v:4}] },
    dealerActivity: {
      dayAuction: { cars:1960, auctions:9100, aucPerCar:4.6, impressions:45200, views:19500, bids:6800, avgImpr:23.1, avgViews:10.0, avgBids:3.5, i2v:43.1, v2b:34.9, i2b:15.0 },
      ocb:        { cars:450,  auctions:450,  aucPerCar:1.0, impressions:9400,  views:3500,  bids:1580, avgImpr:20.9, avgViews:7.8, avgBids:3.5, i2v:37.2, v2b:45.1, i2b:16.8 },
      touchBuy:   { cars:310,  auctions:310,  aucPerCar:1.0, impressions:6200,  views:2350,  bids:910,  avgImpr:20.0, avgViews:7.6, avgBids:2.9, i2v:37.9, v2b:38.7, i2b:14.7 },
    },
    leadFeeEarned:14_00_000, leadFeeRefunds:1_60_000, sbndOver10Days:15,
    leadFeeDetail: [
      { appId:"APP-09845", bp:295000, leadFee:3400, bucket:"0-30" },
      { appId:"APP-09912", bp:410000, leadFee:4600, bucket:"30-60" },
      { appId:"APP-09998", bp:205000, leadFee:2400, bucket:"0-30" },
      { appId:"APP-10055", bp:325000, leadFee:3600, bucket:"60-90" },
      { appId:"APP-10112", bp:155000, leadFee:1900, bucket:"90-120" },
    ],
  },
};

function BusinessSnapshotTab() {
  const [period, setPeriod] = useState("MTD");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [invFilter, setInvFilter] = useState("All"); // All | Opening Inv | SMC
  const [channelF, setChannelF] = useState("All");
  const [zoneF, setZoneF] = useState("All");
  const [activityFilter, setActivityFilter] = useState("dayAuction");
  const [actDateFrom, setActDateFrom] = useState("");
  const [actDateTo, setActDateTo] = useState("");

  const d = BIZ_SNAP_DATA[period === "LMTD" ? "LMTD" : "MTD"];
  const other = BIZ_SNAP_DATA[period === "LMTD" ? "MTD" : "LMTD"];
  const otherLabel = period === "LMTD" ? "MTD" : "LMTD";
  const act = d.dealerActivity[activityFilter];

  const delta = (curr, prev) => { const diff=curr-prev; const pct=prev?((diff/prev)*100).toFixed(1):0; return {diff,pct,up:diff>=0}; };

  const BucketTable = ({ data, label }) => (
    <table style={{ ...S.table, fontSize:12, marginTop:8 }}>
      <thead><tr><th style={S.th}>Bucket</th><th style={S.th}>{label}</th><th style={S.th}>%</th></tr></thead>
      <tbody>{data.map(r => {
        const total = data.reduce((s,x)=>s+x.v,0);
        return (<tr key={r.b||r.a} className="tr"><td style={S.td}><span style={S.bucketChip}>{r.b||r.a}</span></td><td style={{...S.td,fontWeight:700}}>{r.v.toLocaleString()}</td><td style={{...S.td,color:"#64748B"}}>{total?((r.v/total)*100).toFixed(1):0}%</td></tr>);
      })}</tbody>
    </table>
  );

  return (
    <div>
      {/* Period + Filters */}
      <div style={{ ...S.card, marginBottom:16, display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        {["MTD","LMTD","Custom"].map(pr=>(
          <button key={pr} onClick={()=>setPeriod(pr==="Custom"?"custom":pr)} style={{
            padding:"9px 18px", borderRadius:8, border:period===(pr==="Custom"?"custom":pr)?"2px solid #1E3A5F":"2px solid #E2E8F0",
            background:period===(pr==="Custom"?"custom":pr)?"#EFF6FF":"#FFF", color:period===(pr==="Custom"?"custom":pr)?"#1E3A5F":"#64748B",
            fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"inherit",
          }}>{pr}</button>
        ))}
        {period==="custom"&&(<>
          <input type="date" style={S.sel} value={dateFrom} onChange={e=>setDateFrom(e.target.value)} />
          <span style={{color:"#64748B"}}>to</span>
          <input type="date" style={S.sel} value={dateTo} onChange={e=>setDateTo(e.target.value)} />
        </>)}
        <div style={{width:1,height:28,background:"#E2E8F0"}} />
        <select style={S.sel} value={invFilter} onChange={e=>setInvFilter(e.target.value)}>
          <option value="All">📦 All Inventory</option><option value="Opening">Opening Inv</option><option value="SMC">Same Month Cancelled</option>
        </select>
        <select style={S.sel} value={channelF} onChange={e=>setChannelF(e.target.value)}>
          <option value="All">📡 All Channels</option><option value="C2D">C2D</option><option value="C2B">C2B</option>
        </select>
        <select style={S.sel} value={zoneF} onChange={e=>setZoneF(e.target.value)}>
          <option value="All">🌐 All Zones</option><option value="North">North</option><option value="South">South</option>
        </select>
        <div style={{ marginLeft:"auto", padding:"6px 14px", background:"#FEF3C7", borderRadius:8, fontSize:11, color:"#78350F", fontWeight:600 }}>⚠️ Dummy data</div>
      </div>

      {/* Targets */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:20 }}>
        <div style={{ ...S.card, padding:"16px 18px", background:"#F0FDF4", border:"1px solid #BBF7D0" }}>
          <div style={{ fontSize:10, color:"#166534", textTransform:"uppercase", letterSpacing:"1px", fontWeight:700 }}>Verification Target</div>
          <div style={{ fontSize:28, fontWeight:900, color:"#166534", marginTop:4 }}>{d.verificationTarget.toLocaleString()}</div>
          <div style={{ fontSize:12, color:"#15803D", marginTop:4 }}>Done: {d.verifications.total} ({((d.verifications.total/d.verificationTarget)*100).toFixed(0)}%)</div>
          <div style={{ height:6, background:"#DCFCE7", borderRadius:3, marginTop:8, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(100,(d.verifications.total/d.verificationTarget)*100)}%`, background:"#22C55E", borderRadius:3 }} /></div>
        </div>
        <div style={{ ...S.card, padding:"16px 18px", background:"#EFF6FF", border:"1px solid #BFDBFE" }}>
          <div style={{ fontSize:10, color:"#1E40AF", textTransform:"uppercase", letterSpacing:"1px", fontWeight:700 }}>SO Target</div>
          <div style={{ fontSize:28, fontWeight:900, color:"#1E40AF", marginTop:4 }}>{d.soTarget.toLocaleString()}</div>
          <div style={{ fontSize:12, color:"#1D4ED8", marginTop:4 }}>Done: {d.stockOuts.total} ({((d.stockOuts.total/d.soTarget)*100).toFixed(0)}%)</div>
          <div style={{ height:6, background:"#DBEAFE", borderRadius:3, marginTop:8, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(100,(d.stockOuts.total/d.soTarget)*100)}%`, background:"#3B82F6", borderRadius:3 }} /></div>
        </div>
        <div style={{ ...S.card, padding:"16px 18px" }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Live Cancellations</div><div style={{ fontSize:28, fontWeight:900, color:"#EF4444", marginTop:6 }}>{d.liveCancellations}</div>
          {(()=>{const dl=delta(d.liveCancellations,other.liveCancellations); return <div style={{fontSize:11,marginTop:4,color:dl.up?"#EF4444":"#10B981",fontWeight:600}}>{dl.up?"▲":"▼"} {Math.abs(dl.diff)} vs {otherLabel}</div>;})()}
        </div>
        <div style={{ ...S.card, padding:"16px 18px" }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>SBND &gt; 10 Days</div><div style={{ fontSize:28, fontWeight:900, color:"#F59E0B", marginTop:6 }}>{d.sbndOver10Days}</div><div style={{ fontSize:11, color:"#94A3B8", marginTop:4 }}>Needs follow-up</div></div>
      </div>

      {/* Core metrics */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:20 }}>
        <div style={S.card}><div style={S.cHead}>✅ Verifications ({d.verifications.total})</div><BucketTable data={d.verifications.byBucket} label="Verified" /></div>
        <div style={S.card}><div style={S.cHead}>📦 Stock Outs ({d.stockOuts.total})</div><BucketTable data={d.stockOuts.byBucket} label="SOs" /></div>
        <div style={S.card}><div style={S.cHead}>🔄 Re-Cancellations ({d.reCancellations.total})</div><BucketTable data={d.reCancellations.byBucket} label="Re-Cancel" /></div>
      </div>

      {/* SBND + GFD */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginBottom:20 }}>
        <div style={S.card}><div style={S.cHead}>🚛 SBND by Bucket ({d.sbnd.total})</div><BucketTable data={d.sbnd.byBucket} label="SBND" /></div>
        <div style={S.card}><div style={S.cHead}>🚛 SBND by Ageing</div><BucketTable data={d.sbnd.byAgeing.map(r=>({b:r.a,v:r.v}))} label="Cars" /></div>
        <div style={S.card}><div style={S.cHead}>✅ GFD — Go For Delivery ({d.gfd.total})</div><BucketTable data={d.gfd.byBucket} label="GFD" /></div>
      </div>

      {/* Dealer Activity */}
      <div style={{ ...S.card, marginBottom:20 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:8 }}>
          <div style={S.cHead}>🏪 Dealer Activity on Inventory Cars</div>
          <div style={{ display:"flex", gap:6, alignItems:"center" }}>
            {[{id:"dayAuction",l:"Day Auctions"},{id:"ocb",l:"OCB"},{id:"touchBuy",l:"Touch & Buy"}].map(f=>(
              <button key={f.id} onClick={()=>setActivityFilter(f.id)} style={{ padding:"7px 14px", borderRadius:8, border:activityFilter===f.id?"2px solid #1E3A5F":"1px solid #E2E8F0", background:activityFilter===f.id?"#EFF6FF":"#FFF", color:activityFilter===f.id?"#1E3A5F":"#64748B", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>{f.l}</button>
            ))}
            <div style={{width:1,height:24,background:"#E2E8F0"}} />
            <input type="date" style={{...S.sel,fontSize:11,padding:"6px 8px"}} value={actDateFrom} onChange={e=>setActDateFrom(e.target.value)} />
            <span style={{color:"#94A3B8",fontSize:11}}>to</span>
            <input type="date" style={{...S.sel,fontSize:11,padding:"6px 8px"}} value={actDateTo} onChange={e=>setActDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:16 }}>
          <div style={{ ...S.card, padding:14, background:"#F8FAFC" }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Auctioned Cars</div><div style={{ fontSize:22, fontWeight:900, color:"#0F172A", marginTop:4 }}>{act.cars.toLocaleString()}</div></div>
          <div style={{ ...S.card, padding:14, background:"#F8FAFC" }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Total Auctions</div><div style={{ fontSize:22, fontWeight:900, color:"#3B82F6", marginTop:4 }}>{act.auctions.toLocaleString()}</div><div style={{ fontSize:11, color:"#64748B", marginTop:2 }}>Auctions/Car: <b>{act.aucPerCar}</b></div></div>
          <div style={{ ...S.card, padding:14, background:"#F8FAFC" }}>
            <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Total Impressions / Views / Bids</div>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              <div><div style={{ fontSize:18, fontWeight:900, color:"#8B5CF6" }}>{(act.impressions/1000).toFixed(1)}K</div><div style={{ fontSize:9, color:"#94A3B8" }}>Impressions</div></div>
              <div><div style={{ fontSize:18, fontWeight:900, color:"#F59E0B" }}>{(act.views/1000).toFixed(1)}K</div><div style={{ fontSize:9, color:"#94A3B8" }}>Views</div></div>
              <div><div style={{ fontSize:18, fontWeight:900, color:"#10B981" }}>{(act.bids/1000).toFixed(1)}K</div><div style={{ fontSize:9, color:"#94A3B8" }}>Bids</div></div>
            </div>
          </div>
          <div style={{ ...S.card, padding:14, background:"#F8FAFC" }}>
            <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Avg per Auction</div>
            <div style={{ display:"flex", gap:10, marginTop:6 }}>
              <div><div style={{ fontSize:16, fontWeight:900, color:"#8B5CF6" }}>{act.avgImpr}</div><div style={{ fontSize:9, color:"#94A3B8" }}>Avg Impr</div></div>
              <div><div style={{ fontSize:16, fontWeight:900, color:"#F59E0B" }}>{act.avgViews}</div><div style={{ fontSize:9, color:"#94A3B8" }}>Avg Views</div></div>
              <div><div style={{ fontSize:16, fontWeight:900, color:"#10B981" }}>{act.avgBids}</div><div style={{ fontSize:9, color:"#94A3B8" }}>Avg Bids</div></div>
            </div>
          </div>
        </div>
        {/* Conversion funnel */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12 }}>
          <div style={{ ...S.card, padding:14, textAlign:"center", borderTop:"3px solid #8B5CF6" }}>
            <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>I2V (Impression → View)</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#8B5CF6", marginTop:4 }}>{act.i2v}%</div>
          </div>
          <div style={{ ...S.card, padding:14, textAlign:"center", borderTop:"3px solid #F59E0B" }}>
            <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>V2B (View → Bid)</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#F59E0B", marginTop:4 }}>{act.v2b}%</div>
          </div>
          <div style={{ ...S.card, padding:14, textAlign:"center", borderTop:"3px solid #10B981" }}>
            <div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>I2B (Impression → Bid)</div>
            <div style={{ fontSize:26, fontWeight:900, color:"#10B981", marginTop:4 }}>{act.i2b}%</div>
          </div>
        </div>
      </div>

      {/* Lead Fees */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12, marginBottom:16 }}>
            <div style={{ ...S.card, padding:16 }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Lead Fee Earned</div><div style={{ fontSize:22, fontWeight:900, color:"#10B981", marginTop:6 }}>{INR(d.leadFeeEarned)}</div></div>
            <div style={{ ...S.card, padding:16 }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Lead Fee Refunds</div><div style={{ fontSize:22, fontWeight:900, color:"#EF4444", marginTop:6 }}>{INR(d.leadFeeRefunds)}</div></div>
            <div style={{ ...S.card, padding:16 }}><div style={{ fontSize:10, color:"#64748B", textTransform:"uppercase", fontWeight:700 }}>Net Lead Fee</div><div style={{ fontSize:22, fontWeight:900, color:"#3B82F6", marginTop:6 }}>{INR(d.leadFeeEarned-d.leadFeeRefunds)}</div></div>
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cHead}>💰 Lead Fee — Car Details</div>
          <div style={{ maxHeight:250, overflowY:"auto" }}>
            <table style={{ ...S.table, fontSize:12 }}>
              <thead><tr>{["App ID","Bucket","Buying Price","Lead Fee","Fee %"].map(h=><th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {(d.leadFeeDetail||[]).map(r=>(
                  <tr key={r.appId} className="tr">
                    <td style={{ ...S.td, color:"#3B82F6", fontWeight:700 }}>{r.appId}</td>
                    <td style={S.td}><span style={S.bucketChip}>{r.bucket}</span></td>
                    <td style={{ ...S.td, fontVariantNumeric:"tabular-nums" }}>{INR(r.bp)}</td>
                    <td style={{ ...S.td, fontWeight:700, color:"#10B981" }}>{INR(r.leadFee)}</td>
                    <td style={S.td}>{r.bp?((r.leadFee/r.bp)*100).toFixed(1):0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 8 — QUICK INVENTORY SNAPSHOT
//  Age-wise, region-wise, parking-wise distribution.
//  Tesla count. Sellable vs non-sellable (RI/Mismatch/Hold/Legal).
// ═════════════════════════════════════════════════════════════════════
function InventorySnapshotTab({ rows }) {
  if (!rows || !rows.length) return (
    <div style={{ ...S.card, textAlign: "center", padding: 60, color: "#94A3B8" }}>Upload stuck inventory file to see the snapshot.</div>
  );

  // ── Age-wise distribution (from sale cancel date) ────────────
  const ageDist = useMemo(() => {
    const buckets = [
      { label: "0-30", min: 0, max: 30 },
      { label: "30-60", min: 30, max: 60 },
      { label: "60-90", min: 60, max: 90 },
      { label: "90-120", min: 90, max: 120 },
      { label: "120-150", min: 120, max: 150 },
      { label: "150-180", min: 150, max: 180 },
      { label: "180+", min: 180, max: 99999 },
    ];
    const map = {};
    for (const b of buckets) map[b.label] = { label: b.label, count: 0, totalBP: 0 };

    const now = new Date();
    for (const r of rows) {
      // Try AGE_BUCKET first, fall back to computing from SALE_CANCEL_DATE
      const bucket = String(r.AGE_BUCKET || "").trim();
      if (bucket && map[bucket]) {
        map[bucket].count++;
        map[bucket].totalBP += toNum(r.BUYING_PRICE) || 0;
      } else {
        // Try computing age from cancel date
        const cd = r.SALE_CANCEL_DATE;
        if (cd) {
          const d = new Date(cd);
          if (!isNaN(d.getTime())) {
            const age = Math.floor((now - d) / (1000 * 60 * 60 * 24));
            for (const b of buckets) {
              if (age >= b.min && age < b.max) { map[b.label].count++; map[b.label].totalBP += toNum(r.BUYING_PRICE) || 0; break; }
            }
          }
        }
      }
    }
    return Object.values(map);
  }, [rows]);

  const totalCars = ageDist.reduce((s, r) => s + r.count, 0);

  // ── Region-wise ──────────────────────────────────────────────
  const regionDist = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const reg = r.REGION || "Unknown";
      if (!map[reg]) map[reg] = { region: reg, count: 0, totalBP: 0 };
      map[reg].count++;
      map[reg].totalBP += toNum(r.BUYING_PRICE) || 0;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [rows]);

  // ── Parking-wise ─────────────────────────────────────────────
  const parkingDist = useMemo(() => {
    const map = {};
    for (const r of rows) {
      const pk = r.PARKING_REGION || r.ZONE || "Unknown";
      if (!map[pk]) map[pk] = { parking: pk, count: 0 };
      map[pk].count++;
    }
    return Object.values(map).sort((a, b) => b.count - a.count);
  }, [rows]);

  // ── Tesla ────────────────────────────────────────────────────
  const teslaCars = useMemo(() => rows.filter((r) => truthy(r.TESLA) || truthy(r["Tesla Flag"])).length, [rows]);

  // ── Sellable vs Non-sellable ─────────────────────────────────
  const sellability = useMemo(() => {
    let riPending = 0, inspMismatch = 0, auctionHold = 0, legal = 0;
    for (const r of rows) {
      if (truthy(r["RI Pending"])) riPending++;
      if (truthy(r["Insp Mismatch"]) || truthy(r["Inspection Mismatch"]) || truthy(r["INSP_PARKING_MISMATCH"])) inspMismatch++;
      if (truthy(r["Auction Hold"]) || truthy(r["Auction Hold input"]) || truthy(r["Auction Stop"])) auctionHold++;
      if (truthy(r["Legal"]) || truthy(r["Legal Hold"])) legal++;
    }
    const nonSellable = new Set();
    for (const r of rows) {
      if (truthy(r["RI Pending"]) || truthy(r["Insp Mismatch"]) || truthy(r["Inspection Mismatch"]) || truthy(r["INSP_PARKING_MISMATCH"]) ||
          truthy(r["Auction Hold"]) || truthy(r["Auction Hold input"]) || truthy(r["Auction Stop"]) ||
          truthy(r["Legal"]) || truthy(r["Legal Hold"])) {
        nonSellable.add(r.LEAD_ID);
      }
    }
    const sellable = totalCars - nonSellable.size;
    return { sellable, nonSellable: nonSellable.size, riPending, inspMismatch, auctionHold, legal };
  }, [rows, totalCars]);

  const maxAge = Math.max(...ageDist.map((r) => r.count), 1);

  return (
    <div>
      {/* ── Top KPIs ────────────────────────────────────────────── */}
      <div style={S.metrics}>
        <div style={S.mCard}><div style={{ fontSize: 28, fontWeight: 900, color: "#3B82F6" }}>{totalCars.toLocaleString()}</div><div style={S.mLabel}>Total Stuck Cars</div></div>
        <div style={S.mCard}><div style={{ fontSize: 28, fontWeight: 900, color: "#10B981" }}>{sellability.sellable.toLocaleString()}</div><div style={S.mLabel}>Sellable</div></div>
        <div style={S.mCard}><div style={{ fontSize: 28, fontWeight: 900, color: "#EF4444" }}>{sellability.nonSellable.toLocaleString()}</div><div style={S.mLabel}>Non-Sellable</div></div>
        <div style={S.mCard}><div style={{ fontSize: 28, fontWeight: 900, color: "#F59E0B" }}>{teslaCars.toLocaleString()}</div><div style={S.mLabel}>Tesla Cars</div></div>
        <div style={S.mCard}><div style={{ fontSize: 28, fontWeight: 900, color: "#8B5CF6" }}>{regionDist.length}</div><div style={S.mLabel}>Regions</div></div>
      </div>

      {/* ── Age-wise chart + table ──────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 20 }}>
        <div style={S.cHead}>📊 Age-wise Distribution (from Sale Cancel Date)</div>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 160, marginBottom: 16, padding: "0 8px" }}>
          {ageDist.map((b) => {
            const h = maxAge ? (b.count / maxAge) * 140 : 0;
            const pct = totalCars ? ((b.count / totalCars) * 100).toFixed(0) : 0;
            return (
              <div key={b.label} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>{b.count}</div>
                <div style={{ height: Math.max(h, 4), background: `hsl(${220 - (parseInt(b.label) || 180) * 0.8}, 70%, 55%)`, borderRadius: "6px 6px 0 0", transition: "height 0.3s" }} />
                <div style={{ fontSize: 10, color: "#64748B", marginTop: 6, fontWeight: 700 }}>{b.label}</div>
                <div style={{ fontSize: 9, color: "#94A3B8" }}>{pct}%</div>
              </div>
            );
          })}
        </div>
        <table style={S.table}>
          <thead><tr>{["SI Bucket", "Cars", "% of Total", "Avg Buying Price", "Total BP"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
          <tbody>
            {ageDist.map((b) => (
              <tr key={b.label} className="tr">
                <td style={S.td}><span style={S.bucketChip}>{b.label}</span></td>
                <td style={{ ...S.td, fontWeight: 800, fontSize: 15 }}>{b.count.toLocaleString()}</td>
                <td style={S.td}>{totalCars ? ((b.count / totalCars) * 100).toFixed(1) : 0}%</td>
                <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{INR(b.count ? b.totalBP / b.count : 0)}</td>
                <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{INR(b.totalBP)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Region + Parking side by side ────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={S.card}>
          <div style={S.cHead}>📍 Region-wise ({regionDist.length} regions)</div>
          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            <table style={S.table}>
              <thead><tr>{["Region", "Cars", "%", "Avg BP"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {regionDist.map((r) => (
                  <tr key={r.region} className="tr">
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.region}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.count}</td>
                    <td style={S.td}>{((r.count / totalCars) * 100).toFixed(1)}%</td>
                    <td style={{ ...S.td, fontVariantNumeric: "tabular-nums" }}>{INR(r.count ? r.totalBP / r.count : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={S.card}>
          <div style={S.cHead}>🅿️ Parking-wise ({parkingDist.length} locations)</div>
          <div style={{ maxHeight: 350, overflowY: "auto" }}>
            <table style={S.table}>
              <thead><tr>{["Parking", "Cars", "%"].map((h) => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
              <tbody>
                {parkingDist.map((r) => (
                  <tr key={r.parking} className="tr">
                    <td style={{ ...S.td, fontWeight: 600 }}>{r.parking}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.count}</td>
                    <td style={S.td}>{((r.count / totalCars) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Sellable vs Non-sellable breakdown ──────────────────── */}
      <div style={S.card}>
        <div style={S.cHead}>🏷️ Sellable vs Non-Sellable Breakdown</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
          <div style={{ ...S.card, padding: "16px", background: "#F0FDF4", border: "1px solid #BBF7D0", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#166534", textTransform: "uppercase", fontWeight: 700 }}>Sellable</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#16A34A", marginTop: 4 }}>{sellability.sellable.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#15803D" }}>{((sellability.sellable / totalCars) * 100).toFixed(1)}% of inventory</div>
          </div>
          <div style={{ ...S.card, padding: "16px", background: "#FEF2F2", border: "1px solid #FECACA", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#991B1B", textTransform: "uppercase", fontWeight: 700 }}>Non-Sellable</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#DC2626", marginTop: 4 }}>{sellability.nonSellable.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#B91C1C" }}>{((sellability.nonSellable / totalCars) * 100).toFixed(1)}% of inventory</div>
          </div>
          <div style={{ ...S.card, padding: "16px", background: "#FEF3C7", border: "1px solid #FDE68A", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "#92400E", textTransform: "uppercase", fontWeight: 700 }}>Tesla Flagged</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#D97706", marginTop: 4 }}>{teslaCars.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: "#B45309" }}>{((teslaCars / totalCars) * 100).toFixed(1)}% of inventory</div>
          </div>
        </div>

        {/* Non-sellable flag breakdown */}
        <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", marginBottom: 10 }}>Non-sellable flag breakdown:</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { label: "RI Pending", count: sellability.riPending, color: "#EF4444" },
            { label: "Insp ↔ Parking Mismatch", count: sellability.inspMismatch, color: "#F97316" },
            { label: "Auction Hold", count: sellability.auctionHold, color: "#F59E0B" },
            { label: "Legal", count: sellability.legal, color: "#8B5CF6" },
          ].map((f) => (
            <div key={f.label} style={{ padding: "12px 14px", background: "#F8FAFC", borderRadius: 8, borderLeft: `3px solid ${f.color}` }}>
              <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", fontWeight: 700 }}>{f.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: f.color, marginTop: 4 }}>{f.count}</div>
              <div style={{ fontSize: 11, color: "#94A3B8" }}>{totalCars ? ((f.count / totalCars) * 100).toFixed(1) : 0}%</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 10, fontStyle: "italic" }}>
          Note: A car may have multiple flags. Non-sellable count is de-duplicated (unique cars with ≥1 flag).
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 9 — SETTINGS
// ═════════════════════════════════════════════════════════════════════
function SettingsTab({ slackUrl, setSlackUrl, sheetUrl, setSheetUrl, managerEmail, setManagerEmail }) {
  const [slackTest, setSlackTest] = useState(null);
  const [sheetTest, setSheetTest] = useState(null);

  const testSlack = async () => {
    setSlackTest("sending");
    const res = await sendSlackMessage(slackUrl, ":white_check_mark: *Test from Inventory Command Center*\nSlack is working!");
    setSlackTest(res.ok ? "success" : "failed");
    setTimeout(() => setSlackTest(null), 3000);
  };
  const testSheet = async () => {
    setSheetTest("sending");
    const res = await appendToSheet(sheetUrl, {
      timestamp: new Date().toISOString(), appointmentId: "TEST-000", region: "TEST",
      anchorPrice: 0, auctionStartFor: "Test", submittedBy: "test", email: managerEmail,
      date: new Date().toLocaleDateString("en-IN"),
    });
    setSheetTest(res.ok ? "success" : "failed");
    setTimeout(() => setSheetTest(null), 3000);
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 24, color: "#0F172A" }}>⚙️ Integration Settings</h2>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>💬 Slack Integration</div>
        <p style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>Escalations, approvals, and auction starts post here.</p>
        <label style={S.fLabel}>Slack Incoming Webhook URL</label>
        <input style={S.inp} placeholder="https://hooks.slack.com/services/…" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} />
        <button style={{ ...S.pri, marginTop: 12 }} onClick={testSlack} disabled={!slackUrl || slackTest === "sending"}>
          {slackTest === "sending" ? "Sending…" : slackTest === "success" ? "✅ Test Sent!" : slackTest === "failed" ? "❌ Failed" : "Send Test Message"}
        </button>
      </div>

      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>📊 Google Sheet (Auction Log)</div>
        <p style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>Approved quotes and bulk auctions get logged here.</p>
        <label style={S.fLabel}>Apps Script Web App URL</label>
        <input style={S.inp} placeholder="https://script.google.com/macros/s/…/exec" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
        <button style={{ ...S.pri, marginTop: 12 }} onClick={testSheet} disabled={!sheetUrl || sheetTest === "sending"}>
          {sheetTest === "sending" ? "Sending…" : sheetTest === "success" ? "✅ Test Sent!" : sheetTest === "failed" ? "❌ Failed" : "Send Test Row"}
        </button>
      </div>

      <div style={S.card}>
        <div style={S.cHead}>📧 Manager Info</div>
        <label style={S.fLabel}>Manager Email</label>
        <input style={S.inp} placeholder="tarun@cars24.com" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
      </div>

      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cHead}>📏 Auto-Approval Rules</div>
        <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: "8px 16px", fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Bucket</div>
          <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Auto Approve</div>
          <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Reject</div>
          <div style={{ color: "#3B82F6", fontWeight: 600 }}>0-30 days</div><div>Loss ≤ ₹7,000</div><div style={{ color: "#EF4444" }}>Loss &gt; ₹7,000</div>
          <div style={{ color: "#3B82F6", fontWeight: 600 }}>30-60 days</div><div>Loss ≤ ₹2,500</div><div style={{ color: "#EF4444" }}>Loss &gt; ₹2,500</div>
          <div style={{ color: "#3B82F6", fontWeight: 600 }}>60-90 days</div><div>Loss ≤ 20%</div><div style={{ color: "#EF4444" }}>Loss &gt; 20%</div>
          <div style={{ color: "#3B82F6", fontWeight: 600 }}>90+ days</div><div style={{ color: "#F59E0B", gridColumn: "span 2" }}>Always manual review</div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  STYLES — LIGHT THEME
// ═════════════════════════════════════════════════════════════════════
const S = {
  app: { background: "#F8FAFC", color: "#0F172A", minHeight: "100vh", fontFamily: "'DM Sans','Segoe UI',system-ui,sans-serif", fontSize: 14 },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", height: 68, background: "#FFFFFF", borderBottom: "1px solid #E2E8F0", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 1px 3px rgba(15,23,42,0.04)" },
  hLeft: { display: "flex", alignItems: "center", gap: 14 },
  hRight: { display: "flex", alignItems: "center", gap: 10 },
  logo: { width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg,#F59E0B,#EF4444)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 14, color: "#fff" },
  logoTitle: { fontSize: 17, fontWeight: 800, color: "#0F172A" },
  logoSub: { fontSize: 12, color: "#64748B", marginTop: 1 },
  nav: { display: "flex", gap: 2 },
  navBtn: { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, color: "#64748B", background: "transparent", fontFamily: "inherit", position: "relative" },
  navActive: { padding: "8px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#0F172A", background: "#F1F5F9", boxShadow: "0 0 0 1px #CBD5E1", fontFamily: "inherit", position: "relative" },
  tabBadge: { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 18, height: 18, borderRadius: 9, background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 800, marginLeft: 6, padding: "0 5px" },
  userInp: { padding: "8px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, outline: "none", width: 140, fontFamily: "inherit" },
  fileBadge: { padding: "6px 12px", borderRadius: 8, background: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  removeBtn: { background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, fontWeight: 700, padding: "0 4px", fontFamily: "inherit" },
  uploadWrap: { display: "flex", justifyContent: "center", padding: "60px 28px" },
  dropzone: { width: 540, padding: "48px 32px", border: "2px dashed #CBD5E1", borderRadius: 16, textAlign: "center", cursor: "pointer", transition: "all .3s", background: "#FFFFFF" },
  dzHover: { borderColor: "#3B82F6", background: "#EFF6FF" },
  uploadBtn: { display: "inline-block", padding: "10px 28px", borderRadius: 8, background: "#3B82F6", color: "#fff", fontWeight: 700, fontSize: 14 },
  main: { padding: "24px 28px" },
  metrics: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 },
  mCard: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: "18px 16px", textAlign: "center", boxShadow: "0 1px 2px rgba(15,23,42,0.03)" },
  mLabel: { fontSize: 11, color: "#64748B", marginTop: 6, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 600 },
  filters: { display: "flex", gap: 8, alignItems: "center", marginBottom: 12, flexWrap: "wrap" },
  searchBox: { padding: "9px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FFFFFF", color: "#0F172A", fontSize: 13, outline: "none", width: 280, fontFamily: "inherit" },
  sel: { padding: "9px 12px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FFFFFF", color: "#0F172A", fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" },
  fCount: { marginLeft: "auto", color: "#64748B", fontSize: 13 },
  tWrap: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 2px rgba(15,23,42,0.03)" },
  tScroll: { overflowX: "auto", maxHeight: "calc(100vh - 340px)", overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "11px 14px", textAlign: "left", fontWeight: 700, color: "#64748B", borderBottom: "1px solid #E2E8F0", fontSize: 11, textTransform: "uppercase", letterSpacing: ".5px", whiteSpace: "nowrap", position: "sticky", top: 0, background: "#F8FAFC", zIndex: 2 },
  td: { padding: "11px 14px", borderBottom: "1px solid #F1F5F9", whiteSpace: "nowrap", color: "#334155", fontSize: 13 },
  leadBtn: { background: "none", border: "none", color: "#3B82F6", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline", padding: 0 },
  bucketChip: { display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: "#1D4ED8" },
  pag: { display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 16px", borderTop: "1px solid #E2E8F0" },
  pgB: { padding: "6px 14px", borderRadius: 6, border: "1px solid #E2E8F0", background: "#FFFFFF", color: "#334155", fontSize: 13, cursor: "pointer", fontWeight: 600, fontFamily: "inherit" },
  pgI: { color: "#64748B", fontSize: 13, margin: "0 8px" },
  ql: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "start" },
  qlL: { display: "flex", flexDirection: "column", gap: 16 },
  qlR: { display: "flex", flexDirection: "column", gap: 16 },
  card: { background: "#FFFFFF", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, boxShadow: "0 1px 2px rgba(15,23,42,0.03)" },
  cHead: { fontSize: 16, fontWeight: 800, marginBottom: 14, color: "#0F172A" },
  carTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #E2E8F0" },
  carName: { fontSize: 22, fontWeight: 900, color: "#0F172A", letterSpacing: "-.5px" },
  carSub: { fontSize: 13, color: "#64748B", marginTop: 4 },
  dGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "10px 16px" },
  dItem: {},
  dLabel: { fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600, marginBottom: 2 },
  dVal: { fontSize: 14, color: "#0F172A", fontVariantNumeric: "tabular-nums", fontWeight: 500 },
  fLabel: { fontSize: 11, color: "#64748B", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600, marginBottom: 4, display: "block" },
  inp: { padding: "11px 14px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#FFFFFF", color: "#0F172A", fontSize: 14, outline: "none", width: "100%", boxSizing: "border-box", fontFamily: "inherit" },
  pri: { padding: "11px 24px", borderRadius: 8, border: "none", background: "#3B82F6", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  hRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #F1F5F9", gap: 12 },
  modalBg: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 },
  modal: { background: "#FFFFFF", borderRadius: 16, maxWidth: 900, width: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(15,23,42,0.3)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", padding: "24px 24px 16px", borderBottom: "1px solid #E2E8F0" },
  closeBtn: { background: "#F1F5F9", border: "none", width: 36, height: 36, borderRadius: 8, fontSize: 16, cursor: "pointer", color: "#64748B", fontFamily: "inherit" },
  groupTitle: { fontSize: 12, fontWeight: 800, color: "#3B82F6", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, paddingBottom: 6, borderBottom: "2px solid #EFF6FF" },
  slotMetricLabel: { fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, marginBottom: 4 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px 20px" },
  detailItem: { background: "#F8FAFC", padding: "10px 14px", borderRadius: 8, border: "1px solid #F1F5F9" },
  detailLabel: { fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: ".5px", fontWeight: 600, marginBottom: 4 },
  detailVal: { fontSize: 14, color: "#0F172A", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}body{background:#F8FAFC}
  .tr:hover td{background:#F8FAFC!important}
  ::-webkit-scrollbar{width:8px;height:8px}::-webkit-scrollbar-track{background:#F1F5F9}::-webkit-scrollbar-thumb{background:#CBD5E1;border-radius:4px}::-webkit-scrollbar-thumb:hover{background:#94A3B8}
  button:hover{opacity:.9}button:active{transform:scale(.97)}
  input:focus,textarea:focus,select:focus{border-color:#3B82F6!important;box-shadow:0 0 0 3px #3B82F620}
  button:disabled{opacity:.4;cursor:not-allowed}
  @media(max-width:1100px){.ql{grid-template-columns:1fr!important}}
`;
