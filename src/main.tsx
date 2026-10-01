import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { CartProvider } from './store/CartContext'
import { AuthProvider } from './store/AuthContext'
import { ContentProvider } from './store/ContentContext'
import { LanguageProvider } from './store/LanguageContext'
import './styles.css'

// Vstup aplikace obalí stránky routerem a globálním stavem nákupního košíku.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <ContentProvider>
            <CartProvider>
              <App />
            </CartProvider>
          </ContentProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>,
)
