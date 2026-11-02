import React from 'react'
import ReactDOM from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import App from './App.jsx'
import { CityProvider } from './context/CityContext.jsx'
import { PrefsProvider } from './context/PrefsContext.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <CityProvider>
      <PrefsProvider><App /></PrefsProvider>
    </CityProvider>
  </React.StrictMode>
)
