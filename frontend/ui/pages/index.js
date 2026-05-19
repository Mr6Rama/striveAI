// Route dispatcher — maps every v2 route to its page module's render function.

import { render as renderLanding }      from './landing.js';
import { render as renderAuth }         from './auth.js';
import { render as renderOnboarding }   from './onboarding.js';
import { render as renderConfirmTrack } from './confirm-track.js';
import { render as renderPlanPreview }  from './plan-preview.js';
import { render as renderToday }        from './today.js';
import { render as renderAgent }        from './agent.js';
import { render as renderActionKit }    from './action-kit.js';
import { render as renderProof }        from './proof.js';
import { render as renderBlocked }      from './blocked.js';
import { render as renderProgress }     from './progress.js';
import { render as renderRecap }        from './recap.js';
import { render as renderSettings }     from './settings.js';
import { render as renderNotFound }     from './not-found.js';

const ROUTE_MAP = {
  '/landing':       renderLanding,
  '/auth':          renderAuth,
  '/onboarding':    renderOnboarding,
  '/confirm-track': renderConfirmTrack,
  '/plan-preview':  renderPlanPreview,
  '/today':         renderToday,
  '/agent':         renderAgent,
  '/action-kit':    renderActionKit,
  '/proof':         renderProof,
  '/blocked':       renderBlocked,
  '/progress':      renderProgress,
  '/recap':         renderRecap,
  '/settings':      renderSettings,
  '/not-found':     renderNotFound,
};

export function renderRoute(container, route, state, actions = {}) {
  const renderer = ROUTE_MAP[route] ?? renderNotFound;
  renderer(container, state, actions);
}
