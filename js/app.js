// js/app.js — Router, state, and view orchestration

import { onAuth, signInAnon, signInGoogle, currentUser } from './firebase.js';
import { renderHome } from './views/home.js';
import { renderProject } from './views/project.js';
import { renderNewProject } from './views/newProject.js';
import { toast } from './ui.js';

export const state = {
  user: null,
  route: null,
};

export function navigate(view, params = {}) {
  state.route = { view, params };
  render();
  window.scrollTo(0, 0);
}

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!state.user) { renderAuth(app); return; }

  const { view, params } = state.route ?? { view: 'home', params: {} };
  app.innerHTML = '';
  app.appendChild(buildNav());
  const content = document.createElement('div');
  app.appendChild(content);
  if (app._prevCleanup) { app._prevCleanup(); app._prevCleanup = null; }

  switch (view) {
    case 'home':        renderHome(content);                 break;
    case 'project':     renderProject(content, params.pid);  break;
    case 'new-project': renderNewProject(content);           break;
    default:            renderHome(content);
  }
  app._prevCleanup = content._cleanup;
}

function buildNav() {
  const nav = document.createElement('nav');
  nav.className = 'app-nav no-print';
  nav.innerHTML = `
    <div class="nav-logo" id="nav-home"><div class="dot"></div>Planwise</div>
    <div class="nav-spacer"></div>
    <div class="nav-actions">
      ${state.user?.isAnonymous
        ? `<button class="btn btn-secondary btn-sm" id="nav-signin">Save my account</button>`
        : `<span class="text-xs text-muted">${state.user?.email ?? 'Signed in'}</span>`}
    </div>`;
  nav.querySelector('#nav-home')?.addEventListener('click', () => navigate('home'));
  nav.querySelector('#nav-signin')?.addEventListener('click', async () => {
    try { await signInGoogle(); toast('Account saved — log in from any device', 'success'); render(); }
    catch(e) { toast('Sign-in failed — try again', 'error'); }
  });
  return nav;
}

function renderAuth(app) {
  app.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:2rem;background:var(--gray-50);">
      <div style="text-align:center;max-width:340px;">
        <svg width="52" height="52" viewBox="0 0 56 56" fill="none" style="margin-bottom:12px;">
          <circle cx="28" cy="28" r="28" fill="#E1F5EE"/>
          <circle cx="28" cy="28" r="14" fill="#1D9E75"/>
          <circle cx="28" cy="28" r="7"  fill="#0F6E56"/>
        </svg>
        <h1 style="margin-bottom:6px;">Planwise</h1>
        <p style="margin-bottom:1.5rem;">Your projects, your tools, your way.</p>
        <button class="btn btn-primary btn-lg" id="start-anon" style="width:100%;margin-bottom:8px;">Get started</button>
        <button class="btn btn-secondary" id="start-google" style="width:100%;">Sign in with Google</button>
        <p style="margin-top:1rem;font-size:0.78rem;color:var(--text-muted);">
          Start straight away — no account needed.<br>
          Sign in with Google to use on any device.
        </p>
      </div>
    </div>`;
  app.querySelector('#start-anon').addEventListener('click', async () => {
    try { await signInAnon(); }
    catch(e) { toast('Could not start — check your internet connection', 'error'); }
  });
  app.querySelector('#start-google').addEventListener('click', async () => {
    try { await signInGoogle(); }
    catch(e) { toast('Sign-in failed', 'error'); }
  });
}

// Called by boot.js once Firebase is ready
export function bootApp() {
  onAuth(user => {
    if (user) {
      state.user = user;
      if (!state.route) state.route = { view: 'home', params: {} };
    } else {
      state.user = null;
    }
    render();
  });
}
