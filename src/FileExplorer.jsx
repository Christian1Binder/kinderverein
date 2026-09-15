import { useMemo, useRef, useState } from 'react'
import {
  ChevronRight, Download, File, FileText, Folder, FolderOpen, FolderPlus,
  MoreHorizontal, Pencil, Trash2, Upload, X, MoveRight, Search,
} from 'lucide-react'
import { deleteProjectFile, fileDownloadUrl, uploadProjectFile } from './lib/projectStore.js'

const collator = new Intl.Collator('de', { sensitivity: 'base', numeric: true })
const uid = (prefix='folder') => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
const sortByName = (a,b) => collator.compare(a.name || '', b.name || '')
const formatBytes = (bytes=0) => {
  if (!bytes) return '0 B'
  const units=['B','KB','MB','GB']; const i=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)), units.length-1)
  return `${(bytes/Math.pow(1024,i)).toFixed(i ? 1 : 0)} ${units[i]}`
}

function normalizeFolders(folders=[]) {
  return folders.map(f => ({ ...f, parentId: f.parentId || null }))
}

function descendantIds(folders, id) {
  const out = new Set([id])
  let changed = true
  while (changed) {
    changed = false
    for (const f of folders) if (f.parentId && out.has(f.parentId) && !out.has(f.id)) { out.add(f.id); changed = true }
  }
  return out
}

function folderPath(folders, id) {
  const map = new Map(folders.map(f=>[f.id,f]))
  const path=[]; let cur=map.get(id); let guard=0
  while(cur && guard++ < 50){ path.unshift(cur); cur=cur.parentId ? map.get(cur.parentId) : null }
  return path
}

function uniqueFolderName(folders, parentId, desired) {
  const base=(desired || 'Neuer Ordner').trim() || 'Neuer Ordner'
  const taken=new Set(folders.filter(f=>(f.parentId||null)===(parentId||null)).map(f=>f.name.toLocaleLowerCase('de')))
  if(!taken.has(base.toLocaleLowerCase('de'))) return base
  let n=2
  while(taken.has(`${base} ${n}`.toLocaleLowerCase('de'))) n++
  return `${base} ${n}`
}

function fileIcon(file) {
  const name=(file.name||'').toLowerCase()
  if (/\.(pdf|docx?|odt|rtf|txt|md)$/.test(name)) return <FileText size={20}/>
  return <File size={20}/>
}

export default function FileExplorer({ project, user, mutate, setToast, hasPermission }) {
  const folders = useMemo(()=>normalizeFolders(project.folders || []),[project.folders])
  const [currentId,setCurrentId]=useState(null)
  const [query,setQuery]=useState('')
  const [busy,setBusy]=useState(false)
  const [menu,setMenu]=useState(null)
  const [moveTarget,setMoveTarget]=useState(null)
  const inputRef=useRef(null)
  const folderInputRef=useRef(null)
  const canManage = hasPermission(project,user,'files_manage')

  const currentFolder = currentId ? folders.find(f=>f.id===currentId) : null
  const childFolders = folders.filter(f=>(f.parentId||null)===(currentId||null)).sort(sortByName)
  const childFiles = (project.files||[]).filter(f=>(f.folderId||null)===(currentId||null)).sort(sortByName)
  const searchMode = query.trim().length > 0
  const searchResults = searchMode ? [
    ...folders.filter(f=>f.name?.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'))).map(item=>({kind:'folder',item})),
    ...(project.files||[]).filter(f=>f.name?.toLocaleLowerCase('de').includes(query.trim().toLocaleLowerCase('de'))).map(item=>({kind:'file',item})),
  ].sort((a,b)=>a.kind===b.kind?sortByName(a.item,b.item):a.kind==='folder'?-1:1) : []

  const addFolder = () => {
    if(!canManage) return
    const entered=window.prompt('Name des neuen Ordners')
    if(!entered?.trim()) return
    const name=uniqueFolderName(folders,currentId,entered)
    mutate(p=>{p.folders.push({id:uid(),name,parentId:currentId||null,createdAt:new Date().toISOString(),createdBy:user.name||user.email})},`Ordner „${name}“ angelegt`)
  }

  const renameFolder = (folder) => {
    const entered=window.prompt('Ordner umbenennen',folder.name)
    if(!entered?.trim()) return
    const name=uniqueFolderName(folders.filter(f=>f.id!==folder.id),folder.parentId||null,entered)
    mutate(p=>{const x=p.folders.find(f=>f.id===folder.id); if(x)x.name=name},`Ordner „${folder.name}“ in „${name}“ umbenannt`)
    setMenu(null)
  }

  const renameFile = (file) => {
    const entered=window.prompt('Datei umbenennen',file.name)
    if(!entered?.trim()) return
    mutate(p=>{const x=p.files.find(f=>f.id===file.id); if(x)x.name=entered.trim()},`Datei „${file.name}“ umbenannt`)
    setMenu(null)
  }

  const removeFile = async (file) => {
    if(!canManage || !window.confirm(`„${file.name}“ wirklich löschen?`)) return
    try { await deleteProjectFile(file.id); mutate(p=>{p.files=p.files.filter(f=>f.id!==file.id)},`Datei „${file.name}“ gelöscht`) }
    catch(e){setToast?.(e.message)}
    setMenu(null)
  }

  const removeFolder = async (folder) => {
    if(!canManage) return
    const ids=descendantIds(folders,folder.id)
    const affected=(project.files||[]).filter(f=>ids.has(f.folderId))
    if(!window.confirm(`Ordner „${folder.name}“ inklusive ${ids.size-1} Unterordner(n) und ${affected.length} Datei(en) löschen?`)) return
    setBusy(true)
    try {
      for(const file of affected) await deleteProjectFile(file.id)
      mutate(p=>{p.files=p.files.filter(f=>!ids.has(f.folderId));p.folders=p.folders.filter(f=>!ids.has(f.id))},`Ordner „${folder.name}“ gelöscht`)
      if(ids.has(currentId)) setCurrentId(folder.parentId||null)
    } catch(e){setToast?.(e.message || 'Ordner konnte nicht vollständig gelöscht werden.')} finally {setBusy(false);setMenu(null)}
  }

  const moveFolder = (folder,targetId) => {
    if(folder.id===targetId) return
    const forbidden=descendantIds(folders,folder.id)
    if(targetId && forbidden.has(targetId)){setToast?.('Ein Ordner kann nicht in einen eigenen Unterordner verschoben werden.');return}
    mutate(p=>{const x=p.folders.find(f=>f.id===folder.id);if(x)x.parentId=targetId||null},`Ordner „${folder.name}“ verschoben`)
    setMoveTarget(null);setMenu(null)
  }
  const moveFile = (file,targetId) => { mutate(p=>{const x=p.files.find(f=>f.id===file.id);if(x)x.folderId=targetId||null},`Datei „${file.name}“ verschoben`);setMoveTarget(null);setMenu(null) }

  const upload = async (fileList, folderUpload=false) => {
    const files=Array.from(fileList||[]); if(!files.length || !canManage)return
    setBusy(true)
    try {
      const created=[]; const uploaded=[]
      const working=[...folders]
      const ensure=(parentId,name)=>{
        let found=[...working,...created].find(f=>(f.parentId||null)===(parentId||null)&&f.name.toLocaleLowerCase('de')===name.toLocaleLowerCase('de'))
        if(found)return found.id
        const item={id:uid(),name,parentId:parentId||null,createdAt:new Date().toISOString(),createdBy:user.name||user.email};created.push(item);return item.id
      }
      for(const file of files){
        let target=currentId||null
        if(folderUpload && file.webkitRelativePath){
          const parts=file.webkitRelativePath.split('/').filter(Boolean); parts.pop()
          for(const part of parts) target=ensure(target,part)
        }
        const meta=await uploadProjectFile(file)
        uploaded.push({...meta,folderId:target,relativePath:file.webkitRelativePath||''})
      }
      mutate(p=>{p.folders.push(...created);p.files.push(...uploaded)},folderUpload?`${files.length} Dateien mit Ordnerstruktur hochgeladen`:`${files.length} Datei(en) hochgeladen`)
      setToast?.(folderUpload?'Ordnerstruktur vollständig übernommen.':`${files.length} Datei(en) hochgeladen`)
    }catch(e){setToast?.(e.message||'Upload fehlgeschlagen')}finally{setBusy(false);if(inputRef.current)inputRef.current.value='';if(folderInputRef.current)folderInputRef.current.value=''}
  }

  const path=folderPath(folders,currentId)
  const list = searchMode ? searchResults : [
    ...childFolders.map(item=>({kind:'folder',item})),
    ...childFiles.map(item=>({kind:'file',item})),
  ]

  return <div className="page file-explorer-page">
    <div className="page-header"><div><p className="eyebrow">GEMEINSAME ABLAGE</p><h1>Dateien</h1><p>Explorer mit Ordnern, Unterordnern und klarer alphabetischer Sortierung.</p></div>{canManage&&<div className="header-actions"><button className="secondary-btn" onClick={addFolder}><FolderPlus size={16}/> Neuer Ordner</button><label className={`secondary-btn ${busy?'disabled':''}`}><Upload size={16}/> Dateien<input ref={inputRef} hidden multiple type="file" onChange={e=>upload(e.target.files,false)}/></label><label className={`primary-btn ${busy?'disabled':''}`}><FolderOpen size={16}/> Ordner hochladen<input ref={folderInputRef} hidden multiple type="file" webkitdirectory="" directory="" onChange={e=>upload(e.target.files,true)}/></label></div>}</div>

    <div className="explorer-shell">
      <aside className="explorer-tree"><button className={`tree-root ${currentId===null?'active':''}`} onClick={()=>setCurrentId(null)}><FolderOpen size={17}/><span>Dateiablage</span></button><FolderTree folders={folders} currentId={currentId} onOpen={setCurrentId}/></aside>
      <section className="explorer-main">
        <div className="explorer-tools"><div className="breadcrumbs"><button onClick={()=>setCurrentId(null)}>Dateiablage</button>{path.map(f=><span key={f.id}><ChevronRight size={14}/><button onClick={()=>setCurrentId(f.id)}>{f.name}</button></span>)}</div><div className="inline-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Dateien und Ordner suchen"/>{query&&<button className="icon-btn" onClick={()=>setQuery('')}><X size={14}/></button>}</div></div>
        <div className="explorer-column-head"><span>Name</span><span>Typ / Größe</span><span></span></div>
        <div className="explorer-list">{list.length?list.map(({kind,item})=><ExplorerRow key={`${kind}:${item.id}`} kind={kind} item={item} folders={folders} searchMode={searchMode} canManage={canManage} menu={menu} setMenu={setMenu} onOpen={()=>kind==='folder'&&setCurrentId(item.id)} onRename={()=>kind==='folder'?renameFolder(item):renameFile(item)} onDelete={()=>kind==='folder'?removeFolder(item):removeFile(item)} onMove={()=>setMoveTarget({kind,item})}/>):<div className="explorer-empty">{searchMode?'Keine Treffer.':'Dieser Ordner ist leer.'}</div>}</div>
      </section>
    </div>
    {moveTarget&&<MoveDialog item={moveTarget.item} kind={moveTarget.kind} folders={folders} onClose={()=>setMoveTarget(null)} onMove={(target)=>moveTarget.kind==='folder'?moveFolder(moveTarget.item,target):moveFile(moveTarget.item,target)}/>} 
  </div>
}

function FolderTree({folders,currentId,onOpen,parentId=null,depth=0}){
  const children=folders.filter(f=>(f.parentId||null)===(parentId||null)).sort(sortByName)
  return children.map(folder=><div key={folder.id} className="tree-node-wrap"><button className={`tree-node ${currentId===folder.id?'active':''}`} style={{paddingLeft:12+depth*16}} onClick={()=>onOpen(folder.id)}><Folder size={16}/><span>{folder.name}</span></button><FolderTree folders={folders} currentId={currentId} onOpen={onOpen} parentId={folder.id} depth={depth+1}/></div>)
}

function ExplorerRow({kind,item,folders,searchMode,canManage,menu,setMenu,onOpen,onRename,onDelete,onMove}){
  const path=kind==='folder'?folderPath(folders,item.parentId):folderPath(folders,item.folderId)
  return <div className={`explorer-row ${kind}`} onDoubleClick={onOpen}><button className="explorer-name" onClick={onOpen}>{kind==='folder'?<Folder size={20}/>:fileIcon(item)}<span><strong>{item.name}</strong>{searchMode&&<small>{path.length?path.map(x=>x.name).join(' / '):'Dateiablage'}</small>}</span></button><span className="explorer-meta">{kind==='folder'?'Ordner':formatBytes(item.size)}</span><div className="explorer-actions">{kind==='file'&&<a className="icon-btn" href={fileDownloadUrl(item.id)} title="Herunterladen"><Download size={16}/></a>}{canManage&&<><button className="icon-btn" onClick={()=>setMenu(menu===`${kind}:${item.id}`?null:`${kind}:${item.id}`)}><MoreHorizontal size={17}/></button>{menu===`${kind}:${item.id}`&&<div className="explorer-menu"><button onClick={onRename}><Pencil size={14}/> Umbenennen</button><button onClick={onMove}><MoveRight size={14}/> Verschieben</button><button className="danger" onClick={onDelete}><Trash2 size={14}/> Löschen</button></div>}</>}</div></div>
}

function MoveDialog({item,kind,folders,onClose,onMove}){
  const [target,setTarget]=useState('')
  const forbidden=kind==='folder'?descendantIds(folders,item.id):new Set()
  const options=folders.filter(f=>!forbidden.has(f.id)).sort((a,b)=>collator.compare(folderPath(folders,a.id).map(x=>x.name).join('/'),folderPath(folders,b.id).map(x=>x.name).join('/')))
  return <div className="modal-backdrop"><div className="modal-card move-dialog"><div className="modal-head"><div><strong>Verschieben</strong><span>{item.name}</span></div><button className="icon-btn" onClick={onClose}><X size={17}/></button></div><label>Zielordner<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">Dateiablage</option>{options.map(f=><option key={f.id} value={f.id}>{folderPath(folders,f.id).map(x=>x.name).join(' / ')}</option>)}</select></label><div className="modal-actions"><button className="secondary-btn" onClick={onClose}>Abbrechen</button><button className="primary-btn" onClick={()=>onMove(target)}>Verschieben</button></div></div></div>
}
