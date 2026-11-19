// Screen B · Referral queue, pre-acceptance only. Persona (D-070): a verified referrer at Kestrel Pay who
// ALSO seeks referrals, so the one navigation shows both sides with no switch: Find, My asks, Queue,
// Inbox. Impact is a link in the queue's header. No credits pill here: referrers are never charged.
// Desktop: frame 1 is rail | queue list (360px) | opened ask, with the decision bar at rest at the
// viewport bottom. Frame 2 is the same screen with Pass privately open: the 368px popover anchored
// above the button (title, the seven shipped reasons with keys 1-7, the note, Cancel and Pass). It
// floats over the ask, so opening it never moves the pinned bar. The reasons are shared/passReasons.ts's
// (D-052), drawn through lib.mjs's overlay while content.json still lists five.
// Phone: the queue list with the four-item bottom bar (a list has no commit action, so no black element),
// then the opened ask with its decision bar (the bottom bar hides there), then the pass-reason sheet.
// One solid black element in every frame that can commit: Accept & connect.
// Type (D-070): the role is the screen's one 28/36 display title; the list title is a 20/28 heading.
import { C, esc, icon, data, dates, kbd, nn, bindTail } from "./lib.mjs";
import { documentPage, rail, topBar, bottomBar, IMPACT } from "./shell.mjs";

const B = C.screenB;
const R = B.detail;
const P = R.pass;
const referrer = { verified: true, initials: C.shell.account.referrerInitials };

/** Queue rows. `selectable` is false on the phone list, which has no detail pane beside it. */
const queueRows = (selectable) => B.rows
  .map((r) => {
    const isNew = r.state === "New";
    const sel = selectable && r.selected;
    return `
        <li><a class="q-row row-select${sel ? " is-selected" : ""}" href="#${esc(r.id)}"${sel ? ' aria-current="true"' : ""}>
          <span class="q-row__role">${esc(r.role)}</span>
          <span class="q-row__state ${isNew ? "q-row__state--new" : "q-row__state--review"}">${isNew ? '<span class="dot" aria-hidden="true"></span>' : ""}${esc(r.state)}</span>
          <span class="q-row__meta">${esc(r.function)}<span class="sep" aria-hidden="true">·</span><span class="mono${r.closingSoon ? " is-soon" : ""}">${esc(r.timeLeft)}</span></span>
        </a></li>`;
  })
  .join("");

const verifiedMark = (extra = "") =>
  `<p class="verified ${extra}">${icon(B.verifiedMark.icon, 16)}<span>${esc(B.verifiedMark.label)}</span></p>`;

/** Impact, reached from the queue (D-070): a quiet link beside the verified mark. */
const impactLink = `<a class="impact-link hit" href="${esc(IMPACT.href)}">${icon(IMPACT.icon, 16)}<span>${esc(IMPACT.label)}</span></a>`;

/** Position control: "1 / 5" with previous/next. Keycaps K/J are desktop hints only. */
const position = (extra, withKeys) => `
        <div class="pos ${extra}">
          <span class="sr-only">${esc(B.position.ariaLabel)}</span><span class="pos__text mono" aria-hidden="true">${esc(B.position.text)}</span>
          <button class="icon-btn hit pos__btn" aria-label="${esc(B.position.previous.label)}">${icon(B.position.previous.icon, 18)}${withKeys ? kbd("K") : ""}</button>
          <button class="icon-btn hit pos__btn" aria-label="${esc(B.position.next.label)}">${icon(B.position.next.icon, 18)}${withKeys ? kbd("J") : ""}</button>
        </div>`;

/** The top of the opened ask; reused (inert, dimmed) behind the phone pass sheet. */
const askHead = (titleId) => `
        <p class="eyebrow">${esc(R.eyebrow)}</p>
        <h2 class="q-detail__role"${titleId ? ` id="${titleId}"` : ""}>${esc(R.role)}</h2>
        <div class="meta">
          <span class="mono meta__ref">${esc(R.ref)}</span>
          <span class="meta__time">${icon(R.timeLeft.icon, 16)}<span class="mono">${esc(R.timeLeft.text)}</span></span>
          <span>${dates(R.closes)}</span>
          <span>${dates(R.received)}</span>
        </div>
        <dl class="props">
          <div class="props__row"><dt>${esc(R.jobLink.label)}</dt><dd><a class="link" href="${esc(R.jobLink.value)}">${esc(R.jobLink.display)}${icon(R.jobLink.icon, 16)}</a></dd></div>
        </dl>`;

const whyItems = R.whyMe.bullets
  .map((t, i) => `
            <li><span class="why__n mono" aria-hidden="true">${nn(i + 1)}</span><p>${esc(t)}</p></li>`)
  .join("");

const qualityItems = R.quality.chips
  .map((q) => `<li>${icon(R.quality.icon, 16)}<span>${esc(q)}</span></li>`)
  .join("");

/** Phone sheet rows: 48px, no keycaps on touch. */
const passRows = P.reasons
  .map((r) => `
          <label class="radio-row"><input type="radio" name="pass-reason" value="${esc(r.code)}"><span>${esc(r.label)}</span></label>`)
  .join("");

/** Desktop popover rows: 40px, a visible radio, the label, its 1-7 keycap at the right. None preselected. */
const popRows = (sfx) => P.reasons
  .map((r) => `
              <label class="pop-row"><input type="radio" name="pass-reason${sfx}" value="${esc(r.code)}"><span class="pop-row__label">${esc(r.label)}</span><span class="kbds" aria-hidden="true">${kbd(esc(r.key))}</span></label>`)
  .join("");

/** The pass menu: anchored above Pass privately; Pass stays disabled until a reason is picked. */
const passPopover = (sfx) => `
            <section class="pass-pop" id="pass-pop${sfx}" role="dialog" aria-labelledby="pass-pop-title${sfx}">
              <h3 class="pass-pop__title" id="pass-pop-title${sfx}">${esc(P.title)}</h3>
              <p class="pass-pop__desc">${bindTail(P.description)}</p>
              <div class="pass-pop__list" role="radiogroup" aria-labelledby="pass-pop-title${sfx}">${popRows(sfx)}
              </div>
              <p class="pass-pop__note">${esc(P.preferNotToSayNote)}</p>
              <div class="pass-pop__foot">
                <button class="btn btn--ghost btn--sm">${esc(P.cancel)}</button>
                <button class="btn btn--outline btn--sm" aria-disabled="true">${esc(P.confirm)}</button>
              </div>
            </section>`;

/**
 * The opened ask. `sfx` keeps ids unique across frames; `passOpen` draws the popover (desktop frame 2);
 * `phone` adds the phone-only sub-header and verified mark (frame 1 renders at both widths).
 */
const detail = ({ sfx, passOpen, phone }) => `<article class="q-detail" aria-labelledby="ask-role${sfx}">${phone ? `
    <div class="q-sub only-phone">
      <a class="q-sub__back hit" href="${esc(C.shell.nav.giving[0].href)}">${icon("chevron-left", 18)}<span>${esc(B.pageTitle)}</span></a>${position("", false)}
    </div>` : ""}
    <div class="q-detail__body">
      ${phone ? verifiedMark("only-phone q-detail__verified") : ""}${askHead(`ask-role${sfx}`)}
      <section class="why" aria-labelledby="why-h${sfx}">
        <h3 class="label" id="why-h${sfx}">${esc(R.whyMe.label)}</h3>
        <ol>${whyItems}
        </ol>
      </section>
      <section class="quality" aria-labelledby="quality-h${sfx}">
        <h3 class="label" id="quality-h${sfx}">${esc(R.quality.label)}</h3>
        <ul>${qualityItems}</ul>
        <p class="quality__note">${esc(R.quality.note)}</p>
      </section>
    </div>
    <div class="dock">
      <div class="dock__promise">
        <div class="locked">
          ${icon(R.locked.icon, 20, 1.75)}
          <p class="locked__title">${esc(R.locked.title)}</p>
          <span class="locked__docs">${icon(R.locked.documentsIcon, 16)}<span class="mono">${esc(R.locked.documents)}</span></span>
        </div>
        <p class="accept-note">${esc(R.acceptNote)}</p>
      </div>
      <div class="decision">
        <div class="decision__bar">${position("only-desktop", true)}
          <div class="decision__actions">
            <div class="pass-anchor">
              <button class="btn btn--ghost decision__pass" aria-haspopup="dialog" aria-expanded="${passOpen}"${passOpen ? ` aria-controls="pass-pop${sfx}"` : ""}>${esc(R.secondaryAction.label)}<span class="kbds" aria-hidden="true">${kbd(R.secondaryAction.key)}</span></button>${passOpen ? passPopover(sfx) : ""}
            </div>
            <span class="vdivider" aria-hidden="true"></span>
            <button class="btn btn--primary decision__accept">${esc(R.primaryAction.label)}<span class="kbds" aria-hidden="true">${kbd(R.primaryAction.key)}</span></button>
          </div>
        </div>
      </div>
    </div>
  </article>`;

const queueList = (sfx, selectable) => `<section class="q-list" aria-labelledby="queue-h${sfx}">
    <header class="q-list__head">
      <div class="q-list__titlebar">
        <h1 class="q-list__title" id="queue-h${sfx}">${esc(B.heading)}</h1>
        <span class="q-list__count">${data(B.summary)}</span>
      </div>
      <div class="q-list__id">
        ${verifiedMark()}
        ${impactLink}
      </div>
      <p class="q-list__sub">${esc(B.subheading)}</p>
    </header>
    <ul class="q-rows">${queueRows(selectable)}
    </ul>
    <p class="q-list__foot">${esc(B.neverCharged)}</p>
  </section>`;

const bar = () => topBar({ ...referrer, title: B.pageTitle, credits: false });

const passFrame = `<div class="pass-frame frame-break only-phone">
    <div class="pass-frame__backdrop" aria-hidden="true" inert>
      ${bar()}
      <div class="q-sub">
        <span class="q-sub__back">${icon("chevron-left", 18)}<span>${esc(B.pageTitle)}</span></span>${position("", false)}
      </div>
      <div class="q-detail__body">${askHead("")}
      </div>
    </div>
    <section class="sheet" role="dialog" aria-labelledby="pass-sheet-title">
      <div class="sheet__grabber" aria-hidden="true"></div>
      <h3 class="sheet__title" id="pass-sheet-title">${esc(P.title)}</h3>
      <p class="sheet__desc">${bindTail(P.description)}</p>
      <div class="radio-list" role="radiogroup" aria-labelledby="pass-sheet-title">${passRows}
      </div>
      <p class="sheet__note">${esc(P.preferNotToSayNote)}</p>
      <div class="sheet__actions">
        <button class="btn btn--ghost">${esc(P.cancel)}</button>
        <button class="btn btn--outline" aria-disabled="true">${esc(P.confirm)}</button>
      </div>
    </section>
  </div>`;

const shell = () => `${rail({ ...referrer, active: B.navActive })}
  ${bar()}`;

// data-frame marks each review frame, so src/gate.mjs can hold every frame to one black element;
// data-primary="none" marks a frame with no commit action (the phone queue list), held to zero.
const body = `<!-- Phone frame · the queue list under the one navigation (Find, My asks, Queue, Inbox) -->
<div class="app app--qlist only-phone" data-frame="list" data-primary="none">
  ${bar()}
  ${queueList("-p", false)}
  ${bottomBar({ ...referrer, active: B.navActive })}
</div>
<!-- Frame 1 · the opened ask, decision bar at rest (both widths; on phones the pass sheet follows it) -->
<div class="app app--queue frame-break" data-frame="1">
  ${shell()}
  ${queueList("", true)}
  ${detail({ sfx: "", passOpen: false, phone: true })}
  ${passFrame}
</div>
<div class="frame-gap only-desktop" aria-hidden="true"></div>
<!-- Frame 2 · desktop only: Pass privately open, popover anchored above the button, no reason picked -->
<div class="app app--queue only-desktop" data-frame="2">
  ${shell()}
  ${queueList("-2", true)}
  ${detail({ sfx: "-2", passOpen: true, phone: false })}
</div>`;

export default documentPage({ title: B.pageTitle, css: "referral-queue.css", bodyClass: "screen-queue", body });
