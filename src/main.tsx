import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './shared/theme/tokens.css'
import { App } from './App'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('找不到 #root 節點')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
