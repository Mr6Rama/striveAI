// Landing page — paper editorial, product-native StriveAI front door

export function render(container, _state, actions) {
  container.innerHTML = `
    <div class="v2-landing">

      <!-- ======================= HERO ======================= -->
      <section class="v2-landing-hero">
        <div class="v2-landing-hero__left">
          <div class="v2-land-logo">
            <div class="v2-land-logo-mark">S</div>
            <span class="v2-land-logo-name">StriveAI</span>
          </div>

          <div class="v2-landing-eyebrow">
            <span class="v2-landing-eyebrow__dot"></span>
            7-DAY AI EXECUTION AGENT
          </div>

          <h1 class="v2-landing-h1">
            Your roadmap should <em>not</em> be passive.
          </h1>

          <p class="v2-landing-sub">
            StriveAI gives you one action per day, helps you finish it with
            Agent Mode, checks proof, and rebuilds the plan when you fall
            behind.
          </p>

          <div class="v2-landing-cta-row">
            <button data-route="/auth?mode=signup" class="v2-btn v2-btn--primary v2-btn--lg">
              Start 7-day track →
            </button>
            <button data-scroll="loop" class="v2-btn v2-btn--ghost v2-btn--lg">
              See how it works
            </button>
          </div>

          <div class="v2-landing-trust">
            <span>Email sign-in</span>
            <span class="v2-landing-trust__sep">·</span>
            <span>No credit card</span>
            <span class="v2-landing-trust__sep">·</span>
            <span>Telegram check-ins</span>
          </div>
        </div>

        <!-- product preview card -->
        <div class="v2-landing-hero__right">
          <div class="v2-landing-preview v2-bracketed">
            <span class="v2-br-tr"></span><span class="v2-br-bl"></span>

            <div class="v2-landing-preview__head">
              <span class="v2-landing-preview__tag">DAY 3 OF 7 · TODAY'S ACTION</span>
              <span class="v2-landing-preview__pulse">
                <span class="v2-landing-preview__pulse-dot"></span>
                live
              </span>
            </div>

            <h3 class="v2-landing-preview__title">
              Send 5 feedback DMs for your MVP.
            </h3>

            <dl class="v2-landing-preview__meta">
              <div>
                <dt>Done means</dt>
                <dd>5 sent messages + 1 response logged.</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>Avoidance / unclear start</dd>
              </div>
              <div>
                <dt>Est. time</dt>
                <dd>35 min</dd>
              </div>
            </dl>

            <div class="v2-landing-preview__btns">
              <span class="v2-btn v2-btn--primary v2-btn--sm">Start with Agent</span>
              <span class="v2-btn v2-btn--secondary v2-btn--sm">I'm blocked</span>
              <span class="v2-btn v2-btn--ghost v2-btn--sm">Proof</span>
            </div>

            <div class="v2-landing-preview__foot">
              <div class="v2-landing-preview__progress">
                <span class="v2-landing-preview__bar">
                  <span style="width:28%"></span>
                </span>
                <span class="v2-landing-preview__progress-label">2 of 7 days returned</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ======================= EXECUTION LOOP ======================= -->
      <section class="v2-landing-section" id="v2-landing-loop">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ THE LOOP ]</span>
          <h2 class="v2-landing-h2">
            Planning is cheap. <em>Execution</em> needs a loop.
          </h2>
        </div>

        <div class="v2-landing-rail">
          ${node('01', 'Roadmap',         'Your goal becomes a 7-day track.')}
          ${node('02', "Today's Action",  'One specific task, not 47 fake tasks.')}
          ${node('03', 'Agent Mode',      'Micro-steps until the task is started.')}
          ${node('04', 'Proof',           'StriveAI checks what you actually did.')}
          ${node('05', 'Adaptation',      'Tomorrow changes when reality changes.')}
        </div>
      </section>

      <!-- ======================= COMPARISON ======================= -->
      <section class="v2-landing-section">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ NOT THIS ]</span>
          <h2 class="v2-landing-h2">
            Why this is <em>not</em> ChatGPT with a nicer button.
          </h2>
        </div>

        <div class="v2-landing-compare">
          ${cmp('ChatGPT', 'Answers when you ask. Doesn’t come back tomorrow.')}
          ${cmp('Notion',  'Stores plans. Doesn’t make you execute.')}
          ${cmp('Trello',  'Shows tasks. Doesn’t know what matters today.')}
          <div class="v2-landing-compare__card v2-landing-compare__card--us">
            <div class="v2-landing-compare__name">
              <span class="v2-land-logo-mark v2-land-logo-mark--sm">S</span>
              StriveAI
            </div>
            <p class="v2-landing-compare__copy">
              Keeps the roadmap alive. One action a day, proof, rescue, adapt.
            </p>
          </div>
        </div>
      </section>

      <!-- ======================= 7-DAY TRACK PREVIEW ======================= -->
      <section class="v2-landing-section">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ A 7-DAY TRACK ]</span>
          <h2 class="v2-landing-h2">
            What seven days actually <em>look like</em>.
          </h2>
        </div>

        <div class="v2-landing-track">
          ${day(1, 'Done',     'done')}
          ${day(2, 'Rescued',  'rescued')}
          ${day(3, 'Today',    'today')}
          ${day(4, 'Next',     'next')}
          ${day(5, 'Locked',   'locked')}
          ${day(6, 'Locked',   'locked')}
          ${day(7, 'Recap',    'recap')}
        </div>
      </section>

      <!-- ======================= FINAL CTA ======================= -->
      <section class="v2-landing-section v2-landing-final">
        <div class="v2-landing-final__inner v2-bracketed">
          <span class="v2-br-tr"></span><span class="v2-br-bl"></span>
          <h2 class="v2-landing-h2 v2-landing-h2--center">
            Start with one goal. Stay on track for <em>7 days</em>.
          </h2>
          <p class="v2-landing-final__sub">
            No fake productivity. One daily action, proof, rescue, and adaptation.
          </p>
          <div class="v2-landing-cta-row v2-landing-cta-row--center">
            <button data-route="/auth?mode=signup" class="v2-btn v2-btn--primary v2-btn--lg">
              Start 7-day track →
            </button>
            <button data-route="/auth" class="v2-btn v2-btn--ghost v2-btn--lg">
              Sign in
            </button>
          </div>
        </div>

        <footer class="v2-landing-footer">
          <span>StriveAI</span>
          <span class="v2-landing-footer__sep">·</span>
          <span>Execution agent for builders</span>
        </footer>
      </section>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });

  container.querySelectorAll('[data-scroll]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = container.querySelector('#v2-landing-loop');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function node(num, label, copy) {
  return `
    <div class="v2-landing-node">
      <div class="v2-landing-node__num">${esc(num)}</div>
      <div class="v2-landing-node__body">
        <div class="v2-landing-node__label">${esc(label)}</div>
        <div class="v2-landing-node__copy">${esc(copy)}</div>
      </div>
    </div>`;
}

function cmp(name, copy) {
  return `
    <div class="v2-landing-compare__card">
      <div class="v2-landing-compare__name">${esc(name)}</div>
      <p class="v2-landing-compare__copy">${esc(copy)}</p>
    </div>`;
}

function day(n, label, kind) {
  return `
    <div class="v2-landing-day v2-landing-day--${esc(kind)}">
      <div class="v2-landing-day__num">DAY ${n}</div>
      <div class="v2-landing-day__label">${esc(label)}</div>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
