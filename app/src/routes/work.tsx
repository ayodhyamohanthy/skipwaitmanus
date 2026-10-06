import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Check, Download, Eye, FileText, Globe, Image as ImageIcon, Link2, Lock, Pin, Plus, Sparkles, Upload, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pageMeta } from "@/lib/page-meta";
import { importSources, visibilityLabels, workTypes, type Visibility } from "@/lib/monetization-data";

export const Route = createFileRoute("/work")({ head: () => pageMeta("Work showcase", "Publish your work to your SkipWait profile. No feed, no likes — just proof of what you can do."), component: Work });

type Piece = { id: number; title: string; type: string; vis: Visibility; pinned: boolean; source?: string };
const starter: Piece[] = [
  { id: 1, title: "Example: Checkout redesign case study", type: "Case study", vis: "public", pinned: true },
  { id: 2, title: "Example: Open-source CLI tool", type: "Project", vis: "askers", pinned: true, source: "GitHub" },
  { id: 3, title: "Example: Notes on scaling a design system", type: "Write-up", vis: "private", pinned: false, source: "Medium" },
];
const visIcon = { public: Globe, askers: Users, private: Lock } as const;

function Work() {
  const [pieces, setPieces] = useState<Piece[]>(starter);
  const [sheet, setSheet] = useState<null | "add" | "import">(null);
  const [type, setType] = useState<string>("Project");
  const [vis, setVis] = useState<Visibility>("public");
  const [title, setTitle] = useState("");
  const [src, setSrc] = useState<string | null>(null);
  const [importDone, setImportDone] = useState(false);
  const [view, setView] = useState<"owner" | "referrer">("owner");
  const pinnedCount = pieces.filter(p => p.pinned).length;
  const togglePin = (id: number) => setPieces(ps => ps.map(p => p.id === id ? { ...p, pinned: !p.pinned && pinnedCount < 3 ? true : false } : p));
  const add = () => { setPieces(ps => [{ id: Date.now(), title: title || `Untitled ${type.toLowerCase()}`, type, vis, pinned: false }, ...ps]); setTitle(""); setSheet(null); };
  const closeImport = () => { setSheet(null); setSrc(null); setImportDone(false); };
  const shown = view === "referrer" ? pieces.filter(p => p.vis !== "private") : pieces;
  return <main className="page-content work-page">
    <div className="page-heading"><div><span className="eyebrow">NO FEED. NO LIKES. JUST YOUR WORK.</span><h1>Your work, in one quiet place<span className="brand-dot">.</span></h1><p>Publish projects to your profile. Pin your best on referral requests so referrers decide faster.</p></div><span className="preview-label">DESIGN PREVIEW</span></div>

    <div className="work-actions"><Button className="brand-button" onClick={() => setSheet("add")}><Plus />Add work</Button><Button variant="outline" className="brand-button" onClick={() => setSheet("import")}><Download />Import from other platforms</Button></div>

    <section className="work-principles">{[["No algorithm", "Nothing ranks you. Work sits on your profile, in the order you choose."], ["No vanity counts", "No likes, followers or public views. Just the work."], ["You decide who sees it", "Public, only referrers you ask, or only you — per piece."]].map(([h, p]) => <div key={h}><Check /><span><strong>{h}</strong><small>{p}</small></span></div>)}</section>

    <div className="intent-switch work-view"><Button variant="ghost" className={view === "owner" ? "selected" : ""} onClick={() => setView("owner")}><Eye />My view</Button><Button variant="ghost" className={view === "referrer" ? "selected" : ""} onClick={() => setView("referrer")}><Users />What a referrer sees</Button></div>

    <section className="profile-card-preview"><div className="avatar-ph" aria-hidden>Y</div><div className="min-w-0"><strong>Your name</strong><small>Your headline · skipwait.me/<em>yourname</em> <span className="plus-chip">Plus</span></small></div><span className="pin-meter"><Pin />{pinnedCount}/3 pinned to requests</span></section>

    {shown.length === 0 ? <div className="workspace-empty"><span className="empty-icon"><Upload /></span><h2>Nothing visible here yet</h2><p>Add a piece or import from GitHub, Behance and more.</p></div> :
      <section className="work-grid">{shown.map(p => { const V = visIcon[p.vis]; return <article key={p.id} className={`work-card ${p.pinned ? "pinned" : ""}`}>
        <div className="work-thumb" aria-hidden>{p.type === "File or image" ? <ImageIcon /> : p.type === "Link" ? <Link2 /> : <FileText />}{p.pinned && <span className="pin-flag"><Pin />Pinned</span>}</div>
        <div className="work-body"><span className="eyebrow">{p.type}{p.source ? ` · from ${p.source}` : ""}</span><h3>{p.title}</h3><span className="vis-chip"><V />{visibilityLabels[p.vis]}</span></div>
        {view === "owner" && <div className="work-tools"><Button variant="ghost" size="sm" onClick={() => togglePin(p.id)} aria-pressed={p.pinned}><Pin />{p.pinned ? "Unpin" : pinnedCount >= 3 ? "Pin limit" : "Pin"}</Button><select aria-label="Who can see this" value={p.vis} onChange={e => setPieces(ps => ps.map(x => x.id === p.id ? { ...x, vis: e.target.value as Visibility } : x))}>{Object.entries(visibilityLabels).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>}
      </article>; })}</section>}

    <section className="plans-section"><span className="eyebrow">HOW IT HELPS YOUR ASK</span><h2>Pinned work rides along with every request.</h2><div className="ask-preview"><div className="ask-card"><span className="eyebrow">REFERRAL REQUEST · PREVIEW</span><strong>Product Designer · Wipro</strong><p>“I’ve led two checkout redesigns and would love a referral for this role…”</p><div className="ask-pins">{pieces.filter(p => p.pinned).map(p => <span key={p.id}><Pin />{p.title.replace("Example: ", "")}</span>)}{pinnedCount === 0 && <span className="muted">No work pinned yet</span>}</div></div></div></section>

    <aside className="plus-nudge"><Sparkles /><div><strong>Show more of what you can do</strong><p>Start expands your showcase. Momentum unlocks unlimited pieces, 6 pins, a custom link and private view insights.</p></div><Button asChild variant="outline" className="brand-button"><Link to="/plans">Compare plans <ArrowRight /></Link></Button></aside>
    <p className="design-note">DESIGN PREVIEW · EXAMPLE PIECES · NOTHING IS PUBLISHED OR IMPORTED</p>

    {sheet && <div className="modal-backdrop sheet-backdrop" onClick={closeImport}><div className="app-dialog work-sheet" role="dialog" aria-modal="true" aria-label={sheet === "add" ? "Add work" : "Import work"} onClick={e => e.stopPropagation()}>
      <Button variant="ghost" size="icon" className="dialog-close" aria-label="Close" onClick={closeImport}><X /></Button>
      {sheet === "add" ? <>
        <span className="eyebrow">ADD TO YOUR PROFILE</span><h2>What did you make?</h2>
        <div className="chip-row" role="radiogroup" aria-label="Type">{workTypes.map(t => <button key={t} role="radio" aria-checked={type === t} className={type === t ? "selected" : ""} onClick={() => setType(t)}>{t}</button>)}</div>
        <label>Title<input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Redesigned onboarding for a fintech app" /></label>
        <label>{type === "Link" ? "Link" : type === "File or image" ? "File" : "Short description"}{type === "File or image" ? <span className="drop-zone"><Upload />Drop a PDF or image, or tap to choose</span> : <input placeholder={type === "Link" ? "https://" : "What problem, your role, the result"} />}</label>
        <fieldset className="vis-picker"><legend>Who can see this?</legend>{(Object.keys(visibilityLabels) as Visibility[]).map(k => { const V = visIcon[k]; return <button key={k} type="button" aria-pressed={vis === k} className={vis === k ? "selected" : ""} onClick={() => setVis(k)}><V />{visibilityLabels[k]}</button>; })}</fieldset>
        <Button className="brand-button" onClick={add}>Publish to profile<ArrowRight /></Button>
      </> : importDone ? <div className="request-complete"><span className="preview-check"><Check /></span><h2>Ready to review</h2><p>In the live app, items from {src} arrive as private drafts. You choose what to publish. Nothing was imported in this preview.</p><Button className="brand-button" onClick={closeImport}>Done</Button></div> : src ? <>
        <span className="eyebrow">IMPORT FROM {src.toUpperCase()}</span><h2>{src === "LinkedIn export" ? "Upload your LinkedIn data file" : `Connect ${src}`}</h2>
        <p>{src === "LinkedIn export" ? "LinkedIn lets you download your data. Upload the file and we’ll pick out projects and posts — nothing else." : "We only read public items you select. Imports land as private drafts until you publish."}</p>
        {src === "LinkedIn export" ? <span className="drop-zone"><Upload />Drop the .zip file here</span> : src === "Personal website" ? <label>Page link<input placeholder="https://yoursite.com/work" /></label> : <label>Profile link or username<input placeholder={`your ${src} username`} /></label>}
        <div className="done-actions"><Button variant="outline" className="brand-button" onClick={() => setSrc(null)}>Back</Button><Button className="brand-button" onClick={() => setImportDone(true)}>Find my work<ArrowRight /></Button></div>
      </> : <>
        <span className="eyebrow">BRING WHAT YOU’VE ALREADY MADE</span><h2>Import your work</h2>
        <div className="source-grid">{importSources.map(s => <button key={s.id} className="source-card" onClick={() => setSrc(s.name)}><span className="source-mark" aria-hidden>{s.name[0]}</span><span><strong>{s.name}</strong><small>{s.kind}</small></span><ArrowRight /></button>)}</div>
        <p className="secure"><Lock />Read-only access. Imports stay private until you publish.</p>
      </>}
    </div></div>}
  </main>;
}
