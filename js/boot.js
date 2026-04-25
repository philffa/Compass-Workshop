// js/boot.js — startup sequence with graceful error handling

function setSplashMsg(msg) {
  const el = document.getElementById('splash-msg');
  if (el) el.textContent = msg;
}

function isPlaceholderConfig(cfg) {
  return !cfg || cfg.apiKey === 'YOUR_API_KEY' || !cfg.apiKey;
}

function showSetupScreen() {
  document.getElementById('app').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;font-family:'DM Sans',system-ui,sans-serif;background:#F8F7F5;">
      <div style="max-width:500px;width:100%;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:1.25rem;">
          <svg width="36" height="36" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="28" fill="#E1F5EE"/>
            <circle cx="28" cy="28" r="14" fill="#1D9E75"/>
            <circle cx="28" cy="28" r="7"  fill="#0F6E56"/>
          </svg>
          <span style="font-size:1.25rem;font-weight:600;color:#0F6E56;">Planwise</span>
        </div>

        <h2 style="margin-bottom:0.4rem;color:#1a1917;font-size:1.1rem;">Firebase setup needed</h2>
        <p style="color:#6B6966;margin-bottom:1.25rem;font-size:0.88rem;line-height:1.6;">
          Edit <code style="background:#f0ede8;padding:1px 5px;border-radius:4px;font-size:0.82rem;">js/config.js</code>
          and paste in your Firebase project credentials. Then refresh this page.
        </p>

        <div style="background:white;border:1px solid #E8E5E0;border-radius:10px;padding:1.1rem;margin-bottom:1rem;">
          <div style="font-size:0.8rem;font-weight:600;color:#0F6E56;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em;">
            Steps
          </div>
          <div style="font-size:0.85rem;color:#444;line-height:2;">
            <span style="color:#0F6E56;font-weight:600;">1.</span>
            Go to <a href="https://console.firebase.google.com" target="_blank" style="color:#0F6E56;">console.firebase.google.com</a><br>
            <span style="color:#0F6E56;font-weight:600;">2.</span>
            Create a project → Add a <strong>Web app</strong><br>
            <span style="color:#0F6E56;font-weight:600;">3.</span>
            Enable <strong>Anonymous</strong> and <strong>Google</strong> sign-in (Authentication → Sign-in method)<br>
            <span style="color:#0F6E56;font-weight:600;">4.</span>
            Create a <strong>Firestore database</strong> (production mode, paste security rules from <code style="font-size:0.8rem;background:#f0ede8;padding:1px 4px;border-radius:3px;">firestore.rules</code>)<br>
            <span style="color:#0F6E56;font-weight:600;">5.</span>
            Copy the <code style="font-size:0.8rem;background:#f0ede8;padding:1px 4px;border-radius:3px;">firebaseConfig</code> object into <code style="font-size:0.8rem;background:#f0ede8;padding:1px 4px;border-radius:3px;">js/config.js</code><br>
            <span style="color:#0F6E56;font-weight:600;">6.</span>
            Refresh this page
          </div>
        </div>

        <p style="font-size:0.78rem;color:#9E9B94;">
          Running locally? You need a server, not <code style="background:#f0ede8;padding:1px 4px;border-radius:3px;">file://</code>.
          Run <code style="background:#f0ede8;padding:1px 4px;border-radius:3px;">npx serve . -l 3000</code> in this folder.
        </p>
      </div>
    </div>`;
}

async function boot() {
  // Wait up to 2 seconds for config.js to set window.__firebaseConfig
  // (plain <script> tags can load slightly after module scripts on some browsers)
  const cfg = await waitForConfig();

  // Step 1: Check config
  if (isPlaceholderConfig(cfg)) {
    showSetupScreen();
    return;
  }

  setSplashMsg('Connecting…');

  try {
    // Step 2: Dynamic import Firebase — deferred so splash is visible first
    const FIREBASE = 'https://www.gstatic.com/firebasejs/10.7.1';
    const [{ initializeApp }, { getAuth, signInAnonymously, onAuthStateChanged }] = await Promise.all([
      import(`${FIREBASE}/firebase-app.js`),
      import(`${FIREBASE}/firebase-auth.js`),
    ]);

    const app = initializeApp(cfg);
    const auth = getAuth(app);

    // Make auth available globally for the rest of the app
    window.__firebaseApp = app;
    window.__firebaseAuth = auth;

    setSplashMsg('Signing in…');

    // Step 3: Wait for auth state (with timeout fallback)
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Auth timed out — check your Firebase config and internet connection'));
      }, 12000);

      const unsub = onAuthStateChanged(auth, async (user) => {
        unsub();
        clearTimeout(timeout);
        if (!user) {
          try {
            await signInAnonymously(auth);
          } catch(e) {
            reject(e);
            return;
          }
        }
        resolve();
      });
    });

    setSplashMsg('Loading your projects…');

    // Step 4: Load Firestore now that auth is ready
    const firestoreModule = await import(`${FIREBASE}/firebase-firestore.js`);
    window.__firestoreModule = firestoreModule;
    const db = firestoreModule.getFirestore(app);
    window.__firebaseDb = db;

    // Step 5: Boot the app
    const { bootApp } = await import('./app.js');
    bootApp();

  } catch (err) {
    console.error('Boot error:', err);
    window.__showFatalError?.(err.message || String(err));
  }
}

function waitForConfig() {
  return new Promise(resolve => {
    // If already set, return immediately
    if (window.__firebaseConfig) { resolve(window.__firebaseConfig); return; }
    // Otherwise poll every 50ms for up to 3 seconds
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (window.__firebaseConfig) {
        clearInterval(interval);
        resolve(window.__firebaseConfig);
      } else if (attempts > 60) {
        // Timed out — resolve with null so isPlaceholderConfig catches it
        clearInterval(interval);
        resolve(null);
      }
    }, 50);
  });
}

boot();
