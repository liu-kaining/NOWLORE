import { useEffect, useMemo, useState } from "react";
import { api, type AdminOverview, type ProjectView, type PublicStats } from "./api.js";

export function App() {
  const path = window.location.pathname;
  if (path === "/ops" || path.startsWith("/ops/")) return <Ops />;
  if (path.startsWith("/projects/")) return <ProjectPage id={decodeURIComponent(path.split("/")[2] ?? "")} />;
  return <Home />;
}

function Shell({ children, ops = false }: { children: React.ReactNode; ops?: boolean }) {
  return <div className="site-shell">
    <header className="topbar">
      <a className="brand" href="/"><span className="brand-mark">N//L</span><span>NOWLORE</span></a>
      <nav><a href="/#drops">DROPS</a><a href="/#principles">PRINCIPLES</a><a href={ops ? "/" : "/ops"}>{ops ? "PUBLIC LEDGER" : "OPS"}</a></nav>
      <div className="live-dot"><i /> ONCHAIN CULTURE</div>
    </header>
    {children}
    <footer><span>NOWLORE by ThetaMind</span><span>Mint the moment. Keep the record.</span><span>© 2026</span></footer>
  </div>;
}

function Home() {
  const [stats, setStats] = useState<PublicStats | null>(null);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    Promise.all([
      api<PublicStats>("/api/public/stats"),
      api<{ data: ProjectView[] }>("/api/public/projects?limit=12"),
    ]).then(([nextStats, result]) => { setStats(nextStats); setProjects(result.data); }).catch((reason) => setError(reason.message));
  }, []);
  return <Shell>
    <main>
      <section className="hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="eyebrow">AI-NATIVE ONCHAIN CULTURE STUDIO <span>EST. 2026</span></div>
        <h1>MINT THE<br /><em>MOMENT.</em></h1>
        <div className="hero-bottom">
          <p>把正在发生的，变成链上传说。每次发行都有来源、判断、钱包与创作者费用记录。</p>
          <a className="arrow-link" href="#drops">EXPLORE THE ARCHIVE <span>↘</span></a>
        </div>
        <Radar />
      </section>

      <section className="ticker" aria-label="Studio principles">
        <div>SHORT-CYCLE EXPERIMENTS</div><b>✦</b><div>FAIR LAUNCH</div><b>✦</b><div>PUBLIC CREATOR FEES</div><b>✦</b><div>PERMANENT RECORD</div>
      </section>

      <section className="stats-strip">
        <Stat label="CULTURE DROPS" value={String(stats?.projects ?? "—")} />
        <Stat label="CONFIRMED LAUNCHES" value={String(stats?.launched ?? "—")} />
        <Stat label="EVIDENCE SOURCES" value={String(stats?.sources ?? "—")} />
        <Stat label="CREATOR VAULT" value={`${lamportsToSol(stats?.creatorFeesLamports)} SOL`} />
      </section>

      <section className="drops" id="drops">
        <SectionHeading index="01" title="THE ARCHIVE" note="Every experiment remains on the record — including failures." />
        {error && <div className="error-box">{error}</div>}
        {projects.length === 0 && !error ? <EmptyArchive /> : <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>}
      </section>

      <section className="principles" id="principles">
        <SectionHeading index="02" title="THE COMPACT" note="Our operating agreement with the public." />
        <div className="principle-grid">
          <Principle number="01" title="Evidence before narrative">每个热点保留来源、时间与原始链接；AI 不能把猜测伪装成事实。</Principle>
          <Principle number="02" title="Culture, not promises">每个代币明确是短周期文化实验，不承诺价格、收益、流动性或长期维护。</Principle>
          <Principle number="03" title="Fair means visible">团队默认零预留、零创建者首购；钱包和 Creator Fee 长期公开。</Principle>
          <Principle number="04" title="No fake markets">不刷量、不对敲、不制造虚假社区、不做隐蔽砸盘。交易量从来不是内部成功指标。</Principle>
        </div>
      </section>

      <section className="manifesto"><span>NOW</span><p>Moments disappear.<br />Records shouldn't.</p><span>LORE</span></section>
    </main>
  </Shell>;
}

function ProjectPage({ id }: { id: string }) {
  const [project, setProject] = useState<ProjectView | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { api<ProjectView>(`/api/public/projects/${id}`).then(setProject).catch((reason) => setError(reason.message)); }, [id]);
  if (error) return <Shell><main className="page-state"><h1>NOT FOUND</h1><p>{error}</p><a href="/">← Return to archive</a></main></Shell>;
  if (!project) return <Shell><main className="page-state"><p className="blink">LOADING RECORD…</p></main></Shell>;
  const launch = project.launches?.at(-1);
  const metric = project.metrics?.at(-1);
  return <Shell>
    <main className="record-page">
      <a className="back-link" href="/">← ARCHIVE</a>
      <section className="record-hero">
        <div>
          <div className="eyebrow">NOWLORE DROP {String(project.sequence).padStart(3, "0")} · {project.status.toUpperCase()}</div>
          <h1>${project.symbol}</h1>
          <h2>{project.name}</h2>
          <p className="record-tagline">{project.tagline}</p>
        </div>
        {project.assetBundle?.posterUrl ? <img className="record-poster" src={project.assetBundle.posterUrl} alt={`${project.name} poster`} /> : <Radar />}
      </section>
      <section className="record-columns">
        <article><Label>THE CULTURAL THESIS</Label><p>{project.thesis}</p><p>{project.description}</p></article>
        <aside className="ledger-card">
          <Label>PUBLIC LEDGER</Label>
          <LedgerRow label="Network" value={project.network} />
          <LedgerRow label="Mint" value={launch?.mint ?? "Pending"} mono />
          <LedgerRow label="Creator" value={project.creatorWallet ?? "Pending"} mono />
          <LedgerRow label="Team allocation" value={project.teamAllocation} />
          <LedgerRow label="Creator initial buy" value={project.creatorInitialBuy} />
          <LedgerRow label="Creator vault" value={`${lamportsToSol(metric?.creatorVaultLamports)} SOL`} />
          <LedgerRow label="Transaction" value={launch?.transactionSignature ?? "Pending"} mono />
        </aside>
      </section>
      <section className="evidence-section">
        <SectionHeading index="03" title="EVIDENCE" note={`${project.signals?.length ?? 0} source records informed this experiment.`} />
        <div className="evidence-list">{project.signals?.map((signal) => <a key={signal.id} href={signal.url} target="_blank" rel="noreferrer"><span>{signal.sourceType}</span><strong>{signal.title}</strong><time>{formatDate(signal.publishedAt)}</time><i>↗</i></a>)}</div>
      </section>
      {project.assessment && <section className="assessment-section">
        <Label>AI ASSESSMENT · {project.assessment.providerProtocol} / {project.assessment.model}</Label>
        <p>{project.assessment.narrative}</p>
        <div className="score-row">{Object.entries(project.assessment.scores).map(([name, value]) => <div key={name}><span>{name}</span><b>{Math.round(value)}</b></div>)}</div>
      </section>}
      <section className="disclosure"><Label>DISCLOSURE</Label>{project.disclaimers.map((item) => <p key={item}>{item}</p>)}{project.riskDisclosures.map((item) => <p key={item}>— {item}</p>)}</section>
    </main>
  </Shell>;
}

function Ops() {
  const [token, setToken] = useState(() => sessionStorage.getItem("nowlore-admin") ?? "");
  const [draftToken, setDraftToken] = useState(token);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    if (!token) return;
    await api<AdminOverview>("/api/admin/overview", undefined, token).then(setOverview).catch((reason) => setMessage(reason.message));
  };
  useEffect(() => { void refresh(); }, [token]);
  const login = () => { sessionStorage.setItem("nowlore-admin", draftToken); setToken(draftToken); };
  const action = async (label: string, task: () => Promise<unknown>) => {
    setBusy(true); setMessage(`${label}…`);
    try { await task(); setMessage(`${label} complete`); await refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); } finally { setBusy(false); }
  };
  if (!token) return <Shell ops><main className="ops-login"><div><Label>PRIVATE OPERATIONS</Label><h1>ENTER ACCESS TOKEN</h1><input type="password" value={draftToken} onChange={(event) => setDraftToken(event.target.value)} placeholder="ADMIN_TOKEN" onKeyDown={(event) => event.key === "Enter" && login()} /><button onClick={login}>OPEN CONSOLE →</button></div></main></Shell>;
  return <Shell ops><main className="ops-page">
    <section className="ops-head"><div><Label>CONTROL ROOM</Label><h1>RADAR / FORGE / LAUNCH</h1></div><div className="ops-actions"><button disabled={busy} onClick={() => action("Pipeline", () => api("/api/admin/pipeline/run", { method: "POST", body: JSON.stringify({ maxTopics: 5, autoDesign: true }) }, token))}>RUN PIPELINE</button><button className="ghost" onClick={() => { sessionStorage.removeItem("nowlore-admin"); setToken(""); }}>LOCK</button></div></section>
    {message && <div className="ops-message">{message}</div>}
    <div className="ops-metrics"><Stat label="SIGNALS" value={String(overview?.signals.length ?? 0)} /><Stat label="TOPICS" value={String(overview?.topics.length ?? 0)} /><Stat label="DRAFTS" value={String(overview?.projects.length ?? 0)} /><Stat label="LAUNCHES" value={String(overview?.launches.length ?? 0)} /></div>
    <ManualSignalForm token={token} busy={busy} action={action} />
    <section className="ops-panel"><Label>TOPIC QUEUE</Label><div className="ops-table">{overview?.topics.slice(0, 12).map((topic) => <div className="ops-row" key={topic.id}><b>{topic.heuristicScore.toFixed(1)}</b><span><strong>{topic.canonicalTitle}</strong><small>{topic.sourceCount} sources · {topic.status}</small></span><button disabled={busy} onClick={() => action("Evaluate", () => api(`/api/admin/topics/${topic.id}/evaluate`, { method: "POST" }, token))}>EVALUATE</button><button disabled={busy || topic.status !== "evaluated"} onClick={() => action("Design", () => api(`/api/admin/topics/${topic.id}/design`, { method: "POST" }, token))}>DESIGN</button></div>) ?? <p>No topics yet.</p>}</div></section>
    <section className="ops-panel"><Label>PROJECT WORKFLOW</Label><div className="ops-projects">{overview?.projects.map((project) => <OpsProject key={project.id} project={project} token={token} busy={busy} action={action} />) ?? <p>No project drafts yet.</p>}</div></section>
    <section className="ops-panel"><Label>RECENT RUNS</Label><div className="run-list">{overview?.runs.slice(0, 10).map((run) => <div key={run.id}><span>{run.kind}</span><b className={`status-${run.status}`}>{run.status}</b><time>{formatDate(run.startedAt)}</time><code>{JSON.stringify(run.counters)}</code></div>)}</div></section>
  </main></Shell>;
}

function OpsProject({ project, token, busy, action }: { project: ProjectView; token: string; busy: boolean; action: (label: string, task: () => Promise<unknown>) => void }) {
  const [approvalChecked, setApprovalChecked] = useState(false);
  const next = useMemo(() => {
    if (project.status === "draft") return { label: "REVIEW", path: "review", body: undefined };
    if (project.status === "reviewed") return { label: "APPROVE", path: "approve", body: { expectedContentHash: project.contentHash, reason: "Evidence, disclosure and fair-launch fields reviewed." } };
    if (project.status === "approved") return { label: "PUBLISH ASSETS", path: "assets", body: undefined };
    if (project.status === "assets_published" || project.status === "failed") return { label: "SIMULATE", path: "simulate", body: undefined };
    if (project.status === "simulated") return { label: "LAUNCH", path: "launch", body: undefined, idempotency: crypto.randomUUID() };
    return null;
  }, [project]);
  const approvalRequired = next?.path === "approve";
  return <article className="ops-project"><div><span>DROP {String(project.sequence).padStart(3, "0")}</span><h3>${project.symbol} · {project.name}</h3><p>{project.tagline}</p><details className="ops-evidence"><summary>REVIEW EVIDENCE & RISKS</summary><p>{project.thesis}</p>{project.riskDisclosures.map((risk) => <p key={risk} className="ops-risk">— {risk}</p>)}{project.signals?.map((signal) => <a key={signal.id} href={signal.url} target="_blank" rel="noreferrer">↗ {signal.source}: {signal.title}</a>)}</details></div><div className="ops-project-meta"><b>{project.status}</b><code title={project.contentHash}>{project.contentHash.slice(0, 12)}</code>{approvalRequired && <label className="approval-check"><input type="checkbox" checked={approvalChecked} onChange={(event) => setApprovalChecked(event.target.checked)} />I reviewed the evidence, risks and content hash.</label>}{next && <button disabled={busy || (approvalRequired && !approvalChecked)} onClick={() => action(next.label, () => api(`/api/admin/projects/${project.id}/${next.path}`, { method: "POST", headers: next.idempotency ? { "Idempotency-Key": next.idempotency } : {}, ...(next.body ? { body: JSON.stringify(next.body) } : {}) }, token))}>{next.label} →</button>}</div></article>;
}

function ManualSignalForm({ token, busy, action }: { token: string; busy: boolean; action: (label: string, task: () => Promise<unknown>) => void }) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [summary, setSummary] = useState("");
  const submit = () => action("Manual signal", async () => {
    await api("/api/admin/signals", { method: "POST", body: JSON.stringify({ title, url, summary, tags: [] }) }, token);
    setTitle(""); setUrl(""); setSummary("");
  });
  return <section className="ops-panel"><Label>MANUAL SIGNAL</Label><div className="manual-signal"><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Signal title" maxLength={500} /><input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://source.example/story" type="url" /><textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Evidence summary (optional)" maxLength={4000} /><button disabled={busy || !title.trim() || !url.trim()} onClick={submit}>ADD TO RADAR →</button></div></section>;
}

function Radar() { return <div className="radar" aria-hidden="true"><span /><span /><span /><i /></div>; }
function Stat({ label, value }: { label: string; value: string }) { return <div className="stat"><span>{label}</span><b>{value}</b></div>; }
function Label({ children }: { children: React.ReactNode }) { return <div className="label">{children}</div>; }
function SectionHeading({ index, title, note }: { index: string; title: string; note: string }) { return <div className="section-heading"><span>{index}</span><h2>{title}</h2><p>{note}</p></div>; }
function Principle({ number, title, children }: { number: string; title: string; children: React.ReactNode }) { return <article><span>{number}</span><h3>{title}</h3><p>{children}</p></article>; }
function LedgerRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="ledger-row"><span>{label}</span><b className={mono ? "mono truncate" : ""} title={value}>{value}</b></div>; }
function EmptyArchive() { return <div className="empty-archive"><Radar /><div><h3>THE RADAR IS LISTENING.</h3><p>No public culture drops yet. Drafts and rejected experiments remain private until a launch is confirmed.</p></div></div>; }
function ProjectCard({ project }: { project: ProjectView }) { return <a className="project-card" href={`/projects/${project.slug}`}><div className="card-image">{project.assetBundle?.posterUrl ? <img src={project.assetBundle.posterUrl} alt="" /> : <Radar />}<span>DROP {String(project.sequence).padStart(3, "0")}</span></div><div className="card-copy"><div><b>${project.symbol}</b><small>{project.status}</small></div><h3>{project.name}</h3><p>{project.tagline}</p><time>{formatDate(project.publishedAt ?? project.experimentStartsAt)}</time></div></a>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
function lamportsToSol(value?: string) { if (!value) return "0.000"; return (Number(value) / 1_000_000_000).toFixed(3); }
