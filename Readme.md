# Meta Leads – Real-Time Lead Viewer

A small full-stack project that pulls **Meta (Facebook) Lead Ads** leads and shows them **live** in a React Native (Expo) app.

- **Backend** (`leadbackend`): Node.js + Socket.IO server that fetches leads from the Meta Graph API and pushes them to connected apps.
- **Frontend** (`leadsapp`): Expo / React Native app (runs on web, Android, iOS) that connects to the backend over WebSockets and displays leads in real time.

---

## Architecture

```
┌──────────────────┐      Lead form submitted      ┌────────────────────┐
│  Facebook / Meta │ ◄──────────────────────────── │  Customer / Tester │
│    Lead Ads      │                               └────────────────────┘
└────────┬─────────┘
         │  Graph API (polled every 10s)
         │  GET /{page-id}/leadgen_forms
         │  GET /{form-id}/leads
         ▼
┌──────────────────┐   Socket.IO (polling → websocket)   ┌──────────────────┐
│   Node backend   │ ──────────────────────────────────► │   Expo app       │
│  (leadbackend)   │   leads:init  /  lead:new           │   (leadsapp)     │
│  exposed via     │                                     │                  │
│  ngrok (HTTPS)   │                                     │                  │
└──────────────────┘                                     └──────────────────┘
```

### Flow in plain words

1. A user submits a Lead Ad form on the Facebook Page (or you create a test lead using Meta's **Lead Ads Testing Tool**).
2. The backend asks Meta's Graph API for all forms on the page, then all leads for each form. This runs once at startup and then **every 10 seconds**.
3. Each lead is flattened into a simple object, de-duplicated by `id`, and stored in memory (newest first).
4. When the app connects, the backend immediately sends **all stored leads** (`leads:init`).
5. When a **new** lead is discovered later, the backend broadcasts it to every connected app (`lead:new`).
6. The app updates its list instantly and shows a **Live / Offline** indicator based on the socket connection state.

---

## How frontend and backend are connected

They communicate over **Socket.IO** (WebSocket with HTTP long-polling fallback). The backend is made reachable from the app through an **ngrok** HTTPS tunnel.

| Event        | Direction          | Payload     | Purpose                                         |
| ------------ | ------------------ | ----------- | ----------------------------------------------- |
| `connection` | app → backend      | –           | App connects; backend logs it                   |
| `leads:init` | backend → app      | `Lead[]`    | Sent once on connect with every stored lead     |
| `lead:new`   | backend → all apps | `Lead`      | Sent whenever a brand-new lead is found         |
| `disconnect` | either             | –           | App flips status to **Offline**                 |

**Lead object shape**

```json
{
  "id": "1234567890",
  "created_time": "2026-10-05T12:44:41+0000",
  "full_name": "Khushi Arya",
  "email": "khushiarya409@gmail.com",
  "phone_number": "+917047090688",
  "city": "Hyderabad"
}
```

Any field in the Meta form (`field_data`) becomes a key on this object (first value only).

**Frontend connection code** (`leadsapp/src/app/index.tsx`)

```ts
const socket = io(SERVER_URL, {
  transports: ['polling', 'websocket'],
  extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
});
```

- `SERVER_URL` is the public ngrok URL that forwards to the backend port.
- `ngrok-skip-browser-warning` stops ngrok's free-tier interstitial page from blocking Socket.IO requests.
- `polling` is listed first so the connection always succeeds, then it upgrades to `websocket`.

---

## Project structure

```
leadbackend/
├── index.js          # HTTP + Socket.IO server, Meta sync logic
├── package.json
└── .env              # PAGE_ID, PAGE_ACCESS_TOKEN, PORT (NOT committed)

leadsapp/
├── src/app/
│   ├── _layout.tsx   # Expo Router layout
│   ├── index.tsx     # Leads screen (Socket.IO client + FlatList)
│   └── explore.tsx
├── package.json
└── app.json
```

---

## Tech stack

| Layer      | Tech                                                         |
| ---------- | ------------------------------------------------------------ |
| Frontend   | React Native, Expo, Expo Router, TypeScript, socket.io-client |
| Backend    | Node.js (18+ for built-in `fetch`), socket.io, dotenv        |
| Data source| Meta Graph API v21.0 (Lead Ads / `leadgen_forms`)            |
| Tunnel     | ngrok                                                        |

---

## Meta setup (one-time)

1. Create a Meta app at <https://developers.facebook.com> and add the **Lead Ads / Marketing** permissions.
2. Make sure you are an **admin of the Facebook Page** that owns the lead form.
3. Generate a **Page Access Token** with these permissions:
   - `leads_retrieval`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_ads`
4. Note your **Page ID**.
5. Create a Lead Ad form on the Page.
6. For testing, open the **Lead Ads Testing Tool**: <https://developers.facebook.com/tools/lead-ads-testing>
   - Select your Page → Product: *Lead Retrieval* → pick the form → click **Create lead**.
   - Page Diagnostics should show all green checks (Leads Permission, Lead Access Manager, Page Admin).
   - Only one test lead per form is allowed; use **Delete lead** to create another.

---

## Running locally

### 1. Backend

```bash
cd leadbackend
npm install
```

Create `.env`:

```env
PAGE_ID=your_facebook_page_id
PAGE_ACCESS_TOKEN=your_page_access_token
PORT=8080
```

Start it:

```bash
node index.js
# Running on 8080
```

### 2. Expose the backend with ngrok

```bash
ngrok http 8080
```

Copy the HTTPS forwarding URL (e.g. `https://xxxx.ngrok-free.dev`).

### 3. Frontend

```bash
cd leadsapp
npm install
```

Open `src/app/index.tsx` and set:

```ts
const SERVER_URL = 'https://xxxx.ngrok-free.dev';
```

Run the app:

```bash
npx expo start        # then press "w" for web, or scan the QR code with Expo Go
```

When connected, the header shows **● Live** (green). Create a test lead in Meta's tool and it should appear within ~10 seconds.

---

## Troubleshooting

| Symptom                                   | Likely cause / fix                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| App shows **● Offline**                   | Backend not running, ngrok not running, or `SERVER_URL` is outdated (free ngrok URLs change on restart).   |
| "Waiting for leads..." forever            | No leads exist yet, or the token/Page ID is wrong – check backend console for `Forms error` / `Leads error`. |
| `Forms error: ... access token`           | Token expired or missing permissions – regenerate a Page Access Token.                                      |
| Test lead stays **Pending** in Meta tool  | Normal for a few seconds. This project polls the API, so it does not depend on Meta's webhook delivery.    |
| Browser requests blocked by ngrok         | Make sure the `ngrok-skip-browser-warning` header is set in the Socket.IO client options.                  |
| Backend restarted and old leads vanished from memory | Expected – leads are in memory only; they reload from Meta on startup.                        |

---

## Current limitations and ideas for improvement

- **In-memory storage**: leads reset when the backend restarts (they are re-fetched from Meta, so nothing is lost). Add a database (MongoDB / PostgreSQL) for history, status and notes.
- **Polling vs webhooks**: the backend polls Meta every 10 seconds. Using Meta's `leadgen` **webhook** would deliver leads instantly and use fewer API calls.
- **Page Access Token expiry**: use a long-lived token and refresh it, or use a System User token.
- **Open CORS** (`origin: '*'`) and no authentication on the socket: restrict origins and add auth before going to production.
- **Stable hosting**: replace ngrok with a deployed backend (Render, Railway, AWS, etc.) so the URL does not change.
- Add push notifications for new leads, search/filter, and pull-to-refresh.

---


