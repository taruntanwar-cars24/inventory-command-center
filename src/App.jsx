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
     4. Sold Dashboard   — P&L, cars sold by bucket, avg loss/car (dummy data)
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

// Dummy dashboard data
const DUMMY_DASH = {
  totalSold: 1247,
  totalPnL: -18_50_000,
  avgLossPerCar: -1484,
  byBucket: [
    { bucket: "0-30", sold: 612, pnl: -2_80_000, avgLoss: -457 },
    { bucket: "30-60", sold: 348, pnl: -4_20_000, avgLoss: -1207 },
    { bucket: "60-90", sold: 201, pnl: -6_50_000, avgLoss: -3234 },
    { bucket: "90+", sold: 86, pnl: -5_00_000, avgLoss: -5814 },
  ],
  byChannel: [
    { channel: "C2D", sold: 834, pnl: -8_20_000 },
    { channel: "C2B", sold: 413, pnl: -10_30_000 },
  ],
};

// ═════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("inventory");
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [history, setHistory] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => localStorage.getItem("c24_user") || "");

  // Settings
  const [slackUrl, setSlackUrl] = useState(() => localStorage.getItem("c24_slack_url") || "");
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem("c24_sheet_url") || "");
  const [managerEmail, setManagerEmail] = useState(() => localStorage.getItem("c24_mgr_email") || "");

  useEffect(() => { localStorage.setItem("c24_slack_url", slackUrl); }, [slackUrl]);
  useEffect(() => { localStorage.setItem("c24_sheet_url", sheetUrl); }, [sheetUrl]);
  useEffect(() => { localStorage.setItem("c24_mgr_email", managerEmail); }, [managerEmail]);
  useEffect(() => { localStorage.setItem("c24_user", currentUser); }, [currentUser]);

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
  const browse = () => {
    const i = document.createElement("input");
    i.type = "file"; i.accept = ".xlsx,.xls,.csv";
    i.onchange = (e) => handleFile(e.target.files?.[0]); i.click();
  };

  const pendingEsc = history.filter((h) => h.status === "ESCALATED").length;

  const TABS = [
    { id: "inventory", icon: "📋", label: "Stuck Inventory" },
    { id: "quotes", icon: "💰", label: "Submit Quote", badge: pendingEsc || null },
    { id: "history", icon: "📜", label: "Quote History" },
    { id: "dashboard", icon: "📊", label: "Sold Dashboard" },
    { id: "auction", icon: "🔨", label: "Auction Console" },
    { id: "settings", icon: "⚙️", label: "Settings" },
  ];

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* HEADER */}
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
              <span style={{ marginRight: 6 }}>{t.icon}</span>{t.label}
              {t.badge ? <span style={S.tabBadge}>{t.badge}</span> : null}
            </button>
          ))}
        </nav>
        <div style={S.hRight}>
          <input
            style={S.userInp}
            placeholder="Your name..."
            value={currentUser}
            onChange={(e) => setCurrentUser(e.target.value)}
          />
          {rows && (
            <div style={S.fileBadge}>
              <span style={{ color: "#10B981" }}>✓</span> {fileName.length > 20 ? fileName.slice(0, 18) + "…" : fileName}
              <button onClick={() => { setRows(null); setFileName(""); }} style={S.removeBtn}>✕</button>
            </div>
          )}
        </div>
      </header>

      {/* UPLOAD */}
      {!rows && tab !== "settings" && tab !== "dashboard" && (
        <div style={S.uploadWrap}>
          <div style={{ ...S.dropzone, ...(dragOver ? S.dzHover : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop} onClick={browse}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{dragOver ? "📥" : "📂"}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, color: "#0F172A" }}>
              {dragOver ? "Drop it here!" : "Upload Stuck Inventory"}
            </div>
            <div style={{ color: "#64748B", fontSize: 14, marginBottom: 16 }}>Drag & drop .xlsx / .csv, or click to browse</div>
            <div style={S.uploadBtn}>Choose File</div>
            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 16 }}>Data stays in your browser</div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      <main style={S.main}>
        {rows && tab === "inventory" && <InventoryTab rows={rows} />}
        {rows && tab === "quotes" && (
          <QuoteTab rows={rows} history={history} setHistory={setHistory}
            slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />
        )}
        {tab === "history" && <HistoryTab history={history} />}
        {tab === "dashboard" && <DashboardTab />}
        {rows && tab === "auction" && (
          <AuctionTab rows={rows} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} currentUser={currentUser} />
        )}
        {tab === "settings" && (
          <SettingsTab slackUrl={slackUrl} setSlackUrl={setSlackUrl}
            sheetUrl={sheetUrl} setSheetUrl={setSheetUrl}
            managerEmail={managerEmail} setManagerEmail={setManagerEmail} />
        )}
      </main>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 1 — STUCK INVENTORY
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
      f = f.filter((r) =>
        String(r.LEAD_ID || "").toLowerCase().includes(s) ||
        String(r.MAKE || "").toLowerCase().includes(s) ||
        String(r.MODEL || "").toLowerCase().includes(s) ||
        String(r["Reg No"] || "").toLowerCase().includes(s));
    }
    return f;
  }, [rows, regionF, ageF, search]);

  const pg = filtered.slice(page * PG, (page + 1) * PG);
  const tp = Math.ceil(filtered.length / PG);

  const stats = useMemo(() => {
    const bp = filtered.reduce((s, r) => s + (toNum(r.BUYING_PRICE) || 0), 0);
    const c2d = filtered.filter((r) => truthy(r["C2D Flag"])).length;
    const ri = filtered.filter((r) => truthy(r["RI Pending"])).length;
    const as = filtered.filter((r) => truthy(r["Auction Stop"])).length;
    return { n: filtered.length, bp, c2d, ri, as, av: filtered.length ? bp / filtered.length : 0 };
  }, [filtered]);

  return (
    <div>
      {/* Metrics */}
      <div style={S.metrics}>
        {[
          { l: "Total Cars", v: stats.n.toLocaleString(), c: "#3B82F6" },
          { l: "Buying Value", v: INR(stats.bp), c: "#F59E0B" },
          { l: "Avg Buying Price", v: INR(stats.av), c: "#8B5CF6" },
          { l: "C2D Flagged", v: stats.c2d.toLocaleString(), c: "#10B981" },
          { l: "RI Pending", v: stats.ri.toLocaleString(), c: "#EF4444" },
          { l: "Auction Stop", v: stats.as.toLocaleString(), c: "#F97316" },
        ].map((m) => (
          <div key={m.l} style={S.mCard}>
            <div style={{ fontSize: 22, fontWeight: 900, color: m.c, letterSpacing: "-0.5px" }}>{m.v}</div>
            <div style={S.mLabel}>{m.l}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={S.filters}>
        <input style={S.searchBox} placeholder="🔍  Search App ID, Make, Model, Reg No…"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select style={S.sel} value={regionF} onChange={(e) => { setRegionF(e.target.value); setPage(0); }}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "📍 All Regions" : r}</option>)}
        </select>
        <select style={S.sel} value={ageF} onChange={(e) => { setAgeF(e.target.value); setPage(0); }}>
          {ages.map((a) => <option key={a} value={a}>{a === "ALL" ? "📅 All Buckets" : a}</option>)}
        </select>
        <span style={S.fCount}>{filtered.length.toLocaleString()} of {rows.length.toLocaleString()}</span>
      </div>

      {/* Table */}
      <div style={S.tWrap}>
        <div style={S.tScroll}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 50 }}>#</th>
                {INVENTORY_COLS.map((c) => <th key={c.key} style={S.th}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {pg.map((row, i) => (
                <tr key={i} className="tr">
                  <td style={{ ...S.td, color: "#94A3B8", fontSize: 12 }}>{page * PG + i + 1}</td>
                  <td style={S.td}>
                    <button style={S.leadBtn} onClick={() => setDetailCar(row)}>
                      {row.LEAD_ID || "—"}
                    </button>
                  </td>
                  <td style={{ ...S.td, fontWeight: 600, color: "#0F172A" }}>
                    {row.MAKE || ""} {row.MODEL || ""}
                  </td>
                  <td style={S.td}>{row.Year || "—"}</td>
                  <td style={S.td}>
                    <span style={S.bucketChip}>{row.AGE_BUCKET || "—"}</span>
                  </td>
                  <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {INR(toNum(row.BUYING_PRICE))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={S.pag}>
          <button style={S.pgB} disabled={page === 0} onClick={() => setPage(0)}>⟨⟨</button>
          <button style={S.pgB} disabled={page === 0} onClick={() => setPage(page - 1)}>← Prev</button>
          <span style={S.pgI}>Page <b>{page + 1}</b>/<b>{tp || 1}</b> · {page * PG + 1}–{Math.min((page + 1) * PG, filtered.length)} of {filtered.length.toLocaleString()}</span>
          <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(page + 1)}>Next →</button>
          <button style={S.pgB} disabled={page >= tp - 1} onClick={() => setPage(tp - 1)}>⟩⟩</button>
        </div>
      </div>

      {/* Detail Modal */}
      {detailCar && <CarDetailModal car={detailCar} onClose={() => setDetailCar(null)} />}
    </div>
  );
}

// ── Car Detail Modal ─────────────────────────────────────────────────
function CarDetailModal({ car, onClose }) {
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>
        <div style={S.modalHead}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: "#0F172A" }}>
              {car.MAKE} {car.MODEL}
            </div>
            <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
              {car.Year} · {car.fuel_type || "—"} · {car["Reg No"] || "—"}
            </div>
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
          {DETAIL_GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: 20 }}>
              <div style={S.groupTitle}>{g.title}</div>
              <div style={S.detailGrid}>
                {g.fields.map(([key, label, isInr]) => {
                  const raw = car[key];
                  const val = isInr ? INR(toNum(raw)) : (raw || "—");
                  return (
                    <div key={key} style={S.detailItem}>
                      <div style={S.detailLabel}>{label}</div>
                      <div style={S.detailVal}>{String(val)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2 — QUOTE SUBMISSION
// ═════════════════════════════════════════════════════════════════════
function QuoteTab({ rows, history, setHistory, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [appId, setAppId] = useState("");
  const [car, setCar] = useState(null);
  const [miss, setMiss] = useState(false);
  const [q, setQ] = useState({ dealer: "", amt: "", notes: "" });
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState("submit");

  const escalated = history.filter((h) => h.status === "ESCALATED");

  const find = () => {
    const id = appId.trim();
    if (!id) return;
    const f = rows.find((r) => String(r.LEAD_ID || "").trim() === id || String(r.CAR_ID || "").trim() === id);
    if (f) { setCar(f); setMiss(false); setRes(null); } else { setCar(null); setMiss(true); }
  };

  const submit = async () => {
    if (!car || !q.amt) return;
    if (!currentUser) { alert("Please enter your name in the top-right before submitting."); return; }
    setSending(true);
    const bid = toNum(q.amt);
    const buy = toNum(car.BUYING_PRICE) || 0;
    const pnl = bid - buy;
    const ageBucket = car.AGE_BUCKET || "";
    const anchor = toNum(car.Anchor) || toNum(car.NEW_MSP) || 0;

    const { status, reason } = evaluateQuote(bid, buy, ageBucket);

    const entry = {
      id: Date.now(), appId: car.LEAD_ID, make: car.MAKE, model: car.MODEL,
      dealer: q.dealer, bid, msp: anchor, buy, pnl, ageBucket,
      status, reason, region: car.REGION || "", anchor,
      submittedBy: currentUser,
      time: new Date().toLocaleString("en-IN"),
      timestamp: Date.now(),
      slackSent: false, sheetSent: false, auctionStarted: false,
    };

    setRes(entry);
    setHistory((h) => [entry, ...h]);
    setQ({ dealer: "", amt: "", notes: "" });
    setSending(false);
  };

  const startAuction = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry) return;
    const sheetRow = {
      timestamp: new Date().toISOString(),
      appointmentId: entry.appId,
      region: entry.region,
      anchorPrice: entry.bid,
      auctionStartFor: entry.dealer,
      submittedBy: entry.submittedBy,
      email: managerEmail || "",
      date: new Date().toLocaleDateString("en-IN"),
    };
    const sheetRes = await appendToSheet(sheetUrl, sheetRow);
    if (slackUrl) {
      await sendSlackMessage(slackUrl,
        `:hammer: *AUCTION STARTED*\n*App:* ${entry.appId} | *Car:* ${entry.make} ${entry.model}\n*Dealer:* ${entry.dealer} | *Anchor:* ₹${entry.bid?.toLocaleString("en-IN")}\n*Started by:* ${entry.submittedBy}`
      );
    }
    setHistory((h) => h.map((x) => x.id === entryId ? { ...x, auctionStarted: true, sheetSent: sheetRes.ok } : x));
    if (res && res.id === entryId) setRes({ ...res, auctionStarted: true, sheetSent: sheetRes.ok });
  };

  const escalate = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry) return;
    const msg = `:rotating_light: *ESCALATION: Needs Manual Approval*\n\n*Car:* ${entry.make} ${entry.model} | *App:* ${entry.appId}\n*Submitted By:* ${entry.submittedBy}\n*Dealer:* ${entry.dealer} | *Region:* ${entry.region}\n*Bid:* ₹${entry.bid?.toLocaleString("en-IN")} | *Buy:* ₹${entry.buy?.toLocaleString("en-IN")}\n*P&L:* ₹${entry.pnl?.toLocaleString("en-IN")} | *Bucket:* ${entry.ageBucket}\n*Reason:* ${entry.reason}`;
    const r = await sendSlackMessage(slackUrl, msg);
    setHistory((h) => h.map((x) => x.id === entryId ? { ...x, status: "ESCALATED", slackSent: r.ok } : x));
    if (res && res.id === entryId) setRes({ ...res, status: "ESCALATED", slackSent: r.ok });
  };

  const manualApprove = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry) return;
    if (slackUrl) {
      await sendSlackMessage(slackUrl,
        `:white_check_mark: *APPROVED by Manager*\n*App:* ${entry.appId} | *Car:* ${entry.make} ${entry.model} | *Bid:* ₹${entry.bid?.toLocaleString("en-IN")}`
      );
    }
    setHistory((h) => h.map((x) => x.id === entryId ? { ...x, status: "MANAGER_APPROVED" } : x));
  };
  const manualReject = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (slackUrl && entry) {
      await sendSlackMessage(slackUrl,
        `:x: *REJECTED by Manager*\n*App:* ${entry.appId} | *Car:* ${entry.make} ${entry.model} | *Bid:* ₹${entry.bid?.toLocaleString("en-IN")}`
      );
    }
    setHistory((h) => h.map((x) => x.id === entryId ? { ...x, status: "MANAGER_REJECTED" } : x));
  };

  const stCol = { AUTO_APPROVED: "#10B981", REJECTED: "#EF4444", ESCALATED: "#F59E0B", MANAGER_APPROVED: "#10B981", MANAGER_REJECTED: "#EF4444" };
  const stIco = { AUTO_APPROVED: "✅", REJECTED: "❌", ESCALATED: "⚠️", MANAGER_APPROVED: "✅", MANAGER_REJECTED: "❌" };
  const stLabel = { AUTO_APPROVED: "Auto Approved", REJECTED: "Rejected", ESCALATED: "Escalated", MANAGER_APPROVED: "Manager Approved", MANAGER_REJECTED: "Manager Rejected" };
  const isApproved = (s) => s === "AUTO_APPROVED" || s === "MANAGER_APPROVED";

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={viewMode === "submit" ? S.navActive : S.navBtn} onClick={() => setViewMode("submit")}>💰 Submit Quote</button>
        <button style={viewMode === "escalations" ? S.navActive : S.navBtn} onClick={() => setViewMode("escalations")}>
          ⚠️ Escalations {escalated.length ? <span style={S.tabBadge}>{escalated.length}</span> : null}
        </button>
      </div>

      {viewMode === "submit" && (
        <div className="ql" style={S.ql}>
          <div style={S.qlL}>
            <div style={S.card}>
              <div style={S.cHead}>🔍 Find Car</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...S.inp, flex: 1 }} placeholder="Enter App ID…" value={appId}
                  onChange={(e) => setAppId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
                <button style={S.pri} onClick={find}>Search</button>
              </div>
              {miss && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10 }}>⚠ No car found with ID "{appId}"</div>}
            </div>

            {car && (
              <div style={S.card}>
                <div style={S.carTop}>
                  <div>
                    <div style={S.carName}>{car.MAKE} {car.MODEL}</div>
                    <div style={S.carSub}>{car.Year} · {car.fuel_type || "—"} · {car["Reg No"] || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>App ID</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#3B82F6" }}>{car.LEAD_ID}</div>
                  </div>
                </div>
                <div style={{ padding: "10px 14px", background: "#FEF3C7", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#78350F" }}>
                  <strong>Bucket: {car.AGE_BUCKET || "?"}</strong> —{" "}
                  {String(car.AGE_BUCKET || "").includes("0-30") && "Max loss: ₹7,000"}
                  {String(car.AGE_BUCKET || "").includes("30-60") && "Max loss: ₹2,500"}
                  {String(car.AGE_BUCKET || "").includes("60-90") && "Max loss: -20%"}
                  {String(car.AGE_BUCKET || "").includes("90") && !String(car.AGE_BUCKET || "").includes("60-90") && "Manual review required"}
                </div>
                <div style={S.dGrid}>
                  {[
                    ["BUYING_PRICE", "Buying Price", true, "#F59E0B"],
                    ["NEW_MSP", "MSP", true, "#10B981"],
                    ["Anchor", "Anchor", true],
                    ["TP", "Target Price", true],
                    ["C24", "C24 Quote", true, "#3B82F6"],
                    ["REGION", "Region"],
                    ["PARKING_REGION", "Parking"],
                    ["SI_AGE", "SI Age"],
                    ["SALE_CANCEL_DATE", "Cancel Date"],
                  ].map(([k, l, inr, hl]) => (
                    <div key={k} style={S.dItem}>
                      <div style={S.dLabel}>{l}</div>
                      <div style={{ ...S.dVal, ...(hl ? { color: hl, fontWeight: 700 } : {}) }}>
                        {inr ? INR(toNum(car[k])) : (car[k] || "—")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {car && (
              <div style={S.card}>
                <div style={S.cHead}>💰 Submit Dealer Quote</div>
                {!currentUser && <div style={{ color: "#EF4444", fontSize: 12, marginBottom: 10 }}>⚠ Enter your name in the header first</div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <label style={S.fLabel}>Dealer Name</label>
                    <input style={S.inp} placeholder="Dealer name" value={q.dealer} onChange={(e) => setQ({ ...q, dealer: e.target.value })} />
                  </div>
                  <div>
                    <label style={S.fLabel}>Bid Amount (₹)</label>
                    <input style={S.inp} placeholder="e.g. 450000" value={q.amt} onChange={(e) => setQ({ ...q, amt: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <label style={S.fLabel}>Notes</label>
                  <textarea style={{ ...S.inp, minHeight: 50, resize: "vertical" }} value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} />
                </div>
                <button style={{ ...S.pri, width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15 }} onClick={submit} disabled={sending}>
                  {sending ? "Processing…" : "Submit Quote →"}
                </button>
              </div>
            )}
          </div>

          <div style={S.qlR}>
            {res && (
              <div style={{ ...S.card, background: `${stCol[res.status]}0D`, border: `2px solid ${stCol[res.status]}55`, textAlign: "center" }}>
                <div style={{ fontSize: 50, marginBottom: 4 }}>{stIco[res.status]}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: stCol[res.status], letterSpacing: "0.5px" }}>{stLabel[res.status]}</div>
                <div style={{ color: "#64748B", fontSize: 13, marginTop: 8 }}>{res.reason}</div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20, color: "#475569", fontSize: 13 }}>
                  <span>Bid: <b style={{ color: "#0F172A" }}>{INR(res.bid)}</b></span>
                  <span>Buy: <b style={{ color: "#0F172A" }}>{INR(res.buy)}</b></span>
                  <span>P&L: <b style={{ color: res.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(res.pnl)}</b></span>
                </div>
                {isApproved(res.status) && !res.auctionStarted && (
                  <button style={{ ...S.pri, marginTop: 14, background: "#8B5CF6", padding: "10px 28px" }} onClick={() => startAuction(res.id)}>
                    🔨 Start Auction
                  </button>
                )}
                {res.auctionStarted && <div style={{ color: "#10B981", fontSize: 13, marginTop: 12, fontWeight: 700 }}>✅ Auction Started</div>}
                {res.status === "REJECTED" && (
                  <button style={{ ...S.pri, marginTop: 14, background: "#F59E0B", padding: "10px 28px" }} onClick={() => escalate(res.id)}>
                    ⚠️ Escalate to Manager
                  </button>
                )}
              </div>
            )}

            <div style={S.card}>
              <div style={S.cHead}>📋 Recent Quotes ({history.length})</div>
              {!history.length ? <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>No quotes yet</div> : (
                <div style={{ maxHeight: 450, overflowY: "auto" }}>
                  {history.slice(0, 20).map((h) => (
                    <div key={h.id} style={S.hRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A" }}>{h.make} {h.model} <span style={{ color: "#94A3B8", fontSize: 12, fontWeight: 400 }}>#{h.appId}</span></div>
                        <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{h.submittedBy} → {h.dealer} · {h.time}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.status]}1A`, color: stCol[h.status] }}>{stLabel[h.status]}</span>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Bid: {INR(h.bid)} · P&L: <span style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</span></div>
                        {isApproved(h.status) && !h.auctionStarted && (
                          <button style={{ ...S.pri, marginTop: 6, background: "#8B5CF6", padding: "4px 10px", fontSize: 11 }} onClick={() => startAuction(h.id)}>
                            🔨 Start Auction
                          </button>
                        )}
                        {h.auctionStarted && <div style={{ fontSize: 10, color: "#10B981", marginTop: 4, fontWeight: 700 }}>✓ Auction Running</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {viewMode === "escalations" && (
        <div style={S.card}>
          <div style={S.cHead}>⚠️ Pending Escalations ({escalated.length})</div>
          {!escalated.length ? <div style={{ textAlign: "center", padding: "40px 0", color: "#94A3B8" }}>No pending escalations</div> : (
            <div>
              {escalated.map((h) => (
                <div key={h.id} style={{ ...S.hRow, padding: "16px 0", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: "#0F172A" }}>{h.make} {h.model}</div>
                    <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
                      App: <b style={{ color: "#3B82F6" }}>{h.appId}</b> · Dealer: {h.dealer} · Region: {h.region} · By: {h.submittedBy}
                    </div>
                    <div style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
                      Bid: <b>{INR(h.bid)}</b> · Buy: <b>{INR(h.buy)}</b> · P&L: <b style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</b> · Bucket: {h.ageBucket}
                    </div>
                    <div style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>{h.reason}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...S.pri, background: "#10B981", padding: "10px 20px" }} onClick={() => manualApprove(h.id)}>✅ Approve</button>
                    <button style={{ ...S.pri, background: "#EF4444", padding: "10px 20px" }} onClick={() => manualReject(h.id)}>❌ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 3 — QUOTE HISTORY (filterable log)
// ═════════════════════════════════════════════════════════════════════
function HistoryTab({ history }) {
  const [memberF, setMemberF] = useState("ALL");
  const [bucketF, setBucketF] = useState("ALL");
  const [regionF, setRegionF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const members = useMemo(() => ["ALL", ...new Set(history.map((h) => h.submittedBy).filter(Boolean))].sort(), [history]);
  const buckets = useMemo(() => ["ALL", ...new Set(history.map((h) => h.ageBucket).filter(Boolean))], [history]);
  const regions = useMemo(() => ["ALL", ...new Set(history.map((h) => h.region).filter(Boolean))].sort(), [history]);

  const filtered = useMemo(() => {
    let f = history;
    if (memberF !== "ALL") f = f.filter((h) => h.submittedBy === memberF);
    if (bucketF !== "ALL") f = f.filter((h) => h.ageBucket === bucketF);
    if (regionF !== "ALL") f = f.filter((h) => h.region === regionF);
    if (statusF !== "ALL") f = f.filter((h) => h.status === statusF);
    if (dateFrom) { const t = new Date(dateFrom).getTime(); f = f.filter((h) => h.timestamp >= t); }
    if (dateTo) { const t = new Date(dateTo).getTime() + 86400000; f = f.filter((h) => h.timestamp <= t); }
    return f;
  }, [history, memberF, bucketF, regionF, statusF, dateFrom, dateTo]);

  const stCol = { AUTO_APPROVED: "#10B981", REJECTED: "#EF4444", ESCALATED: "#F59E0B", MANAGER_APPROVED: "#10B981", MANAGER_REJECTED: "#EF4444" };
  const stLabel = { AUTO_APPROVED: "Auto Approved", REJECTED: "Rejected", ESCALATED: "Escalated", MANAGER_APPROVED: "Mgr Approved", MANAGER_REJECTED: "Mgr Rejected" };

  const stats = useMemo(() => {
    const n = filtered.length;
    const approved = filtered.filter((h) => h.status === "AUTO_APPROVED" || h.status === "MANAGER_APPROVED").length;
    const totalPnL = filtered.reduce((s, h) => s + (h.pnl || 0), 0);
    return { n, approved, totalPnL, rate: n ? (approved / n * 100).toFixed(0) : 0 };
  }, [filtered]);

  return (
    <div>
      <div style={S.metrics}>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#3B82F6" }}>{stats.n}</div><div style={S.mLabel}>Total Quotes</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#10B981" }}>{stats.approved}</div><div style={S.mLabel}>Approved</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: "#8B5CF6" }}>{stats.rate}%</div><div style={S.mLabel}>Approval Rate</div></div>
        <div style={S.mCard}><div style={{ fontSize: 22, fontWeight: 900, color: stats.totalPnL >= 0 ? "#10B981" : "#EF4444" }}>{INR(stats.totalPnL)}</div><div style={S.mLabel}>Total P&L</div></div>
      </div>

      <div style={S.filters}>
        <select style={S.sel} value={memberF} onChange={(e) => setMemberF(e.target.value)}>
          {members.map((m) => <option key={m} value={m}>{m === "ALL" ? "👤 All Members" : m}</option>)}
        </select>
        <select style={S.sel} value={bucketF} onChange={(e) => setBucketF(e.target.value)}>
          {buckets.map((b) => <option key={b} value={b}>{b === "ALL" ? "📅 All Buckets" : b}</option>)}
        </select>
        <select style={S.sel} value={regionF} onChange={(e) => setRegionF(e.target.value)}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "📍 All Regions" : r}</option>)}
        </select>
        <select style={S.sel} value={statusF} onChange={(e) => setStatusF(e.target.value)}>
          <option value="ALL">📊 All Status</option>
          <option value="AUTO_APPROVED">Auto Approved</option>
          <option value="MANAGER_APPROVED">Manager Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="ESCALATED">Escalated</option>
          <option value="MANAGER_REJECTED">Mgr Rejected</option>
        </select>
        <input type="date" style={S.sel} value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <span style={{ color: "#64748B" }}>to</span>
        <input type="date" style={S.sel} value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <span style={S.fCount}>{filtered.length} of {history.length}</span>
      </div>

      <div style={S.tWrap}>
        <div style={S.tScroll}>
          <table style={S.table}>
            <thead><tr>
              {["Time", "Member", "App ID", "Car", "Dealer", "Region", "Bucket", "Bid", "Buy", "P&L", "Status"].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={11} style={{ ...S.td, textAlign: "center", padding: 40, color: "#94A3B8" }}>No quotes match these filters</td></tr>
              )}
              {filtered.map((h) => (
                <tr key={h.id} className="tr">
                  <td style={{ ...S.td, fontSize: 11, color: "#64748B" }}>{h.time}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{h.submittedBy || "—"}</td>
                  <td style={{ ...S.td, color: "#3B82F6", fontWeight: 600 }}>{h.appId}</td>
                  <td style={S.td}>{h.make} {h.model}</td>
                  <td style={S.td}>{h.dealer}</td>
                  <td style={S.td}>{h.region || "—"}</td>
                  <td style={S.td}><span style={S.bucketChip}>{h.ageBucket || "—"}</span></td>
                  <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{INR(h.bid)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{INR(h.buy)}</td>
                  <td style={{ ...S.td, textAlign: "right", fontVariantNumeric: "tabular-nums", color: h.pnl >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{INR(h.pnl)}</td>
                  <td style={S.td}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.status]}1A`, color: stCol[h.status] }}>{stLabel[h.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 4 — SOLD DASHBOARD
// ═════════════════════════════════════════════════════════════════════
function DashboardTab() {
  const d = DUMMY_DASH;
  return (
    <div>
      <div style={{ padding: "12px 16px", background: "#FEF3C7", borderRadius: 8, marginBottom: 20, fontSize: 13, color: "#78350F" }}>
        ⚠️ <b>Showing dummy data.</b> Connect your sold-cars data source later to see real numbers.
      </div>

      <div style={S.metrics}>
        <div style={S.mCard}>
          <div style={{ fontSize: 28, fontWeight: 900, color: "#3B82F6" }}>{d.totalSold.toLocaleString()}</div>
          <div style={S.mLabel}>Total Cars Sold</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 28, fontWeight: 900, color: d.totalPnL >= 0 ? "#10B981" : "#EF4444" }}>{INR(d.totalPnL)}</div>
          <div style={S.mLabel}>Total P&L</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 28, fontWeight: 900, color: d.avgLossPerCar >= 0 ? "#10B981" : "#EF4444" }}>{INR(d.avgLossPerCar)}</div>
          <div style={S.mLabel}>Avg Loss / Car</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 20 }}>
        <div style={S.card}>
          <div style={S.cHead}>📊 Sold by SI Bucket</div>
          <table style={S.table}>
            <thead><tr>
              {["Bucket", "Cars Sold", "P&L", "Avg Loss/Car"].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.byBucket.map((b) => (
                <tr key={b.bucket} className="tr">
                  <td style={S.td}><span style={S.bucketChip}>{b.bucket}</span></td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{b.sold}</td>
                  <td style={{ ...S.td, color: b.pnl >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{INR(b.pnl)}</td>
                  <td style={{ ...S.td, color: b.avgLoss >= 0 ? "#10B981" : "#EF4444" }}>{INR(b.avgLoss)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={S.card}>
          <div style={S.cHead}>🏷️ Sold by Channel</div>
          <table style={S.table}>
            <thead><tr>
              {["Channel", "Cars Sold", "P&L", "% of Total"].map((h) => <th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.byChannel.map((c) => (
                <tr key={c.channel} className="tr">
                  <td style={{ ...S.td, fontWeight: 700 }}>{c.channel}</td>
                  <td style={S.td}>{c.sold}</td>
                  <td style={{ ...S.td, color: c.pnl >= 0 ? "#10B981" : "#EF4444", fontWeight: 700 }}>{INR(c.pnl)}</td>
                  <td style={S.td}>{((c.sold / d.totalSold) * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 5 — AUCTION CONSOLE (Slot-based, mirrors Copy_Experiment_Liquidation)
// ═════════════════════════════════════════════════════════════════════
//  Mirrors the control pattern of the master Excel sheet:
//   - Z column filters APPOINTMENT_IDs by SI bucket (regex match on bucket name)
//   - E column computes Anchor using $D$4 (base multiplier) and $D$2 (drop factor)
//  Here each slot = one group of SI buckets, and each bucket has its own
//  anchor slider (average anchor price applied to all cars in that bucket).
// ═════════════════════════════════════════════════════════════════════
const SLOT_NAMES = ["A", "B", "C", "D", "E", "F", "G", "H"];
const CANONICAL_BUCKETS = ["0-30", "30-60", "60-90", "90-120", "120-150", "150-180", "180+"];

const sortBuckets = (arr) => [...arr].sort((a, b) => {
  const na = parseInt(String(a).match(/\d+/)?.[0] || "0", 10);
  const nb = parseInt(String(b).match(/\d+/)?.[0] || "0", 10);
  return na - nb;
});

function AuctionTab({ rows, slackUrl, sheetUrl, managerEmail, currentUser }) {
  const [numSlots, setNumSlots] = useState(3);
  // slotAssignments: { "A": Set<bucket>, "B": Set<bucket>, ... }
  const [slotAssignments, setSlotAssignments] = useState({
    A: new Set(), B: new Set(), C: new Set(),
  });
  // bucketAnchors: { "0-30": 250000, ... }  (average anchor per bucket)
  const [bucketAnchors, setBucketAnchors] = useState({});
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState(null);

  // ── 1. Discover SI buckets from the uploaded inventory ───────────
  const SI_BUCKETS = useMemo(() => {
    const found = new Set();
    for (const r of rows) {
      const b = String(r.AGE_BUCKET || "").trim();
      if (b) found.add(b);
    }
    // If nothing found (column missing), fall back to canonical list
    return found.size ? sortBuckets([...found]) : CANONICAL_BUCKETS;
  }, [rows]);

  // ── 2. Aggregate cars by bucket ──────────────────────────────────
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

  // ── 3. Initialize default anchor per bucket (95% of avg BP) ──────
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

  // ── 4. Auto-distribute buckets across slots when slot count changes ──
  useEffect(() => {
    setSlotAssignments((prev) => {
      // Only auto-seed if all current slots are empty (first load / reset)
      const activeNow = SLOT_NAMES.slice(0, numSlots);
      const existingSlots = Object.keys(prev);
      const anyAssigned = existingSlots.some((s) => prev[s] && prev[s].size > 0);

      const next = {};
      for (const s of activeNow) next[s] = prev[s] ? new Set(prev[s]) : new Set();

      if (!anyAssigned && SI_BUCKETS.length) {
        // Distribute buckets round-robin across slots
        SI_BUCKETS.forEach((b, i) => {
          if (bucketStats[b]?.count > 0) {
            const slot = activeNow[i % activeNow.length];
            next[slot].add(b);
          }
        });
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numSlots, SI_BUCKETS.length]);

  const activeSlots = SLOT_NAMES.slice(0, numSlots);

  // ── 5. Helpers ───────────────────────────────────────────────────
  // Which slot currently owns a given bucket? (buckets are exclusive across slots)
  const bucketOwner = (bucket) => {
    for (const s of activeSlots) {
      if (slotAssignments[s]?.has(bucket)) return s;
    }
    return null;
  };

  // Toggle a bucket in a slot. If already in another slot, move it here.
  const toggleBucket = (slot, bucket) => {
    setSlotAssignments((prev) => {
      const next = {};
      for (const s of activeSlots) next[s] = new Set(prev[s] || []);
      const owner = activeSlots.find((s) => next[s].has(bucket));
      if (owner === slot) {
        next[slot].delete(bucket); // uncheck → remove from auction
      } else {
        if (owner) next[owner].delete(bucket); // move from old slot
        next[slot].add(bucket);
      }
      return next;
    });
  };

  const setBucketAnchor = (bucket, val) => {
    setBucketAnchors((prev) => ({ ...prev, [bucket]: Number(val) }));
  };

  // ── 6. Per-slot aggregated stats ─────────────────────────────────
  const slotStats = useMemo(() => {
    const out = {};
    for (const s of activeSlots) {
      const bs = [...(slotAssignments[s] || [])];
      let cars = 0, totalBP = 0, totalAnchor = 0;
      for (const b of bs) {
        const bkt = bucketStats[b];
        if (!bkt) continue;
        cars += bkt.count;
        totalBP += bkt.totalBP;
        const a = bucketAnchors[b] ?? bkt.avgBP;
        totalAnchor += a * bkt.count;
      }
      out[s] = {
        cars, totalBP, totalAnchor,
        avgBP: cars ? Math.round(totalBP / cars) : 0,
        avgAnchor: cars ? Math.round(totalAnchor / cars) : 0,
        pnl: totalAnchor - totalBP,
      };
    }
    return out;
  }, [activeSlots, slotAssignments, bucketStats, bucketAnchors]);

  // ── 7. Global total across all slots ─────────────────────────────
  const globalStats = useMemo(() => {
    let cars = 0, bp = 0, anchor = 0;
    Object.values(slotStats).forEach((s) => {
      cars += s.cars; bp += s.totalBP; anchor += s.totalAnchor;
    });
    return { cars, bp, anchor, pnl: anchor - bp, avgPnL: cars ? (anchor - bp) / cars : 0 };
  }, [slotStats]);

  // ── 8. Run auction: log every car to sheet, tagged with slot + bucket ──
  const runAuction = async () => {
    if (!globalStats.cars) { alert("No buckets selected. Check at least one bucket in any slot."); return; }
    if (!currentUser) { alert("Please enter your name in the header first."); return; }
    if (!confirm(`Run auction on ${globalStats.cars.toLocaleString()} cars across ${activeSlots.length} slot(s)?\nExpected P&L: ${INR(globalStats.pnl)}`)) return;
    setRunning(true);

    let sent = 0;
    for (const slot of activeSlots) {
      const buckets = [...(slotAssignments[slot] || [])];
      for (const b of buckets) {
        const anchor = bucketAnchors[b] ?? bucketStats[b].avgBP;
        for (const car of bucketStats[b].cars) {
          await appendToSheet(sheetUrl, {
            timestamp: new Date().toISOString(),
            appointmentId: car.LEAD_ID,
            region: car.REGION || "",
            anchorPrice: anchor,
            auctionStartFor: `SLOT_${slot}_${b}`,
            submittedBy: currentUser,
            email: managerEmail || "",
            date: new Date().toLocaleDateString("en-IN"),
          });
          sent++;
        }
      }
    }

    if (slackUrl) {
      const summary = activeSlots
        .filter((s) => slotStats[s].cars > 0)
        .map((s) => {
          const bs = [...(slotAssignments[s] || [])];
          return `• Slot ${s}: ${bs.join(", ")} → ${slotStats[s].cars} cars @ avg anchor ₹${slotStats[s].avgAnchor.toLocaleString("en-IN")}`;
        })
        .join("\n");
      await sendSlackMessage(slackUrl,
        `:hammer: *BULK AUCTION STARTED*\n*Total:* ${sent} cars | *Expected P&L:* ₹${globalStats.pnl.toLocaleString("en-IN")}\n\n${summary}\n\n*By:* ${currentUser}`
      );
    }

    setLastRun({ count: sent, pnl: globalStats.pnl, time: new Date().toLocaleString("en-IN") });
    setRunning(false);
  };

  const slotColors = ["#3B82F6", "#8B5CF6", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#EF4444", "#84CC16"];

  // ═════════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════════
  return (
    <div>
      {/* ── Slot count selector ─────────────────────────────────── */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>🎰 Number of Auction Slots</div>
        <div style={{ color: "#64748B", fontSize: 13, marginBottom: 12 }}>
          Each slot runs auctions on its own set of SI buckets. Buckets are exclusive — a bucket can only live in one slot at a time.
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              onClick={() => setNumSlots(n)}
              style={{
                padding: "10px 22px",
                borderRadius: 10,
                border: numSlots === n ? "2px solid #3B82F6" : "2px solid #E2E8F0",
                background: numSlots === n ? "#EFF6FF" : "#FFFFFF",
                color: numSlots === n ? "#1D4ED8" : "#64748B",
                fontWeight: 800,
                fontSize: 15,
                cursor: "pointer",
                fontFamily: "inherit",
                minWidth: 56,
              }}
            >
              {n}
            </button>
          ))}
          <div style={{ marginLeft: "auto", color: "#64748B", fontSize: 13, alignSelf: "center" }}>
            Active: <b style={{ color: "#0F172A" }}>{activeSlots.join(" · ")}</b>
          </div>
        </div>
      </div>

      {/* ── Global summary ──────────────────────────────────────── */}
      <div style={S.metrics}>
        <div style={S.mCard}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#3B82F6" }}>{globalStats.cars.toLocaleString()}</div>
          <div style={S.mLabel}>Cars in Auction</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#F59E0B" }}>{INR(globalStats.bp)}</div>
          <div style={S.mLabel}>Total Buying Value</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 26, fontWeight: 900, color: "#8B5CF6" }}>{INR(globalStats.anchor)}</div>
          <div style={S.mLabel}>Total Anchor Value</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 26, fontWeight: 900, color: globalStats.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.pnl)}</div>
          <div style={S.mLabel}>Expected P&L</div>
        </div>
        <div style={S.mCard}>
          <div style={{ fontSize: 26, fontWeight: 900, color: globalStats.avgPnL >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.avgPnL)}</div>
          <div style={S.mLabel}>Avg P&L / Car</div>
        </div>
      </div>

      {/* ── Slot Cards ──────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 20 }}>
        {activeSlots.map((slot, idx) => {
          const color = slotColors[idx % slotColors.length];
          const st = slotStats[slot];
          const slotBuckets = slotAssignments[slot] || new Set();

          return (
            <div key={slot} style={{ ...S.card, borderLeft: `4px solid ${color}`, padding: 0, overflow: "hidden" }}>
              {/* Slot header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                background: `${color}0D`,
                borderBottom: "1px solid #E2E8F0",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, background: color, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 24, fontWeight: 900,
                  }}>{slot}</div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>Slot {slot}</div>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                      {slotBuckets.size ? `${[...slotBuckets].join(" · ")}` : "No buckets checked — auction will skip this slot"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 28, textAlign: "right" }}>
                  <div>
                    <div style={S.slotMetricLabel}>Cars</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#0F172A" }}>{st.cars.toLocaleString()}</div>
                  </div>
                  <div>
                    <div style={S.slotMetricLabel}>Avg BP</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: "#F59E0B" }}>{INR(st.avgBP)}</div>
                  </div>
                  <div>
                    <div style={S.slotMetricLabel}>Avg Anchor</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color }}>{INR(st.avgAnchor)}</div>
                  </div>
                  <div>
                    <div style={S.slotMetricLabel}>Slot P&L</div>
                    <div style={{ fontSize: 18, fontWeight: 900, color: st.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(st.pnl)}</div>
                  </div>
                </div>
              </div>

              {/* Bucket rows */}
              <div style={{ padding: "8px 20px 16px" }}>
                {/* Column headers */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "180px 90px 140px 1fr 200px",
                  gap: 16,
                  padding: "10px 0 6px",
                  borderBottom: "1px solid #E2E8F0",
                }}>
                  <div style={S.slotMetricLabel}>Bucket</div>
                  <div style={S.slotMetricLabel}>Cars</div>
                  <div style={S.slotMetricLabel}>Avg BP</div>
                  <div style={S.slotMetricLabel}>Avg Anchor (slide to set)</div>
                  <div style={{ ...S.slotMetricLabel, textAlign: "right" }}>Delta from BP</div>
                </div>

                {SI_BUCKETS.map((b) => {
                  const bkt = bucketStats[b];
                  if (!bkt) return null;
                  const owner = bucketOwner(b);
                  const checked = owner === slot;
                  const ownedElsewhere = owner && owner !== slot;
                  const disabled = bkt.count === 0;
                  const avgBP = bkt.avgBP;
                  // Slider range: 70%–110% of BP
                  const min = Math.max(1000, Math.round(avgBP * 0.70));
                  const max = Math.round(avgBP * 1.10);
                  const anchor = bucketAnchors[b] ?? avgBP;
                  const deltaAbs = anchor - avgBP;
                  const deltaPct = avgBP ? (deltaAbs / avgBP) * 100 : 0;

                  return (
                    <div key={b} style={{
                      display: "grid",
                      gridTemplateColumns: "180px 90px 140px 1fr 200px",
                      gap: 16,
                      alignItems: "center",
                      padding: "14px 0",
                      borderBottom: "1px solid #F1F5F9",
                      opacity: disabled ? 0.35 : (ownedElsewhere ? 0.45 : 1),
                    }}>
                      {/* Checkbox + bucket pill */}
                      <label style={{
                        display: "flex", alignItems: "center", gap: 10,
                        cursor: disabled ? "not-allowed" : "pointer",
                      }}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleBucket(slot, b)}
                          style={{ width: 18, height: 18, accentColor: color, cursor: disabled ? "not-allowed" : "pointer" }}
                        />
                        <span style={{
                          padding: "5px 14px",
                          borderRadius: 20,
                          fontSize: 12,
                          fontWeight: 800,
                          background: checked ? `${color}1F` : "#F1F5F9",
                          color: checked ? color : "#64748B",
                          border: checked ? `1px solid ${color}55` : "1px solid transparent",
                        }}>{b}</span>
                        {ownedElsewhere && (
                          <span style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>in Slot {owner}</span>
                        )}
                      </label>

                      {/* Car count */}
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                        {bkt.count.toLocaleString()}
                      </div>

                      {/* Avg BP box */}
                      <div style={{
                        padding: "8px 12px",
                        background: "#FEF3C7",
                        borderRadius: 8,
                        fontSize: 14,
                        fontWeight: 800,
                        color: "#92400E",
                        textAlign: "center",
                        border: "1px solid #FDE68A",
                      }}>
                        {INR(avgBP)}
                      </div>

                      {/* Anchor slider */}
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94A3B8", marginBottom: 4 }}>
                          <span>{INR(min)}</span>
                          <span style={{ fontWeight: 800, color: "#0F172A", fontSize: 14 }}>{INR(anchor)}</span>
                          <span>{INR(max)}</span>
                        </div>
                        <input
                          type="range"
                          min={min}
                          max={max}
                          step={500}
                          value={Math.min(max, Math.max(min, anchor))}
                          disabled={!checked || disabled}
                          onChange={(e) => setBucketAnchor(b, e.target.value)}
                          style={{
                            width: "100%",
                            accentColor: color,
                            cursor: (checked && !disabled) ? "pointer" : "not-allowed",
                          }}
                        />
                      </div>

                      {/* Delta from BP */}
                      <div style={{ textAlign: "right" }}>
                        <div style={{
                          display: "inline-block",
                          padding: "6px 14px",
                          borderRadius: 8,
                          background: deltaAbs >= 0 ? "#DCFCE7" : "#FEE2E2",
                          color: deltaAbs >= 0 ? "#166534" : "#991B1B",
                          fontWeight: 800,
                          fontSize: 13,
                        }}>
                          {deltaAbs >= 0 ? "▲ +" : "▼ "}{INR(Math.abs(deltaAbs))}
                          <span style={{ opacity: 0.75, marginLeft: 6, fontSize: 11 }}>
                            ({deltaPct >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
                          </span>
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

      {/* ── Run button ──────────────────────────────────────────── */}
      <div style={{
        marginTop: 24,
        display: "flex",
        gap: 16,
        alignItems: "center",
        padding: 20,
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: 12,
        boxShadow: "0 1px 2px rgba(15,23,42,0.03)",
      }}>
        <button
          style={{ ...S.pri, background: "#8B5CF6", padding: "16px 36px", fontSize: 16 }}
          onClick={runAuction}
          disabled={running || !globalStats.cars}
        >
          {running ? "Running…" : `🔨 Run Auction on ${globalStats.cars.toLocaleString()} cars`}
        </button>
        <div style={{ color: "#64748B", fontSize: 13 }}>
          Expected P&L: <b style={{ color: globalStats.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.pnl)}</b>
          {" · "}Avg: <b style={{ color: globalStats.avgPnL >= 0 ? "#10B981" : "#EF4444" }}>{INR(globalStats.avgPnL)}/car</b>
        </div>
        {lastRun && (
          <div style={{ marginLeft: "auto", color: "#10B981", fontSize: 13, fontWeight: 600 }}>
            ✅ Last run: {lastRun.count.toLocaleString()} cars · {INR(lastRun.pnl)} · {lastRun.time}
          </div>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════
//  TAB 6 — SETTINGS
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
