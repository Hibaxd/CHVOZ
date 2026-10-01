import { useState, type FormEvent } from 'react'
import { useContent } from '../store/ContentContext'
import { useLanguage } from '../store/LanguageContext'
import type { ProductCategory } from '../types/shop'
import { filesToDataUrls } from '../utils/files'

export function InventoryPage() {
  const { addProduct } = useContent()
  const { t } = useLanguage()
  const [details, setDetails] = useState([''])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  // Formulář pošle data serveru; ID, slug i skutečné umístění obrázků vytváří backend.
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const images = await filesToDataUrls((formElement.elements.namedItem('images') as HTMLInputElement).files)
      if (!images.length) throw new Error('Nahraj alespoň jeden obrázek.')
      const sizes = String(form.get('sizes')).split(',').map((item) => item.trim()).filter(Boolean)

      await addProduct({
        name: String(form.get('name')).trim(),
        code: String(form.get('code') || `OBJECT_${Date.now().toString().slice(-4)}`),
        price: Number(form.get('price')),
        image: images[0],
        images,
        category: String(form.get('category')) as ProductCategory,
        description: String(form.get('description')),
        details: details.map((item) => item.trim()).filter(Boolean),
        sizes: sizes.length ? sizes : undefined,
        stock: Number(form.get('stock')),
        edition: String(form.get('edition') || new Date().getFullYear()),
      })

      formElement.reset()
      setDetails([''])
      setMessage('Produkt byl uložen do databáze a je vidět v obchodě.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Produkt se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  return <AdminShell eyebrow="STAFF_CHANNEL / INVENTORY" title={t('inventory')}>
    <form className="admin-form" onSubmit={submit}>
      <div className="admin-form__grid">
        <label>{t('name')}<input name="name" required /></label>
        <label>{t('productCode')}<input name="code" placeholder="DROP_01 / 2026" /></label>
        <label>{t('price')} / CZK<input name="price" required type="number" min="0" step="1" /></label>
        <label>{t('stock')}<input name="stock" required type="number" min="0" /></label>
        <label>{t('category')}<select name="category"><option value="oděv">{t('apparel')}</option><option value="objekt">{t('object')}</option><option value="doplněk">{t('accessory')}</option></select></label>
        <label>{t('edition')}<input name="edition" placeholder="DROP_01 / 2026" /></label>
        <label className="admin-form__wide">{t('sizes')}<input name="sizes" placeholder="S, M, L, XL" /></label>
        <label className="admin-form__wide">{t('description')}<textarea name="description" required rows={4} /></label>
        <label className="admin-form__wide">{t('images')}<input name="images" required type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple /></label>
      </div>
      <fieldset className="detail-editor"><legend>{t('productPoints')}</legend>
        {details.map((detail, index) => <div className="detail-editor__row" key={index}><span>+.</span><input aria-label={`Textový bod ${index + 1}`} value={detail} onChange={(event) => setDetails((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} />{details.length > 1 && <button type="button" onClick={() => setDetails((current) => current.filter((_, itemIndex) => itemIndex !== index))}>×</button>}</div>)}
        <button className="text-button" type="button" onClick={() => setDetails((current) => [...current, ''])}>+ {t('addRow')}</button>
      </fieldset>
      {message && <p className="form-message">{message}</p>}
      <button className="button button--acid" type="submit" disabled={saving}>{saving ? 'UKLÁDÁM…' : `${t('save')} PRODUKT`}</button>
    </form>
  </AdminShell>
}

export function AdminShell({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return <div className="page-view admin-page"><div className="page-shell"><header className="admin-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1></header>{children}<p className="security-note">Změny se ukládají do zabezpečené databáze serveru.</p></div></div>
}
