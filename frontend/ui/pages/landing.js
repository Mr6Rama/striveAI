// Landing page — product-native StriveAI front door.
// Reuses real product classes (v2-card, v2-bracketed, v2-today-action,
// v2-today-title, v2-done-criteria, v2-badge--*, v2-day-card) so the
// visual language is identical to Today / Agent / Proof / Progress.

export function render(container, _state, actions) {
  container.innerHTML = `
    <div class="v2-landing">

      <!-- ═════════════════════════ HERO ═════════════════════════ -->
      <section class="v2-landing-hero">
        <div class="v2-landing-hero__left">

          <div class="v2-land-logo">
            <div class="v2-land-logo-mark">S</div>
            <span class="v2-land-logo-name">StriveAI</span>
          </div>

          <div class="v2-kicker v2-landing-kicker-hero">
            <span class="v2-landing-kicker-dot"></span>
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

        <!-- product-native preview: literal Today screen -->
        <div class="v2-landing-hero__right">
          <div class="v2-landing-preview">

            <div class="v2-landing-preview__chrome">
              <span class="v2-landing-preview__route">/today</span>
              <span class="v2-landing-preview__live">
                <span class="v2-landing-preview__live-dot"></span>
                product preview
              </span>
            </div>

            <div class="v2-landing-preview__body">
              <div class="v2-kicker" style="margin-bottom:6px">
                <span>Day 3 of 7</span>
                <span class="v2-badge v2-badge--today">Today</span>
              </div>
              <p class="v2-muted-text v2-landing-preview__goal">
                Ship MVP &amp; get first 10 beta users
              </p>

              <div class="v2-card v2-card--focus v2-bracketed v2-landing-preview__card">
                <span class="v2-br-tr"></span><span class="v2-br-bl"></span>
                <div class="v2-today-action">Today's mission</div>
                <h2 class="v2-today-title">
                  Send 5 feedback DMs <em>for</em> your MVP.
                </h2>
                <p class="v2-body-text v2-landing-preview__why">
                  Cold outreach is the bottleneck. One real reply unblocks the next day.
                </p>
                <div class="v2-done-criteria">
                  Done means: 5 sent messages + 1 response logged.
                </div>
                <div class="v2-landing-preview__meta-row">
                  <span class="v2-section-label">35 min</span>
                  <span class="v2-landing-preview__dot"></span>
                  <span class="v2-section-label">Outreach</span>
                  <span class="v2-landing-preview__dot"></span>
                  <span class="v2-section-label v2-landing-preview__risk">
                    Failure mode: avoidance
                  </span>
                </div>
              </div>

              <div class="v2-landing-preview__btns">
                <span class="v2-btn v2-btn--primary">Start with Agent →</span>
                <span class="v2-btn v2-btn--secondary">Action Kit</span>
              </div>
              <div class="v2-landing-preview__btns v2-landing-preview__btns--ghost">
                <span class="v2-btn v2-btn--ghost">I’m stuck</span>
                <span class="v2-btn v2-btn--ghost">Proof</span>
              </div>

              <div class="v2-landing-preview__foot">
                <div class="v2-progress"><div class="v2-progress-fill" style="width:28%"></div></div>
                <div class="v2-landing-preview__foot-label">
                  <span>2 of 7 days returned</span>
                  <span>Day 3 active</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </section>

      <!-- ═════════════════════════ LOOP ═════════════════════════ -->
      <section class="v2-landing-section" id="v2-landing-loop">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ THE LOOP ]</span>
          <h2 class="v2-landing-h2">
            Planning is cheap. <em>Execution</em> needs a loop.
          </h2>
          <p class="v2-landing-section__sub">
            Five product surfaces, one closed feedback loop. The plan adapts
            because the system watches what you actually did.
          </p>
        </div>

        <ol class="v2-landing-loop">
          ${loopRow('01', '/track',      'Roadmap',         'Your goal becomes a 7-day track.',          'blue')}
          ${loopRow('02', '/today',      "Today's Action",  'One specific task, not 47 fake tasks.',     'today')}
          ${loopRow('03', '/agent',      'Agent Mode',      'Micro-steps until the task is started.',   'blue')}
          ${loopRow('04', '/proof',      'Proof',           'StriveAI checks what you actually did.',   'done')}
          ${loopRow('05', '/blocked',    'Rescue + Adapt',  'Tomorrow changes when reality changes.',   'rescued', true)}
        </ol>

        <p class="v2-landing-loop__return">
          <span class="v2-landing-loop__return-arrow">↻</span>
          The loop closes. Day 4 is rewritten by what happened on Day 3.
        </p>
      </section>

      <!-- ═════════════════════════ COMPARE ═════════════════════════ -->
      <section class="v2-landing-section v2-landing-compare-section">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ NOT THIS ]</span>
          <h2 class="v2-landing-h2">
            Why this is <em>not</em> ChatGPT with a nicer button.
          </h2>
        </div>

        <div class="v2-landing-compare">
          <div class="v2-landing-compare__col">
            ${cmpRow('ChatGPT', 'Answers when you ask.',  "Doesn't come back tomorrow.")}
            ${cmpRow('Notion',  'Stores plans.',           "Doesn't make you execute.")}
            ${cmpRow('Trello',  'Shows tasks.',            "Doesn't know what matters today.")}
          </div>

          <div class="v2-landing-compare__us v2-card v2-card--focus v2-bracketed">
            <span class="v2-br-tr"></span><span class="v2-br-bl"></span>
            <div class="v2-landing-compare__us-name">
              <span class="v2-land-logo-mark v2-land-logo-mark--sm">S</span>
              StriveAI
            </div>
            <p class="v2-landing-compare__us-headline">
              The roadmap <em>executes itself</em> with you in the loop.
            </p>
            <ul class="v2-landing-compare__us-list">
              <li>Comes back tomorrow with one action.</li>
              <li>Starts the task inside the product, not in your head.</li>
              <li>Checks proof. Rescues when blocked. Adapts what's next.</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- ═════════════════════════ 7-DAY TRACK ═════════════════════════ -->
      <section class="v2-landing-section">
        <div class="v2-landing-section__head">
          <span class="v2-landing-kicker">[ A 7-DAY TRACK ]</span>
          <h2 class="v2-landing-h2">
            What seven days <em>actually</em> look like.
          </h2>
          <p class="v2-landing-section__sub">
            Real tracks are messy. Days get rescued, skipped, or missed —
            the timeline records the truth and reshapes tomorrow.
          </p>
        </div>

        <div class="v2-landing-track">
          ${day(1, 'Done',     'Wrote landing page copy',          'done')}
          ${day(2, 'Rescued',  'Smaller task after a hard day',     'rescued')}
          ${day(3, 'Today',    'Send 5 feedback DMs',              'today')}
          ${day(4, 'Next',     'Review responses, fix top blocker', 'next')}
          ${day(5, 'Locked',   'Unlocks after Day 4',              'locked')}
          ${day(6, 'Locked',   'Unlocks after Day 5',              'locked')}
          ${day(7, 'Recap',    'Day 7 reflection &amp; next track',     'recap')}
        </div>
      </section>

      <!-- ═════════════════════════ FINAL CTA ═════════════════════════ -->
      <section class="v2-landing-section v2-landing-final">
        <div class="v2-landing-final__inner v2-card v2-card--focus v2-bracketed">
          <span class="v2-br-tr"></span><span class="v2-br-bl"></span>

          <div class="v2-kicker" style="justify-content:center;margin-bottom:14px">
            <span class="v2-badge v2-badge--today">Day 1 of 7</span>
            <span>Starts the moment you sign up</span>
          </div>

          <h2 class="v2-landing-h2 v2-landing-h2--center">
            One goal. Seven days. <em>No fake</em> productivity.
          </h2>
          <p class="v2-landing-final__sub">
            One daily action, proof, rescue, and adaptation — until the goal is shipped.
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
          <span class="v2-landing-footer__sep">·</span>
          <span>v2</span>
        </footer>
      </section>

    </div>`;

  container.querySelectorAll('[data-route]').forEach((el) => {
    el.addEventListener('click', () => actions.onNavigate?.(el.getAttribute('data-route')));
  });
  container.querySelectorAll('[data-scroll]').forEach((el) => {
    el.addEventListener('click', () => {
      container.querySelector('#v2-landing-loop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function loopRow(num, route, label, copy, badge, last = false) {
  const badgeCls = {
    today:   'v2-badge--today',
    done:    'v2-badge--done',
    rescued: 'v2-badge--rescued',
    blue:    'v2-badge--rescued',
  }[badge] || 'v2-badge--today';
  return `
    <li class="v2-landing-loop__item${last ? ' v2-landing-loop__item--last' : ''}">
      <div class="v2-landing-loop__rail"><span class="v2-landing-loop__rail-num">${esc(num)}</span></div>
      <div class="v2-landing-loop__body">
        <div class="v2-landing-loop__head">
          <span class="v2-landing-loop__label">${esc(label)}</span>
          <span class="v2-badge ${badgeCls}">${esc(route)}</span>
        </div>
        <p class="v2-landing-loop__copy">${esc(copy)}</p>
      </div>
    </li>`;
}

function cmpRow(name, head, tail) {
  return `
    <div class="v2-landing-compare__row">
      <div class="v2-landing-compare__name">${esc(name)}</div>
      <div class="v2-landing-compare__copy">
        <span class="v2-landing-compare__head">${esc(head)}</span>
        <span class="v2-landing-compare__tail">${esc(tail)}</span>
      </div>
    </div>`;
}

function day(n, label, copy, kind) {
  return `
    <div class="v2-landing-day v2-landing-day--${esc(kind)}">
      <div class="v2-landing-day__stripe"></div>
      <div class="v2-landing-day__inner">
        <div class="v2-landing-day__head">
          <span class="v2-landing-day__num">DAY ${n}</span>
          <span class="v2-badge v2-landing-day__badge">${esc(label)}</span>
        </div>
        <p class="v2-landing-day__copy">${copy}</p>
      </div>
    </div>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
