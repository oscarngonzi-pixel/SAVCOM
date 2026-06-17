# SAVCOM OVERALL Processor (v3 — SERVICE MOJA)

Hii ndiyo toleo rahisi zaidi: **service MOJA tu** kwenye Render (sio mbili).
Express inahudumia API yake (`/api/...`) NA inatoa ukurasa wa React
(dashboard) kwa wakati mmoja, kwenye URL moja.

Processor inaunganisha (merge) miamala moja kwa moja kutoka **CRDB —
PASSED_SAV** na **NMB — PASSED_SAV_NMB** (Google Sheets), kwa muda
unaouchagua, na kutengeneza **SAVCOM OVERALL** kwa wakati huo huo.

## Muundo wa mradi

```
savcom-app/
  server.js          Express server — API + inatoa frontend/build
  package.json        amri za install/build/start
  frontend/            React app (chanzo)
    src/App.js
    src/index.css
    ...
```

---

## HATUA 1 — Tengeneza Google Service Account (kama bado hujafanya)

1. https://console.cloud.google.com/ → tengeneza project
2. **APIs & Services > Library** → **Google Sheets API** → **Enable**
3. **APIs & Services > Credentials > Create Credentials > Service Account**
4. Bofya Service Account → **Keys > Add Key > Create new key > JSON** →
   pakua faili
5. Fungua faili hiyo kwa text editor (Notepad/TextEdit), copy maandishi
   yote (Ctrl+A, Ctrl+C) — utayahitaji Hatua 4 hapa chini

## HATUA 2 — Shirikisha (Share) Sheets mbili na Service Account

Kwa kila sheet, fungua, **Share**, bandika `client_email` (kutoka JSON,
mfano `savcom-sheets-reader@...iam.gserviceaccount.com`), Viewer, **Send**:

1. CRDB: `https://docs.google.com/spreadsheets/d/1rdSRNLdZPT5xXLRgV7wSn1beYwWZp41ZpYoLkbGmt0o/`
2. NMB: `https://docs.google.com/spreadsheets/d/1YchOygtfVyVNgz37sGX_KKud_Wr9KQsIkQKn_tEdbek/`

## HATUA 3 — Pakia kwenye GitHub

Pakia folder hii (`savcom-app`) kama repo mpya kwenye GitHub yako (kama
hujui jinsi: tengeneza repo mpya kwenye github.com, kisha "uploaded
files" kwenye ukurasa wa repo, drag-and-drop folder hii yote).

## HATUA 4 — Unda Web Service MOJA kwenye Render

1. https://dashboard.render.com → **New > Web Service**
2. Connect repo uliyopakia Hatua 3
3. Weka:
   - **Root Directory:** (bila kuweka chochote — root ya repo)
   - **Build Command:** `npm run render-build`
   - **Start Command:** `npm start`
4. **Environment**, ongeza:

   | Key | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_JSON` | maandishi YOTE ya `.json` (paste moja kwa moja) |
   | `CRDB_SHEET_ID` | `1rdSRNLdZPT5xXLRgV7wSn1beYwWZp41ZpYoLkbGmt0o` |
   | `CRDB_PASSED_SAV_TAB` | `PASSED_SAV` |
   | `NMB_SHEET_ID` | `1YchOygtfVyVNgz37sGX_KKud_Wr9KQsIkQKn_tEdbek` |
   | `NMB_PASSED_SAV_TAB` | `PASSED_SAV_NMB` |

5. **Create Web Service**. Subiri "Live" (dakika 2-5, kwa kuwa inajenga
   frontend pia)
6. Fungua URL iliyotolewa (mfano `https://savcom-app-xxxx.onrender.com`)
   — utaona dashboard moja kwa moja, hauitaji service ya pili

---

## Kuthibitisha kabla ya kutumia dashboard

Kwenye browser, jaribu hizi (badilisha jina la URL):

- `https://JINA-LAKO.onrender.com/api/health` → `{"ok":true,...}`
- `https://JINA-LAKO.onrender.com/api/overall?start=2026-06-01&end=2026-06-15`
  → JSON ya miamala, au ujumbe wa error unaoeleza tatizo kwa uwazi
  (mfano "permission denied" kama bado hujashare sheets)

## Vidokezo muhimu vya muundo wa data

- `PASSED_SAV` (CRDB): **hakuna header row** — data inaanzia row ya
  kwanza moja kwa moja
- `PASSED_SAV_NMB` (NMB): **ina header row** — data inaanzia row ya pili
- Column positions (0-indexed) zinazotumika: `[No, DATE, CHANNEL,
  MESSAGE, AMOUNT, PLATE/PHONE, NAME, REFNUMBER, CUSTOMER ID]`
- Rows zisizo na `REFNUMBER` au `DATE` inayosomeka zinapuuzwa

## Usalama

Kama wakati fulani ulibandika private key kwenye mazungumzo ya wazi
(chat, email, n.k), nenda Google Cloud Console > IAM & Admin > Service
Accounts > Keys, **futa (delete) key hiyo**, tengeneza mpya, na tumia
ile mpya tu kwenye Render.
