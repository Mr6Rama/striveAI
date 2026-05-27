// Fallback data and functions for ai-v2.js — do not import directly in UI.

export const FALLBACK_TITLES = {
  project:  ['Define what you are building and who it is for', 'Cut scope to 3 essential features', 'Set up your repo and write a project README', 'Build the core feature end-to-end', 'Test with 2 real people and note observations', 'Fix the top issue found in testing', 'Record a demo or capture final screenshots'],
  startup:  ['Write your one-sentence value proposition', 'List 10 potential users and mark 3 reachable', 'Send 5 direct outreach messages requesting calls', 'Run 3 user interviews and log verbatim quotes', 'Build a rough prototype of the core flow', 'Show prototype to 2 users and record reactions', 'Write a one-page problem–solution–evidence summary'],
  content:  ['Draft your first post or script', 'Edit: cut everything not directly useful to the reader', 'Publish and note initial engagement numbers', 'Batch-write 2 more pieces in the same format', 'Study 3 high-performing posts in your niche', 'Apply the best structure to one draft and publish', 'Review 7-day numbers and write one clear lesson'],
  skill:    ['Define one small project to build with this skill', 'Complete the first tutorial and write 3 takeaways', 'Build one exercise from scratch without copying', 'Find and close the biggest knowledge gap', 'Build an exercise combining two concepts', 'Explain the core concept back in 200 words', 'Complete or demo the project from Day 1'],
  career:   ['Write your target-role summary and top qualification', 'Update your resume and cut every bullet to one line', 'Find 5 job postings where you meet 70%+ of requirements', 'Send one personalised cold outreach message', 'Apply to 2 saved postings with customised notes', 'Write out answers to the 3 most common interview questions', 'Do a mock interview and record yourself'],
  study:    ['List the 3 most important concepts for this week', 'Study concept 1 and write a summary in your own words', 'Complete 3 practice problems on concept 1', 'Study concept 2 and connect it to concept 1 in writing', 'Complete 5 mixed practice problems', 'Study concept 3 and write a summary connecting all three', 'Do a timed recall without notes and note weak spots'],
  habit:    ['Define the habit: trigger, action, and duration', 'Do the habit today and record start and end time', 'Set a specific daily time and block it in your calendar', 'Do the habit and rate difficulty 1–5', 'Remove one friction point and prepare the environment', 'Do the habit and note whether preparation helped', 'Write a one-paragraph reflection on what worked or did not'],
  fitness:  ['Define your plan: type, duration, and frequency', 'Complete the first workout and record your key metric', 'Identify one technique issue and look up the fix', 'Complete second workout applying the technique change', 'Add one measurable progressive overload', 'Rest or do light movement and prepare for Day 7', 'Final workout: record metric and compare to Day 2'],
};

export const FALLBACK_CRITERIA = {
  project:  ['Scope written: target user + the one problem you are solving', 'Feature list trimmed to 3, written down', 'Repo exists with README describing what it does', 'Core feature runs end-to-end without crashing', 'Notes from 2 testers written with at least one clear issue', 'Top issue fixed and re-tested', 'Demo video or final screenshots captured and saved'],
  startup:  ['Value proposition written in one sentence', 'List of 10 potential users complete, 3 marked reachable', '5 outreach messages sent and noted in a log', '3 interview notes logged with verbatim quotes', 'Prototype is clickable or a screencast is recorded', 'Reaction notes from 2 users written with one key insight', 'One-page problem–solution–evidence summary written'],
  content:  ['First draft or script exists as a file', 'Edited version is at least 30% shorter than the draft', 'Post published and engagement numbers noted', '2 more drafts exist in the same format', 'Notes on 3 high-performing posts in your niche written', 'Revised draft published', '7-day metrics reviewed and one lesson written'],
  skill:    ['Small project defined and the goal written down', 'First tutorial completed and 3 takeaways written', 'One exercise built from scratch without copying', 'Biggest knowledge gap identified and a resource found', 'Exercise combining two concepts built and working', 'Core concept written out in 200 words without notes', 'Day 1 project completed or a demo recorded'],
  career:   ['Target role summary and top qualification written', 'Resume updated with every bullet cut to one line', '5 job postings found where you meet 70%+ requirements', 'One personalised cold message sent', '2 applications submitted with customised cover notes', 'Answers to 3 common interview questions written out', 'Mock interview recorded and one improvement noted'],
  study:    ['3 key concepts for the week listed with sources', 'Concept 1 summarised in your own words', '3 practice problems on concept 1 completed and checked', 'Concept 2 connected to concept 1 in writing', '5 mixed practice problems completed and scored', 'All 3 concepts summarised together in one page', 'Timed recall done without notes and weak spots listed'],
  habit:    ['Habit written as: when X happens I will do Y for Z minutes', 'Start time and end time recorded for first attempt', 'Calendar block created for daily habit time', 'Difficulty rated 1–5 with one reason written', 'One friction point removed and environment prepared', 'Note written on whether the preparation helped', 'One-paragraph reflection on what worked or did not'],
  fitness:  ['Plan written: type, duration, and weekly frequency', 'First workout done and key metric recorded', 'One technique issue found and fix looked up', 'Second workout done applying the technique change', 'One measurable progressive overload applied and noted', 'Recovery session done and Day 7 workout prepared', 'Final workout done and metric compared to Day 2'],
};

const DEFAULT_TITLES = ['Define your goal clearly and write a done condition', 'Identify the 3 most important sub-tasks', 'Complete the first sub-task', 'Review progress and set the next priority', 'Complete the second sub-task', 'Adjust scope so the final day is achievable', 'Deliver one tangible output'];

const WHYS = ['Sets a concrete starting point and removes ambiguity', 'Builds on Day 1 progress toward the goal', 'Converts preparation into a first real output', 'Maintains momentum and deepens progress', 'Pushes past the halfway point toward the goal', 'Removes the last obstacle before the final deliverable', 'Produces the proof point that closes out the goal'];

// Phase whys indexed [week 0..3][activeDay 0..5]
const PHASE_WHYS = [
  ['Sets the foundation for the month', 'Establishes the baseline', 'Locks in the working structure', 'Produces the first concrete artifact', 'Validates the initial approach', 'Closes out the first phase with a checkpoint'],
  ['Builds the core', 'Deepens the core work', 'Advances the main deliverable', 'Tests the core against a real constraint', 'Iterates on the core output', 'Completes the build phase with a working artifact'],
  ['Validates the work with real criteria', 'Tests an edge case', 'Incorporates feedback into the artifact', 'Adjusts scope based on validation results', 'Runs a second validation pass', 'Closes validation with a clear ship checklist'],
  ['Begins final polish and prep for ship', 'Applies the last round of fixes', 'Documents the artifact for handoff or sharing', 'Records a demo or proof of completion', 'Distributes or publishes the artifact', 'Reflects on the month and notes next steps'],
];

export function fallbackTrack(input) {
  const goal     = String(input?.goal || 'your goal').trim();
  const category = String(input?.goalCategory || 'other').trim();
  const isTrack  = input?.trackKind === 'track';
  const titles   = FALLBACK_TITLES[category] || DEFAULT_TITLES;
  const criteria = FALLBACK_CRITERIA[category] || titles.map((t) => `${t.slice(0, 65)} — output written and saved`);
  const restPos  = Number(input?.restDayPosition) || 6;

  if (!isTrack) {
    return {
      goal,
      days: titles.map((title, i) => ({
        dayNumber: i + 1, title,
        why: WHYS[i] || `Advances progress toward: ${goal.slice(0, 60)}`,
        successCriteria: criteria[i] || `${title.slice(0, 65)} — output written and saved`,
        estimateMinutes: 60, category: 'other', blockerRisk: '', status: 'pending', date: '',
      })),
    };
  }

  const phaseNames = ['Foundation', 'Build', 'Validate', 'Ship'];
  const phaseRoles = ['setup', 'build', 'validate', 'ship'];
  const phases = phaseNames.map((name, i) => ({ weekNumber: i + 1, name, role: phaseRoles[i] }));
  const days = [];

  for (let week = 0; week < 4; week++) {
    let activeDay = 0;
    for (let d = 0; d < 7; d++) {
      const dayNumber = week * 7 + d + 1;
      const isRestDay = (d + 1) === restPos;
      if (isRestDay) {
        days.push({ dayNumber, weekNumber: week + 1, role: 'rest', isRestDay: true, title: 'Rest day', why: '', successCriteria: '', estimateMinutes: 0, category: 'rest', blockerRisk: '', status: 'pending', date: '' });
      } else {
        const tIdx = activeDay % titles.length;
        days.push({
          dayNumber, weekNumber: week + 1, role: 'active', isRestDay: false,
          title: titles[tIdx],
          why: PHASE_WHYS[week][activeDay] || `Advances Week ${week + 1} toward: ${goal.slice(0, 50)}`,
          successCriteria: criteria[tIdx] || `${titles[tIdx].slice(0, 65)} — output written and saved`,
          estimateMinutes: 60, category: 'other', blockerRisk: '', status: 'pending', date: '',
        });
        activeDay++;
      }
    }
  }

  return { goal, phases, days };
}

export function fallbackSteps(day) {
  const title    = String(day?.title || 'your task').slice(0, 80);
  const criteria = String(day?.successCriteria || '').slice(0, 100);
  const category = String(day?.category || 'other');
  const byCategory = {
    build:    [`Write 2-3 bullets describing exactly what "${title}" looks like when done.`, 'Identify the single smallest piece you can build first — name it explicitly.', 'Build that smallest piece end-to-end and run it once.'],
    research: [`Write down 3 questions you need answered for "${title}".`, 'Find one source per question — paste the link or quote.', 'Summarise the answers in 4–6 bullet points you can use tomorrow.'],
    write:    [`Write a 3-line outline of "${title}" — beginning, middle, end.`, 'Draft the opening paragraph (or first 100 words). No editing.', 'Finish a complete first draft. Length over polish.'],
    outreach: ['Make a list of 5 specific people or accounts to reach today.', 'Draft one message template (≤6 sentences) personalised for one of them.', 'Send at least 3 messages. Log the responses you get back.'],
    review:   [`List what you produced this week related to "${title}".`, 'For each item, write one sentence: what worked, what did not.', 'Pick one specific change for tomorrow based on the review.'],
    test:     [`Write 3 specific scenarios you want to verify for "${title}".`, 'Run scenario 1 yourself or with one tester. Record what happened.', 'Run the remaining scenarios. Write up the one issue you most want to fix.'],
    practice: [`Set a 25-minute timer for focused practice on "${title}".`, 'Do the practice — actively, not passively. Capture one specific thing you noticed.', 'Identify the single weakest area and plan tomorrow around it.'],
  };
  const steps = byCategory[category] || [
    `Write the first 2–3 bullet points describing what "${title}" looks like done.`,
    'Do the single smallest concrete action that moves you toward that — 10–25 minutes.',
    criteria ? `Check your output against this: "${criteria}". Save the result before stopping.` : 'Capture your output (a link, a file, a paragraph) so it exists outside your head.',
  ];
  return steps.map((text, i) => ({ index: i, text }));
}

export function fallbackProofCheck() {
  return { verdict: 'partial', note: 'Could not verify automatically. Check your work against the success criteria.' };
}

export function fallbackRescue(day) {
  const title = String(day?.title || 'your task').slice(0, 60);
  return { rescueTitle: `Smallest step toward: ${title}`, steps: ['Set a 10-minute timer.', 'Complete the first concrete sub-part of this task, even if rough.', 'Write one sentence describing what you produced.'], reframeNote: '', source: 'fallback' };
}

export function fallbackKit(day) {
  const title = String(day?.title || 'your task').slice(0, 60);
  return { items: [
    { type: 'question', label: 'Focus question', content: `What is the smallest thing I can produce in 30 minutes that proves progress on: "${title}"?` },
    { type: 'template', label: 'Progress log',   content: 'Time started:\nWhat I did:\nOutput produced:\nBlocker (if any):\nNext step:' },
    { type: 'tip',      label: 'Getting unstuck', content: 'Reduce scope to 25% of the original task. A smaller done beats a full not-started every time.' },
  ]};
}

export function fallbackAdaptDay(track, days) {
  const tomorrowIndex = track?.currentDayNumber || 1;
  const tomorrow = (Array.isArray(days) ? days : [])[tomorrowIndex] || {};
  return { changed: false, title: String(tomorrow.title || ''), why: '' };
}

export function fallbackDay7Recap(track, days) {
  const goal   = String(track?.goal || 'your goal').slice(0, 60);
  const dayArr = Array.isArray(days) ? days : [];
  const done   = dayArr.filter((d) => d.status === 'done' || d.status === 'rescued').length;
  return `You completed ${done} of 7 days working on: ${goal}. Review your notes to identify the pattern that most affected your consistency. Use that as the starting point for your next run.`;
}
