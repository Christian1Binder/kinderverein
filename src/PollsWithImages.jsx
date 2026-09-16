import { useEffect, useState } from 'react'
import { Check, Clock3, Image as ImageIcon, Plus, Trash2, Upload, Users } from 'lucide-react'
import { cloudEnabled, projectImageUrl, uploadProjectFile } from './lib/projectStore.js'
import './polls.css'

const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const fmtDate = (value) => value ? new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'

const emptyOption = (label = '') => ({ localId: uid('draft-opt'), label, file: null, preview: '' })

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Bild konnte nicht gelesen werden.'))
    reader.readAsDataURL(file)
  })
}

function optionImageSrc(option) {
  if (option.imageDataUrl) return option.imageDataUrl
  if (option.imageId) return projectImageUrl(option.imageId)
  return ''
}

export default function PollsWithImages({ project, user, mutate, setToast, canCreate = true, scope = 'foundation', uploadScope = 'foundation', embedded = false, heading = 'Umfragen', intro = 'Text oder Bild: Varianten direkt miteinander vergleichen und transparent abstimmen.' }) {
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [closes, setCloses] = useState('')
  const [multiple, setMultiple] = useState(false)
  const [options, setOptions] = useState(() => [emptyOption('Ja'), emptyOption('Nein')])

  useEffect(() => () => options.forEach((option) => option.preview && URL.revokeObjectURL(option.preview)), [])

  const reset = () => {
    options.forEach((option) => option.preview && URL.revokeObjectURL(option.preview))
    setTitle('')
    setDescription('')
    setCloses('')
    setMultiple(false)
    setOptions([emptyOption('Ja'), emptyOption('Nein')])
    setShowNew(false)
  }

  const patchOption = (localId, patch) => setOptions((current) => current.map((option) => option.localId === localId ? { ...option, ...patch } : option))

  const chooseImage = (localId, file) => {
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
      setToast?.('Bitte JPG, PNG oder WebP verwenden.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setToast?.('Bilder dürfen maximal 12 MB groß sein.')
      return
    }
    setOptions((current) => current.map((option) => {
      if (option.localId !== localId) return option
      if (option.preview) URL.revokeObjectURL(option.preview)
      return { ...option, file, preview: URL.createObjectURL(file) }
    }))
  }

  const removeDraftImage = (localId) => setOptions((current) => current.map((option) => {
    if (option.localId !== localId) return option
    if (option.preview) URL.revokeObjectURL(option.preview)
    return { ...option, file: null, preview: '' }
  }))

  const removeOption = (localId) => {
    if (options.length <= 2) return
    const removed = options.find((option) => option.localId === localId)
    if (removed?.preview) URL.revokeObjectURL(removed.preview)
    setOptions((current) => current.filter((option) => option.localId !== localId))
  }

  const create = async (event) => {
    event.preventDefault()
    const clean = options.map((option) => ({ ...option, label: option.label.trim() })).filter((option) => option.label)
    if (!title.trim()) return setToast?.('Bitte einen Titel für die Umfrage eingeben.')
    if (clean.length < 2) return setToast?.('Eine Umfrage braucht mindestens zwei Antwortoptionen.')

    setBusy(true)
    try {
      const uploaded = []
      for (const option of clean) {
        let imageMeta = {}
        if (option.file) {
          if (cloudEnabled) {
            const meta = await uploadProjectFile(option.file, uploadScope)
            imageMeta = { imageId: meta.id, imageName: meta.name, imageMime: meta.mime }
          } else {
            imageMeta = { imageDataUrl: await fileToDataUrl(option.file), imageName: option.file.name, imageMime: option.file.type }
          }
        }
        uploaded.push({ id: uid('opt'), label: option.label, votes: [], ...imageMeta })
      }

      mutate((p) => p.polls.unshift({
        id: uid('poll'),
        title: title.trim(),
        description: description.trim(),
        status: 'open',
        closes,
        multiple: scope === 'member' ? false : multiple,
        scope,
        createdBy: user.email,
        createdByName: user.name || user.email,
        createdAt: new Date().toISOString(),
        options: uploaded,
      }), `Umfrage „${title.trim()}“ gestartet`)
      setToast?.(uploaded.some((option) => option.imageId || option.imageDataUrl) ? 'Bild-Umfrage veröffentlicht' : 'Umfrage veröffentlicht')
      reset()
    } catch (error) {
      setToast?.(error.message || 'Umfrage konnte nicht erstellt werden.')
    } finally {
      setBusy(false)
    }
  }

  const visiblePolls = project.polls.filter((poll) => (poll.scope || 'foundation') === scope)

  return <div className={embedded ? 'polls-v3 polls-embedded' : 'page polls-v3'}>
    <div className="page-header">
      <div><p className="eyebrow">GEMEINSAM ENTSCHEIDEN</p><h1>{heading}</h1><p>{intro}</p></div>
      {canCreate && <button className="primary-btn" onClick={() => setShowNew((value) => !value)}><Plus size={16} /> Umfrage</button>}
    </div>

    {canCreate && showNew && <form className="card visual-poll-builder" onSubmit={create}>
      <div className="poll-builder-head"><div><span className="eyebrow">NEUE UMFRAGE</span><h3>Antwortoptionen mit oder ohne Bild</h3><p>Für Logo-, Farb- oder Designabstimmungen kannst du jeder Option ein Bild hinzufügen.</p></div><ImageIcon size={24} /></div>
      <div className="poll-builder-basics">
        <label>Titel<input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Welches Logo passt am besten zu WeKiB?" /></label>
        <label>Beschreibung · optional<textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Kurzer Kontext für die Abstimmung …" /></label>
        <label>Abstimmung bis · optional<input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} /></label>
        {scope !== 'member' && <label className="poll-switch"><span><strong>Mehrfachauswahl</strong><small>Mitglieder dürfen mehrere Varianten auswählen.</small></span><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /></label>}
      </div>

      <div className="poll-builder-options">
        <div className="poll-builder-section-title"><strong>Antwortoptionen</strong><span>{options.length} Varianten</span></div>
        <div className="poll-builder-option-grid">
          {options.map((option, index) => <div className="poll-builder-option" key={option.localId}>
            <div className="poll-builder-image">
              {option.preview ? <img src={option.preview} alt="Vorschau" /> : <div className="poll-image-placeholder"><ImageIcon size={24} /><span>Bild optional</span></div>}
              <label className="poll-image-upload"><Upload size={15} /> {option.preview ? 'Ersetzen' : 'Bild wählen'}<input type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={(e) => chooseImage(option.localId, e.target.files?.[0])} /></label>
              {option.preview && <button type="button" className="poll-image-remove" onClick={() => removeDraftImage(option.localId)} title="Bild entfernen"><Trash2 size={14} /></button>}
            </div>
            <div className="poll-builder-option-copy"><span>OPTION {index + 1}</span><input required value={option.label} onChange={(e) => patchOption(option.localId, { label: e.target.value })} placeholder={`Variante ${index + 1}`} /></div>
            {options.length > 2 && <button type="button" className="icon-btn poll-option-remove" onClick={() => removeOption(option.localId)} title="Option entfernen"><Trash2 size={15} /></button>}
          </div>)}
        </div>
        <button type="button" className="secondary-btn poll-add-option" onClick={() => setOptions((current) => [...current, emptyOption(`Variante ${current.length + 1}`)])}><Plus size={15} /> Weitere Option</button>
      </div>

      <div className="poll-builder-actions"><button type="button" className="secondary-btn" onClick={reset}>Abbrechen</button><button className={`primary-btn ${busy ? 'disabled' : ''}`} disabled={busy}>{busy ? 'Bilder werden hochgeladen …' : 'Umfrage veröffentlichen'}</button></div>
    </form>}

    <div className="poll-grid">{visiblePolls.length ? visiblePolls.map((poll) => <PollCard key={poll.id} poll={poll} user={user} mutate={mutate} />) : <div className="card poll-empty"><VoteEmpty /></div>}</div>
  </div>
}

function VoteEmpty() {
  return <div className="visual-poll-empty"><ImageIcon size={25} /><strong>Noch keine Umfrage</strong><span>Lege eine Text- oder Bildabstimmung an.</span></div>
}

function PollCard({ poll, user, mutate }) {
  const options = Array.isArray(poll.options) ? poll.options : []
  const total = options.reduce((n, option) => n + (option.votes?.length || 0), 0)
  const myVotes = options.filter((option) => option.votes?.includes(user.email)).map((option) => option.id)
  const hasImages = options.some((option) => option.imageId || option.imageDataUrl)
  const resultsVisibility = poll.resultsVisibility || 'after-vote'
  const canSeeResults = (poll.scope || 'foundation') !== 'member' || resultsVisibility === 'always' || (resultsVisibility === 'after-vote' && myVotes.length > 0) || (resultsVisibility === 'after-close' && poll.status !== 'open')

  const vote = (optionId) => mutate((p) => {
    const target = p.polls.find((item) => item.id === poll.id)
    if (!target || target.status !== 'open') return
    const selected = target.options.find((option) => option.id === optionId)
    selected.votes ||= []
    const alreadySelected = selected.votes.includes(user.email)
    if (target.multiple) {
      selected.votes = alreadySelected ? selected.votes.filter((email) => email !== user.email) : [...selected.votes, user.email]
    } else {
      target.options.forEach((option) => { option.votes = (option.votes || []).filter((email) => email !== user.email) })
      if (!alreadySelected) selected.votes.push(user.email)
    }
  })

  return <article className={`poll-card visual-poll ${hasImages ? 'has-images' : ''}`}>
    <div className="poll-head"><span className={`status-pill ${poll.status}`}>{poll.status === 'open' ? 'offen' : 'beendet'}</span>{poll.closes && <small><Clock3 size={12} /> bis {fmtDate(poll.closes)}</small>}</div>
    <h3>{poll.title}</h3>
    {poll.description && <p>{poll.description}</p>}
    {poll.multiple && <span className="poll-mode-hint">Mehrfachauswahl möglich</span>}
    <div className={`poll-options ${hasImages ? 'poll-options--visual' : ''}`}>
      {options.map((option) => {
        const count = option.votes?.length || 0
        const percent = canSeeResults && total ? Math.round((count / total) * 100) : 0
        const selected = myVotes.includes(option.id)
        const src = optionImageSrc(option)
        return <button key={option.id} disabled={poll.status !== 'open'} className={selected ? 'selected' : ''} onClick={() => vote(option.id)}>
          {src && <span className="poll-option-image"><img src={src} alt={option.label} loading="lazy" /></span>}
          <span className="poll-option-body"><span className="poll-option-label">{selected && <span className="poll-check"><Check size={12} /></span>}<strong>{option.label}</strong></span><b>{canSeeResults ? `${percent}%` : '—'}</b></span>
          <i className="poll-result-bar" style={{ width: `${percent}%` }} />
        </button>
      })}
    </div>
    <div className="visual-poll-footer"><span><Users size={13} /> {canSeeResults ? `${total} ${total === 1 ? 'Stimme' : 'Stimmen'}` : 'Ergebnis noch verborgen'}</span>{poll.createdByName && <span>von {poll.createdByName}</span>}</div>
  </article>
}
