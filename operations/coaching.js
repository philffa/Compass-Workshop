// js/coaching.js — Strength-based coaching questions, surfaced contextually

const QUESTIONS = [
  "Tell me about some of the options you have when it comes to achieving your goals.",
  "What are some of the steps you think you want to take next?",
  "Have you been in this kind of situation before? How did you resolve it?",
  "Can you tell me about some of the steps that you've already taken?",
  "Are there any solutions that have already worked for a similar problem?",
  "How do you think your leaders can help you with this obstacle?",
  "What's something you can do differently to help you reach your goals?",
  "Tell me about a great first step you can take to change the situation.",
  "What's your process for starting a new assignment, task, or project?",
  "Is there someone on the team you think can offer you support in this?",
];

// Context → question indices
const CONTEXT_MAP = {
  'starting':   [8, 1, 7],   // No tasks yet / new project
  'stuck':      [2, 4, 6],   // Nothing assigned this week
  'team':       [5, 9],      // Team component active
  'reviewing':  [3, 6, 2],   // Week review / carry-forward
  'freetime':   [0,1,2,3,4,5,6,7,8,9], // Exploration mode — all fair game
};

// Get a contextual question, avoiding repeats within session
const sessionShown = new Set();

export function getCoachingQuestion(context = 'starting') {
  const pool = CONTEXT_MAP[context] ?? CONTEXT_MAP['starting'];
  // Filter out recently shown, fallback to full pool if all shown
  const available = pool.filter(i => !sessionShown.has(i));
  const indices = available.length > 0 ? available : pool;
  const idx = indices[Math.floor(Math.random() * indices.length)];
  sessionShown.add(idx);
  return QUESTIONS[idx];
}

export function resetCoachingSession() {
  sessionShown.clear();
}

// Determine context based on project state
export function coachingContext({ taskCount, hasTeamComponent, isFreetime, isReviewing }) {
  if (isFreetime) return 'freetime';
  if (isReviewing) return 'reviewing';
  if (taskCount === 0) return 'starting';
  if (hasTeamComponent) return 'team';
  return 'stuck';
}

// Render a coaching card element
export function renderCoachingCard(context, container) {
  const question = getCoachingQuestion(context);
  const card = document.createElement('div');
  card.className = 'coaching-card';
  card.innerHTML = `
    <div class="coaching-icon">💬</div>
    <div style="flex:1;">
      <div class="coaching-text" id="coaching-q">${question}</div>
      <button class="coaching-refresh" id="coaching-next">Different question</button>
    </div>
  `;
  card.querySelector('#coaching-next').addEventListener('click', () => {
    card.querySelector('#coaching-q').textContent = getCoachingQuestion(context);
  });
  container.appendChild(card);
  return card;
}
