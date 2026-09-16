import { ArrowRight, Download, Image as ImageIcon, Info, Quote, Sparkles } from 'lucide-react'
import { projectImageUrl, publicImageUrl } from './lib/projectStore.js'

export const DEFAULT_PUBLIC_BLOCKS = [
  { id: 'pub-hero', anchor: 'start', type: 'hero', audience: 'public', eyebrow: 'WEKIB · IN GRÜNDUNG', title: 'Gute Betreuung schafft Freiraum.', text: 'Wir bauen einen gemeinnützigen Bildungsträger auf, der Kinder und Jugendliche verlässlich begleitet, Entwicklung ermöglicht und Schule mit starken Betreuungsangeboten ergänzt.', buttonLabel: 'WeKiB kennenlernen', buttonHref: '#ueber-uns' },
  { id: 'pub-intro', anchor: 'ueber-uns', type: 'text', audience: 'public', eyebrow: 'ÜBER UNS', title: 'Ein Träger, der Betreuung als Bildungsraum versteht.', text: 'WeKiB entsteht aus der Praxis heraus. Unser Ziel ist ein professioneller, verlässlicher und moderner Träger für schulische Betreuung, Ganztagsangebote, Ferienangebote und weitere Bildungs- und Jugendhilfeformate.' },
  { id: 'pub-cards', anchor: 'angebote', type: 'cards', audience: 'public', eyebrow: 'ANGEBOTE', title: 'Was wir aufbauen', cards: [
    { title: 'Ganztag & Betreuung', text: 'Offene Ganztagsangebote, Mittags- und Nachmittagsbetreuung mit klaren pädagogischen Strukturen.' },
    { title: 'Bildung & Entwicklung', text: 'Angebote, die Selbstständigkeit, Gemeinschaft, Beteiligung und individuelle Entwicklung fördern.' },
    { title: 'Ferien & Projekte', text: 'Ferienbetreuung, Workshops und ergänzende Bildungsangebote für Kinder und Jugendliche.' },
  ]},
  { id: 'pub-stats', anchor: 'gruendung', type: 'stats', audience: 'public', items: [{ value: '100%', label: 'pädagogischer Anspruch' }, { value: 'offen', label: 'für mehrere Standorte' }, { value: 'gemeinsam', label: 'mit Schulen & Kommunen' }] },
  { id: 'pub-cta', anchor: 'kontakt', type: 'cta', audience: 'public', title: 'Ein Konto öffnet den erweiterten WeKiB-Bereich.', text: 'Registrierte Nutzer erhalten zunächst einen Lesebereich mit allgemeinen Informationen. Interne Arbeitsbereiche werden ausschließlich durch Administratoren freigeschaltet.', buttonLabel: 'Konto erstellen', action: 'register' },
]

export const DEFAULT_MEMBER_BLOCKS = [
  { id: 'member-welcome', type: 'hero', audience: 'member', eyebrow: 'MEIN WEKIB', title: 'Willkommen im erweiterten WeKiB-Bereich.', text: 'Hier stellen wir registrierten Nutzerinnen und Nutzern zusätzliche Informationen bereit. Dieser Bereich ist grundsätzlich lesend; Arbeitsbereiche erscheinen erst nach ausdrücklicher Freigabe.' },
  { id: 'member-notice', type: 'notice', audience: 'member', title: 'Dein Zugang ist ein Lesezugang', text: 'Du kannst allgemeine Inhalte ansehen. Gründungsunterlagen, Vorstandsunterlagen, CMS und Administration bleiben geschützt.' },
  { id: 'member-faq', type: 'faq', audience: 'member', title: 'Häufige Fragen', items: [{ q: 'Wie bekomme ich Zugang zur Gründung?', a: 'Ein Administrator ordnet dein Konto der Gründung zu und vergibt die benötigten Rechte.' }, { q: 'Kann ich Inhalte verändern?', a: 'Nicht mit dem normalen Basiszugang. Bearbeitungsrechte werden separat vergeben.' }] },
]

const DEFAULT_ANCHORS = {
  'pub-hero': 'start', 'pub-intro': 'ueber-uns', 'pub-cards': 'angebote', 'pub-stats': 'gruendung', 'pub-cta': 'kontakt',
}

export function PortalBlocks({ blocks = [], mode = 'public', onAction }) {
  if (!blocks?.length) return null
  return <div className={`portal-blocks portal-blocks-${mode}`}>{blocks.map((block) => <PortalBlock key={block.id} block={block} mode={mode} onAction={onAction} />)}</div>
}

function imageUrl(block, mode) {
  if (!block?.imageId) return ''
  return mode === 'public' ? publicImageUrl(block.imageId) : projectImageUrl(block.imageId)
}

function sectionId(block, mode) {
  if (mode !== 'public') return block.anchor || undefined
  return block.anchor || DEFAULT_ANCHORS[block.id] || undefined
}

function PortalBlock({ block, mode, onAction }) {
  const id = sectionId(block, mode)
  if (block.type === 'hero') return <section className="pb-section pb-hero" id={id}><div className="pb-copy">{block.eyebrow && <span className="pb-eyebrow"><Sparkles size={14} />{block.eyebrow}</span>}<h1>{block.title}</h1>{block.text && <p>{block.text}</p>}{(block.buttonLabel || block.action) && <PortalButton block={block} onAction={onAction} />}</div>{block.imageId ? <img className="pb-hero-image" src={imageUrl(block, mode)} alt={block.imageAlt || ''} /> : <div className="pb-hero-art"><span>W</span></div>}</section>
  if (block.type === 'text') return <section className="pb-section pb-text" id={id}><div>{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2></div><div><p>{block.text}</p></div></section>
  if (block.type === 'image') return <section className="pb-section pb-image" id={id}>{block.imageId ? <img src={imageUrl(block, mode)} alt={block.imageAlt || block.title || ''} /> : <div className="pb-image-placeholder"><ImageIcon size={30} /></div>}<div>{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2><p>{block.text}</p></div></section>
  if (block.type === 'cards') return <section className="pb-section pb-stack" id={id}><div className="pb-heading">{block.eyebrow && <span className="pb-eyebrow">{block.eyebrow}</span>}<h2>{block.title}</h2>{block.text && <p>{block.text}</p>}</div><div className="pb-card-grid">{(block.cards || []).map((card, i) => <article key={`${block.id}-${i}`}><span>{String(i + 1).padStart(2, '0')}</span><h3>{card.title}</h3><p>{card.text}</p></article>)}</div></section>
  if (block.type === 'stats') return <section className="pb-section pb-stats" id={id}>{(block.items || []).map((item, i) => <div key={`${block.id}-${i}`}><strong>{item.value}</strong><span>{item.label}</span></div>)}</section>
  if (block.type === 'notice') return <section className="pb-section pb-notice" id={id}><Info size={22} /><div><h3>{block.title}</h3><p>{block.text}</p></div></section>
  if (block.type === 'quote') return <section className="pb-section pb-quote" id={id}><Quote size={30} /><blockquote>{block.text}</blockquote>{block.caption && <span>{block.caption}</span>}</section>
  if (block.type === 'faq') return <section className="pb-section pb-stack" id={id}><div className="pb-heading"><h2>{block.title || 'Häufige Fragen'}</h2></div><div className="pb-faq">{(block.items || []).map((item, i) => <details key={`${block.id}-${i}`}><summary>{item.q}</summary><p>{item.a}</p></details>)}</div></section>
  if (block.type === 'links') return <section className="pb-section pb-stack" id={id}><div className="pb-heading"><h2>{block.title}</h2></div><div className="pb-links">{(block.items || []).map((item, i) => <a key={`${block.id}-${i}`} href={item.href || '#'} target={item.external ? '_blank' : undefined} rel={item.external ? 'noreferrer' : undefined}><span><strong>{item.label}</strong>{item.text && <small>{item.text}</small>}</span><ArrowRight size={17} /></a>)}</div></section>
  if (block.type === 'cta') return <section className="pb-section pb-cta" id={id}><div><h2>{block.title}</h2><p>{block.text}</p></div><PortalButton block={block} onAction={onAction} /></section>
  if (block.type === 'spacer') return <div className={`pb-spacer ${block.size || 'medium'}`} id={id} />
  return null
}

function PortalButton({ block, onAction }) {
  if (block.action) return <button className="portal-primary" onClick={() => onAction?.(block.action)}>{block.buttonLabel || 'Weiter'} <ArrowRight size={16} /></button>
  if (block.buttonHref) return <a className="portal-primary" href={block.buttonHref}>{block.buttonLabel || 'Weiter'} <ArrowRight size={16} /></a>
  if (block.downloadHref) return <a className="portal-primary" href={block.downloadHref}><Download size={16} /> {block.buttonLabel || 'Herunterladen'}</a>
  return null
}
