// ============================================================
// SAVCOM OVERALL PROCESSOR — server.js (v3 — SINGLE SERVICE)
// ------------------------------------------------------------
// Hii version inaunganisha BACKEND na FRONTEND kwenye huduma MOJA
// ya Render — hauitaji kuunda "Web Service" na "Static Site"
// tofauti. Express inahudumia API (/api/*) NA inatoa (serve)
// faili za React zilizojengwa (frontend/build).
//
// Kazi yake (logic sawa na v2):
// 1. Kusoma "PASSED_SAV" (CRDB) na "PASSED_SAV_NMB" (NMB) kutoka
//    Google Sheets moja kwa moja (live), kwa Service Account
// 2. Kuchuja (filter) rows zenye DATE iliyo ndani ya muda
//    uliochaguliwa na mtumiaji
// 3. Kuunganisha (merge) rows hizo mbili kwenye jedwali MOJA —
//    "SAVCOM OVERALL" — likitumia FORMAT ile ile ya columns
//    iliyopo ndani ya sheets asilia
// 4. Rangi automatic kutegemea chanzo (CRDB / NMB)
// 5. Download ya Excel (.xlsx) yenye rangi hiyo
// ============================================================

const express = require("express");
const cors = require("cors");
const path = require("path");
const { google } = require("googleapis");
const ExcelJS = require("exceljs");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

// ------------------------------------------------------------
// Google Sheets auth (Service Account)
// ------------------------------------------------------------
// Two supported configurations:
//   1) GOOGLE_SERVICE_ACCOUNT_JSON — paste the ENTIRE downloaded .json
//      file content as-is into one env var. This is the recommended
//      method: it avoids the "not a valid RSA_X509_PEM formatted key"
//      error that happens when private_key's \n characters get mangled
//      by pasting into a single-line text field.
//   2) GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_PRIVATE_KEY — split fields
//      (legacy / fallback), kept for backward compatibility.
function getAuth() {
  const fullJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (fullJson) {
    let creds;
    try {
      creds = JSON.parse(fullJson);
    } catch (e) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the entire .json file content exactly as downloaded, with no edits."
      );
    }
    if (!creds.client_email || !creds.private_key) {
      throw new Error(
        "GOOGLE_SERVICE_ACCOUNT_JSON is missing client_email or private_key fields."
      );
    }
    return new google.auth.JWT(creds.client_email, null, creds.private_key, [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
    ]);
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON (recommended) or both GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY."
    );
  }
  key = key.replace(/\\n/g, "\n");
  return new google.auth.JWT(email, null, key, [
    "https://www.googleapis.com/auth/spreadsheets.readonly",
  ]);
}

async function readSheet(spreadsheetId, tabName) {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  // Columns A:I cover [No, DATE, CHANNEL, MESSAGE, AMOUNT, PLATE/PHONE,
  // NAME, REFNUMBER, CUSTOMER ID] on both source sheets. Limiting the
  // range keeps payloads small on sheets with tens of thousands of rows.
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tabName}!A:I`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return res.data.values || [];
}

// ------------------------------------------------------------
// Date parsing — handles every format seen across CRDB / NMB
// sheets: "13.06.2026 16:52:00", Excel serials, "2026-06-13", etc.
// ------------------------------------------------------------
function excelSerialToDate(serial) {
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function parseFlexibleDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return excelSerialToDate(value);
  const str = String(value).trim();
  if (!str) return null;

  let m = str.match(
    /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}):(\d{2}))?/
  );
  if (m) {
    let [, d, mo, y, h, mi, s] = m;
    d = parseInt(d, 10);
    mo = parseInt(mo, 10);
    y = parseInt(y, 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    h = h ? parseInt(h, 10) : 0;
    mi = mi ? parseInt(mi, 10) : 0;
    s = s ? parseInt(s, 10) : 0;
    return new Date(y, mo - 1, d, h, mi, s);
  }

  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}):(\d{2}))?/);
  if (m) {
    let [, y, mo, d, h, mi, s] = m;
    return new Date(
      parseInt(y, 10),
      parseInt(mo, 10) - 1,
      parseInt(d, 10),
      h ? parseInt(h, 10) : 0,
      mi ? parseInt(mi, 10) : 0,
      s ? parseInt(s, 10) : 0
    );
  }

  m = str.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})/);
  if (m) {
    const parsed = new Date(`${m[2]} ${m[1]}, ${m[3]}`);
    if (!isNaN(parsed.getTime())) return parsed;
  }

  const native = new Date(str);
  if (!isNaN(native.getTime())) return native;

  return null;
}

// ------------------------------------------------------------
// Map a PASSED_SAV-style sheet row into the common SAVCOM OVERALL
// row shape, preserving the original columns as-is.
// Expected columns (0-indexed): 1=DATE, 2=CHANNEL, 3=MESSAGE,
// 4=AMOUNT, 5=PLATE/PHONE, 6=NAME, 7=REFNUMBER, 8=CUSTOMER ID
// ------------------------------------------------------------
function mapRow(row, source) {
  const dateRaw = row[1];
  return {
    source, // "CRDB" | "NMB"
    date: dateRaw,
    dateParsed: parseFlexibleDate(dateRaw),
    channel: row[2] || "",
    message: row[3] || "",
    amount: row[4] != null ? row[4] : "",
    plateOrPhone: row[5] || "",
    name: row[6] || "",
    refNumber: row[7] || "",
    customerId: row[8] || "",
  };
}

function inRange(dateParsed, startDate, endDate) {
  if (!dateParsed) return false; // rows without a parseable date are excluded
  if (startDate && dateParsed < startDate) return false;
  if (endDate && dateParsed > endDate) return false;
  return true;
}

async function buildOverall(start, end) {
  const startDate = start ? new Date(`${start}T00:00:00`) : null;
  const endDate = end ? new Date(`${end}T23:59:59`) : null;

  const crdbSheetId = process.env.CRDB_SHEET_ID;
  const crdbTab = process.env.CRDB_PASSED_SAV_TAB || "PASSED_SAV";
  const nmbSheetId = process.env.NMB_SHEET_ID;
  const nmbTab = process.env.NMB_PASSED_SAV_TAB || "PASSED_SAV_NMB";

  const [crdbRows, nmbRows] = await Promise.all([
    readSheet(crdbSheetId, crdbTab),
    readSheet(nmbSheetId, nmbTab),
  ]);

  // IMPORTANT: the two source sheets have different layouts.
  // - CRDB "PASSED_SAV" has NO header row — data starts at row 1.
  // - NMB "PASSED_SAV_NMB" HAS a header row (DATE, CHANNEL, MESSAGE, ...)
  //   at row 1 — real data starts at row 2.
  // Skipping a row unconditionally would silently drop the first real
  // CRDB transaction, so each sheet is sliced according to its own shape.
  const crdbMapped = crdbRows
    .map((r) => mapRow(r, "CRDB"))
    .filter((r) => r.refNumber && inRange(r.dateParsed, startDate, endDate));

  const nmbMapped = nmbRows
    .slice(1)
    .map((r) => mapRow(r, "NMB"))
    .filter((r) => r.refNumber && inRange(r.dateParsed, startDate, endDate));

  const merged = [...crdbMapped, ...nmbMapped].sort((a, b) => {
    if (!a.dateParsed) return 1;
    if (!b.dateParsed) return -1;
    return a.dateParsed - b.dateParsed;
  });

  const summary = {
    totalRecords: merged.length,
    fromCrdb: crdbMapped.length,
    fromNmb: nmbMapped.length,
    totalAmount: merged.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    crdbAmount: crdbMapped.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    nmbAmount: nmbMapped.reduce((s, r) => s + (Number(r.amount) || 0), 0),
  };

  return { merged, summary };
}

// ------------------------------------------------------------
// API: GET /api/health
// ------------------------------------------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ------------------------------------------------------------
// API: GET /api/overall?start=YYYY-MM-DD&end=YYYY-MM-DD
// Inarudisha SAVCOM OVERALL (JSON) kwa muda uliochaguliwa
// ------------------------------------------------------------
app.get("/api/overall", async (req, res) => {
  try {
    const { start, end } = req.query;
    const { merged, summary } = await buildOverall(start, end);

    const results = merged.map((r) => ({
      source: r.source,
      date: r.date,
      channel: r.channel,
      message: r.message,
      amount: r.amount,
      plateOrPhone: r.plateOrPhone,
      name: r.name,
      refNumber: r.refNumber,
      customerId: r.customerId,
    }));

    res.json({ range: { start, end }, summary, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// API: GET /api/overall/export — same data as .xlsx, color-coded
// by source (CRDB / NMB), same column format as the source sheets
// ------------------------------------------------------------
app.get("/api/overall/export", async (req, res) => {
  try {
    const { start, end } = req.query;
    const { merged } = await buildOverall(start, end);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SAVCOM OVERALL");

    sheet.columns = [
      { header: "DATE", key: "date", width: 22 },
      { header: "CHANNEL", key: "channel", width: 10 },
      { header: "MESSAGE", key: "message", width: 60 },
      { header: "AMOUNT", key: "amount", width: 14 },
      { header: "PLATE/PHONE", key: "plateOrPhone", width: 16 },
      { header: "NAME", key: "name", width: 28 },
      { header: "REFNUMBER", key: "refNumber", width: 22 },
      { header: "CUSTOMER ID", key: "customerId", width: 16 },
      { header: "SOURCE", key: "source", width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE0E0E0" },
    };

    // Colors matching bank-source distinction (CRDB green family,
    // NMB blue/amber family — distinct from "passed/failed" reds).
    const CRDB_FILL = "FFC6EFCE"; // green
    const NMB_FILL = "FFBDD7EE"; // blue

    for (const r of merged) {
      const excelRow = sheet.addRow({
        date: r.date,
        channel: r.channel,
        message: r.message,
        amount: r.amount,
        plateOrPhone: r.plateOrPhone,
        name: r.name,
        refNumber: r.refNumber,
        customerId: r.customerId,
        source: r.source,
      });
      const fillColor = r.source === "CRDB" ? CRDB_FILL : NMB_FILL;
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: fillColor },
        };
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="SAVCOM_OVERALL_${start || "all"}_to_${
        end || "all"
      }.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------
// Serve the built React frontend (frontend/build) as static files.
// Any non-/api route falls through to index.html so client-side
// routing (if added later) keeps working.
// ------------------------------------------------------------
const FRONTEND_BUILD_DIR = path.join(__dirname, "frontend", "build");
app.use(express.static(FRONTEND_BUILD_DIR));

app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_BUILD_DIR, "index.html"));
});

app.listen(PORT, () => {
  console.log(`SAVCOM OVERALL Processor (v3 single-service) running on port ${PORT}`);
});
