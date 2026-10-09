import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import './styles/app.css'

// Registro mínimo de erros não tratados (substituível por um serviço de monitoramento).
window.addEventListener('unhandledrejection', (e) => { console.error('[diario] erro não tratado', e.reason) })
window.addEventListener('error', (e) => { console.error('[diario] erro', e.error ?? e.message) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
