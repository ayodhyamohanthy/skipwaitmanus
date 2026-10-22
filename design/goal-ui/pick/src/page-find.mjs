// Screen A · Find a referral with the ask drawer open for Kestrel Pay.
// Persona (content.json screenA.persona): a job seeker who is not a verified referrer. One navigation:
// Find, My asks, Inbox; "Give a referral" (work email only) is the quiet link at the bottom of the rail
// and beside the avatar on phones. No mode switch.
// Desktop: rail 104 | directory | docked 480px drawer. Phone: directory frame, then the full-height ask
// sheet as frame 2. One solid black element: Send ask.
// Type (D-070): Signal's scale. The heading is the one 28/36 display title; the subheading is 16/24 body.
import { C, esc, icon, data, dates, kbd, nn } from "./lib.mjs";
import { documentPage, rail, topBar, bottomBar } from "./shell.mjs";

const A = C.screenA;
const D = A.askDrawer;
const seeker = { verified: false, initials: C.shell.account.seekerInitials };

const chips = A.filters.chips
  .map((c) => `
        <button class="chip hit" aria-pressed="${c.selected}">${c.selected ? icon("check", 16) : ""}<span>${esc(c.label)}</span></button>`)
  .join("");

const companyRows = A.companies
  .map((co) => {
    const av = co.open ? A.availability.open : A.availability.notOpen;
    const sel = co.selected ? ' aria-current="true"' : "";
    return `
        <li><a class="co-row row-select${co.selected ? " is-selected" : ""}" href="/explore/${esc(co.slug)}"${sel}>
          <span class="mark" aria-hidden="true">${esc(co.initials)}</span>
          <span class="co-row__name">${esc(co.name)}</span>
          <span class="co-row__fn">${esc(co.functions.join(A.functionsSeparator))}</span>
          <span class="avail${co.open ? "" : " avail--no"}"><span class="dot${co.open ? "" : " dot--ring"}" aria-hidden="true"></span>${esc(av.label)}</span>
        </a></li>`;
  })
  .join("");

const reasons = D.whyMe.bullets
  .map((b) => {
    const text = b.state === "empty"
      ? `<span class="reason__ph">${esc(b.placeholder)}</span>`
      : `${esc(b.text)}${b.focused ? '<span class="caret" aria-hidden="true"></span>' : ""}`;
    return `
            <div class="reason${b.focused ? " is-focus" : ""}">
              <span class="reason__n mono" aria-hidden="true">${nn(b.n)}</span>
              <div class="reason__text" role="textbox" aria-multiline="true" aria-label="${esc(D.whyMe.label)} ${b.n}" tabindex="0">${text}</div>
              <span class="reason__count mono">${esc(b.counter)}</span>
            </div>`;
  })
  .join("");

const drawer = `<div class="drawer-frame frame-break">
    <aside class="drawer" aria-labelledby="ask-title">
      <div class="drawer__grabber" aria-hidden="true"></div>
      <header class="drawer__head">
        <div class="drawer__titles">
          <h2 class="drawer__title" id="ask-title">${esc(D.title)}</h2>
          <p class="drawer__ctx">${esc(D.context)}</p>
        </div>
        <button class="icon-btn hit" aria-label="${esc(D.closeLabel)}">${icon("x", 20, 1.75)}</button>
      </header>
      <div class="drawer__body">
        <div class="drawer__intro">
          <p class="verified">${icon(D.verifiedLine.icon, 16)}<span>${esc(D.verifiedLine.text)}</span></p>
          <p class="drawer__privacy">${esc(D.privacyNote)}</p>
        </div>
        <div class="field">
          <label class="field__label" for="job-link">${esc(D.jobLink.label)}</label>
          <input class="input" id="job-link" type="url" inputmode="url" autocapitalize="none" spellcheck="false" value="${esc(D.jobLink.display)}" placeholder="${esc(D.jobLink.placeholder)}">
          <p class="field__hint field__hint--pass">${icon(D.jobLink.matchHint.icon, 16)}<span>${esc(D.jobLink.matchHint.text)}</span></p>
        </div>
        <div class="field">
          <span class="field__label" id="resume-label">${esc(D.resume.label)}</span>
          <div class="file" role="group" aria-labelledby="resume-label">
            ${icon(D.resume.icons.file, 20, 1.75)}
            <span class="file__name">${esc(D.resume.fileName)}</span>
            <span class="file__meta">${dates(D.resume.updated)}</span>
            <button class="btn btn--ghost btn--xs hit file__change">${esc(D.resume.action)}</button>
          </div>
          <p class="field__hint">${icon(D.resume.icons.hint, 16)}<span>${esc(D.resume.hint)}</span></p>
        </div>
        <div class="field reasons" role="group" aria-labelledby="why-label">
          <span class="field__label" id="why-label">${esc(D.whyMe.label)}</span>
          <p class="field__help">${esc(D.whyMe.helper)}</p>
          <div class="reasons__list">${reasons}
          </div>
        </div>
      </div>
      <footer class="drawer__foot">
        <p class="cost">${data(D.cost.line)}</p>
        <p class="cost__detail">${esc(D.cost.detail)}</p>
        <div class="drawer__actions">
          <button class="btn btn--ghost">${esc(D.secondaryAction.label)}</button>
          <span class="vdivider" aria-hidden="true"></span>
          <button class="btn btn--primary">${esc(D.primaryAction.label)}<span class="kbds" aria-hidden="true">${kbd(icon("command", 12))}${kbd(icon("corner-down-left", 12))}</span></button>
        </div>
      </footer>
    </aside>
  </div>`;

const body = `<div class="app app--find">
  ${rail({ ...seeker, active: A.navActive })}
  ${topBar({ ...seeker, title: A.pageTitle, credits: true })}
  <main class="find" aria-labelledby="find-heading">
    <h1 class="find__heading" id="find-heading">${esc(A.heading)}</h1>
    <p class="find__sub">${esc(A.subheading)}</p>
    <div class="search">
      ${icon("search", 20, 1.75)}
      <input type="search" aria-label="${esc(A.search.label)}" placeholder="${esc(A.search.placeholder)}" value="${esc(A.search.value)}">
    </div>
    <div class="chips" role="group" aria-label="${esc(A.filters.ariaLabel)}">${chips}
    </div>
    <p class="summary">${data(A.results.summary)}</p>
    <ul class="co-list">${companyRows}
    </ul>
    <p class="footnote">${esc(A.footnote)}</p>
  </main>
  ${bottomBar({ ...seeker, active: A.navActive })}
  ${drawer}
</div>`;

export default documentPage({ title: A.pageTitle, css: "find-a-referral.css", bodyClass: "screen-find", body });
