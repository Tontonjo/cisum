// Cisum web player v0.9.0 - Entry point.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import '@fontsource-variable/bricolage-grotesque'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'

window.__cisumStarted = true // read by the start-up watchdog in index.html

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
