import { useState, type FormEvent } from 'react'
import { useContent } from '../store/ContentContext'
import { useLanguage } from '../store/LanguageContext'
import { filesToDataUrls } from '../utils/files'
import { AdminShell } from './InventoryPage'

export function MediaManagerPage({ mode }: { mode: 'gallery' | 'archive' }) {
  const { addGalleryEntries, addArchiveEntries } = useContent()
  const { t } = useLanguage()
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')
    setSaving(true)
    const formElement = event.currentTarget
    const form = new FormData(formElement)

    try {
      const images = await filesToDataUrls((formElement.elements.namedItem('images') as HTMLInputElement).files)
      if (!images.length) throw new Error('Nahraj alespoň jeden obrázek.')
      const title = String(form.get('title')).trim()
      const year = String(form.get('year'))

      if (mode === 'gallery') {
        await addGalleryEntries(images.map((image) => ({ title, year, image })))
      } else {
        await addArchiveEntries(images.map((image) => ({
          title,
          year,
          image,
          code: String(form.get('code')),
          pieces: String(form.get('pieces')),
        })))
      }

      formElement.reset()
      setMessage('Obsah byl uložen do databáze a je vidět na veřejné stránce.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Obsah se nepodařilo uložit.')
    } finally {
      setSaving(false)
    }
  }

  const title = mode === 'gallery' ? t('gallery') : t('archive')
  return <AdminShell eyebrow={`STAFF_CHANNEL / ${mode.toUpperCase()}`} title={`${title} / SPRÁVA`}>
    <form className="admin-form media-form" onSubmit={submit}>
      <label>{t('name')}<input name="title" required placeholder={mode === 'gallery' ? 'FRAME_01' : 'NIGHT PASSAGE'} /></label>
      <label>{t('year')}<input name="year" required type="number" min="2023" defaultValue={new Date().getFullYear()} /></label>
      {mode === 'archive' && <><label>{t('seriesCode')}<input name="code" required placeholder="DROP_01" /></label><label>{t('objectCount')}<input name="pieces" required placeholder="08 OBJECTS" /></label></>}
      <label className="admin-form__wide">{t('images')}<input name="images" required type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple /></label>
      {message && <p className="form-message admin-form__wide">{message}</p>}
      <button className="button button--acid" type="submit" disabled={saving}>{saving ? 'UKLÁDÁM…' : `${t('save')} FOTOGRAFIE`}</button>
    </form>
  </AdminShell>
}
