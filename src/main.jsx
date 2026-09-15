import React from 'react'
import ReactDOM from 'react-dom/client'
import PortalRoot from './PortalRoot.jsx'
import './v2.css'
import './production.css'
import './portal-v4.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <PortalRoot />
  </React.StrictMode>,
)
