// Screen C · My asks. Persona (content.json screenC.persona): the seeker of screen A, not a verified
// referrer. One navigation (Find, My asks, Inbox) with the quiet "Give a referral" link; no mode switch.
// Desktop: rail | asks list (440px) | the focused Quillmint ask. Phone: the six asks.
// Rows have three lines (company + status, role + date, next step), so the larger type never truncates
// a company, role, status or date. Status = dot + text in its role colour; the mini stepper's last node
// is the status dot. One solid black element: Ask for a referral.
// Type (D-070): "My asks" is the screen's one 28/36 display title; the focused ask is a 20/28 heading.
import { C, esc, icon, mono, data, dates } from "./lib.mjs";
import { documentPage, rail, topBar, bottomBar } from "./shell.mjs";

const S = C.screenC;
const seeker = { verified: false, initials: C.shell.account.seekerInitials };
const STEPS = S.stepper.steps;
const NODE_ICON = S.stepper.nodeIcons;

// Role colours, strictly: amber pending, ink accepted, emerald referred, crimson expired, muted withdrawn.
const TONE = { amber: "tone-amber", neutral: "tone-ink", emerald: "tone-emerald", crimson: "tone-crimson", "neutral-muted": "tone-muted" };
const statusOf = (label) => S.statuses.find((s) => s.label === label);

/** Stepper states from content.json's rules (stage, terminal, Referred). */
function steps(ask) {
  return STEPS.map((label, i) => {
    if (ask.status === "Referred") return { label, state: i === 3 ? "referred" : "done" };
    if (ask.terminal) {
      if (i <= ask.stage) return { label, state: "done" };
      if (i === ask.stage + 1) return { label: ask.status, state: ask.terminal };
      return { label, state: "upcoming" };
    }
    return { label, state: i < ask.stage ? "done" : i === ask.stage ? "current" : "upcoming" };
  });
}

const reached = (state) => state !== "upcoming";

function miniStepper(ask) {
  const st = steps(ask);
  const parts = st.map((s, i) => {
    const link = i > 0 ? `<span class="mini__link${reached(s.state) ? "" : " mini__link--upcoming"}"></span>` : "";
    return `${link}<span class="mini__node mini__node--${s.state}"></span>`;
  });
  return `<span class="mini" aria-hidden="true">${parts.join("")}</span>`;
}

function askRow(ask) {
  const tone = TONE[statusOf(ask.status).tone];
  const returned = ask.credit.state === "returned";
  const sel = ask.focused ? ' aria-current="true"' : "";
  const credit = returned ? `<span class="a-row__credit">${data(ask.credit.label)}</span><span class="sep" aria-hidden="true">·</span>` : "";
  return `
        <li><a class="a-row row-select${ask.focused ? " is-selected" : ""}" href="#${esc(ask.id)}"${sel}>
          <span class="a-row__co">${esc(ask.company)}</span>
          <span class="a-row__status ${tone}">${miniStepper(ask)}<span>${esc(ask.status)}</span></span>
          <span class="a-row__role">${esc(ask.role)}</span>
          <span class="a-row__date">${esc(ask.date.label)} ${mono(ask.date.value)}</span>
          <span class="a-row__next">${credit}${dates(ask.nextStep)}</span>
        </a></li>`;
}

const section = (sec) => {
  const rows = S.asks.filter((a) => a.section === sec.id).map(askRow).join("");
  return `
    <section class="a-section" aria-labelledby="sec-${sec.id}">
      <h2 class="a-section__label" id="sec-${sec.id}">${esc(sec.label)}<span class="sep" aria-hidden="true">·</span>${mono(sec.count)}</h2>
      <ul class="a-rows">${rows}
      </ul>
    </section>`;
};

// The focused ask, in detail.
const q = S.asks.find((a) => a.id === S.focusedAskId);
const qTone = TONE[statusOf(q.status).tone];

const stepper = steps(q)
  .map((s) => {
    const iconName = s.state === "referred" ? NODE_ICON.done : NODE_ICON[s.state];
    const toneCls = s.state === "current" ? qTone : s.state === "referred" ? "tone-emerald" : "";
    const cur = s.state === "current" ? ' aria-current="step"' : "";
    return `
        <li class="step step--${s.state}"${cur}><span class="step__node ${toneCls}">${icon(iconName, 20, 1.75)}</span><span class="step__label">${esc(s.label)}</span></li>`;
  })
  .join("");

const history = q.events
  .map((e) => `
        <li class="ev ev--${e.state}"><span class="ev__date mono">${esc(e.date)}</span><span class="ev__text">${esc(e.text)}${e.credit ? `<span class="ev__credit">${data(e.credit)}</span>` : ""}</span></li>`)
  .join("");

const detail = `<article class="a-detail" aria-labelledby="ask-title">
    <div class="a-detail__inner">
      <p class="a-detail__ref mono">${esc(q.ref)}</p>
      <h2 class="a-detail__title" id="ask-title"><span>${esc(q.company)}</span> <span class="a-detail__role">${esc(q.role)}</span></h2>
      <div class="a-status">
        <span class="a-status__label ${qTone}"><span class="dot" aria-hidden="true"></span>${esc(q.status)}</span>
        <span class="a-status__line">${esc(q.statusLine)}</span>
        <span class="a-status__date">${esc(q.date.label)} ${mono(q.date.value)}</span>
      </div>
      <ol class="stepper" aria-label="${esc(S.stepper.ariaLabel)}">${stepper}
      </ol>
      <p class="a-detail__next">${dates(q.nextStep)}</p>
      <p class="a-credit">${icon(C.shell.creditsPill.icon, 16)}<span class="a-credit__label">${data(q.credit.label)}</span><span class="sep" aria-hidden="true">·</span><span>${dates(q.credit.detail)}</span></p>
      <ol class="history">${history}
      </ol>
      <div class="a-detail__actions">
        <button class="btn btn--ghost">${esc(q.action.label)}</button>
      </div>
    </div>
  </article>`;

const body = `<div class="app app--asks">
  ${rail({ ...seeker, active: S.navActive })}
  ${topBar({ ...seeker, title: S.pageTitle, credits: true })}
  <section class="a-list" aria-labelledby="asks-h">
    <header class="a-list__head">
      <div class="a-list__top">
        <h1 class="a-list__title" id="asks-h">${esc(S.heading)}</h1>
        <a class="btn btn--primary a-list__cta" href="${esc(S.primaryAction.href)}">${icon(S.primaryAction.icon, 18)}<span>${esc(S.primaryAction.label)}</span></a>
      </div>
      <p class="a-list__sub">${esc(S.subheading)}</p>
      <p class="a-list__slots">${data(S.slots.text)}</p>
    </header>${S.sections.map(section).join("")}
  </section>
  ${detail}
  ${bottomBar({ ...seeker, active: S.navActive })}
</div>`;

export default documentPage({ title: S.pageTitle, css: "my-asks.css", bodyClass: "screen-asks", body });
