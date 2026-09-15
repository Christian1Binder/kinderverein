import { useMemo, useRef, useState } from 'react'
import { Download, FileText, Folder, Plus, Trash2, Upload, WalletCards } from 'lucide-react'
import { fileDownloadUrl, uploadProjectFile, deleteProjectFile } from './lib/projectStore.js'

const uid = (p='fin') => `${p}-${Date.now()}-${Math.random().toString(36).slice(2,7)}`
const now = () => new Date().toISOString()
const money = (v=0) => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v)||0)

export default function Treasurer({ project, user, mutate, setToast }) {
  const finance = project.finance || { transactions: [], budgets: [], files: [], accounts: [] }
  const [tab,setTab] = useState('overview')
  const [form,setForm] = useState({ date:new Date().toISOString().slice(0,10), type:'expense', amount:'', category:'Allgemein', description:'', account:'Vereinskonto' })
  const inputRef = useRef(null)
  const income = useMemo(()=>finance.transactions.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0),[finance.transactions])
  const expenses = useMemo(()=>finance.transactions.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0),[finance.transactions])
  const balance = income-expenses

  const addTransaction = (e) => {
    e.preventDefault(); if(!form.amount || !form.description.trim()) return
    mutate(p=>{ p.finance ||= {transactions:[],budgets:[],files:[],accounts:[]}; p.finance.transactions.unshift({id:uid('txn'),...form,amount:Number(form.amount),createdAt:now(),createdBy:user.name||user.email}) },`Finanzbuchung „${form.description}“ erfasst`)
    setForm({...form,amount:'',description:''})
  }
  const removeTransaction = (id) => mutate(p=>{p.finance.transactions=p.finance.transactions.filter(t=>t.id!==id)},'Finanzbuchung entfernt')
  const addBudget = () => {
    const name=window.prompt('Budget / Kostenstelle'); if(!name?.trim()) return
    const amount=Number(window.prompt('Planbetrag in Euro')||0)
    mutate(p=>{p.finance ||= {transactions:[],budgets:[],files:[],accounts:[]};p.finance.budgets.push({id:uid('budget'),name:name.trim(),amount})},`Budget „${name.trim()}“ angelegt`)
  }
  const upload = async (files) => {
    const list=Array.from(files||[]); if(!list.length) return
    try{
      const uploaded=[]
      for(const file of list) uploaded.push({...await uploadProjectFile(file,'treasury'),scope:'treasury',uploadedFor:'finance'})
      mutate(p=>{p.finance ||= {transactions:[],budgets:[],files:[],accounts:[]};p.files ||= [];p.files.unshift(...uploaded);p.finance.files.unshift(...uploaded.map(f=>f.id))},`${uploaded.length} Finanzdatei(en) hochgeladen`)
      setToast?.(`${uploaded.length} Datei(en) hochgeladen`)
    }catch(e){setToast?.(e.message)}finally{if(inputRef.current)inputRef.current.value=''}
  }
  const removeFile = async (file) => { if(!window.confirm(`„${file.name}“ löschen?`))return; try{await deleteProjectFile(file.id);mutate(p=>{p.files=p.files.filter(f=>f.id!==file.id);p.finance.files=p.finance.files.filter(id=>id!==file.id)},'Finanzdatei gelöscht')}catch(e){setToast?.(e.message)} }
  const financeFiles=(project.files||[]).filter(f=>(finance.files||[]).includes(f.id)||f.scope==='treasury')

  return <div className="page"><div className="page-header"><div><p className="eyebrow">VORSTAND · SCHATZMEISTER</p><h1>Finanzverwaltung</h1><p>Kassenstand, Einnahmen, Ausgaben, Budgets und Finanzunterlagen in einem geschützten Arbeitsbereich.</p></div></div>
    <div className="finance-tabs"><button className={tab==='overview'?'active':''} onClick={()=>setTab('overview')}>Übersicht</button><button className={tab==='transactions'?'active':''} onClick={()=>setTab('transactions')}>Buchungen</button><button className={tab==='budgets'?'active':''} onClick={()=>setTab('budgets')}>Budgets</button><button className={tab==='files'?'active':''} onClick={()=>setTab('files')}>Finanzdateien</button></div>
    {tab==='overview'&&<><section className="finance-grid"><Metric label="Einnahmen" value={money(income)} positive/><Metric label="Ausgaben" value={money(expenses)} negative/><Metric label="Saldo" value={money(balance)} positive={balance>=0} negative={balance<0}/><Metric label="Buchungen" value={finance.transactions.length}/></section><section className="finance-layout"><div className="card"><div className="card-head"><h3>Letzte Buchungen</h3><button onClick={()=>setTab('transactions')}>Alle</button></div><Transactions rows={finance.transactions.slice(0,8)} onDelete={removeTransaction}/></div><div className="card"><h3>Planung</h3><p>Budgets: {finance.budgets.length}</p><p>Finanzdateien: {financeFiles.length}</p><p>Dieser Bereich ist ausschließlich für Nutzer mit Schatzmeister-/Finanzrecht sichtbar.</p></div></section></>}
    {tab==='transactions'&&<div className="finance-layout"><section className="card"><div className="card-head"><h3>Buchungen</h3></div><Transactions rows={finance.transactions} onDelete={removeTransaction}/></section><section className="card"><h3>Neue Buchung</h3><form className="finance-form" onSubmit={addTransaction}><div className="row2"><label>Datum<input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label>Art<select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="expense">Ausgabe</option><option value="income">Einnahme</option></select></label></div><div className="row2"><label>Betrag<input type="number" step="0.01" min="0" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label>Kategorie<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label></div><label>Beschreibung<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Konto<input value={form.account} onChange={e=>setForm({...form,account:e.target.value})}/></label><button className="primary-btn"><Plus size={15}/> Buchung erfassen</button></form></section></div>}
    {tab==='budgets'&&<section className="card"><div className="card-head"><div><h3>Budgets & Kostenstellen</h3><p>Planwerte für Gründung, Verwaltung, Versicherungen oder spätere Angebote.</p></div><button className="primary-btn" onClick={addBudget}><Plus size={15}/> Budget</button></div><div className="finance-grid">{finance.budgets.map(b=><div className="finance-metric" key={b.id}><span>{b.name}</span><strong>{money(b.amount)}</strong></div>)}</div></section>}
    {tab==='files'&&<section className="card"><div className="card-head"><div><h3>Finanzdateien</h3><p>Rechnungen, Angebote, Kontoauszüge, Haushalts- und Finanzunterlagen getrennt von der allgemeinen Ablage.</p></div><label className="primary-btn"><Upload size={15}/> Dateien hochladen<input ref={inputRef} hidden multiple type="file" onChange={e=>upload(e.target.files)}/></label></div><div className="finance-files">{financeFiles.map(file=><div className="finance-file" key={file.id}><span><FileText size={17}/> <strong>{file.name}</strong></span><span><a className="icon-btn" href={fileDownloadUrl(file.id)}><Download size={15}/></a><button className="icon-btn" onClick={()=>removeFile(file)}><Trash2 size={15}/></button></span></div>)}</div></section>}
  </div>
}

function Metric({label,value,positive,negative}){return <div className="finance-metric"><span>{label}</span><strong className={positive?'finance-positive':negative?'finance-negative':''}>{value}</strong></div>}
function Transactions({rows,onDelete}){return <div style={{overflowX:'auto'}}><table className="finance-table"><thead><tr><th>Datum</th><th>Beschreibung</th><th>Kategorie</th><th>Konto</th><th>Betrag</th><th></th></tr></thead><tbody>{rows.map(t=><tr key={t.id}><td>{t.date}</td><td>{t.description}</td><td>{t.category}</td><td>{t.account}</td><td className={t.type==='income'?'finance-positive':'finance-negative'}>{t.type==='income'?'+':'−'}{money(t.amount)}</td><td><button className="icon-btn" onClick={()=>onDelete(t.id)}><Trash2 size={14}/></button></td></tr>)}</tbody></table></div>}
