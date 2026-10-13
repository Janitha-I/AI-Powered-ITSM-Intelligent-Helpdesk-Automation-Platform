import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bot, Boxes, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, Command, FileText, Gauge, Headphones, LifeBuoy,
  ListFilter, MessageCircle, Network, Plus, Search, Send, Settings2, ShieldCheck,
  Sparkles, Ticket, WandSparkles, Wifi, X
} from 'lucide-react';
import './style.css';

const API = 'http://localhost:8000/api';
const navItems = [
  { id: 'overview', label: 'Overview', icon: Gauge },
  { id: 'tickets', label: 'Tickets', icon: Ticket, count: '12' },
  { id: 'self-service', label: 'Self-service', icon: MessageCircle },
  { id: 'knowledge', label: 'Knowledge base', icon: FileText },
  { id: 'automations', label: 'Automations', icon: WandSparkles },
  { id: 'software', label: 'Software access', icon: Boxes },
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || 'The request could not be completed.');
  return data;
}

function App() {
  const [page, setPage] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [health, setHealth] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [intake, setIntake] = useState(null);
  const [software, setSoftware] = useState('');
  const [justification, setJustification] = useState('');
  const [ticketFilter, setTicketFilter] = useState('All tickets');

  async function refresh() {
    try {
      const [overview, status] = await Promise.all([api('/dashboard'), api('/health')]);
      setDashboard(overview);
      setHealth(status);
    } catch {
      setHealth({ status: 'offline', database: 'API unavailable', ai: 'Unavailable', servicenow: 'mock' });
    }
  }

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (page === 'knowledge' && !searchResults) {
      api('/knowledge').then(setSearchResults).catch((error) => setNotice(error.message));
    }
  }, [page, searchResults]);

  async function submitChat(event) {
    event?.preventDefault();
    const message = chatInput.trim();
    if (!message || busy) return;
    setBusy(true);
    setChatMessages((items) => [...items, { role: 'user', text: message }]);
    setChatInput('');
    try {
      const result = await api('/chat', { method: 'POST', body: JSON.stringify({ message }) });
      setChatMessages((items) => [...items, { role: 'assistant', text: result.answer, sources: result.sources, confidence: result.confidence, model: result.model }]);
    } catch (error) {
      setChatMessages((items) => [...items, { role: 'assistant', text: error.message }]);
    } finally { setBusy(false); }
  }

  async function submitIntake(event) {
    event.preventDefault();
    const message = query.trim();
    if (!message || busy) return;
    setBusy(true);
    try {
      const result = await api('/intake', { method: 'POST', body: JSON.stringify({ message }) });
      setIntake(result);
      setNotice(`Ticket ${result.ticket.id} created and routed to ${result.ticket.assigned_to}.`);
      setQuery('');
      refresh();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function runAutomation(action) {
    setBusy(true);
    try {
      const result = await api(`/automation/${action}`, { method: 'POST', body: JSON.stringify({ message: action, requester: 'Alex Morgan' }) });
      setNotice(result.result);
      refresh();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function searchKnowledge(event) {
    event?.preventDefault();
    setBusy(true);
    try { setSearchResults(await api(`/knowledge?query=${encodeURIComponent(query)}`)); }
    catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  async function submitSoftware(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await api('/provision', { method: 'POST', body: JSON.stringify({ software, justification }) });
      setNotice(`${result.request.id} created for ${software}. ${result.request.servicenow}.`);
      setSoftware(''); setJustification(''); refresh();
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  }

  const openPage = (id) => { setPage(id); setNotice(''); };
  const tickets = dashboard?.tickets || [];

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); openPage('overview'); }}>
        <span className="brand-mark"><Command size={19} strokeWidth={2.5} /></span>
        <span className="brand-name">SORIM<span>.Ai</span><small>service operations</small></span>
      </a>
      <div className="workspace-picker"><span className="workspace-icon">N</span><span><b>Northstar Group</b><small>IT Operations</small></span><ChevronDown size={15} /></div>
      <div className="nav-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Primary navigation">
        {navItems.map(({ id, label, icon: Icon, count }) => <button key={id} className={`nav-item ${page === id ? 'active' : ''}`} onClick={() => openPage(id)}>
          <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{count && <small>{count}</small>}
        </button>)}
      </nav>
      <div className="nav-label tools-label">INSIGHTS</div>
      <button className={`nav-item ${page === 'analysis' ? 'active' : ''}`} onClick={() => openPage('analysis')}><Activity size={17} strokeWidth={1.8} /><span>AI analysis</span></button>
      <div className="sidebar-spacer" />
      <div className="sidebar-status"><span className={`status-dot ${health?.status === 'ok' ? 'online' : ''}`} /><span>{health?.status === 'ok' ? 'All systems operational' : 'Connecting to API'}</span><button title="Refresh status" onClick={refresh}><Activity size={14} /></button></div>
      <button className="profile-row"><span className="avatar">AM</span><span><b>Alex Morgan</b><small>IT administrator</small></span><Settings2 size={16} /></button>
    </aside>

    <main className="main-area">
      <header className="topbar">
        <div className="crumb"><span>Northstar Group</span><span className="crumb-slash">/</span><b>{navItems.find((item) => item.id === page)?.label || 'AI analysis'}</b></div>
        <div className="top-actions"><span className={`connection-pill ${health?.status === 'ok' ? 'connected' : ''}`}><span /> {health?.status === 'ok' ? 'API connected' : 'API offline'}</span><button className="icon-button" aria-label="Help"><CircleHelp size={18} /></button><span className="avatar top-avatar">AM</span></div>
      </header>
      <div className="page-content">
        {notice && <div className="notice" role="status"><CheckCircle2 size={17} /><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {page === 'overview' && <Overview dashboard={dashboard} health={health} tickets={tickets} onNavigate={openPage} onAsk={() => openPage('self-service')} />}
        {page === 'tickets' && <Tickets tickets={tickets} filter={ticketFilter} setFilter={setTicketFilter} />}
        {page === 'self-service' && <SelfService messages={chatMessages} input={chatInput} setInput={setChatInput} onSubmit={submitChat} busy={busy} onCreateTicket={() => openPage('analysis')} />}
        {page === 'knowledge' && <Knowledge query={query} setQuery={setQuery} results={searchResults} onSearch={searchKnowledge} busy={busy} />}
        {page === 'automations' && <Automations onRun={runAutomation} busy={busy} />}
        {page === 'software' && <SoftwareRequest software={software} setSoftware={setSoftware} justification={justification} setJustification={setJustification} onSubmit={submitSoftware} busy={busy} tickets={tickets.filter((ticket) => ticket.category === 'Software / Access')} />}
        {page === 'analysis' && <Analysis query={query} setQuery={setQuery} result={intake} onSubmit={submitIntake} busy={busy} />}
      </div>
    </main>
  </div>;
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Overview({ dashboard, health, tickets, onNavigate, onAsk }) {
  const metrics = dashboard?.metrics || { open_tickets: '—', resolved_today: '—', automation_rate: '—', avg_resolution: '—' };
  const metricCards = [
    { label: 'Open tickets', value: metrics.open_tickets, delta: 'Needs attention', icon: Ticket, tone: 'blue' },
    { label: 'Resolved today', value: metrics.resolved_today, delta: '+12% vs. yesterday', icon: CheckCircle2, tone: 'green' },
    { label: 'Automated', value: `${metrics.automation_rate}%`, delta: '+6% this month', icon: Sparkles, tone: 'orange' },
    { label: 'Avg. resolution', value: metrics.avg_resolution, delta: '−4 min this week', icon: Clock3, tone: 'violet' },
  ];
  return <>
    <PageHeading eyebrow={new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()} title="Good morning, Alex" subtitle="Here’s what’s happening across your service desk today." action={<button className="button button-primary" onClick={() => onNavigate('analysis')}><Plus size={16} /> New ticket</button>} />
    <div className="integration-strip"><div className="integration-title"><span className="integration-pulse" /> INTEGRATIONS</div><Integration name="MongoDB Atlas" value={health?.database || 'Checking'} /><Integration name="AI assistant" value={health?.ai || 'Checking'} /><Integration name="ServiceNow" value={health?.servicenow || 'Checking'} /></div>
    <div className="metric-grid">{metricCards.map(({ label, value, delta, icon: Icon, tone }) => <div className="metric-card" key={label}><div className="metric-top"><span>{label}</span><span className={`metric-icon ${tone}`}><Icon size={16} /></span></div><div className="metric-value">{value}</div><div className="metric-delta">{delta.includes('+') ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{delta}</div></div>)}</div>
    <div className="section-title-row"><div><h2>Service desk</h2><span>Live overview of your team's queue</span></div><button className="text-button" onClick={() => onNavigate('tickets')}>View all tickets <ArrowRight size={15} /></button></div>
    <div className="overview-grid">
      <section className="table-panel"><div className="panel-toolbar"><div><b>Recent tickets</b><span className="subtle-count">{tickets.length} active records</span></div><button className="filter-button" onClick={() => onNavigate('tickets')}><ListFilter size={15} /> Filter</button></div><TicketTable tickets={tickets.slice(0, 5)} compact /></section>
      <aside className="right-rail"><div className="assistant-panel"><div className="assistant-head"><div className="assistant-icon"><Bot size={17} /></div><div><b>Ask SORIM.Ai</b><small>Knowledge-backed answers</small></div><span className="live-dot" /></div><p>Resolve an issue or find an approved answer, with sources attached.</p><button className="assistant-cta" onClick={onAsk}>Ask a question <ArrowRight size={15} /></button></div>
        <div className="activity-panel"><div className="panel-toolbar"><b>Recent activity</b><button className="quiet-button" title="Activity"><Activity size={15} /></button></div>{(dashboard?.activity || []).slice(0, 4).map((item, index) => <div className="activity-item" key={`${item.label}-${index}`}><span className={`activity-mark ${item.kind}`}><Check size={12} /></span><div><b>{item.label}</b><small>{item.detail}</small></div><time>{item.time}</time></div>)}</div>
      </aside>
    </div>
    <div className="section-title-row capability-heading"><div><h2>Helpdesk workflows</h2><span>AI-assisted, with human approval where it matters</span></div></div>
    <div className="workflow-grid">
      <Workflow icon={Ticket} number="01" title="Intelligent intake" text="Classify, prioritize and route incoming issues." color="blue" onClick={() => onNavigate('analysis')} />
      <Workflow icon={WandSparkles} number="02" title="Self-heal" text="Run safe fixes and record every action." color="orange" onClick={() => onNavigate('automations')} />
      <Workflow icon={FileText} number="03" title="Knowledge RAG" text="Search approved guidance with source citations." color="green" onClick={() => onNavigate('knowledge')} />
      <Workflow icon={MessageCircle} number="04" title="Self-service" text="Give employees a grounded AI helpdesk." color="violet" onClick={() => onNavigate('self-service')} />
      <Workflow icon={Boxes} number="05" title="Provisioning" text="Request catalog software through ITSM." color="blue" onClick={() => onNavigate('software')} />
    </div>
  </>;
}

function Integration({ name, value }) {
  const good = ['MongoDB Atlas', 'Hugging Face', 'ServiceNow', 'connected'].some((word) => value?.toLowerCase().includes(word.toLowerCase()));
  return <div className="integration-item"><span className={`integration-check ${good ? '' : 'mock'}`}>{good ? <Check size={11} /> : <span />}</span><span>{name}</span><b>{value}</b></div>;
}

function Workflow({ icon: Icon, number, title, text, color, onClick }) {
  return <button className="workflow-item" onClick={onClick}><span className={`workflow-icon ${color}`}><Icon size={17} /></span><span className="workflow-copy"><span className="workflow-number">{number} / WORKFLOW</span><b>{title}</b><small>{text}</small></span><ArrowRight className="workflow-arrow" size={16} /></button>;
}

function TicketTable({ tickets, compact = false }) {
  if (!tickets.length) return <div className="empty-state">No tickets to show yet.</div>;
  return <div className={`table-scroll ${compact ? 'compact' : ''}`}><table><thead><tr><th>Ticket</th><th>Requester</th><th>Category</th><th>Priority</th><th>Status</th><th>Assigned to</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td><b className="ticket-id">{ticket.id}</b><span className="ticket-title">{ticket.title}</span></td><td>{ticket.requester}</td><td>{ticket.category}</td><td><span className={`priority ${ticket.priority.toLowerCase()}`}><i />{ticket.priority}</span></td><td><span className={`status-tag ${ticket.status.toLowerCase().replaceAll(' ', '-')}`}>{ticket.status}</span></td><td>{ticket.assigned_to}</td></tr>)}</tbody></table></div>;
}

function Tickets({ tickets, filter, setFilter }) {
  const visible = filter === 'All tickets' ? tickets : tickets.filter((ticket) => filter === 'Open' ? !['Resolved', 'Closed'].includes(ticket.status) : ticket.status === filter);
  return <><PageHeading eyebrow="SERVICE DESK" title="Tickets" subtitle="Track incidents and requests from intake through resolution." action={<button className="button button-primary" onClick={() => window.dispatchEvent(new CustomEvent('navigate-analysis'))}><Plus size={16} /> New ticket</button>} /><div className="filter-tabs">{['All tickets', 'Open', 'Resolved', 'Provisioning'].map((item) => <button className={filter === item ? 'selected' : ''} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div><section className="table-panel full-table"><div className="panel-toolbar"><div><b>Ticket queue</b><span className="subtle-count">{visible.length} records</span></div><button className="filter-button"><ListFilter size={15} /> Sort: newest</button></div><TicketTable tickets={visible} /></section></>;
}

function SelfService({ messages, input, setInput, onSubmit, busy, onCreateTicket }) {
  return <><PageHeading eyebrow="EMPLOYEE PORTAL" title="How can we help?" subtitle="Ask a question, get an approved answer, or raise a ticket." /><div className="selfservice-layout"><section className="chat-panel"><div className="chat-top"><div className="assistant-icon"><Bot size={18} /></div><div><b>Sora IT assistant</b><small><span className="live-dot" /> Answers grounded in the IT knowledge base</small></div><button className="quiet-button" title="Start new conversation" onClick={() => window.location.reload()}><Plus size={17} /></button></div><div className="chat-stream">{messages.length === 0 && <div className="chat-welcome"><span className="welcome-spark"><Sparkles size={20} /></span><h2>Hi Alex, what’s going on?</h2><p>I’ll look through approved IT guidance and show you where the answer came from.</p><div className="suggestion-row">{['My VPN keeps disconnecting', 'How do I reset my password?', 'I need Visual Studio Code'].map((suggestion) => <button key={suggestion} onClick={() => setInput(suggestion)}>{suggestion}<ArrowRight size={13} /></button>)}</div></div>}{messages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${index}`}><span className="message-avatar">{message.role === 'assistant' ? <Bot size={15} /> : 'AM'}</span><div className="message-body"><div className="message-text">{message.text}</div>{message.sources?.length > 0 && <div className="source-list"><span>KNOWLEDGE SOURCES</span>{message.sources.map((source) => <div className="source-chip" key={source.id}><FileText size={13} /><span>{source.id} · {source.title}</span><b>{Math.round(source.score * 100)}%</b></div>)}<small>{message.model} · Confidence {Math.round((message.confidence || 0) * 100)}%</small></div>}</div></div>)}{busy && <div className="typing"><span /><span /><span /> Searching approved knowledge</div>}</div><form className="chat-composer" onSubmit={onSubmit}><textarea aria-label="Ask the IT assistant" placeholder="Describe what you need help with..." value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onSubmit(event); } }} /><div><span><ShieldCheck size={14} /> No passwords or MFA codes, please</span><button className="send-button" aria-label="Send message" disabled={busy || !input.trim()}><Send size={16} /></button></div></form></section><aside className="service-aside"><div className="aside-block"><span className="eyebrow">NEED A HUMAN?</span><h3>Still stuck?</h3><p>Send the issue to the right support team with AI-generated context already attached.</p><button className="button button-outline" onClick={onCreateTicket}><Plus size={15} /> Create a ticket</button></div><div className="aside-block trust-block"><ShieldCheck size={19} /><b>Answers stay grounded</b><p>If approved guidance doesn’t cover it, Sora will say so and recommend escalation.</p></div></aside></div></>;
}

function Knowledge({ query, setQuery, results, onSearch, busy }) {
  return <><PageHeading eyebrow="KNOWLEDGE MANAGEMENT" title="Knowledge base" subtitle="Find approved support guidance. Results are ranked by relevance." /><form className="knowledge-search" onSubmit={onSearch}><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search VPN, Outlook, passwords..." /><button className="button button-primary" disabled={busy}><Search size={15} /> Search</button></form><div className="knowledge-heading"><b>{results ? `${results.length} relevant articles` : 'Featured articles'}</b><span>Grounded answers only</span></div><div className="knowledge-grid">{(results || []).map((article) => <article className="knowledge-card" key={article.id}><div className="knowledge-meta"><span>{article.category}</span><b>{article.id}</b></div><h3>{article.title}</h3><p>{article.content}</p><div className="knowledge-foot"><span><FileText size={14} /> Approved knowledge</span>{article.score != null && <b>{Math.round(article.score * 100)}% match</b>}</div></article>)}</div>{results?.length === 0 && <div className="empty-state">No matching approved articles. Try broader terms or create a ticket for the Service Desk.</div>}</>;
}

function Automations({ onRun, busy }) {
  const tasks = [
    { id: 'password-reset', icon: ShieldCheck, name: 'Password reset', type: 'IDENTITY', description: 'Guide a user through the approved password reset flow. Identity verification remains required.', action: 'Start reset flow', safety: 'Human verification required' },
    { id: 'account-unlock', icon: CheckCircle2, name: 'Account unlock', type: 'IDENTITY', description: 'Queue an account unlock after the user completes the approved identity check.', action: 'Queue unlock', safety: 'Human verification required' },
    { id: 'vpn-check', icon: Wifi, name: 'VPN diagnostics', type: 'NETWORK', description: 'Record basic profile, device-time and connectivity checks without collecting credentials.', action: 'Run diagnostics', safety: 'Read-only checks' },
    { id: 'restart-app', icon: Network, name: 'Application restart', type: 'ENDPOINT', description: 'Send a safe restart instruction and capture the action in the audit log.', action: 'Send restart steps', safety: 'User initiated' },
  ];
  return <><PageHeading eyebrow="AUTOMATION CENTER" title="Safe fixes, clear audit" subtitle="Run approved first-line actions. Sensitive account changes stay behind identity verification." /><div className="safety-banner"><ShieldCheck size={18} /><div><b>Guardrails are on</b><span>Every action is logged. Passwords and MFA codes are never requested.</span></div><span className="guardrail-pill"><span /> ACTIVE</span></div><div className="automation-grid">{tasks.map(({ id, icon: Icon, name, type, description, action, safety }) => <article className="automation-card" key={id}><div className="automation-card-top"><span className="automation-icon"><Icon size={19} /></span><span className="eyebrow">{type}</span></div><h3>{name}</h3><p>{description}</p><div className="automation-safety"><ShieldCheck size={14} />{safety}</div><button className="button button-outline" disabled={busy} onClick={() => onRun(id)}>{action}<ArrowRight size={15} /></button></article>)}</div><div className="section-title-row log-title"><div><h2>Automation audit trail</h2><span>Recent actions are visible in the overview activity feed.</span></div></div><div className="audit-note"><Activity size={17} /><span>Each run creates an audit record with the action, requester and result. Production deployments should additionally enforce role-based approval and identity verification.</span></div></>;
}

function SoftwareRequest({ software, setSoftware, justification, setJustification, onSubmit, busy, tickets }) {
  return <><PageHeading eyebrow="SOFTWARE CATALOG" title="Request software" subtitle="Submit an access request for an approved application. Provisioning status is tracked in the service desk." /><div className="provision-layout"><form className="request-form" onSubmit={onSubmit}><div className="form-heading"><span className="software-icon"><Boxes size={20} /></span><div><h2>New software request</h2><p>Requests enter the approval and provisioning queue.</p></div></div><label>Software title<input required minLength="2" value={software} onChange={(event) => setSoftware(event.target.value)} placeholder="e.g. Visual Studio Code" /></label><label>Business justification<textarea value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="What will this software be used for?" rows="3" /></label><div className="request-info"><ShieldCheck size={16} /><span>Approved catalog items may require manager approval before deployment.</span></div><button className="button button-primary" disabled={busy || software.trim().length < 2}><Plus size={15} /> Submit request</button></form><aside className="provision-aside"><div className="eyebrow">REQUEST FLOW</div><div className="flow-step current"><span>1</span><div><b>Request submitted</b><small>AI identifies the software request</small></div></div><div className="flow-step"><span>2</span><div><b>Approval review</b><small>Route to the appropriate approver</small></div></div><div className="flow-step"><span>3</span><div><b>Provisioning</b><small>Update status when fulfilled</small></div></div><div className="integration-callout"><Boxes size={17} /><span>ITSM integration</span><b>ServiceNow</b></div></aside></div><div className="section-title-row capability-heading"><div><h2>Recent requests</h2><span>{tickets.length} software requests</span></div></div><section className="table-panel full-table"><TicketTable tickets={tickets} /></section></>;
}

function Analysis({ query, setQuery, result, onSubmit, busy }) {
  return <><PageHeading eyebrow="INTELLIGENT TICKET INTAKE" title="Understand. Route. Resolve." subtitle="Describe the issue in plain language. Sora classifies the request, searches knowledge and creates a ticket." /><div className="analysis-layout"><section className="intake-panel"><div className="intake-panel-heading"><span className="assistant-icon"><Sparkles size={17} /></span><div><b>AI ticket intake</b><small>Classification · priority · assignment</small></div><span className="ai-badge">AI ASSISTED</span></div><form onSubmit={onSubmit}><label htmlFor="issue-description">What does the employee need help with?</label><textarea id="issue-description" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Example: I cannot connect to VPN since this morning. Authentication keeps failing." rows="5" minLength="3" required /><div className="intake-hint"><ShieldCheck size={14} /> Avoid entering passwords, MFA codes or sensitive personal data.</div><button className="button button-primary" disabled={busy || query.trim().length < 3}><Sparkles size={15} /> Analyze & create ticket</button></form></section><aside className="intake-side"><span className="eyebrow">INTAKE PIPELINE</span><div className="pipeline-step"><span className="pipeline-dot done"><Check size={11} /></span><div><b>Detect intent</b><small>Incident, request or automation</small></div></div><div className="pipeline-line" /><div className="pipeline-step"><span className="pipeline-dot done"><Search size={11} /></span><div><b>Retrieve guidance</b><small>Relevant approved knowledge</small></div></div><div className="pipeline-line" /><div className="pipeline-step"><span className="pipeline-dot"><Ticket size={11} /></span><div><b>Route to ITSM</b><small>Ticket, priority and assignment</small></div></div></aside></div>{result && <section className="result-panel"><div className="result-heading"><CheckCircle2 size={19} /><div><b>Ticket created</b><small>{result.ticket.id} · {result.model}</small></div><span className="status-tag open">Open</span></div><div className="analysis-details"><div><span>INTENT</span><b>{result.classification.intent}</b></div><div><span>CATEGORY</span><b>{result.classification.category}</b></div><div><span>PRIORITY</span><b>{result.classification.priority} · {result.classification.urgency}</b></div><div><span>ASSIGNED TO</span><b>{result.classification.assignment_group}</b></div></div><div className="result-answer"><Sparkles size={15} /><p>{result.answer}</p></div>{result.sources?.length > 0 && <div className="result-sources">Sources: {result.sources.map((source) => `${source.id} ${source.title}`).join(' · ')}</div>}</section>}</>;
}

function AppRoot() {
  const [route, setRoute] = useState(0);
  useEffect(() => {
    const listener = () => setRoute((value) => value + 1);
    window.addEventListener('navigate-analysis', listener);
    return () => window.removeEventListener('navigate-analysis', listener);
  }, []);
  return <App key={route} />;
}

createRoot(document.getElementById('root')).render(<AppRoot />);
