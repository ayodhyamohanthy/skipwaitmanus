// Dev-only goal-UI gallery (packet §6c): every primitive in its states plus
// the three composed frames. Neutral placeholders only — never the comps'
// sample names, refs or numbers (R6). Reached via /components#goal-ui.
import { useState } from "react";
import { Building2, CircleAlert } from "lucide-react";
import {
  GoalAvailability,
  GoalButton,
  GoalCompanyMark,
  GoalDecisionBar,
  GoalDetailPane,
  GoalDrawer,
  GoalEmptyState,
  GoalErrorState,
  GoalField,
  GoalFilterChip,
  GoalIconButton,
  GoalListRow,
  GoalListSection,
  GoalLockedPanel,
  GoalNum,
  GoalPassReasons,
  GoalSearchInput,
  GoalShell,
  GoalSkeletonRows,
  GoalStatus,
  GoalTextInput,
  GoalVerifiedMark,
  useOnlineStatus,
} from "..";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-g-hairline px-6 py-6">
      <h2 className="mb-4 text-g-heading text-g-ink">{title}</h2>
      <div className="grid gap-3">{children}</div>
    </section>
  );
}

export function GoalGallery() {
  const online = useOnlineStatus();
  const [chip, setChip] = useState(false);
  const [query, setQuery] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(1);

  return (
    <div data-testid="goal-gallery" className="g-scope bg-g-canvas text-g-ink">
      <Section title="Status and marks">
        <div className="flex flex-wrap items-center gap-4">
          <GoalStatus status="waiting" label="Waiting" />
          <GoalStatus status="under_review" label="Under review" />
          <GoalStatus status="accepted" label="Accepted" />
          <GoalStatus status="referred" label="Referred" />
          <GoalStatus status="expired" label="Expired" />
          <GoalStatus status="withdrawn" label="Withdrawn" />
          <GoalStatus status="queue_new" label="New" />
          <GoalStatus status="queue_review" label="Under review" />
        </div>
        <GoalStatus status="referred" label="Referred" stepper={{ stage: 3 }} />
        <GoalStatus status="expired" label="Expired" stepper={{ stage: 1, terminal: "expired" }} />
        <GoalVerifiedMark>Goes to verified Company A employees</GoalVerifiedMark>
        <GoalNum>3 / 9</GoalNum>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap items-center gap-3">
          <GoalButton variant="primary" keys={[{ icon: "command" }, { icon: "corner-down-left" }]}>Send ask</GoalButton>
          <GoalButton variant="ghost">Cancel</GoalButton>
          <GoalButton variant="outline">Pass</GoalButton>
          <GoalButton variant="primary" busy busyLabel="Sending your ask…">Send ask</GoalButton>
          <GoalButton variant="primary" disabledReason={online ? "Pick a company first" : "You're offline"}>Send ask</GoalButton>
          <GoalButton variant="primary" asChild><a href="#goal-ui">Ask for a referral</a></GoalButton>
          <GoalIconButton icon={CircleAlert} aria-label="Details" />
        </div>
      </Section>

      <Section title="Inputs and chips">
        <div className="max-w-md grid gap-4">
          <GoalSearchInput label="Search companies" value={query} onChange={setQuery} placeholder="Company, function or level" />
          <GoalField label="Your ask" help="One clear request." hint={{ icon: Building2, text: "They work on this team", tone: "pass" }}>
            <GoalTextInput placeholder="e.g. a warm intro" />
          </GoalField>
          <GoalField label="Role link" error="That link didn't load. Paste the full role URL.">
            <GoalTextInput invalid placeholder="https://" />
          </GoalField>
          <div role="group" aria-label="Filter companies" className="flex flex-wrap gap-2">
            <GoalFilterChip label="Open to refer" pressed={chip} onPressedChange={setChip} />
            <GoalFilterChip label="Engineering" pressed={false} onPressedChange={() => {}} />
          </div>
        </div>
      </Section>

      <Section title="States">
        <GoalEmptyState title="No asks yet." body="Pick a company, find a verified referrer, and write one great ask." action={{ label: "Find a company", href: "#goal-ui" }} />
        <GoalErrorState title="We couldn't load your asks" body="Your asks are still active and nothing was lost." retry={{ label: "Try again", onClick: () => {} }} />
        <GoalSkeletonRows density="company" count={3} />
      </Section>

      <Section title="List rows">
        <GoalListSection label="Companies" count={3}>
          {[0, 1, 2].map(index => (
            <GoalListRow
              key={index}
              density="company"
              selected={selectedRow === index}
              onSelect={() => setSelectedRow(index)}
              leading={<GoalCompanyMark initials={String.fromCharCode(65 + index)} />}
              title={`Company ${String.fromCharCode(65 + index)}`}
              meta="Engineering, Design"
              trailing={<GoalAvailability open={index !== 2} label={index !== 2 ? "Open to refer" : "Not open"} />}
            />
          ))}
        </GoalListSection>
      </Section>

      <Section title="Composed: referral queue detail">
        <div data-testid="frame-queue" className="rounded-g-tile border border-g-hairline bg-g-surface">
          <GoalDetailPane
            labelledBy="gq-title"
            eyebrow="Referral queue"
            refId="R-4X2KQ"
            title="Role title at Company A"
            titleSize="display"
            meta={["Function", "Posted recently"]}
            dock={
              <>
                <GoalLockedPanel title="Locked until you accept" documentCount={3} />
                <p className="my-3 text-g-meta text-g-ink-2">Accepting reveals the seeker's name and note.</p>
                <GoalDecisionBar
                  position={{ index: 3, total: 9, onPrev: () => {}, onNext: () => {} }}
                  secondary={{ label: "Pass", keyHint: "P", onClick: () => setPassOpen(open => !open), expanded: passOpen, controlsId: "gallery-pass" }}
                  primary={{ label: "Accept", keyHint: "A", onClick: () => {}, busyLabel: "Accepting…" }}
                  passPicker={
                    <GoalPassReasons
                      open={passOpen}
                      onOpenChange={setPassOpen}
                      title="Pass on this ask"
                      description="Pick a reason. The seeker never sees which one."
                      cancelLabel="Cancel"
                      confirmLabel="Pass"
                      onConfirm={() => setPassOpen(false)}
                      onCancel={() => setPassOpen(false)}
                    />
                  }
                />
              </>
            }
          >
            <p className="text-g-body text-g-ink">The ask body renders here in plain words.</p>
          </GoalDetailPane>
        </div>
      </Section>

      <Section title="Composed: my asks">
        <div data-testid="frame-asks" className="rounded-g-tile border border-g-hairline bg-g-surface">
          <GoalListSection label="Waiting" count={2}>
            {[0, 1].map(index => (
              <GoalListRow
                key={index}
                density="ask"
                selected={selectedRow === index}
                onSelect={() => setSelectedRow(index)}
                title={`Company ${String.fromCharCode(67 + index)}`}
                meta="Role title"
                trailing={<GoalStatus status={index === 0 ? "waiting" : "under_review"} label={index === 0 ? "Waiting" : "Under review"} stepper={{ stage: index }} />}
                footer="Next step: the referrer reviews your ask."
              />
            ))}
          </GoalListSection>
          <GoalDetailPane labelledBy="ga-title" refId="R-9M4TD" title="Role title at Company C" titleSize="heading" meta={["Function"]}>
            <GoalStatus status="accepted" label="Accepted" stepper={{ stage: 2 }} />
          </GoalDetailPane>
        </div>
      </Section>

      <Section title="Composed: shell with ask drawer">
        <div data-testid="frame-find" className="overflow-hidden rounded-g-tile border border-g-hairline" style={{ height: 720 }}>
          <GoalShell
            active="find"
            verifiedReferrer={false}
            pageTitle="Find a referral"
            credits={{ state: "ready", count: 8 }}
            account={{ initials: "AB" }}
            alertsHref="#goal-ui"
            drawer={
              <GoalDrawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Write your ask" context="Goes to verified Company A employees" closeLabel="Close"
                footer={
                  <div>
                    <p className="text-g-label text-g-ink">Uses one credit</p>
                    <div className="mt-4 flex items-center justify-end gap-2 max-gdesk:grid max-gdesk:grid-cols-[1fr_2fr]">
                      <GoalButton variant="ghost" touch="large" onClick={() => setDrawerOpen(false)}>Save draft</GoalButton>
                      <span aria-hidden="true" className="h-6 w-px bg-g-hairline max-gdesk:hidden" />
                      <GoalButton variant="primary" touch="large" keys={[{ icon: "command" }, { icon: "corner-down-left" }]}>Send ask</GoalButton>
                    </div>
                  </div>
                }>
                <GoalField label="Your ask">
                  <GoalTextInput placeholder="One clear request" />
                </GoalField>
              </GoalDrawer>
            }
          >
            <div className="grid gap-4 p-6">
              <GoalSearchInput label="Search companies" value={query} onChange={setQuery} placeholder="Company, function or level" />
              <div><GoalButton variant="ghost" onClick={() => setDrawerOpen(true)}>Open ask drawer</GoalButton></div>
            </div>
          </GoalShell>
        </div>
      </Section>
    </div>
  );
}
