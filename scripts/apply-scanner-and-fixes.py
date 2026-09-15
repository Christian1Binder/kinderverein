from pathlib import Path
import json, re

# Keep the v4 migration idempotent: older runs may have already added these symbols.
p=Path('src/AppV2.jsx'); s=p.read_text()
for line in [
"import { Extension } from '@tiptap/core'",
"import Table from '@tiptap/extension-table'",
"import TableRow from '@tiptap/extension-table-row'",
"import TableHeader from '@tiptap/extension-table-header'",
"import TableCell from '@tiptap/extension-table-cell'",
"import Underline from '@tiptap/extension-underline'",
"import TextAlign from '@tiptap/extension-text-align'",
"import Highlight from '@tiptap/extension-highlight'",
"import Link from '@tiptap/extension-link'",
]:
    parts=s.split(line)
    if len(parts)>2:
        s=parts[0]+line+''.join(parts[1:]).replace(line,'')
# remove repeated canFinance declarations while retaining the first
needle="  const canFinance = isAdmin || (canBoard && hasPermission(project, user, 'finance_manage'))"
first=s.find(needle)
if first!=-1:
    rest=s[first+len(needle):].replace('\n'+needle,'')
    s=s[:first+len(needle)]+rest
p.write_text(s)

# Scanner runtime dependencies.
p=Path('package.json'); data=json.loads(p.read_text())
data.setdefault('dependencies',{})['jspdf']='^3.0.2'
data.setdefault('dependencies',{})['tesseract.js']='^6.0.1'
p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')

# Scanner styling.
p=Path('src/main.jsx'); s=p.read_text()
if "./document-scanner.css" not in s:
    anchor="import './file-explorer.css'"
    if anchor in s: s=s.replace(anchor,anchor+"\nimport './document-scanner.css'",1)
    else: s += "\nimport './document-scanner.css'\n"
p.write_text(s)

# File explorer scanner button + modal.
p=Path('src/FileExplorer.jsx'); s=p.read_text()
if "DocumentScanner" not in s:
    s=s.replace("import { deleteProjectFile, fileDownloadUrl, uploadProjectFile } from './lib/projectStore.js'", "import { deleteProjectFile, fileDownloadUrl, uploadProjectFile } from './lib/projectStore.js'\nimport DocumentScanner from './DocumentScanner.jsx'",1)
    s=s.replace("MoreHorizontal, Pencil, Trash2, Upload, X, MoveRight, Search,", "MoreHorizontal, Pencil, Trash2, Upload, X, MoveRight, Search, Camera,",1)
    s=s.replace("  const [moveTarget,setMoveTarget]=useState(null)", "  const [moveTarget,setMoveTarget]=useState(null)\n  const [scannerOpen,setScannerOpen]=useState(false)",1)
    old="<div className=\"header-actions\"><button className=\"secondary-btn\" onClick={addFolder}><FolderPlus size={16}/> Neuer Ordner</button><label className={`secondary-btn ${busy?'disabled':''}`}><Upload size={16}/> Dateien"
    new="<div className=\"header-actions\"><button className=\"secondary-btn\" onClick={addFolder}><FolderPlus size={16}/> Neuer Ordner</button><button className=\"secondary-btn\" onClick={()=>setScannerOpen(true)}><Camera size={16}/> Dokument scannen</button><label className={`secondary-btn ${busy?'disabled':''}`}><Upload size={16}/> Dateien"
    if old not in s: raise SystemExit('Explorer header anchor not found')
    s=s.replace(old,new,1)
    anchor="    {moveTarget&&<MoveDialog item={moveTarget.item} kind={moveTarget.kind} folders={folders} onClose={()=>setMoveTarget(null)} onMove={(target)=>moveTarget.kind==='folder'?moveFolder(moveTarget.item,target):moveFile(moveTarget.item,target)}/>} \n  </div>"
    repl="    {moveTarget&&<MoveDialog item={moveTarget.item} kind={moveTarget.kind} folders={folders} onClose={()=>setMoveTarget(null)} onMove={(target)=>moveTarget.kind==='folder'?moveFolder(moveTarget.item,target):moveFile(moveTarget.item,target)}/>} \n    <DocumentScanner open={scannerOpen} onClose={()=>setScannerOpen(false)} folderId={currentId} user={user} mutate={mutate} setToast={setToast} />\n  </div>"
    if anchor not in s: raise SystemExit('Explorer modal anchor not found')
    s=s.replace(anchor,repl,1)
p.write_text(s)

print('Portal duplicates fixed and professional document scanner wired')
