import { useMemo, useRef, useState } from 'react'
import { Camera, Check, Crop, FileSearch, ImagePlus, Loader2, RotateCw, ScanLine, SlidersHorizontal, Trash2, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { uploadProjectFile } from './lib/projectStore.js'

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,8)}`

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

function autoBounds(image) {
  const max = 700
  const scale = Math.min(1, max / Math.max(image.width, image.height))
  const w = Math.max(1, Math.round(image.width * scale))
  const h = Math.max(1, Math.round(image.height * scale))
  const c = document.createElement('canvas'); c.width=w; c.height=h
  const ctx = c.getContext('2d', { willReadFrequently:true })
  ctx.drawImage(image,0,0,w,h)
  const d = ctx.getImageData(0,0,w,h).data
  const lum=(x,y)=>{ const i=(y*w+x)*4; return .299*d[i]+.587*d[i+1]+.114*d[i+2] }
  const edge=[]
  for(let y=2;y<h-2;y+=2) for(let x=2;x<w-2;x+=2){
    const g=Math.abs(lum(x+2,y)-lum(x-2,y))+Math.abs(lum(x,y+2)-lum(x,y-2))
    if(g>70) edge.push([x,y])
  }
  if(edge.length<40) return {left:0,top:0,right:1,bottom:1}
  const xs=edge.map(p=>p[0]).sort((a,b)=>a-b), ys=edge.map(p=>p[1]).sort((a,b)=>a-b)
  const q=(arr,p)=>arr[Math.min(arr.length-1,Math.max(0,Math.floor(arr.length*p)))]
  const left=Math.max(0,q(xs,.04)-8), right=Math.min(w,q(xs,.96)+8), top=Math.max(0,q(ys,.04)-8), bottom=Math.min(h,q(ys,.96)+8)
  if((right-left)<w*.35 || (bottom-top)<h*.35) return {left:0,top:0,right:1,bottom:1}
  return {left:left/w,top:top/h,right:right/w,bottom:bottom/h}
}

async function renderPage(page, quality=.9) {
  const img=await loadImage(page.url)
  const b=page.crop || {left:0,top:0,right:1,bottom:1}
  const sx=Math.round(img.width*b.left), sy=Math.round(img.height*b.top)
  const sw=Math.max(1,Math.round(img.width*(b.right-b.left))), sh=Math.max(1,Math.round(img.height*(b.bottom-b.top)))
  const rot=((page.rotation||0)%360+360)%360
  const rotated=rot===90||rot===270
  const maxSide=2200, scale=Math.min(1,maxSide/Math.max(sw,sh))
  const rw=Math.max(1,Math.round(sw*scale)), rh=Math.max(1,Math.round(sh*scale))
  const c=document.createElement('canvas'); c.width=rotated?rh:rw; c.height=rotated?rw:rh
  const ctx=c.getContext('2d')
  ctx.save(); ctx.translate(c.width/2,c.height/2); ctx.rotate(rot*Math.PI/180)
  ctx.filter=page.mode==='gray' ? `grayscale(1) contrast(${page.contrast||1.15})` : `contrast(${page.contrast||1.05})`
  ctx.drawImage(img,sx,sy,sw,sh,-rw/2,-rh/2,rw,rh); ctx.restore()
  return {canvas:c,dataUrl:c.toDataURL('image/jpeg',quality)}
}

export default function DocumentScanner({ open, onClose, folderId, user, mutate, setToast }) {
  const inputRef=useRef(null)
  const [pages,setPages]=useState([])
  const [selected,setSelected]=useState(0)
  const [name,setName]=useState(()=>`Scan ${new Date().toLocaleDateString('de-DE').replaceAll('.','-')}`)
  const [busy,setBusy]=useState('')
  const page=pages[selected]
  const canSave=pages.length>0 && !busy
  const pageCount=pages.length

  const addFiles=async(fileList)=>{
    const files=Array.from(fileList||[]).filter(f=>f.type.startsWith('image/'))
    if(!files.length)return
    setBusy('Seiten werden vorbereitet …')
    try{
      const next=[]
      for(const file of files){
        const url=URL.createObjectURL(file); const img=await loadImage(url)
        next.push({id:uid(),url,file,crop:autoBounds(img),rotation:0,mode:'gray',contrast:1.18,ocr:''})
      }
      setPages(p=>[...p,...next]); setSelected(pages.length)
    }catch(e){setToast?.('Scan konnte nicht vorbereitet werden.')}finally{setBusy('');if(inputRef.current)inputRef.current.value=''}
  }

  const update=(patch)=>setPages(list=>list.map((p,i)=>i===selected?{...p,...patch}:p))
  const remove=()=>{ if(!page)return; URL.revokeObjectURL(page.url); setPages(list=>list.filter((_,i)=>i!==selected)); setSelected(i=>Math.max(0,Math.min(i,pages.length-2))) }
  const resetCrop=()=>update({crop:{left:0,top:0,right:1,bottom:1}})
  const autoCrop=async()=>{if(!page)return;const img=await loadImage(page.url);update({crop:autoBounds(img)})}

  const ocr=async()=>{
    if(!page||busy)return
    setBusy('Texterkennung läuft …')
    try{
      const { dataUrl }=await renderPage(page,.82)
      const Tesseract=await import('tesseract.js')
      const result=await Tesseract.recognize(dataUrl,'deu',{logger:m=>{if(m.status==='recognizing text')setBusy(`Texterkennung ${Math.round((m.progress||0)*100)} %`)}})
      update({ocr:(result.data?.text||'').trim()})
      setToast?.('Texterkennung abgeschlossen.')
    }catch(e){setToast?.('Texterkennung war nicht verfügbar. Der Scan kann trotzdem gespeichert werden.')}finally{setBusy('')}
  }

  const save=async()=>{
    if(!canSave)return
    setBusy('PDF wird erstellt …')
    try{
      const rendered=[]
      for(let i=0;i<pages.length;i++){setBusy(`PDF: Seite ${i+1} von ${pages.length}`);rendered.push(await renderPage(pages[i]))}
      const first=rendered[0].canvas
      const portrait=first.height>=first.width
      const pdf=new jsPDF({orientation:portrait?'portrait':'landscape',unit:'mm',format:'a4',compress:true})
      rendered.forEach((r,i)=>{
        if(i){const p=r.canvas.height>=r.canvas.width;pdf.addPage('a4',p?'portrait':'landscape')}
        const pw=pdf.internal.pageSize.getWidth(), ph=pdf.internal.pageSize.getHeight()
        const ratio=Math.min(pw/r.canvas.width,ph/r.canvas.height), w=r.canvas.width*ratio, h=r.canvas.height*ratio
        pdf.addImage(r.dataUrl,'JPEG',(pw-w)/2,(ph-h)/2,w,h,undefined,'FAST')
      })
      const blob=pdf.output('blob')
      const safe=(name.trim()||'Scan').replace(/[\\/:*?"<>|]+/g,'-')
      const file=new File([blob],`${safe}.pdf`,{type:'application/pdf'})
      setBusy('Scan wird hochgeladen …')
      const meta=await uploadProjectFile(file)
      const ocrText=pages.map(p=>p.ocr).filter(Boolean).join('\n\n')
      mutate(p=>p.files.push({...meta,folderId:folderId||null,source:'mobile-scan',scanPages:pages.length,ocrText,scannedAt:new Date().toISOString(),scannedBy:user?.name||user?.email||''}),`Dokument „${file.name}“ gescannt und abgelegt`)
      setToast?.(`Scan als PDF gespeichert${ocrText?' · OCR-Text erkannt':''}.`)
      pages.forEach(p=>URL.revokeObjectURL(p.url)); setPages([]); setSelected(0); onClose()
    }catch(e){setToast?.(e.message||'Scan konnte nicht gespeichert werden.')}finally{setBusy('')}
  }

  const crop=page?.crop||{left:0,top:0,right:1,bottom:1}
  const pct=v=>Math.round(v*100)
  if(!open)return null
  return <div className="modal-backdrop scan-backdrop"><div className="scan-modal">
    <header className="scan-head"><div><ScanLine size={22}/><div><strong>Dokument scannen</strong><span>Mehrseitiger PDF-Scan mit Zuschnitt, Optimierung und OCR</span></div></div><button className="icon-btn" onClick={onClose}><X size={18}/></button></header>
    <div className="scan-layout">
      <aside className="scan-pages"><label className="scan-add"><Camera size={18}/><span>Seite aufnehmen</span><input ref={inputRef} hidden type="file" accept="image/*" capture="environment" multiple onChange={e=>addFiles(e.target.files)}/></label>{pages.map((p,i)=><button key={p.id} className={`scan-thumb ${i===selected?'active':''}`} onClick={()=>setSelected(i)}><img src={p.url}/><span>Seite {i+1}</span>{p.ocr&&<Check size={13}/>}</button>)}</aside>
      <main className="scan-workspace">{page?<><div className="scan-preview"><img src={page.url} style={{transform:`rotate(${page.rotation||0}deg)`,filter:page.mode==='gray'?`grayscale(1) contrast(${page.contrast||1.18})`:`contrast(${page.contrast||1.05})`,clipPath:`inset(${pct(crop.top)}% ${100-pct(crop.right)}% ${100-pct(crop.bottom)}% ${pct(crop.left)}%)`}}/></div><div className="scan-tools"><button onClick={()=>update({rotation:(page.rotation+90)%360})}><RotateCw size={16}/> Drehen</button><button onClick={autoCrop}><Crop size={16}/> Automatisch zuschneiden</button><button onClick={()=>update({mode:page.mode==='gray'?'color':'gray'})}><SlidersHorizontal size={16}/> {page.mode==='gray'?'Farbe':'Dokumentmodus'}</button><button onClick={ocr}><FileSearch size={16}/> OCR</button><button className="danger" onClick={remove}><Trash2 size={16}/> Seite löschen</button></div><div className="scan-adjust"><label>Links <input type="range" min="0" max="35" value={pct(crop.left)} onChange={e=>update({crop:{...crop,left:+e.target.value/100}})}/></label><label>Rechts <input type="range" min="65" max="100" value={pct(crop.right)} onChange={e=>update({crop:{...crop,right:+e.target.value/100}})}/></label><label>Oben <input type="range" min="0" max="35" value={pct(crop.top)} onChange={e=>update({crop:{...crop,top:+e.target.value/100}})}/></label><label>Unten <input type="range" min="65" max="100" value={pct(crop.bottom)} onChange={e=>update({crop:{...crop,bottom:+e.target.value/100}})}/></label><label>Kontrast <input type="range" min="90" max="180" value={Math.round((page.contrast||1.18)*100)} onChange={e=>update({contrast:+e.target.value/100})}/></label><button className="text-btn" onClick={resetCrop}>Zuschnitt zurücksetzen</button></div>{page.ocr&&<details className="ocr-result"><summary>Erkannten Text anzeigen</summary><textarea value={page.ocr} onChange={e=>update({ocr:e.target.value})}/></details>}</>:<div className="scan-empty"><Camera size={38}/><h3>Erste Seite aufnehmen</h3><p>Auf dem Smartphone öffnet sich direkt die rückseitige Kamera.</p><label className="primary-btn"><ImagePlus size={16}/> Kamera / Bilder<input hidden type="file" accept="image/*" capture="environment" multiple onChange={e=>addFiles(e.target.files)}/></label></div>}</main>
    </div>
    <footer className="scan-footer"><div><label>Dateiname<input value={name} onChange={e=>setName(e.target.value)}/></label><span>{pageCount} Seite{pageCount===1?'':'n'} · Ziel: aktueller Ordner</span></div><div><button className="secondary-btn" onClick={onClose}>Abbrechen</button><button className="primary-btn" disabled={!canSave} onClick={save}>{busy?<><Loader2 className="spin" size={16}/>{busy}</>:<><ScanLine size={16}/> Als PDF speichern</>}</button></div></footer>
  </div></div>
}
