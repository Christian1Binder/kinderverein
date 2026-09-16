import { useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Copy, Eye, ImagePlus, Plus, Trash2 } from 'lucide-react'
import { PortalBlocks, DEFAULT_MEMBER_BLOCKS, DEFAULT_PUBLIC_BLOCKS } from './PortalBlocks.jsx'
import { projectImageUrl, uploadProjectFile } from './lib/projectStore.js'
import PollsWithImages from './PollsWithImages.jsx'

const TYPES = [
  ['hero', 'Hero / Aufmacher'], ['text', 'Textbereich'], ['image', 'Bild + Text'], ['cards', 'Karten'],
  ['stats', 'Kennzahlen'], ['notice', 'Hinweis'], ['quote', 'Zitat'], ['faq', 'FAQ'], ['links', 'Linkliste'], ['cta', 'Call-to-Action'], ['spacer', 'Abstand'],
]

const uid = (prefix='block') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`

function makeBlock(type, audience) {
  const base = { id: uid(), type, audience }
  if (type === 'hero') return { ...base, eyebrow: audience === 'public' ? 'WEKIB' : 'MEIN WEKIB', title: 'Neue Überschrift', text: 'Hier steht der beschreibende Text.', buttonLabel: '', buttonHref: '' }
  if (type === 'text') return { ...base, eyebrow: '', title: 'Neue Überschrift', text: 'Textinhalt' }
  if (type === 'image') return { ...base, eyebrow: '', title: 'Bildbereich', text: 'Beschreibung', imageId: '', imageAlt: '' }
  if (type === 'cards') return { ...base, title: 'Kartenbereich', text: '', cards: [{ title: 'Karte 1', text: 'Beschreibung' }, { title: 'Karte 2', text: 'Beschreibung' }] }
  if (type === 'stats') return { ...base, items: [{ value: '100%', label: 'Beispiel' }, { value: '3', label: 'Standorte' }] }
  if (type === 'notice') return { ...base, title: 'Hinweis', text: 'Wichtige Information' }
  if (type === 'quote') return { ...base, text: 'Ein starkes Zitat.', caption: '' }
  if (type === 'faq') return { ...base, title: 'Häufige Fragen', items: [{ q: 'Frage?', a: 'Antwort.' }] }
  if (type === 'links') return { ...base, title: 'Weiterführende Links', items: [{ label: 'Link', text: '', href: '#', external: false }] }
  if (type === 'cta') return { ...base, title: 'Jetzt mitmachen', text: 'Beschreibung', buttonLabel: 'Mehr erfahren', buttonHref: '#' }
  return { ...base, size: 'medium' }
}

export default function PortalCms({ project, user, mutate, setToast }) {
  const [audience, setAudience] = useState('public')
  const [preview, setPreview] = useState(false)
  const blocks = useMemo(() => audience === 'public'
    ? (project.settings?.publicBlocks?.length ? project.settings.publicBlocks : DEFAULT_PUBLIC_BLOCKS)
    : (project.settings?.memberBlocks?.length ? project.settings.memberBlocks : DEFAULT_MEMBER_BLOCKS), [project.settings, audience])

  const writeBlocks = (next) => mutate((p) => {
    p.settings ||= {}
    if (audience === 'public') p.settings.publicBlocks = next
    else p.settings.memberBlocks = next
  })

  const add = (type) => writeBlocks([...blocks, makeBlock(type, audience)])
  const update = (id, patch) => writeBlocks(blocks.map((b) => b.id === id ? { ...b, ...patch } : b))
  const remove = (id) => writeBlocks(blocks.filter((b) => b.id !== id))
  const duplicate = (block) => writeBlocks([...blocks, { ...JSON.parse(JSON.stringify(block)), id: uid() }])
  const move = (index, delta) => {
    const next = [...blocks]; const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    writeBlocks(next)
  }

  return <div>
    <div className="cms-audience-tabs">
      <button className={audience === 'public' ? 'active' : ''} onClick={() => setAudience('public')}>Öffentliche Website</button>
      <button className={audience === 'member' ? 'active' : ''} onClick={() => setAudience('member')}>Registrierter Lesebereich</button>
      <button onClick={() => setPreview(!preview)}><Eye size={15} /> {preview ? 'Editor' : 'Vorschau'}</button>
    </div>
    {preview ? <div className="cms-preview"><div className="cms-preview-head"><span>Vorschau</span><span>{audience === 'public' ? 'öffentlich' : 'nur angemeldete Nutzer'}</span></div><PortalBlocks blocks={blocks} mode={audience === 'public' ? 'public' : 'member'} /></div> : <div className="cms-builder">
      <aside className="cms-palette card"><strong>Bausteine</strong><small>Baustein anklicken, um ihn unten anzufügen.</small>{TYPES.map(([type,label]) => <button key={type} onClick={() => add(type)}><Plus size={14} /> {label}</button>)}</aside>
      <section className="cms-canvas">{blocks.map((block,index) => <BlockEditor key={block.id} block={block} onChange={(patch) => update(block.id, patch)} onDelete={() => remove(block.id)} onDuplicate={() => duplicate(block)} onUp={() => move(index,-1)} onDown={() => move(index,1)} setToast={setToast} />)}</section>
    </div>}
    {audience === 'member' && !preview && user && <section className="cms-member-polls"><PollsWithImages project={project} user={user} mutate={mutate} setToast={setToast} canCreate scope="member" uploadScope="member-cms" embedded heading="Umfragen im Mitgliederbereich" intro="Erstelle Abstimmungen für registrierte Nutzer. Pro Konto ist bei diesen Umfragen genau eine Stimme möglich; Bilder je Antwortoption sind erlaubt." /></section>}
  </div>
}

function BlockEditor({ block, onChange, onDelete, onDuplicate, onUp, onDown, setToast }) {
  const imageRef = useRef(null)
  const uploadImage = async (file) => {
    if (!file) return
    try {
      const meta = await uploadProjectFile(file, block.audience === 'public' ? 'public-cms' : 'member-cms')
      onChange({ imageId: meta.id })
      setToast?.('Bild hochgeladen')
    } catch (e) { setToast?.(e.message) }
  }
  return <article className="cms-block-card"><div className="cms-block-head"><div><strong>{TYPES.find(([t]) => t === block.type)?.[1] || block.type}</strong><small>{block.audience === 'public' ? 'öffentlich' : 'registriert'}</small></div><div className="cms-block-actions"><button className="icon-btn" onClick={onUp}><ArrowUp size={15}/></button><button className="icon-btn" onClick={onDown}><ArrowDown size={15}/></button><button className="icon-btn" onClick={onDuplicate}><Copy size={15}/></button><button className="icon-btn" onClick={onDelete}><Trash2 size={15}/></button></div></div><div className="cms-block-body"><Fields block={block} onChange={onChange} />{['hero','image'].includes(block.type) && <div><label>Bild</label>{block.imageId && <img className="cms-image-preview" src={projectImageUrl(block.imageId)} alt="" />}<div><button className="secondary-btn" onClick={() => imageRef.current?.click()}><ImagePlus size={15}/> Bild auswählen</button><input ref={imageRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(e.target.files?.[0])}/></div></div>}</div></article>
}

function Fields({ block, onChange }) {
  const common = ['hero','text','image'].includes(block.type)
  return <>
    {common && <><label>Kicker / kleine Überschrift<input value={block.eyebrow || ''} onChange={(e)=>onChange({eyebrow:e.target.value})}/></label><label>Überschrift<input value={block.title || ''} onChange={(e)=>onChange({title:e.target.value})}/></label><label>Text<textarea value={block.text || ''} onChange={(e)=>onChange({text:e.target.value})}/></label></>}
    {block.type === 'image' && <label>Alternativtext<input value={block.imageAlt || ''} onChange={(e)=>onChange({imageAlt:e.target.value})}/></label>}
    {block.type === 'hero' && <div className="cms-inline-grid"><label>Buttontext<input value={block.buttonLabel || ''} onChange={(e)=>onChange({buttonLabel:e.target.value})}/></label><label>Link / Anker<input value={block.buttonHref || ''} onChange={(e)=>onChange({buttonHref:e.target.value})}/></label></div>}
    {block.type === 'cards' && <RepeatEditor title={block.title} text={block.text} items={block.cards || []} onTitle={(v)=>onChange({title:v})} onText={(v)=>onChange({text:v})} onItems={(v)=>onChange({cards:v})} fields={['title','text']} />}
    {block.type === 'stats' && <RepeatEditor items={block.items || []} onItems={(v)=>onChange({items:v})} fields={['value','label']} />}
    {block.type === 'notice' && <><label>Titel<input value={block.title||''} onChange={(e)=>onChange({title:e.target.value})}/></label><label>Text<textarea value={block.text||''} onChange={(e)=>onChange({text:e.target.value})}/></label></>}
    {block.type === 'quote' && <><label>Zitat<textarea value={block.text||''} onChange={(e)=>onChange({text:e.target.value})}/></label><label>Quelle / Zusatz<input value={block.caption||''} onChange={(e)=>onChange({caption:e.target.value})}/></label></>}
    {block.type === 'faq' && <RepeatEditor title={block.title} items={block.items||[]} onTitle={(v)=>onChange({title:v})} onItems={(v)=>onChange({items:v})} fields={['q','a']} />}
    {block.type === 'links' && <RepeatEditor title={block.title} items={block.items||[]} onTitle={(v)=>onChange({title:v})} onItems={(v)=>onChange({items:v})} fields={['label','href','text']} />}
    {block.type === 'cta' && <><label>Titel<input value={block.title||''} onChange={(e)=>onChange({title:e.target.value})}/></label><label>Text<textarea value={block.text||''} onChange={(e)=>onChange({text:e.target.value})}/></label><div className="cms-inline-grid"><label>Buttontext<input value={block.buttonLabel||''} onChange={(e)=>onChange({buttonLabel:e.target.value})}/></label><label>Link<input value={block.buttonHref||''} onChange={(e)=>onChange({buttonHref:e.target.value})}/></label></div></>}
    {block.type === 'spacer' && <label>Größe<select value={block.size||'medium'} onChange={(e)=>onChange({size:e.target.value})}><option value="small">klein</option><option value="medium">mittel</option><option value="large">groß</option></select></label>}
  </>
}

function RepeatEditor({ title, text, items, onTitle, onText, onItems, fields }) {
  const set = (i,key,value) => onItems(items.map((item,idx)=>idx===i?{...item,[key]:value}:item))
  const add = () => onItems([...items,Object.fromEntries(fields.map((f)=>[f,'']))])
  return <>{onTitle && <label>Titel<input value={title||''} onChange={(e)=>onTitle(e.target.value)}/></label>}{onText && <label>Einleitung<textarea value={text||''} onChange={(e)=>onText(e.target.value)}/></label>}{items.map((item,i)=><div className="cms-repeat-row" key={i}>{fields.map((f)=><label key={f}>{f}<input value={item[f]||''} onChange={(e)=>set(i,f,e.target.value)}/></label>)}<button className="icon-btn" onClick={()=>onItems(items.filter((_,idx)=>idx!==i))}><Trash2 size={14}/></button></div>)}<button className="secondary-btn" onClick={add}><Plus size={14}/> Eintrag ergänzen</button></>
}
