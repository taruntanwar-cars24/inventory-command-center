import React, { useState, useEffect, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";

/* ═══════════════════════════════════════════════════════════════
   Cars24 Inventory Command Center
   ─────────────────────────────────────────────────────────────
   Data sources:
     • Stuck Inventory  → Google Sheets (public CSV export)
     • Liquidation P&L  → Excel upload (.xlsx)
     • Master Auction   → Excel upload (.xlsx)
   ═══════════════════════════════════════════════════════════════ */

// ── Palette & Theme ──────────────────────────────────────────
const T = {
  bg: "#0B0F1A",
  card: "#111827",
  cardAlt: "#1A2236",
  border: "#1E293B",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.25)",
  green: "#10B981",
  red: "#EF4444",
  amber: "#F59E0B",
  purple: "#8B5CF6",
  text: "#F1F5F9",
  textMuted: "#94A3B8",
  textDim: "#64748B",
};

// ── Helpers ──────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  if (Math.abs(n) >= 1e3) return `₹${(n / 1e3).toFixed(1)}K`;
  return `₹${Number(n).toLocaleString("en-IN")}`;
};
const pct = (n) => (n == null || isNaN(n) ? "—" : `${(n * 100).toFixed(1)}%`);
const num = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "string" ? Number(v.replace(/[₹,%\s]/g, "")) : Number(v);
  return isNaN(n) ? null : n;
};

// ── Google Sheets URL builder ────────────────────────────────
function sheetCsvUrl(input) {
  // Accepts: full URL, share link, or just the sheet ID
  let id = input.trim();
  // Extract ID from various URL formats
  const m = id.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) id = m[1];
  // Also handle /edit, /pub etc by extracting ID
  const m2 = id.match(/^([a-zA-Z0-9_-]{20,})$/);
  if (!m2 && !m) return null;
  const sheetId = m ? m[1] : id;
  return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;
}

// ── Parse CSV text → array of objects ────────────────────────
function parseCsv(text) {
  const wb = XLSX.read(text, { type: "string" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

// ── Styles ───────────────────────────────────────────────────
const S = {
  app: {
    background: T.bg,
    color: T.text,
    minHeight: "100vh",
    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
    fontSize: 14,
  },
  header: {
    background: "linear-gradient(135deg, #0F172A 0%, #1E293B 100%)",
    borderBottom: `1px solid ${T.border}`,
    padding: "16px 24px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "sticky",
    top: 0,
    zIndex: 50,
  },
  logo: {
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.5px",
    background: "linear-gradient(135deg, #3B82F6, #8B5CF6)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  nav: { display: "flex", gap: 4 },
  navBtn: (active) => ({
    padding: "8px 16px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    transition: "all 0.2s",
    background: active ? T.accent : "transparent",
    color: active ? "#fff" : T.textMuted,
  }),
  main: { padding: "24px", maxWidth: 1400, margin: "0 auto" },
  card: {
    background: T.card,
    border: `1px solid ${T.border}`,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: { fontSize: 16, fontWeight: 700, marginBottom: 12, color: T.text },
  btn: (variant = "primary") => ({
    padding: "10px 20px",
    borderRadius: 8,
    border: "none",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: 13,
    transition: "all 0.2s",
    background: variant === "primary" ? T.accent : T.cardAlt,
    color: "#fff",
  }),
  input: {
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: T.cardAlt,
    color: T.text,
    fontSize: 14,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  },
  select: {
    padding: "10px 14px",
    borderRadius: 8,
    border: `1px solid ${T.border}`,
    background: T.cardAlt,
    color: T.text,
    fontSize: 13,
    outline: "none",
  },
  badge: (color) => ({
    display: "inline-block",
    padding: "3px 10px",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    background: `${color}22`,
    color: color,
    border: `1px solid ${color}44`,
  }),
  table: {
    width: "100%",
    borderCollapse: "separate",
    borderSpacing: 0,
    fontSize: 13,
  },
  th: {
    padding: "10px 12px",
    textAlign: "left",
    fontWeight: 600,
    color: T.textMuted,
    borderBottom: `1px solid ${T.border}`,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    position: "sticky",
    top: 0,
    background: T.card,
  },
  td: {
    padding: "10px 12px",
    borderBottom: `1px solid ${T.border}08`,
    color: T.text,
  },
  metric: {
    textAlign: "center",
    padding: "16px 12px",
    background: T.cardAlt,
    borderRadius: 10,
    border: `1px solid ${T.border}`,
    minWidth: 140,
  },
  metricVal: (color) => ({
    fontSize: 24,
    fontWeight: 800,
    color: color || T.text,
    letterSpacing: "-1px",
  }),
  metricLabel: {
    fontSize: 11,
    color: T.textMuted,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  dropzone: (dragging) => ({
    border: `2px dashed ${dragging ? T.accent : T.border}`,
    borderRadius: 12,
    padding: "40px 20px",
    textAlign: "center",
    cursor: "pointer",
    transition: "all 0.3s",
    background: dragging ? T.accentGlow : "transparent",
  }),
};

// ═════════════════════════════════════════════════════════════
//  DATA SETUP MODULE
// ═════════════════════════════════════════════════════════════
function DataSetup({ data, setData }) {
  const [sheetUrl, setSheetUrl] = useState("");
  const [sheetStatus, setSheetStatus] = useState(null); // null | 'loading' | 'success' | 'error'
  const [sheetError, setSheetError] = useState("");
  const [dragging, setDragging] = useState({});

  // ── Google Sheets fetch ────────────────────────────────
  const fetchSheet = async () => {
    if (!sheetUrl.trim()) return;
    setSheetStatus("loading");
    setSheetError("");
    try {
      const csvUrl = sheetCsvUrl(sheetUrl);
      if (!csvUrl) throw new Error("Could not parse Google Sheets URL. Paste the full sharing link or sheet ID.");

      // Use allOrigins proxy for CORS
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(csvUrl)}`;
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`Fetch failed (${res.status}). Make sure the sheet is shared as "Anyone with the link".`);
      const text = await res.text();
      if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
        throw new Error("Got an HTML page instead of CSV. Make sure the Google Sheet is publicly shared (Anyone with the link → Viewer).");
      }
      const rows = parseCsv(text);
      if (!rows.length) throw new Error("Sheet appears empty or could not be parsed.");
      setData((d) => ({ ...d, stuckInventory: rows }));
      setSheetStatus("success");
    } catch (e) {
      setSheetStatus("error");
      setSheetError(e.message);
    }
  };

  // ── Refresh stuck inventory from sheet ────────────────
  const refreshSheet = async () => {
    if (sheetUrl.trim()) {
      await fetchSheet();
    }
  };

  // ── Excel file handler ─────────────────────────────────
  const handleFile = (file, key) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        setData((d) => ({ ...d, [key]: rows }));
      } catch (err) {
        alert(`Error reading file: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const onDrop = (e, key) => {
    e.preventDefault();
    setDragging((d) => ({ ...d, [key]: false }));
    const file = e.dataTransfer?.files?.[0] || e.target?.files?.[0];
    if (file) handleFile(file, key);
  };

  const DropZone = ({ label, dataKey, count }) => (
    <div
      style={S.dropzone(dragging[dataKey])}
      onDragOver={(e) => { e.preventDefault(); setDragging((d) => ({ ...d, [dataKey]: true })); }}
      onDragLeave={() => setDragging((d) => ({ ...d, [dataKey]: false }))}
      onDrop={(e) => onDrop(e, dataKey)}
      onClick={() => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".xlsx,.xls,.csv";
        input.onchange = (e) => onDrop(e, dataKey);
        input.click();
      }}
    >
      {count ? (
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
          <div style={{ fontWeight: 700, color: T.green }}>{label}</div>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>{count.toLocaleString()} rows loaded</div>
          <div style={{ color: T.textDim, fontSize: 12, marginTop: 8 }}>Drop new file to replace</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
          <div style={{ fontWeight: 600 }}>{label}</div>
          <div style={{ color: T.textMuted, fontSize: 13, marginTop: 4 }}>Drag & drop .xlsx or click to browse</div>
        </div>
      )}
    </div>
  );

  return (
    <div>
      <div style={{ ...S.card, background: "linear-gradient(135deg, #0F172A 0%, #1A2236 100%)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8, background: "linear-gradient(135deg, #3B82F6, #8B5CF6)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Connect Your Data
          </h2>
          <p style={{ color: T.textMuted, fontSize: 14 }}>
            Stuck Inventory via Google Sheets (live sync) • P&L and Auction via Excel upload
          </p>
        </div>

        {/* ── Google Sheets Connection ───────────────── */}
        <div style={{ ...S.card, background: T.cardAlt, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Stuck Inventory — Google Sheets</div>
              <div style={{ color: T.textMuted, fontSize: 12, marginTop: 2 }}>Paste your Google Sheets link below. Sheet must be shared as "Anyone with the link → Viewer".</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <input
              style={{ ...S.input, flex: 1 }}
              placeholder="https://docs.google.com/spreadsheets/d/your-sheet-id/edit"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchSheet()}
            />
            <button style={S.btn("primary")} onClick={fetchSheet} disabled={sheetStatus === "loading"}>
              {sheetStatus === "loading" ? "⏳ Fetching..." : "🔗 Connect"}
            </button>
            {data.stuckInventory && (
              <button style={S.btn("secondary")} onClick={refreshSheet} title="Refresh data from sheet">
                🔄
              </button>
            )}
          </div>

          {sheetStatus === "success" && (
            <div style={{ ...S.badge(T.green), marginTop: 4 }}>
              ✓ Connected — {data.stuckInventory.length.toLocaleString()} rows loaded
            </div>
          )}
          {sheetStatus === "error" && (
            <div style={{ color: T.red, fontSize: 13, marginTop: 4 }}>⚠ {sheetError}</div>
          )}

          {/* Instructions */}
          <details style={{ marginTop: 14 }}>
            <summary style={{ cursor: "pointer", color: T.accent, fontSize: 13, fontWeight: 600 }}>
              📋 How to share your Google Sheet
            </summary>
            <div style={{ padding: "12px 0", color: T.textMuted, fontSize: 13, lineHeight: 1.8 }}>
              <strong style={{ color: T.text }}>Step 1:</strong> Open your Stuck Inventory Google Sheet<br />
              <strong style={{ color: T.text }}>Step 2:</strong> Click <strong style={{ color: T.text }}>Share</strong> (top right)<br />
              <strong style={{ color: T.text }}>Step 3:</strong> Under "General access", change to <strong style={{ color: T.accent }}>"Anyone with the link"</strong><br />
              <strong style={{ color: T.text }}>Step 4:</strong> Set role to <strong style={{ color: T.text }}>Viewer</strong> (default)<br />
              <strong style={{ color: T.text }}>Step 5:</strong> Copy the link and paste it above<br />
              <br />
              <span style={{ color: T.amber }}>⚠ Important:</span> The first row must be column headers (LEAD_ID, REGION, MAKE, MODEL, etc.)
            </div>
          </details>
        </div>

        {/* ── Excel Uploads ─────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <DropZone label="Liquidation P&L" dataKey="liquidationPnl" count={data.liquidationPnl?.length} />
          <DropZone label="Master Auction" dataKey="masterAuction" count={data.masterAuction?.length} />
        </div>
      </div>

      {/* Status summary */}
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        {[
          { label: "Stuck Inventory", key: "stuckInventory", icon: "📊" },
          { label: "Liquidation P&L", key: "liquidationPnl", icon: "💰" },
          { label: "Master Auction", key: "masterAuction", icon: "🔨" },
        ].map(({ label, key, icon }) => (
          <div key={key} style={{ ...S.card, flex: 1, textAlign: "center", padding: 12, background: data[key] ? `${T.green}11` : T.cardAlt, borderColor: data[key] ? `${T.green}44` : T.border }}>
            <div style={{ fontSize: 18 }}>{icon}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 4, color: data[key] ? T.green : T.textDim }}>
              {label}
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
              {data[key] ? `${data[key].length.toLocaleString()} rows` : "Not loaded"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//  LIQUIDATION DASHBOARD
// ═════════════════════════════════════════════════════════════
function LiquidationDashboard({ data }) {
  const pnl = data.liquidationPnl || [];
  const si = data.stuckInventory || [];
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const [ageFilter, setAgeFilter] = useState("ALL");

  const regions = useMemo(() => ["ALL", ...new Set(pnl.map((r) => r.INSP_REGION || r.Insp_Region || r.Region || "").filter(Boolean))], [pnl]);
  const owners = useMemo(() => ["ALL", ...new Set(pnl.map((r) => r.Owner || r.OWNER || "").filter(Boolean))], [pnl]);
  const ageBuckets = useMemo(() => ["ALL", ...new Set(pnl.map((r) => r.AGE_BUCKET || r.Age_Bucket || "").filter(Boolean))], [pnl]);

  const filtered = useMemo(() => {
    let rows = pnl;
    if (regionFilter !== "ALL") rows = rows.filter((r) => (r.INSP_REGION || r.Insp_Region || r.Region) === regionFilter);
    if (ownerFilter !== "ALL") rows = rows.filter((r) => (r.Owner || r.OWNER) === ownerFilter);
    if (ageFilter !== "ALL") rows = rows.filter((r) => (r.AGE_BUCKET || r.Age_Bucket) === ageFilter);
    return rows;
  }, [pnl, regionFilter, ownerFilter, ageFilter]);

  const metrics = useMemo(() => {
    if (!filtered.length) return null;
    const totalPnl = filtered.reduce((s, r) => s + (num(r["P&L"] || r.PNL || r.pnl) || 0), 0);
    const totalLoss = filtered.reduce((s, r) => s + (num(r.Loss || r.LOSS) || 0), 0);
    const totalSell = filtered.reduce((s, r) => s + (num(r.SELL_PRICE || r.Sell_Price) || 0), 0);
    const totalBuy = filtered.reduce((s, r) => s + (num(r.BOUGHT_BID_AMOUNT || r.Buying_Price) || 0), 0);
    const cars = filtered.length;
    return {
      totalPnl, totalLoss, totalSell, totalBuy, cars,
      avgLoss: cars ? totalLoss / cars : 0,
      avgSell: cars ? totalSell / cars : 0,
      margin: totalSell ? totalPnl / totalSell : 0,
    };
  }, [filtered]);

  // Region breakdown
  const regionBreakdown = useMemo(() => {
    const map = {};
    filtered.forEach((r) => {
      const reg = r.INSP_REGION || r.Insp_Region || r.Region || "Unknown";
      if (!map[reg]) map[reg] = { cars: 0, loss: 0, pnl: 0 };
      map[reg].cars++;
      map[reg].loss += num(r.Loss || r.LOSS) || 0;
      map[reg].pnl += num(r["P&L"] || r.PNL) || 0;
    });
    return Object.entries(map).map(([region, v]) => ({ region, ...v, avgLoss: v.cars ? v.loss / v.cars : 0 })).sort((a, b) => a.pnl - b.pnl);
  }, [filtered]);

  if (!pnl.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Liquidation P&L Data</div>
        <div style={{ color: T.textMuted }}>Upload your Liquidation P&L Excel file in the Data Setup tab</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <select style={S.select} value={regionFilter} onChange={(e) => setRegionFilter(e.target.value)}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "All Regions" : r}</option>)}
        </select>
        <select style={S.select} value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
          {owners.map((o) => <option key={o} value={o}>{o === "ALL" ? "All Owners" : o}</option>)}
        </select>
        <select style={S.select} value={ageFilter} onChange={(e) => setAgeFilter(e.target.value)}>
          {ageBuckets.map((a) => <option key={a} value={a}>{a === "ALL" ? "All Age Buckets" : a}</option>)}
        </select>
        <div style={{ marginLeft: "auto", color: T.textMuted, fontSize: 13, alignSelf: "center" }}>
          Showing {filtered.length.toLocaleString()} of {pnl.length.toLocaleString()} records
        </div>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
          <div style={S.metric}>
            <div style={S.metricVal(T.red)}>{fmt(metrics.totalPnl)}</div>
            <div style={S.metricLabel}>Total P&L</div>
          </div>
          <div style={S.metric}>
            <div style={S.metricVal(T.red)}>{fmt(metrics.avgLoss)}</div>
            <div style={S.metricLabel}>Avg Loss/Car</div>
          </div>
          <div style={S.metric}>
            <div style={S.metricVal(T.text)}>{metrics.cars.toLocaleString()}</div>
            <div style={S.metricLabel}>Cars Sold</div>
          </div>
          <div style={S.metric}>
            <div style={S.metricVal(T.green)}>{fmt(metrics.avgSell)}</div>
            <div style={S.metricLabel}>Avg Sell Price</div>
          </div>
          <div style={S.metric}>
            <div style={S.metricVal(T.amber)}>{pct(metrics.margin)}</div>
            <div style={S.metricLabel}>P&L Margin</div>
          </div>
        </div>
      )}

      {/* Region Breakdown Table */}
      <div style={S.card}>
        <div style={S.cardTitle}>Region-wise P&L Breakdown</div>
        <div style={{ overflowX: "auto", maxHeight: 400 }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Region</th>
                <th style={{ ...S.th, textAlign: "right" }}>Cars</th>
                <th style={{ ...S.th, textAlign: "right" }}>Total P&L</th>
                <th style={{ ...S.th, textAlign: "right" }}>Total Loss</th>
                <th style={{ ...S.th, textAlign: "right" }}>Avg Loss/Car</th>
                <th style={S.th}>Impact</th>
              </tr>
            </thead>
            <tbody>
              {regionBreakdown.map((r) => (
                <tr key={r.region} style={{ transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = T.cardAlt)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  <td style={{ ...S.td, fontWeight: 600 }}>{r.region}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{r.cars}</td>
                  <td style={{ ...S.td, textAlign: "right", color: r.pnl < 0 ? T.red : T.green }}>{fmt(r.pnl)}</td>
                  <td style={{ ...S.td, textAlign: "right", color: T.red }}>{fmt(r.loss)}</td>
                  <td style={{ ...S.td, textAlign: "right" }}>{fmt(r.avgLoss)}</td>
                  <td style={S.td}>
                    <div style={{ width: 80, height: 6, background: T.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, Math.abs(r.pnl) / (Math.abs(metrics?.totalPnl || 1)) * 100)}%`, height: "100%", background: T.red, borderRadius: 3 }} />
                    </div>
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

// ═════════════════════════════════════════════════════════════
//  STUCK INVENTORY BROWSER
// ═════════════════════════════════════════════════════════════
function StuckInventory({ data }) {
  const si = data.stuckInventory || [];
  const [search, setSearch] = useState("");
  const [regionFilter, setRegionFilter] = useState("ALL");
  const [ageFilter, setAgeFilter] = useState("ALL");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const regions = useMemo(() => ["ALL", ...new Set(si.map((r) => r.REGION || r.Region || "").filter(Boolean))], [si]);
  const ageBuckets = useMemo(() => ["ALL", ...new Set(si.map((r) => r.AGE_BUCKET || r.Age_Bucket || r.SI_AGE_BUCKET || "").filter(Boolean))], [si]);

  const filtered = useMemo(() => {
    let rows = si;
    if (regionFilter !== "ALL") rows = rows.filter((r) => (r.REGION || r.Region) === regionFilter);
    if (ageFilter !== "ALL") rows = rows.filter((r) => (r.AGE_BUCKET || r.Age_Bucket || r.SI_AGE_BUCKET) === ageFilter);
    if (search) {
      const s = search.toLowerCase();
      rows = rows.filter((r) => Object.values(r).some((v) => String(v).toLowerCase().includes(s)));
    }
    return rows;
  }, [si, regionFilter, ageFilter, search]);

  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Columns to display
  const displayCols = useMemo(() => {
    if (!si.length) return [];
    const all = Object.keys(si[0]);
    const priority = ["LEAD_ID", "Lead_Id", "REGION", "Region", "MAKE", "Make", "MODEL", "Model", "BUYING_PRICE", "Buying_Price", "NEW_MSP", "TP", "AGE_BUCKET", "Age_Bucket", "C2D Flag", "C2D_Flag", "Anchor"];
    const found = priority.filter((c) => all.includes(c));
    if (found.length < 5) return all.slice(0, 10);
    return found;
  }, [si]);

  if (!si.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Stuck Inventory Data</div>
        <div style={{ color: T.textMuted }}>Connect your Google Sheet in the Data Setup tab</div>
      </div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input style={{ ...S.input, maxWidth: 300 }} placeholder="🔍 Search by Lead ID, Make, Model..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <select style={S.select} value={regionFilter} onChange={(e) => { setRegionFilter(e.target.value); setPage(0); }}>
          {regions.map((r) => <option key={r} value={r}>{r === "ALL" ? "All Regions" : r}</option>)}
        </select>
        <select style={S.select} value={ageFilter} onChange={(e) => { setAgeFilter(e.target.value); setPage(0); }}>
          {ageBuckets.map((a) => <option key={a} value={a}>{a === "ALL" ? "All Age Buckets" : a}</option>)}
        </select>
        <div style={{ marginLeft: "auto", color: T.textMuted, fontSize: 13, alignSelf: "center" }}>
          {filtered.length.toLocaleString()} cars
          {data.stuckInventory && <span style={{ ...S.badge(T.green), marginLeft: 10 }}>🔗 Google Sheets — Live</span>}
        </div>
      </div>

      {/* Summary metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        {(() => {
          const total = filtered.length;
          const regionCount = new Set(filtered.map((r) => r.REGION || r.Region)).size;
          const avgBuy = total ? filtered.reduce((s, r) => s + (num(r.BUYING_PRICE || r.Buying_Price) || 0), 0) / total : 0;
          const c2dCount = filtered.filter((r) => (r["C2D Flag"] || r.C2D_Flag || "") === "Y" || (r["C2D Flag"] || r.C2D_Flag || "") === "1").length;
          return [
            { label: "Total Cars", val: total.toLocaleString(), color: T.accent },
            { label: "Regions", val: regionCount, color: T.purple },
            { label: "Avg Buying Price", val: fmt(avgBuy), color: T.amber },
            { label: "C2D Flagged", val: c2dCount.toLocaleString(), color: T.green },
          ].map((m) => (
            <div key={m.label} style={S.metric}>
              <div style={S.metricVal(m.color)}>{m.val}</div>
              <div style={S.metricLabel}>{m.label}</div>
            </div>
          ));
        })()}
      </div>

      {/* Table */}
      <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto", maxHeight: 500 }}>
          <table style={S.table}>
            <thead>
              <tr>{displayCols.map((c) => <th key={c} style={S.th}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {paged.map((row, i) => (
                <tr key={i} style={{ transition: "background 0.15s" }} onMouseEnter={(e) => (e.currentTarget.style.background = T.cardAlt)} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                  {displayCols.map((c) => (
                    <td key={c} style={S.td}>{row[c] ?? ""}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: `1px solid ${T.border}` }}>
          <button style={S.btn("secondary")} onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}>← Prev</button>
          <span style={{ color: T.textMuted, fontSize: 13 }}>Page {page + 1} of {totalPages || 1}</span>
          <button style={S.btn("secondary")} onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}>Next →</button>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//  QUOTE SUBMISSION
// ═════════════════════════════════════════════════════════════
function QuoteSubmission({ data }) {
  const si = data.stuckInventory || [];
  const [leadId, setLeadId] = useState("");
  const [car, setCar] = useState(null);
  const [quote, setQuote] = useState({ dealerName: "", bidAmount: "", notes: "" });
  const [result, setResult] = useState(null);
  const [history, setHistory] = useState([]);

  const findCar = () => {
    if (!leadId.trim()) return;
    const found = si.find((r) => String(r.LEAD_ID || r.Lead_Id || r.lead_id || "").trim() === leadId.trim());
    setCar(found || "NOT_FOUND");
    setResult(null);
  };

  const submitQuote = () => {
    if (!car || car === "NOT_FOUND" || !quote.bidAmount) return;
    const bid = num(quote.bidAmount);
    const msp = num(car.NEW_MSP || car.MSP || car.TP) || 0;
    const buy = num(car.BUYING_PRICE || car.Buying_Price) || 0;

    let status, color;
    if (bid >= msp) {
      status = "APPROVED";
      color = T.green;
    } else if (msp && bid >= msp * 0.9) {
      status = "ESCALATED";
      color = T.amber;
    } else {
      status = "REJECTED";
      color = T.red;
    }

    const entry = {
      id: Date.now(),
      leadId: leadId,
      make: car.MAKE || car.Make || "",
      model: car.MODEL || car.Model || "",
      dealer: quote.dealerName,
      bid,
      msp,
      buyingPrice: buy,
      pnl: bid - buy,
      status,
      time: new Date().toLocaleString(),
    };
    setResult({ status, color, entry });
    setHistory((h) => [entry, ...h]);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      {/* Left: Form */}
      <div>
        <div style={S.card}>
          <div style={S.cardTitle}>🔍 Find Car by Lead ID</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input style={{ ...S.input, flex: 1 }} placeholder="Enter Lead ID..." value={leadId} onChange={(e) => setLeadId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && findCar()} />
            <button style={S.btn("primary")} onClick={findCar}>Search</button>
          </div>

          {car === "NOT_FOUND" && (
            <div style={{ color: T.red, marginTop: 12, fontSize: 13 }}>⚠ Car not found in Stuck Inventory. Check the Lead ID.</div>
          )}

          {car && car !== "NOT_FOUND" && (
            <div style={{ marginTop: 16, padding: 16, background: T.cardAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
                {car.MAKE || car.Make} {car.MODEL || car.Model}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 13 }}>
                {[
                  ["Region", car.REGION || car.Region],
                  ["Buying Price", fmt(num(car.BUYING_PRICE || car.Buying_Price))],
                  ["MSP", fmt(num(car.NEW_MSP || car.MSP || car.TP))],
                  ["Age Bucket", car.AGE_BUCKET || car.Age_Bucket],
                  ["Anchor", car.Anchor],
                  ["C2D Flag", car["C2D Flag"] || car.C2D_Flag],
                ].map(([label, val]) => (
                  <div key={label}>
                    <span style={{ color: T.textMuted }}>{label}: </span>
                    <span style={{ fontWeight: 600 }}>{val || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {car && car !== "NOT_FOUND" && (
          <div style={{ ...S.card, marginTop: 0 }}>
            <div style={S.cardTitle}>💰 Submit Dealer Quote</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <input style={S.input} placeholder="Dealer Name" value={quote.dealerName} onChange={(e) => setQuote({ ...quote, dealerName: e.target.value })} />
              <input style={S.input} placeholder="Bid Amount (₹)" value={quote.bidAmount} onChange={(e) => setQuote({ ...quote, bidAmount: e.target.value })} />
              <textarea style={{ ...S.input, minHeight: 60, resize: "vertical" }} placeholder="Notes (optional)" value={quote.notes} onChange={(e) => setQuote({ ...quote, notes: e.target.value })} />
              <button style={S.btn("primary")} onClick={submitQuote}>Submit Quote →</button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Result + History */}
      <div>
        {result && (
          <div style={{ ...S.card, background: `${result.color}11`, border: `2px solid ${result.color}44`, textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {result.status === "APPROVED" ? "✅" : result.status === "ESCALATED" ? "⚠️" : "❌"}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: result.color }}>{result.status}</div>
            <div style={{ color: T.textMuted, fontSize: 13, marginTop: 8 }}>
              Bid: {fmt(result.entry.bid)} | MSP: {fmt(result.entry.msp)} | P&L: <span style={{ color: result.entry.pnl >= 0 ? T.green : T.red }}>{fmt(result.entry.pnl)}</span>
            </div>
          </div>
        )}

        <div style={S.card}>
          <div style={S.cardTitle}>📋 Quote History ({history.length})</div>
          {!history.length ? (
            <div style={{ color: T.textMuted, textAlign: "center", padding: 20 }}>No quotes submitted yet</div>
          ) : (
            <div style={{ maxHeight: 400, overflowY: "auto" }}>
              {history.map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}08` }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{h.make} {h.model} — {h.dealer}</div>
                    <div style={{ color: T.textMuted, fontSize: 12 }}>Lead: {h.leadId} | {h.time}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={S.badge(h.status === "APPROVED" ? T.green : h.status === "ESCALATED" ? T.amber : T.red)}>{h.status}</div>
                    <div style={{ fontSize: 12, color: T.textMuted, marginTop: 4 }}>Bid: {fmt(h.bid)}</div>
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

// ═════════════════════════════════════════════════════════════
//  AUCTION SLOTS
// ═════════════════════════════════════════════════════════════
function AuctionSlots({ data }) {
  const ma = data.masterAuction || [];
  const [slots, setSlots] = useState(4);
  const [duration, setDuration] = useState(30);
  const [cycles, setCycles] = useState(3);

  const slotAssignment = useMemo(() => {
    if (!ma.length) return [];
    const result = [];
    for (let i = 0; i < slots; i++) {
      result.push({
        slot: i + 1,
        cars: ma.filter((_, idx) => idx % slots === i),
        startMin: i * duration,
      });
    }
    return result;
  }, [ma, slots, duration]);

  if (!ma.length) {
    return (
      <div style={{ ...S.card, textAlign: "center", padding: 60 }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🔨</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>No Master Auction Data</div>
        <div style={{ color: T.textMuted }}>Upload your Master Auction Excel file in the Data Setup tab</div>
      </div>
    );
  }

  return (
    <div>
      {/* Config */}
      <div style={S.card}>
        <div style={S.cardTitle}>⚙️ Auction Slot Configuration</div>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <div>
            <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Number of Slots</label>
            <input type="number" style={{ ...S.input, width: 100 }} value={slots} onChange={(e) => setSlots(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Duration per Slot (min)</label>
            <input type="number" style={{ ...S.input, width: 100 }} value={duration} onChange={(e) => setDuration(Math.max(5, parseInt(e.target.value) || 5))} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Rotation Cycles</label>
            <input type="number" style={{ ...S.input, width: 100 }} value={cycles} onChange={(e) => setCycles(Math.max(1, parseInt(e.target.value) || 1))} />
          </div>
          <div style={{ alignSelf: "flex-end" }}>
            <div style={{ fontSize: 13, color: T.textMuted }}>
              Total Auction Time: <strong style={{ color: T.accent }}>{slots * duration * cycles} min</strong> ({(slots * duration * cycles / 60).toFixed(1)} hrs)
            </div>
          </div>
        </div>
      </div>

      {/* Slot cards */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(slots, 4)}, 1fr)`, gap: 12 }}>
        {slotAssignment.map((slot) => (
          <div key={slot.slot} style={{ ...S.card, borderTop: `3px solid ${[T.accent, T.green, T.amber, T.purple, T.red][slot.slot % 5]}` }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>Slot {slot.slot}</div>
            <div style={{ fontSize: 13, color: T.textMuted, marginBottom: 12 }}>
              {slot.cars.length} cars • Starts at T+{slot.startMin}min
            </div>
            <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 12 }}>
              {slot.cars.slice(0, 10).map((car, i) => (
                <div key={i} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}08`, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 600 }}>{car.APPOINTMENT_ID || car.Appointment_Id || `#${i + 1}`}</span>
                  <span style={{ color: T.textMuted }}>{car.Owner || ""}</span>
                </div>
              ))}
              {slot.cars.length > 10 && <div style={{ color: T.textDim, padding: "6px 0", textAlign: "center" }}>+{slot.cars.length - 10} more</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//  PRICING CONTROL RULES
// ═════════════════════════════════════════════════════════════
function PricingRules({ data }) {
  const si = data.stuckInventory || [];
  const [rules, setRules] = useState([
    { id: 1, name: "Default Drop", ageBuckets: ["ALL"], regions: ["ALL"], dropPct: 5, active: true },
  ]);
  const [editing, setEditing] = useState(null);

  const regions = useMemo(() => [...new Set(si.map((r) => r.REGION || r.Region || "").filter(Boolean))], [si]);
  const ageBuckets = useMemo(() => [...new Set(si.map((r) => r.AGE_BUCKET || r.Age_Bucket || r.SI_AGE_BUCKET || "").filter(Boolean))], [si]);

  const addRule = () => {
    const newRule = { id: Date.now(), name: "New Rule", ageBuckets: ["ALL"], regions: ["ALL"], dropPct: 5, active: true };
    setRules([...rules, newRule]);
    setEditing(newRule.id);
  };

  const updateRule = (id, field, value) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const deleteRule = (id) => {
    setRules(rules.filter((r) => r.id !== id));
    if (editing === id) setEditing(null);
  };

  // Count affected cars
  const countAffected = (rule) => {
    if (!si.length) return 0;
    return si.filter((r) => {
      const reg = r.REGION || r.Region || "";
      const age = r.AGE_BUCKET || r.Age_Bucket || r.SI_AGE_BUCKET || "";
      const regionMatch = rule.regions.includes("ALL") || rule.regions.includes(reg);
      const ageMatch = rule.ageBuckets.includes("ALL") || rule.ageBuckets.includes(age);
      return regionMatch && ageMatch;
    }).length;
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={S.cardTitle}>📐 Pricing Drop Rules</div>
        <button style={S.btn("primary")} onClick={addRule}>+ Add Rule</button>
      </div>

      {rules.map((rule) => (
        <div key={rule.id} style={{ ...S.card, borderLeft: `4px solid ${rule.active ? T.accent : T.textDim}`, opacity: rule.active ? 1 : 0.6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <input
                style={{ ...S.input, width: 200, fontWeight: 700 }}
                value={rule.name}
                onChange={(e) => updateRule(rule.id, "name", e.target.value)}
              />
              <span style={S.badge(rule.active ? T.green : T.textDim)}>
                {rule.active ? "Active" : "Inactive"}
              </span>
              <span style={{ color: T.textMuted, fontSize: 12 }}>{countAffected(rule)} cars affected</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={S.btn("secondary")} onClick={() => updateRule(rule.id, "active", !rule.active)}>
                {rule.active ? "Disable" : "Enable"}
              </button>
              <button style={{ ...S.btn("secondary"), color: T.red }} onClick={() => deleteRule(rule.id)}>Delete</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 200px", gap: 16 }}>
            <div>
              <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Age Buckets</label>
              <select style={{ ...S.select, width: "100%" }} value={rule.ageBuckets[0]} onChange={(e) => updateRule(rule.id, "ageBuckets", [e.target.value])}>
                <option value="ALL">All Buckets</option>
                {ageBuckets.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Regions</label>
              <select style={{ ...S.select, width: "100%" }} value={rule.regions[0]} onChange={(e) => updateRule(rule.id, "regions", [e.target.value])}>
                <option value="ALL">All Regions</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: T.textMuted, display: "block", marginBottom: 4 }}>Price Drop %</label>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="range"
                  min="0" max="30" step="1"
                  value={rule.dropPct}
                  onChange={(e) => updateRule(rule.id, "dropPct", parseInt(e.target.value))}
                  style={{ flex: 1 }}
                />
                <span style={{ fontWeight: 700, color: T.amber, minWidth: 40, textAlign: "right" }}>{rule.dropPct}%</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════
export default function App() {
  const [tab, setTab] = useState("setup");
  const [data, setData] = useState({
    stuckInventory: null,
    liquidationPnl: null,
    masterAuction: null,
  });

  const hasData = data.stuckInventory || data.liquidationPnl || data.masterAuction;

  const tabs = [
    { id: "setup", label: "⚙️ Data Setup" },
    { id: "dashboard", label: "📊 Dashboard" },
    { id: "inventory", label: "🚗 Stuck Inventory" },
    { id: "quotes", label: "💰 Quotes" },
    { id: "pricing", label: "📐 Pricing Rules" },
    { id: "slots", label: "🔨 Auction Slots" },
  ];

  return (
    <div style={S.app}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.logo}>Cars24 • Inventory Command Center</div>
        <div style={S.nav}>
          {tabs.map((t) => (
            <button key={t.id} style={S.navBtn(tab === t.id)} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {hasData && (
          <div style={{ display: "flex", gap: 6 }}>
            {data.stuckInventory && <span style={{ ...S.badge(T.green), fontSize: 11 }}>SI ✓</span>}
            {data.liquidationPnl && <span style={{ ...S.badge(T.accent), fontSize: 11 }}>P&L ✓</span>}
            {data.masterAuction && <span style={{ ...S.badge(T.purple), fontSize: 11 }}>MA ✓</span>}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={S.main}>
        {tab === "setup" && <DataSetup data={data} setData={setData} />}
        {tab === "dashboard" && <LiquidationDashboard data={data} />}
        {tab === "inventory" && <StuckInventory data={data} />}
        {tab === "quotes" && <QuoteSubmission data={data} />}
        {tab === "pricing" && <PricingRules data={data} />}
        {tab === "slots" && <AuctionSlots data={data} />}
      </div>
    </div>
  );
}
