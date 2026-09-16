import { useMemo, useState } from 'react'
import { BarChart3, Download, Eye, EyeOff, Image as ImageIcon, Lock, Play, Square } from 'lucide-react'
import { projectImageUrl } from './lib/projectStore.js'

const fmtDate = (value) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'

function csvCell(value='') {
  const text = String(value ?? '')
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text
}

function uniqueVoters(poll) {
  const set = new Set()
  ;(poll.options || []).forEach((option) => (option.votes || []).forEach((email) => set.add(String(email).toLowerCase())))
  return set.size
}

function exportPoll(poll) {
  const voters = uniqueVoters(poll)
  const rows = [['Umfrage','Status','Option','Stimmen','Prozent','Teilnehmende insgesamt']]
  ;(poll.options || []).forEach((option) => {
    const count = (option.votes || []).length
    rows.push([poll.title, poll.status === 'open' ? 'offen' : 'beendet', option.label, count, voters ? Math.round((count / voters) * 100) : 0, voters])
  })
  const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wekib-umfrage-${String(poll.title || 'auswertung').toLowerCase().replace(/[^a-z0-9äöüß]+/gi,'-').replace(/^-|-$/g,'') || 'auswertung'}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function MemberPollAdmin({ project, mutate, setToast }) {
  const polls = useMemo(() => (project.polls || []).filter((poll) => (poll.scope || 'foundation') === 'member'), [project.polls])
  const [expanded, setExpanded] = useState(polls[0]?.id || null)

  const patch = (id, recipe, message='Umfrage aktualisiert') => {
    mutate((p) => {
      const poll = (p.polls || []).find((item) => item.id === id)
      if (poll) recipe(poll)
    })
    setToast?.(message)
  }

  return <section className="member-poll-admin">
    <div className="card member-poll-admin-intro">
      <div><p className="eyebrow">REGISTRIERTER BEREICH</p><h3>Umfragen & Auswertung</h3><p>Mitgliederumfragen verwalten, Ergebnisse aggregiert auswerten und anonymisiert exportieren.</p></div>
      <div className="member-poll-admin-metric"><BarChart3 size={19}/><strong>{polls.length}</strong><span>Umfragen</span></div>
    </div>

    {polls.length ? <div className="member-poll-admin-list">{polls.map((poll) => {
      const voters = uniqueVoters(poll)
      const open = expanded === poll.id
      const visibility = poll.resultsVisibility || 'after-vote'
      return <article className="card member-poll-admin-card" key={poll.id}>
        <button className="member-poll-admin-head" onClick={() => setExpanded(open ? null : poll.id)}>
          <div><span className={`status-pill ${poll.status}`}>{poll.status === 'open' ? 'offen' : 'beendet'}</span><strong>{poll.title}</strong><small>{poll.closes ? `bis ${fmtDate(poll.closes)}` : 'ohne Enddatum'} · {voters} {voters === 1 ? 'Teilnahme' : 'Teilnahmen'}</small></div>
          <span>{open ? 'Schließen' : 'Auswerten'}</span>
        </button>
        {open && <div className="member-poll-admin-body">
          <div className="member-poll-admin-toolbar">
            <button className="secondary-btn" onClick={() => patch(poll.id, (p) => { p.status = p.status === 'open' ? 'closed' : 'open' }, poll.status === 'open' ? 'Umfrage beendet' : 'Umfrage wieder geöffnet')}>{poll.status === 'open' ? <><Square size={14}/> Beenden</> : <><Play size={14}/> Wieder öffnen</>}</button>
            <label>Ergebnisse für Mitglieder<select value={visibility} onChange={(e) => patch(poll.id, (p) => { p.resultsVisibility = e.target.value }, 'Ergebnis-Sichtbarkeit aktualisiert')}><option value="always">immer anzeigen</option><option value="after-vote">nach eigener Abstimmung</option><option value="after-close">erst nach Ende</option></select></label>
            <button className="secondary-btn" onClick={() => exportPoll(poll)}><Download size={14}/> CSV exportieren</button>
          </div>
          <div className="member-poll-results">
            {(poll.options || []).map((option) => {
              const count = (option.votes || []).length
              const percent = voters ? Math.round((count / voters) * 100) : 0
              const src = option.imageId ? projectImageUrl(option.imageId) : option.imageDataUrl || ''
              return <div className="member-poll-result" key={option.id}>
                {src ? <img src={src} alt={option.label || ''}/> : <div className="member-poll-result-placeholder"><ImageIcon size={18}/></div>}
                <div><strong>{option.label}</strong><span>{count} {count === 1 ? 'Stimme' : 'Stimmen'} · {percent}%</span><i><b style={{width:`${percent}%`}}/></i></div>
              </div>
            })}
          </div>
          <div className="member-poll-privacy"><Lock size={14}/><span>Die Auswertung ist aggregiert. Einzelne Namen oder E-Mail-Adressen werden hier nicht angezeigt.</span></div>
        </div>}
      </article>
    })}</div> : <div className="card member-poll-empty"><EyeOff size={20}/><strong>Noch keine Mitgliederumfrage</strong><span>Lege im Reiter „Inhalte & Umfragen“ die erste Abstimmung an.</span></div>}
  </section>
}
