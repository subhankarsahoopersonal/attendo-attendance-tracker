<div align="center">

# ⚡ AttenDO

### Smart Attendance Tracker for Students

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-attendo--tracker.netlify.app-6366f1?style=for-the-badge)](https://attendotracker.netlify.app)
[![Firebase](https://img.shields.io/badge/Firebase-v10.8-FFCA28?style=for-the-badge&logo=firebase&logoColor=white)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=for-the-badge)](LICENSE)
[![Made with Love](https://img.shields.io/badge/Made_with-❤️-ef4444?style=for-the-badge)](https://github.com/subhankarsahoopersonal)

*Track attendance, predict bunks, and never fall below the threshold.*

---

**[✨ Features](#-features) · [🚀 Quick Start](#-quick-start) · [🏗️ Architecture](#️-architecture) · [📱 Screenshots](#-screenshots) · [🤝 Contributing](#-contributing)**

</div>

---

## ✨ Features

### 📊 Dashboard
- **Real-time stats** — Overall attendance %, classes attended, classes missed
- **Today's classes** — Mark attendance with one tap (✅ Attended / ❌ Missed / 🟡 Cancelled)
- **Subject cards** — Color-coded cards showing per-subject attendance with visual progress bars
- **Click to explore** — Tap any subject card to view full attendance history

### 📅 Attendance History
- **Calendar heatmap** — Monthly view with color-coded days (green/red/yellow)
- **Month navigation** — Browse through past months with arrow controls
- **Activity log** — Chronological list of all attendance entries per subject
- **Stats summary** — Quick attended/missed/cancelled counts at a glance

### 🤖 AI Chatbot
- **Natural language queries** — Ask *"What's my Math attendance?"* or *"Can I bunk Physics?"*
- **Bunk calculator** — *"Can I bunk today?"* tells you which classes are safe to skip
- **Smart predictions** — *"How many classes to reach 80% in Chemistry?"*
- **Quick action buttons** — Common queries accessible in one click

### 📋 Timetable
- **Weekly schedule** — Configure your recurring class schedule
- **Extra classes** — Add one-time classes for specific dates
- **Time slots** — Set start and end times for each class

### 🔔 Push Notifications
- **Class reminders** — *"📚 Physics in 30 min!"* — 30 minutes before each class
- **Attendance warnings** — Alerts when any subject drops within 5% of your target
- **Below threshold alerts** — Immediate notification with recovery plan when you fall below target
- **Daily reminder** — Configurable evening reminder to mark attendance

### 🔐 Multi-User Auth
- **Google Sign-In** — One click login with your Google account
- **Email/Password** — Traditional signup and login
- **Cloud sync** — Data persists across devices via Firebase Firestore
- **Auto-migration** — Existing local data migrates to cloud on first login

### ⚙️ Settings
- **Target attendance** — Set your minimum required percentage (default: 75%)
- **Notification timing** — Configure when to receive daily reminders
- **Import/Export** — Backup and restore your data as JSON

---

## 🚀 Quick Start

### Use the Live App
Visit **[attendotracker.netlify.app](https://attendotracker.netlify.app)** and create an account to get started!

### Run Locally

```bash
# Clone the repo
git clone https://github.com/subhankarsahoopersonal/attendo-attendance-tracker.git

# Navigate to the project
cd attendo-attendance-tracker

# Start a local server (Firebase Auth requires http://)
python -m http.server 3000

# Open in browser
# http://localhost:3000
```

> **Note:** The app requires `http://` or `https://` to work (Firebase Auth limitation). Opening via `file://` will not work.

---

## 🏗️ Architecture

```
attendo-attendance-tracker/
├── index.html              # Main app shell + Login screen
├── css/
│   └── styles.css          # Design system (Dark theme + Glassmorphism)
├── js/
│   ├── firebase-config.js  # Firebase initialization
│   ├── auth.js             # Authentication (Google + Email/Password)
│   ├── storage.js          # LocalStorage + Firestore sync layer
│   ├── calculator.js       # Attendance math engine
│   ├── dashboard.js        # Dashboard UI rendering
│   ├── timetable.js        # Timetable management UI
│   └── chatbot.js          # AI chatbot with NLP pattern matching
└── assets/
    └── logo.png            # App logo
```

### Data Flow

```
User Action → StorageManager (localStorage) → FirestoreSync (debounced) → Cloud Firestore
                     ↑                                                          ↓
                     └──────────── On Login: Pull from Firestore ───────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Design** | Custom Dark Theme, Glassmorphism, CSS Custom Properties |
| **Auth** | Firebase Authentication (Google + Email/Password) |
| **Database** | Firebase Cloud Firestore + localStorage (offline cache) |
| **Hosting** | Netlify (auto-deploy from GitHub) |
| **Fonts** | Inter, Atomic Age (Google Fonts) |

---

## 📱 Screenshots

| Login | Dashboard | Attendance History |
|---|---|---|
| Glassmorphic login card with Google + Email auth | Real-time stats, today's classes, subject cards | Calendar heatmap + activity log per subject |

| Chatbot | Timetable | Notifications |
|---|---|---|
| Natural language attendance queries | Weekly schedule with extra class support | Class reminders + threshold warnings |

---

## 🧮 How the Bunk Calculator Works

The app uses a simple but effective algorithm:

```
Can I bunk?
├── Current: attended / totalHeld × 100 = current%
├── Simulated: attended / (totalHeld + 1) × 100 = projected%
└── If projected% >= target% → ✅ Safe to bunk!
    Else → ❌ Don't bunk! Need N more classes to recover.
```

---

## 🔒 Security

- **Firebase Security Rules** lock down data so each user can only access their own documents
- **API keys are public by design** — Firebase client-side keys are not secrets ([learn more](https://firebase.google.com/docs/projects/api-keys))
- **Auth-gated access** — App content is hidden until authentication succeeds
- **Offline persistence** — Firestore SDK caches data locally for offline support

---

## 🤝 Contributing

Contributions are welcome! Here's how:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

<div align="center">

**Made with ❤️ by [Subhankar Sahoo](https://github.com/subhankarsahoopersonal)**

⭐ Star this repo if you found it useful!

</div>
