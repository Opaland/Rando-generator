import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Élément racine #root introuvable')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker : rend l'application ouvrable hors connexion et met en cache
// les fonds de carte déjà consultés. Uniquement en production — en
// développement il masquerait les modifications de code.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        // Contexte non sécurisé ou navigateur sans support : l'application
        // fonctionne exactement comme avant, simplement sans hors-ligne.
      })
  })
}
