from pathlib import Path

p=Path('src/main.jsx')
s=p.read_text()
if "./file-explorer.css" not in s:
    s=s.replace("import './portal-v4.css'", "import './portal-v4.css'\nimport './file-explorer.css'")
p.write_text(s)

p=Path('src/AppV2.jsx')
s=p.read_text()
if "import FileExplorer from './FileExplorer.jsx'" not in s:
    s=s.replace("import Treasurer from './Treasurer.jsx'", "import Treasurer from './Treasurer.jsx'\nimport FileExplorer from './FileExplorer.jsx'")
start=s.find('function Files({ project, user, mutate, setToast }) {')
end=s.find('\nfunction Calendar(', start)
if start == -1 or end == -1:
    raise SystemExit('Files component not found')
replacement="""function Files({ project, user, mutate, setToast }) {\n  return <FileExplorer project={project} user={user} mutate={mutate} setToast={setToast} hasPermission={hasPermission} />\n}\n"""
s=s[:start]+replacement+s[end:]
p.write_text(s)

print('Hierarchical file explorer wired')
