# Planwise

A personal productivity app for managing projects with brain dumps, priority sorting, weekly planning, and reviews. Built for Year 7–8 students but works for anyone.

---

## What's in here

```
planwise/
├── index.html              # App shell
├── css/
│   └── main.css            # All styles
├── js/
│   ├── app.js              # Router + state
│   ├── firebase.js         # Firebase setup + all data operations
│   ├── ui.js               # Shared UI utilities (toast, modal, drag)
│   ├── coaching.js         # Strength-based coaching questions
│   └── views/
│       ├── home.js         # Project dashboard
│       ├── newProject.js   # Template picker + project creation
│       ├── project.js      # Project shell + tool tabs
│       └── tools/
│           ├── brainDump.js       # Task creation + brain dump
│           ├── eisenhower.js      # Priority sort (drag to quadrant)
│           ├── resourceAudit.js   # Fixed blocks / free time grid
│           ├── weeklyPlanner.js   # Drag tasks into week slots
│           ├── todoList.js        # Smart 3-task window + drag reorder
│           ├── weeklyReview.js    # Week rollover + carry-forward
│           └── export.js          # PDF generation
├── firestore.rules         # Firestore security rules
└── README.md
```

---

## Setup

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com)
2. Create a new project (name it anything — "planwise" works)
3. Add a **Web app** — copy the config object it gives you

### 2. Enable Firebase services

In the Firebase console:

- **Authentication** → Sign-in method → Enable **Anonymous** and **Google**
- **Firestore Database** → Create database → Start in **production mode**
  - Once created, go to **Rules** and paste the contents of `firestore.rules`

### 3. Add your Firebase config

Open `js/firebase.js` and replace the placeholder config at the top:

```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Deploy to GitHub Pages

```bash
# From your repo root
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/planwise.git
git push -u origin main
```

Then in your GitHub repo:
- Settings → Pages → Source: **Deploy from a branch** → Branch: `main` / `/ (root)`

Your site will be live at `https://YOUR_USERNAME.github.io/planwise/`

### 5. Add your domain to Firebase Auth

In Firebase console → Authentication → Settings → Authorised domains:
- Add `YOUR_USERNAME.github.io`

---

## How it works

### Anonymous auth by default
Students visit the site and are immediately signed in anonymously — no account needed. Their data is stored in Firestore tied to a device session. If they want to access from a different device, they hit **"Save my account"** in the nav, which upgrades to a Google account without losing any data.

### One task, all tools
A task is created once (in Brain dump) and flows automatically into every other tool:
- **Priority sort** — drag tasks into quadrants; quadrant is stored on the task
- **Week plan** — drag tasks from the sidebar into day/slot cells; slot stored on task
- **To-do list** — smart view reads `quadrant`, `weekSlot`, and `sortOrder`; shows 3 at a time
- **Week review** — reads which tasks were assigned to last week; shows completed vs incomplete

### Weekly rollover
Every Monday the week plan moves forward automatically. The review tool looks at the previous week, lets the student choose what to carry forward, and marks dropped tasks as archived.

### Templates
| Template | Description |
|----------|-------------|
| School project | Pre-populates with individual / team / community components + coach check-in |
| Extracurricular | Activity, schedule, and goal fields |
| I've got time | Open-ended exploration; coaching questions surface throughout |
| Blank | Empty project, all tools available |

### Coaching questions
Strength-based questions surface contextually — different questions appear depending on whether the student is just starting, stuck, has a team component, or is doing a weekly review. Students can cycle to a different question at any time.

---

## Customising

**Adding a new template** — edit the `TEMPLATES` array in `js/views/newProject.js`

**Adding a coaching question** — add to the `QUESTIONS` array in `js/coaching.js` and map it to a context in `CONTEXT_MAP`

**Changing the tool tabs** — edit `TOOLS` in `js/views/project.js`

**Print styles** — the `@media print` section in `css/main.css` controls what shows in the PDF

---

## Local development

No build step required — the app uses native ES modules. Run a local server (required for modules to work):

```bash
# Python
python3 -m http.server 8080

# Node
npx serve .

# VS Code
# Install "Live Server" extension, right-click index.html → Open with Live Server
```

Then open `http://localhost:8080`

---

## Notes for the facilitator

The app is designed so students can open it on the day of the workshop and use it in real time during the personalisation blocks. The anonymous sign-in means zero friction — they just go to the URL and start.

If students want to keep using it from home or on a different device, they upgrade to Google sign-in from the nav. All their workshop data carries over automatically.
