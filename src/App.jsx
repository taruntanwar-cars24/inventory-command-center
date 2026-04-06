import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════════════
   CARS24 INVENTORY COMMAND CENTER v5
   ───────────────────────────────────────────────────────────────────────
   Tab 1 — Stuck Inventory: Excel upload, full table
   Tab 2 — Quote Submission: auto-approval logic, Slack alerts, Sheet write
   Tab 3 — Settings: Slack webhook + Google Sheet config
   ═══════════════════════════════════════════════════════════════════════ */

// ── Helpers ──────────────────────────────────────────────────────────
const toNum = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[₹,\s%]/g, "")) : Number(v);
  return isNaN(n) ? null : n;
};
const INR = (n) => {
  if (n == null || isNaN(n)) return "\u2014";
  const a = Math.abs(n), s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}\u20B9${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}\u20B9${(a / 1e5).toFixed(2)} L`;
  if (a >= 1e3) return `${s}\u20B9${(a / 1e3).toFixed(1)} K`;
  return `${s}\u20B9${a.toLocaleString("en-IN")}`;
};

// ── Approval Logic ───────────────────────────────────────────────────
// Returns { status: "AUTO_APPROVED" | "REJECTED", reason: string }
function evaluateQuote(bid, buyingPrice, ageBucket) {
  const pnl = bid - buyingPrice;
  const lossPct = buyingPrice ? (pnl / buyingPrice) * 100 : 0;
  const bucket = String(ageBucket || "").trim().toLowerCase();

  if (bucket.includes("0-30") || bucket.includes("0 - 30") || bucket === "0-30") {
    if (pnl >= -7000) return { status: "AUTO_APPROVED", reason: `Loss \u20B9${Math.abs(pnl).toLocaleString("en-IN")} is within \u20B97,000 limit for 0-30 day bucket` };
    return { status: "REJECTED", reason: `Loss \u20B9${Math.abs(pnl).toLocaleString("en-IN")} exceeds \u20B97,000 max for 0-30 day bucket` };
  }
  if (bucket.includes("30-60") || bucket.includes("30 - 60") || bucket === "30-60") {
    if (pnl >= -25000) return { status: "AUTO_APPROVED", reason: `Loss \u20B9${Math.abs(pnl).toLocaleString("en-IN")} is within \u20B92,500 limit for 30-60 day bucket` };
    return { status: "REJECTED", reason: `Loss \u20B9${Math.abs(pnl).toLocaleString("en-IN")} exceeds \u20B92,500 max for 30-60 day bucket` };
  }
  if (bucket.includes("60-90") || bucket.includes("60 - 90") || bucket === "60-90") {
    if (lossPct >= -20) return { status: "AUTO_APPROVED", reason: `Loss ${lossPct.toFixed(1)}% is within -20% limit for 60-90 day bucket` };
    return { status: "REJECTED", reason: `Loss ${lossPct.toFixed(1)}% exceeds -20% max for 60-90 day bucket` };
  }
  // 90+ or unknown bucket → escalate by default
  return { status: "REJECTED", reason: `Age bucket "${ageBucket}" requires manual review (90+ days or unrecognized)` };
}

// ── Slack Webhook ────────────────────────────────────────────────────
async function sendSlackMessage(webhookUrl, message) {
  if (!webhookUrl) return { ok: false, error: "No Slack webhook URL configured" };
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Google Sheets Append (via Google Forms / Apps Script Web App) ────
async function appendToSheet(sheetWebhookUrl, rowData) {
  if (!sheetWebhookUrl) return { ok: false, error: "No Google Sheet webhook URL configured" };
  try {
    const res = await fetch(sheetWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rowData),
      mode: "no-cors",
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Constants ────────────────────────────────────────────────────────
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

const KEY_COLS = [
  "LEAD_ID", "REGION", "MAKE", "MODEL", "BUYING_PRICE", "NEW_MSP", "Anchor",
  "TP", "AGE_BUCKET", "SI_AGE", "PARKING_REGION", "SALE_CANCEL_DATE",
  "C24", "C2D Flag", "C2D Price", "Auction Stop", "RI Pending",
  "Year", "Odometer", "fuel_type", "AUCTION", "BID_AMOUNT", "AUCTION_BIDDING_STATUS",
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
  const [history, setHistory] = useState([]);

  // Settings (persisted in localStorage)
  const [slackUrl, setSlackUrl] = useState(() => localStorage.getItem("c24_slack_url") || "");
  const [sheetUrl, setSheetUrl] = useState(() => localStorage.getItem("c24_sheet_url") || "");
  const [managerEmail, setManagerEmail] = useState(() => localStorage.getItem("c24_mgr_email") || "");

  useEffect(() => { localStorage.setItem("c24_slack_url", slackUrl); }, [slackUrl]);
  useEffect(() => { localStorage.setItem("c24_sheet_url", sheetUrl); }, [sheetUrl]);
  useEffect(() => { localStorage.setItem("c24_mgr_email", managerEmail); }, [managerEmail]);

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
        if (tab === "inventory" || !tab) setTab("inventory");
      } catch (err) { alert("Error: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer?.files?.[0]); };
  const browse = () => { const i = document.createElement("input"); i.type = "file"; i.accept = ".xlsx,.xls,.csv"; i.onchange = (e) => handleFile(e.target.files?.[0]); i.click(); };

  // Escalation counts for badge
  const pendingEsc = history.filter((h) => h.status === "ESCALATED").length;

  return (
    <div style={S.app}>
      <style>{CSS}</style>

      {/* HEADER */}
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
            { id: "quotes", icon: "\uD83D\uDCB0", label: "Quote Submission", badge: pendingEsc || null },
            { id: "settings", icon: "\u2699\uFE0F", label: "Settings" },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={tab === t.id ? S.navActive : S.navBtn}>
              {t.icon} {t.label}
              {t.badge ? <span style={S.tabBadge}>{t.badge}</span> : null}
            </button>
          ))}
        </nav>
        {rows && (
          <div style={S.fileBadge}>
            <span style={{ color: "#10B981" }}>\u2713</span> {fileName}
            <button onClick={() => { setRows(null); setFileName(""); }} style={S.removeBtn}>\u2715</button>
          </div>
        )}
      </header>

      {/* UPLOAD */}
      {!rows && (
        <div style={S.uploadWrap}>
          <div style={{ ...S.dropzone, ...(dragOver ? S.dzHover : {}) }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop} onClick={browse}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.6 }}>{dragOver ? "\uD83D\uDCE5" : "\uD83D\uDCC2"}</div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>{dragOver ? "Drop it here!" : "Upload Stuck Inventory"}</div>
            <div style={{ color: "#8896AB", fontSize: 14, marginBottom: 16 }}>Drag & drop .xlsx / .csv, or click to browse</div>
            <div style={S.uploadBtn}>Choose File</div>
            <div style={{ color: "#475569", fontSize: 12, marginTop: 16 }}>Data stays in your browser</div>
          </div>
        </div>
      )}

      {/* CONTENT */}
      {rows && (
        <main style={S.main}>
          {tab === "inventory" && <InventoryTab rows={rows} />}
          {tab === "quotes" && <QuoteTab rows={rows} history={history} setHistory={setHistory} slackUrl={slackUrl} sheetUrl={sheetUrl} managerEmail={managerEmail} />}
          {tab === "settings" && <SettingsTab slackUrl={slackUrl} setSlackUrl={setSlackUrl} sheetUrl={sheetUrl} setSheetUrl={setSheetUrl} managerEmail={managerEmail} setManagerEmail={setManagerEmail} />}
        </main>
      )}
      {!rows && tab === "settings" && (
        <main style={S.main}>
          <SettingsTab slackUrl={slackUrl} setSlackUrl={setSlackUrl} sheetUrl={sheetUrl} setSheetUrl={setSheetUrl} managerEmail={managerEmail} setManagerEmail={setManagerEmail} />
        </main>
      )}
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
  const [parkF, setParkF] = useState("ALL");
  const [c2dF, setC2dF] = useState("ALL");
  const [page, setPage] = useState(0);
  const [allC, setAllC] = useState(false);
  const PG = 100;

  const cols = useMemo(() => rows.length ? Object.keys(rows[0]) : [], [rows]);
  const vis = useMemo(() => allC ? cols : KEY_COLS.filter((c) => cols.includes(c)), [cols, allC]);
  const regions = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.REGION).filter(Boolean))].sort(), [rows]);
  const ages = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.AGE_BUCKET).filter(Boolean))], [rows]);
  const parks = useMemo(() => ["ALL", ...new Set(rows.map((r) => r.PARKING_REGION).filter(Boolean))].sort(), [rows]);

  const filtered = useMemo(() => {
    let f = rows;
    if (regionF !== "ALL") f = f.filter((r) => r.REGION === regionF);
    if (ageF !== "ALL") f = f.filter((r) => r.AGE_BUCKET === ageF);
    if (parkF !== "ALL") f = f.filter((r) => r.PARKING_REGION === parkF);
    if (c2dF !== "ALL") f = f.filter((r) => String(r["C2D Flag"]) === c2dF);
    if (search) { const s = search.toLowerCase(); f = f.filter((r) => String(r.LEAD_ID||"").toLowerCase().includes(s)||String(r.MAKE||"").toLowerCase().includes(s)||String(r.MODEL||"").toLowerCase().includes(s)||String(r["Reg No"]||"").toLowerCase().includes(s)); }
    return f;
  }, [rows, regionF, ageF, parkF, c2dF, search]);

  const pg = filtered.slice(page*PG,(page+1)*PG);
  const tp = Math.ceil(filtered.length/PG);
  const st = useMemo(() => {
    const n=filtered.length, bp=filtered.reduce((s,r)=>s+(toNum(r.BUYING_PRICE)||0),0);
    const ri=filtered.filter(r=>["yes","1","true"].includes(String(r["RI Pending"]).toLowerCase())).length;
    const as=filtered.filter(r=>["yes","1","true"].includes(String(r["Auction Stop"]).toLowerCase())).length;
    const c2=filtered.filter(r=>["yes","1","true"].includes(String(r["C2D Flag"]).toLowerCase())).length;
    const rg=new Set(filtered.map(r=>r.REGION).filter(Boolean)).size;
    return {n,bp,ri,as,c2,rg,av:n?bp/n:0};
  },[filtered]);

  return (
    <div>
      <div style={S.metrics}>
        {[{l:"TOTAL CARS",v:st.n.toLocaleString(),c:"#4F8EF7"},{l:"REGIONS",v:st.rg,c:"#A78BFA"},{l:"AVG BUYING PRICE",v:INR(st.av),c:"#F59E0B"},{l:"C2D FLAGGED",v:st.c2.toLocaleString(),c:"#10B981"},{l:"RI PENDING",v:st.ri.toLocaleString(),c:"#EF4444"},{l:"AUCTION STOP",v:st.as.toLocaleString(),c:"#F97316"}].map(m=>(
          <div key={m.l} style={S.mCard}><div style={{fontSize:22,fontWeight:900,color:m.c,letterSpacing:"-1px"}}>{m.v}</div><div style={S.mLabel}>{m.l}</div></div>
        ))}
      </div>
      <div style={S.filters}>
        <input style={S.searchBox} placeholder="\uD83D\uDD0D  Search Lead ID, Make, Model..." value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} />
        <select style={S.sel} value={regionF} onChange={e=>{setRegionF(e.target.value);setPage(0)}}>{regions.map(r=><option key={r} value={r}>{r==="ALL"?"\uD83D\uDCCD All Regions":r}</option>)}</select>
        <select style={S.sel} value={ageF} onChange={e=>{setAgeF(e.target.value);setPage(0)}}>{ages.map(a=><option key={a} value={a}>{a==="ALL"?"\uD83D\uDCC5 All Ages":a}</option>)}</select>
        <select style={S.sel} value={parkF} onChange={e=>{setParkF(e.target.value);setPage(0)}}>{parks.map(p=><option key={p} value={p}>{p==="ALL"?"\uD83C\uDD7F\uFE0F All Parking":p}</option>)}</select>
        <select style={S.sel} value={c2dF} onChange={e=>{setC2dF(e.target.value);setPage(0)}}><option value="ALL">C2D: All</option><option value="1">C2D: Yes</option><option value="0">C2D: No</option></select>
        <button style={S.colBtn} onClick={()=>setAllC(!allC)}>{allC?`Key (${KEY_COLS.length})`:`All (${cols.length})`}</button>
        <span style={S.fCount}>{filtered.length.toLocaleString()} / {rows.length.toLocaleString()}</span>
      </div>
      <div style={S.tWrap}>
        <div style={S.tScroll}>
          <table style={S.table}><thead><tr>
            <th style={{...S.th,position:"sticky",left:0,zIndex:3,background:"#131B2E",width:44}}>#</th>
            {vis.map(c=><th key={c} style={S.th}>{c}</th>)}
          </tr></thead><tbody>
            {pg.map((row,i)=>(
              <tr key={i} className="tr">
                <td style={{...S.td,position:"sticky",left:0,background:"#0D1321",color:"#475569",fontSize:11,zIndex:1}}>{page*PG+i+1}</td>
                {vis.map(c=>{const v=row[c],m=INR_COLS.has(c);return(
                  <td key={c} style={{...S.td,...(m?{textAlign:"right",fontVariantNumeric:"tabular-nums"}:{})}}>
                    {c==="LEAD_ID"?<span style={{color:"#4F8EF7",fontWeight:600}}>{v}</span>
                    :c==="C2D Flag"?<span className={String(v)==="1"?"bg":"bd"}>{String(v)==="1"?"Yes":v||"\u2014"}</span>
                    :c==="RI Pending"?<span style={{color:["yes","1"].includes(String(v).toLowerCase())?"#EF4444":"#64748B"}}>{v||"\u2014"}</span>
                    :c==="Auction Stop"?<span style={{color:["yes","1"].includes(String(v).toLowerCase())?"#F97316":"#64748B"}}>{v||"\u2014"}</span>
                    :m?INR(toNum(v)):String(v||"\u2014")}
                  </td>
                )})}
              </tr>
            ))}
          </tbody></table>
        </div>
        <div style={S.pag}>
          <button style={S.pgB} disabled={page===0} onClick={()=>setPage(0)}>{"\u27E8\u27E8"}</button>
          <button style={S.pgB} disabled={page===0} onClick={()=>setPage(page-1)}>{"\u2190"} Prev</button>
          <span style={S.pgI}>Page <b>{page+1}</b>/<b>{tp||1}</b> | {page*PG+1}\u2013{Math.min((page+1)*PG,filtered.length)} of {filtered.length.toLocaleString()}</span>
          <button style={S.pgB} disabled={page>=tp-1} onClick={()=>setPage(page+1)}>Next {"\u2192"}</button>
          <button style={S.pgB} disabled={page>=tp-1} onClick={()=>setPage(tp-1)}>{"\u27E9\u27E9"}</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  TAB 2 — QUOTE SUBMISSION
// ═════════════════════════════════════════════════════════════════════
function QuoteTab({ rows, history, setHistory, slackUrl, sheetUrl, managerEmail }) {
  const [appId, setAppId] = useState("");
  const [car, setCar] = useState(null);
  const [miss, setMiss] = useState(false);
  const [q, setQ] = useState({ dealer: "", amt: "", notes: "" });
  const [res, setRes] = useState(null);
  const [sending, setSending] = useState(false);
  const [viewMode, setViewMode] = useState("submit"); // "submit" | "escalations"

  const escalated = history.filter((h) => h.status === "ESCALATED");

  const find = () => {
    const id = appId.trim();
    if (!id) return;
    const f = rows.find((r) => String(r.LEAD_ID||"").trim() === id || String(r.CAR_ID||"").trim() === id);
    if (f) { setCar(f); setMiss(false); setRes(null); } else { setCar(null); setMiss(true); }
  };

  const submit = async () => {
    if (!car || !q.amt) return;
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
      status, reason, region: car.REGION || "",
      anchor, time: new Date().toLocaleString("en-IN"),
      slackSent: false, sheetSent: false,
    };

    // AUTO_APPROVED → send to Google Sheet for auction
    if (status === "AUTO_APPROVED") {
      const sheetRow = {
        timestamp: new Date().toISOString(),
        appointmentId: car.LEAD_ID,
        region: car.REGION || "",
        anchorPrice: anchor,
        auctionStartFor: q.dealer,
        email: managerEmail || "",
        date: new Date().toLocaleDateString("en-IN"),
      };
      const sheetRes = await appendToSheet(sheetUrl, sheetRow);
      entry.sheetSent = sheetRes.ok;
    }

    // REJECTED → show escalate button (handled in UI, no auto-send)

    setRes(entry);
    setHistory((h) => [entry, ...h]);
    setQ({ dealer: "", amt: "", notes: "" });
    setSending(false);
  };

  // Escalate a rejected quote → sends Slack + changes status
  const escalate = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry) return;

    const slackMsg = `:rotating_light: *ESCALATION: Quote Needs Manual Approval*\n\n` +
      `*Car:* ${entry.make} ${entry.model} | *Lead ID:* ${entry.appId}\n` +
      `*Dealer:* ${entry.dealer} | *Region:* ${entry.region}\n` +
      `*Bid:* \u20B9${entry.bid?.toLocaleString("en-IN")} | *Buying Price:* \u20B9${entry.buy?.toLocaleString("en-IN")}\n` +
      `*P&L:* \u20B9${entry.pnl?.toLocaleString("en-IN")} | *Age Bucket:* ${entry.ageBucket}\n` +
      `*Reason:* ${entry.reason}\n\n` +
      `_Please approve or reject on the Inventory Command Center portal._`;

    const slackRes = await sendSlackMessage(slackUrl, slackMsg);

    setHistory((h) => h.map((x) =>
      x.id === entryId ? { ...x, status: "ESCALATED", slackSent: slackRes.ok } : x
    ));
  };

  // Manager manually approves escalated quote → sends to sheet
  const manualApprove = async (entryId) => {
    const entry = history.find((h) => h.id === entryId);
    if (!entry) return;

    const sheetRow = {
      timestamp: new Date().toISOString(),
      appointmentId: entry.appId,
      region: entry.region,
      anchorPrice: entry.anchor || entry.msp,
      auctionStartFor: entry.dealer,
      email: managerEmail || "",
      date: new Date().toLocaleDateString("en-IN"),
    };
    const sheetRes = await appendToSheet(sheetUrl, sheetRow);

    // Slack confirmation
    if (slackUrl) {
      await sendSlackMessage(slackUrl,
        `:white_check_mark: *APPROVED by Manager*\n*Lead ID:* ${entry.appId} | *Car:* ${entry.make} ${entry.model} | *Bid:* \u20B9${entry.bid?.toLocaleString("en-IN")}`
      );
    }

    setHistory((h) => h.map((x) =>
      x.id === entryId ? { ...x, status: "MANAGER_APPROVED", sheetSent: sheetRes.ok } : x
    ));
  };

  const manualReject = async (entryId) => {
    if (slackUrl) {
      const entry = history.find((h) => h.id === entryId);
      await sendSlackMessage(slackUrl,
        `:x: *REJECTED by Manager*\n*Lead ID:* ${entry?.appId} | *Car:* ${entry?.make} ${entry?.model} | *Bid:* \u20B9${entry?.bid?.toLocaleString("en-IN")}`
      );
    }
    setHistory((h) => h.map((x) => x.id === entryId ? { ...x, status: "MANAGER_REJECTED" } : x));
  };

  const stCol = { AUTO_APPROVED: "#10B981", REJECTED: "#EF4444", ESCALATED: "#F59E0B", MANAGER_APPROVED: "#10B981", MANAGER_REJECTED: "#EF4444" };
  const stIco = { AUTO_APPROVED: "\u2705", REJECTED: "\u274C", ESCALATED: "\u26A0\uFE0F", MANAGER_APPROVED: "\u2705", MANAGER_REJECTED: "\u274C" };
  const stLabel = { AUTO_APPROVED: "Auto Approved", REJECTED: "Rejected", ESCALATED: "Escalated", MANAGER_APPROVED: "Manager Approved", MANAGER_REJECTED: "Manager Rejected" };

  return (
    <div>
      {/* Toggle */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button style={viewMode === "submit" ? S.navActive : S.navBtn} onClick={() => setViewMode("submit")}>{"\uD83D\uDCB0"} Submit Quote</button>
        <button style={viewMode === "escalations" ? S.navActive : S.navBtn} onClick={() => setViewMode("escalations")}>
          {"\u26A0\uFE0F"} Escalations {escalated.length ? <span style={S.tabBadge}>{escalated.length}</span> : null}
        </button>
      </div>

      {viewMode === "submit" && (
        <div className="ql" style={S.ql}>
          <div style={S.qlL}>
            {/* Search */}
            <div style={S.card}>
              <div style={S.cHead}>{"\uD83D\uDD0D"} Find Car</div>
              <div style={{ display: "flex", gap: 10 }}>
                <input style={{ ...S.inp, flex: 1 }} placeholder="Enter Lead ID..." value={appId} onChange={(e) => setAppId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && find()} />
                <button style={S.pri} onClick={find}>Search</button>
              </div>
              {miss && <div style={{ color: "#EF4444", fontSize: 13, marginTop: 10 }}>{"\u26A0"} No car found with ID "{appId}"</div>}
            </div>

            {/* Car card */}
            {car && (
              <div style={S.card}>
                <div style={S.carTop}>
                  <div>
                    <div style={S.carName}>{car.MAKE} {car.MODEL}</div>
                    <div style={S.carSub}>{car.Year} {"\u2022"} {car.fuel_type||"\u2014"} {"\u2022"} {car["Reg No"]||"\u2014"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: "#64748B", textTransform: "uppercase", letterSpacing: "1px" }}>Lead ID</div>
                    <div style={{ fontSize: 20, fontWeight: 900, color: "#4F8EF7" }}>{car.LEAD_ID}</div>
                  </div>
                </div>
                {/* Approval rules hint */}
                <div style={{ padding: "8px 12px", background: "#1A223680", borderRadius: 8, marginBottom: 14, fontSize: 12, color: "#8896AB" }}>
                  <strong style={{ color: "#F59E0B" }}>Bucket: {car.AGE_BUCKET || "?"}</strong>
                  {" \u2014 "}
                  {String(car.AGE_BUCKET||"").includes("0-30") && "Max loss: \u20B97,000"}
                  {String(car.AGE_BUCKET||"").includes("30-60") && "Max loss: \u20B92,500"}
                  {String(car.AGE_BUCKET||"").includes("60-90") && "Max loss: -20%"}
                  {String(car.AGE_BUCKET||"").includes("90") && !String(car.AGE_BUCKET||"").includes("60-90") && "Manual review required"}
                </div>
                <div style={S.dGrid}>
                  {QUOTE_FIELDS.map((f) => {
                    const raw = car[f.key], val = f.fmt === "inr" ? INR(toNum(raw)) : String(raw||"\u2014");
                    const hl = { BUYING_PRICE: "#F59E0B", NEW_MSP: "#10B981", C24: "#4F8EF7" }[f.key];
                    return (<div key={f.key} style={S.dItem}><div style={S.dLabel}>{f.label}</div><div style={{ ...S.dVal, ...(hl ? { color: hl, fontWeight: 700 } : {}) }}>{val}</div></div>);
                  })}
                </div>
              </div>
            )}

            {/* Quote form */}
            {car && (
              <div style={S.card}>
                <div style={S.cHead}>{"\uD83D\uDCB0"} Submit Dealer Quote</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><label style={S.fLabel}>Dealer Name</label><input style={S.inp} placeholder="Dealer name" value={q.dealer} onChange={(e) => setQ({ ...q, dealer: e.target.value })} /></div>
                  <div><label style={S.fLabel}>Bid Amount ({"\u20B9"})</label><input style={S.inp} placeholder="e.g. 450000" value={q.amt} onChange={(e) => setQ({ ...q, amt: e.target.value })} /></div>
                </div>
                <div style={{ marginTop: 12 }}><label style={S.fLabel}>Notes</label><textarea style={{ ...S.inp, minHeight: 50, resize: "vertical" }} value={q.notes} onChange={(e) => setQ({ ...q, notes: e.target.value })} /></div>
                <button style={{ ...S.pri, width: "100%", marginTop: 16, padding: "14px 0", fontSize: 15, opacity: sending ? 0.6 : 1 }} onClick={submit} disabled={sending}>
                  {sending ? "Processing..." : "Submit Quote \u2192"}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: Result + History */}
          <div style={S.qlR}>
            {res && (
              <div style={{ ...S.card, background: `${stCol[res.status]}08`, border: `2px solid ${stCol[res.status]}55`, textAlign: "center" }}>
                <div style={{ fontSize: 50, marginBottom: 4 }}>{stIco[res.status]}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: stCol[res.status], letterSpacing: "1px" }}>{stLabel[res.status]}</div>
                <div style={{ color: "#8896AB", fontSize: 13, marginTop: 8 }}>{res.reason}</div>
                <div style={{ marginTop: 12, display: "flex", justifyContent: "center", gap: 20, color: "#94A3B8", fontSize: 13 }}>
                  <span>Bid: <b style={{ color: "#E2E8F0" }}>{INR(res.bid)}</b></span>
                  <span>Buy: <b style={{ color: "#E2E8F0" }}>{INR(res.buy)}</b></span>
                  <span>P&L: <b style={{ color: res.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(res.pnl)}</b></span>
                </div>
                {res.status === "AUTO_APPROVED" && res.sheetSent && <div style={{ color: "#10B981", fontSize: 12, marginTop: 8 }}>{"\u2705"} Sent to auction sheet</div>}
                {res.status === "AUTO_APPROVED" && !res.sheetSent && !sheetUrl && <div style={{ color: "#F59E0B", fontSize: 12, marginTop: 8 }}>{"\u26A0\uFE0F"} Sheet webhook not configured (go to Settings)</div>}
                {res.status === "REJECTED" && (
                  <button style={{ ...S.pri, marginTop: 14, background: "#F59E0B", padding: "10px 28px" }} onClick={() => escalate(res.id)}>
                    {"\u26A0\uFE0F"} Escalate to Manager
                  </button>
                )}
              </div>
            )}

            <div style={S.card}>
              <div style={S.cHead}>{"\uD83D\uDCCB"} Quote History ({history.length})</div>
              {!history.length ? <div style={{ textAlign: "center", padding: "40px 0", color: "#475569" }}>No quotes yet</div> : (
                <div style={{ maxHeight: 450, overflowY: "auto" }}>
                  {history.map((h) => (
                    <div key={h.id} style={S.hRow}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{h.make} {h.model} <span style={{ color: "#475569", fontSize: 12 }}>#{h.appId}</span></div>
                        <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{h.dealer} {"\u2022"} {h.time}</div>
                        <div style={{ color: "#8896AB", fontSize: 11, marginTop: 2 }}>{h.reason}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: `${stCol[h.status]}22`, color: stCol[h.status] }}>{stLabel[h.status]}</span>
                        <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Bid: {INR(h.bid)} | P&L: <span style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</span></div>
                        {h.slackSent && <div style={{ fontSize: 10, color: "#A78BFA", marginTop: 2 }}>Slack sent</div>}
                        {h.sheetSent && <div style={{ fontSize: 10, color: "#10B981", marginTop: 2 }}>Sheet logged</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ESCALATIONS VIEW */}
      {viewMode === "escalations" && (
        <div style={S.card}>
          <div style={S.cHead}>{"\u26A0\uFE0F"} Pending Escalations ({escalated.length})</div>
          {!escalated.length ? <div style={{ textAlign: "center", padding: "40px 0", color: "#475569" }}>No pending escalations</div> : (
            <div>
              {escalated.map((h) => (
                <div key={h.id} style={{ ...S.hRow, padding: "16px 0", gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{h.make} {h.model}</div>
                    <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4 }}>
                      Lead: <b style={{ color: "#4F8EF7" }}>{h.appId}</b> | Dealer: {h.dealer} | Region: {h.region}
                    </div>
                    <div style={{ color: "#8896AB", fontSize: 13, marginTop: 4 }}>
                      Bid: <b>{INR(h.bid)}</b> | Buying: <b>{INR(h.buy)}</b> | P&L: <b style={{ color: h.pnl >= 0 ? "#10B981" : "#EF4444" }}>{INR(h.pnl)}</b> | Bucket: {h.ageBucket}
                    </div>
                    <div style={{ color: "#F59E0B", fontSize: 12, marginTop: 4 }}>{h.reason}</div>
                    <div style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>{h.time}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button style={{ ...S.pri, background: "#10B981", padding: "10px 20px" }} onClick={() => manualApprove(h.id)}>
                      {"\u2705"} Approve
                    </button>
                    <button style={{ ...S.pri, background: "#EF4444", padding: "10px 20px" }} onClick={() => manualReject(h.id)}>
                      {"\u274C"} Reject
                    </button>
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
//  TAB 3 — SETTINGS
// ═════════════════════════════════════════════════════════════════════
function SettingsTab({ slackUrl, setSlackUrl, sheetUrl, setSheetUrl, managerEmail, setManagerEmail }) {
  const [slackTest, setSlackTest] = useState(null);
  const [sheetTest, setSheetTest] = useState(null);

  const testSlack = async () => {
    setSlackTest("sending");
    const res = await sendSlackMessage(slackUrl, ":white_check_mark: *Test message from Inventory Command Center*\nSlack integration is working!");
    setSlackTest(res.ok ? "success" : "failed");
    setTimeout(() => setSlackTest(null), 3000);
  };

  const testSheet = async () => {
    setSheetTest("sending");
    const res = await appendToSheet(sheetUrl, {
      timestamp: new Date().toISOString(),
      appointmentId: "TEST-000",
      region: "TEST",
      anchorPrice: 0,
      auctionStartFor: "Test",
      email: managerEmail,
      date: new Date().toLocaleDateString("en-IN"),
    });
    setSheetTest(res.ok ? "success" : "failed");
    setTimeout(() => setSheetTest(null), 3000);
  };

  return (
    <div style={{ maxWidth: 700 }}>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 24 }}>{"\u2699\uFE0F"} Integration Settings</h2>

      {/* Slack */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>{"\uD83D\uDCAC"} Slack Integration</div>
        <p style={{ color: "#8896AB", fontSize: 13, marginBottom: 12 }}>Escalated quotes will be posted to your Slack channel via webhook.</p>
        <label style={S.fLabel}>Slack Incoming Webhook URL</label>
        <input style={S.inp} placeholder="https://hooks.slack.com/services/T.../B.../xxx" value={slackUrl} onChange={(e) => setSlackUrl(e.target.value)} />
        <button style={{ ...S.pri, marginTop: 12, opacity: slackTest === "sending" ? 0.6 : 1 }} onClick={testSlack} disabled={!slackUrl || slackTest === "sending"}>
          {slackTest === "sending" ? "Sending..." : slackTest === "success" ? "\u2705 Test Sent!" : slackTest === "failed" ? "\u274C Failed" : "Send Test Message"}
        </button>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "#4F8EF7", fontSize: 13, fontWeight: 600 }}>{"\uD83D\uDCCB"} How to create a Slack webhook (step by step)</summary>
          <div style={{ padding: "12px 0", color: "#8896AB", fontSize: 13, lineHeight: 2 }}>
            <b style={{ color: "#E2E8F0" }}>Step 1:</b> Go to <b style={{ color: "#4F8EF7" }}>api.slack.com/apps</b> and click "Create New App"<br />
            <b style={{ color: "#E2E8F0" }}>Step 2:</b> Choose "From scratch", name it "Inventory Alerts", select your workspace<br />
            <b style={{ color: "#E2E8F0" }}>Step 3:</b> In the left sidebar, click <b style={{ color: "#E2E8F0" }}>"Incoming Webhooks"</b><br />
            <b style={{ color: "#E2E8F0" }}>Step 4:</b> Toggle "Activate Incoming Webhooks" to ON<br />
            <b style={{ color: "#E2E8F0" }}>Step 5:</b> Click <b style={{ color: "#E2E8F0" }}>"Add New Webhook to Workspace"</b><br />
            <b style={{ color: "#E2E8F0" }}>Step 6:</b> Select the channel where alerts should go (e.g. #inventory-ops)<br />
            <b style={{ color: "#E2E8F0" }}>Step 7:</b> Copy the Webhook URL and paste it above<br />
            <b style={{ color: "#E2E8F0" }}>Step 8:</b> Click "Send Test Message" to verify<br />
          </div>
        </details>
      </div>

      {/* Google Sheet */}
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cHead}>{"\uD83D\uDCCA"} Google Sheet (Auction Log)</div>
        <p style={{ color: "#8896AB", fontSize: 13, marginBottom: 12 }}>Auto-approved quotes get logged to your Google Sheet for running auctions.</p>
        <label style={S.fLabel}>Google Apps Script Web App URL</label>
        <input style={S.inp} placeholder="https://script.google.com/macros/s/.../exec" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} />
        <button style={{ ...S.pri, marginTop: 12, opacity: sheetTest === "sending" ? 0.6 : 1 }} onClick={testSheet} disabled={!sheetUrl || sheetTest === "sending"}>
          {sheetTest === "sending" ? "Sending..." : sheetTest === "success" ? "\u2705 Test Sent!" : sheetTest === "failed" ? "\u274C Failed" : "Send Test Row"}
        </button>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", color: "#4F8EF7", fontSize: 13, fontWeight: 600 }}>{"\uD83D\uDCCB"} How to set up Google Sheet logging (step by step)</summary>
          <div style={{ padding: "12px 0", color: "#8896AB", fontSize: 13, lineHeight: 2 }}>
            <b style={{ color: "#E2E8F0" }}>Step 1:</b> Open your auction Google Sheet<br />
            <b style={{ color: "#E2E8F0" }}>Step 2:</b> Make sure Row 1 has headers: <b style={{ color: "#F59E0B" }}>Timestamp | Appointment ID | Region | Anchor Price | Auction Start For | Email address | Date</b><br />
            <b style={{ color: "#E2E8F0" }}>Step 3:</b> Click <b style={{ color: "#E2E8F0" }}>Extensions {"\u2192"} Apps Script</b><br />
            <b style={{ color: "#E2E8F0" }}>Step 4:</b> Delete everything and paste this code:<br />
            <div style={{ background: "#131B2E", padding: 12, borderRadius: 8, marginTop: 8, marginBottom: 8, fontFamily: "monospace", fontSize: 12, color: "#C8D1E0", whiteSpace: "pre-wrap", overflowX: "auto" }}>
{`function doPost(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = JSON.parse(e.postData.contents);
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.appointmentId || "",
    data.region || "",
    data.anchorPrice || "",
    data.auctionStartFor || "",
    data.email || "",
    data.date || new Date().toLocaleDateString()
  ]);
  return ContentService
    .createTextOutput(JSON.stringify({status: "ok"}))
    .setMimeType(ContentService.MimeType.JSON);
}`}
            </div>
            <b style={{ color: "#E2E8F0" }}>Step 5:</b> Click <b style={{ color: "#E2E8F0" }}>Deploy {"\u2192"} New deployment</b><br />
            <b style={{ color: "#E2E8F0" }}>Step 6:</b> Type = "Web app", Execute as = "Me", Access = "Anyone"<br />
            <b style={{ color: "#E2E8F0" }}>Step 7:</b> Click Deploy, authorize when prompted<br />
            <b style={{ color: "#E2E8F0" }}>Step 8:</b> Copy the Web App URL and paste it above<br />
            <b style={{ color: "#E2E8F0" }}>Step 9:</b> Click "Send Test Row" to verify a row appears in your sheet<br />
          </div>
        </details>
      </div>

      {/* Manager Email */}
      <div style={S.card}>
        <div style={S.cHead}>{"\uD83D\uDCE7"} Manager Info</div>
        <label style={S.fLabel}>Manager Email (logged in sheet)</label>
        <input style={S.inp} placeholder="tarun@cars24.com" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
      </div>

      {/* Approval Rules Reference */}
      <div style={{ ...S.card, marginTop: 16 }}>
        <div style={S.cHead}>{"\uD83D\uDCCF"} Auto-Approval Rules</div>
        <div style={{ fontSize: 13, color: "#C8D1E0", lineHeight: 2 }}>
          <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 1fr", gap: "4px 16px", marginTop: 8 }}>
            <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Age Bucket</div>
            <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Auto Approve If</div>
            <div style={{ fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase" }}>Reject If</div>

            <div style={{ color: "#4F8EF7", fontWeight: 600 }}>0-30 days</div>
            <div>Loss {"\u2264"} {"\u20B9"}7,000</div>
            <div style={{ color: "#EF4444" }}>Loss {">"} {"\u20B9"}7,000</div>

            <div style={{ color: "#4F8EF7", fontWeight: 600 }}>30-60 days</div>
            <div>Loss {"\u2264"} {"\u20B9"}2,500</div>
            <div style={{ color: "#EF4444" }}>Loss {">"} {"\u20B9"}2,500</div>

            <div style={{ color: "#4F8EF7", fontWeight: 600 }}>60-90 days</div>
            <div>Loss {"\u2264"} 20%</div>
            <div style={{ color: "#EF4444" }}>Loss {">"} 20%</div>

            <div style={{ color: "#4F8EF7", fontWeight: 600 }}>90+ days</div>
            <div colSpan={2} style={{ color: "#F59E0B" }}>Always requires manual review</div>
            <div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  STYLES
// ═════════════════════════════════════════════════════════════════════
const S = {
  app:{background:"#080C18",color:"#E2E8F0",minHeight:"100vh",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif",fontSize:14},
  header:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 28px",height:64,background:"linear-gradient(180deg,#0D1321,#0B0F1A)",borderBottom:"1px solid #1A2236",position:"sticky",top:0,zIndex:50},
  hLeft:{display:"flex",alignItems:"center",gap:14},
  logo:{width:38,height:38,borderRadius:10,background:"linear-gradient(135deg,#F59E0B,#EF4444)",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:14,color:"#fff"},
  logoTitle:{fontSize:17,fontWeight:800,color:"#F1F5F9"},
  logoSub:{fontSize:12,color:"#64748B",marginTop:1},
  nav:{display:"flex",gap:4},
  navBtn:{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:600,fontSize:13,color:"#8896AB",background:"transparent",fontFamily:"inherit",position:"relative"},
  navActive:{padding:"8px 20px",borderRadius:8,border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:"#fff",background:"#1E293B",boxShadow:"0 0 0 1px #334155",fontFamily:"inherit",position:"relative"},
  tabBadge:{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:18,height:18,borderRadius:9,background:"#EF4444",color:"#fff",fontSize:10,fontWeight:800,marginLeft:6,padding:"0 5px"},
  fileBadge:{padding:"6px 14px",borderRadius:8,background:"#10B98112",border:"1px solid #10B98133",color:"#10B981",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",gap:6},
  removeBtn:{background:"none",border:"none",color:"#EF4444",cursor:"pointer",fontSize:14,fontWeight:700,padding:"0 4px",fontFamily:"inherit"},
  uploadWrap:{display:"flex",justifyContent:"center",padding:"60px 28px"},
  dropzone:{width:540,padding:"48px 32px",border:"2px dashed #1E293B",borderRadius:16,textAlign:"center",cursor:"pointer",transition:"all .3s",background:"#0D1321"},
  dzHover:{borderColor:"#4F8EF7",background:"#4F8EF710"},
  uploadBtn:{display:"inline-block",padding:"10px 28px",borderRadius:8,background:"#4F8EF7",color:"#fff",fontWeight:700,fontSize:14},
  main:{padding:"20px 28px"},
  metrics:{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:16},
  mCard:{background:"#0D1321",border:"1px solid #1A2236",borderRadius:10,padding:"16px 14px",textAlign:"center"},
  mLabel:{fontSize:10,color:"#64748B",marginTop:4,textTransform:"uppercase",letterSpacing:"1px",fontWeight:600},
  filters:{display:"flex",gap:8,alignItems:"center",marginBottom:12,flexWrap:"wrap"},
  searchBox:{padding:"9px 14px",borderRadius:8,border:"1px solid #1E293B",background:"#131B2E",color:"#E2E8F0",fontSize:13,outline:"none",width:280,fontFamily:"inherit"},
  sel:{padding:"9px 12px",borderRadius:8,border:"1px solid #1E293B",background:"#131B2E",color:"#C8D1E0",fontSize:13,outline:"none",fontFamily:"inherit",cursor:"pointer"},
  colBtn:{padding:"8px 14px",borderRadius:8,border:"1px solid #334155",background:"#1A2236",color:"#94A3B8",fontSize:12,cursor:"pointer",fontWeight:600,fontFamily:"inherit"},
  fCount:{marginLeft:"auto",color:"#64748B",fontSize:13},
  tWrap:{background:"#0D1321",border:"1px solid #1A2236",borderRadius:12,overflow:"hidden"},
  tScroll:{overflowX:"auto",maxHeight:"calc(100vh - 340px)",overflowY:"auto"},
  table:{width:"100%",borderCollapse:"collapse",fontSize:13},
  th:{padding:"10px 14px",textAlign:"left",fontWeight:700,color:"#8896AB",borderBottom:"1px solid #1A2236",fontSize:11,textTransform:"uppercase",letterSpacing:".5px",whiteSpace:"nowrap",position:"sticky",top:0,background:"#131B2E",zIndex:2},
  td:{padding:"9px 14px",borderBottom:"1px solid #1A223610",whiteSpace:"nowrap",color:"#C8D1E0",fontSize:13},
  pag:{display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px 16px",borderTop:"1px solid #1A2236"},
  pgB:{padding:"6px 14px",borderRadius:6,border:"1px solid #1E293B",background:"#131B2E",color:"#94A3B8",fontSize:13,cursor:"pointer",fontWeight:600,fontFamily:"inherit"},
  pgI:{color:"#64748B",fontSize:13,margin:"0 8px"},
  ql:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,alignItems:"start"},
  qlL:{display:"flex",flexDirection:"column",gap:16},
  qlR:{display:"flex",flexDirection:"column",gap:16},
  card:{background:"#0D1321",border:"1px solid #1A2236",borderRadius:12,padding:20},
  cHead:{fontSize:16,fontWeight:800,marginBottom:14,color:"#F1F5F9"},
  carTop:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:16,paddingBottom:14,borderBottom:"1px solid #1A2236"},
  carName:{fontSize:22,fontWeight:900,color:"#F1F5F9",letterSpacing:"-.5px"},
  carSub:{fontSize:13,color:"#64748B",marginTop:4},
  dGrid:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"10px 16px"},
  dItem:{},
  dLabel:{fontSize:10,color:"#64748B",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600,marginBottom:2},
  dVal:{fontSize:14,color:"#C8D1E0",fontVariantNumeric:"tabular-nums"},
  fLabel:{fontSize:11,color:"#8896AB",textTransform:"uppercase",letterSpacing:".5px",fontWeight:600,marginBottom:4,display:"block"},
  inp:{padding:"11px 14px",borderRadius:8,border:"1px solid #1E293B",background:"#131B2E",color:"#E2E8F0",fontSize:14,outline:"none",width:"100%",boxSizing:"border-box",fontFamily:"inherit"},
  pri:{padding:"11px 24px",borderRadius:8,border:"none",background:"#4F8EF7",color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer",fontFamily:"inherit"},
  hRow:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 0",borderBottom:"1px solid #1A223620"},
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700;9..40,900&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}body{background:#080C18}
  .tr:hover td{background:#131B2E!important}
  .bg{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#10B98122;color:#10B981}
  .bd{display:inline-block;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#64748B22;color:#64748B}
  ::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-track{background:#0B0F1A}::-webkit-scrollbar-thumb{background:#2D3B55;border-radius:3px}
  button:hover{opacity:.88}button:active{transform:scale(.97)}
  input:focus,textarea:focus,select:focus{border-color:#4F8EF7!important;box-shadow:0 0 0 2px #4F8EF720}
  button:disabled{opacity:.4;cursor:not-allowed}
  @media(max-width:1100px){.ql{grid-template-columns:1fr!important}}
`;
