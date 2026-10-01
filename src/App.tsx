import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AboutPage } from './pages/AboutPage'
import { ArchivePage } from './pages/ArchivePage'
import { CheckoutPage } from './pages/CheckoutPage'
import { GalleryPage } from './pages/GalleryPage'
import { HomePage } from './pages/HomePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { ProductPage } from './pages/ProductPage'
import { ShippingPage } from './pages/ShippingPage'
import { ShopPage } from './pages/ShopPage'
import { AccountPage, LoginPage, RegisterPage } from './pages/AuthPage'
import { InventoryPage } from './pages/InventoryPage'
import { MediaManagerPage } from './pages/MediaManagerPage'
import { OrdersAdminPage } from './pages/OrdersAdminPage'
import { UsersAdminPage } from './pages/UsersAdminPage'
import { ProtectedRoute } from './components/ProtectedRoute'

// Router mapuje čisté české URL na jednotlivé obrazovky aplikace.
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="obchod" element={<ShopPage />} />
        <Route path="obchod/:slug" element={<ProductPage />} />
        <Route path="archiv" element={<ArchivePage />} />
        <Route path="galerie" element={<GalleryPage />} />
        <Route path="o-nas" element={<AboutPage />} />
        <Route path="doprava-a-platba" element={<ShippingPage />} />
        <Route path="pokladna" element={<CheckoutPage />} />
        <Route path="prihlaseni" element={<LoginPage />} />
        <Route path="registrace" element={<RegisterPage />} />
        <Route path="ucet" element={<AccountPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="sprava/naskladneni" element={<InventoryPage />} />
          <Route path="sprava/galerie" element={<MediaManagerPage mode="gallery" />} />
          <Route path="sprava/archiv" element={<MediaManagerPage mode="archive" />} />
          <Route path="sprava/objednavky" element={<OrdersAdminPage />} />
          <Route path="sprava/uzivatele" element={<UsersAdminPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
