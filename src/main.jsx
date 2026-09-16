import React from 'react'
import ReactDOM from 'react-dom/client'
import PortalRoot from './PortalRoot.jsx'
import './v2.css'
import './production.css'
import './portal-v4.css'
import './file-explorer.css'
import './document-scanner.css'
import './preview-polls.css'
import './airportr-theme.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortalRoot />
  </React.StrictMode>,
)
