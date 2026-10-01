const allowedImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

// Pro jednoduchý JSON upload převede prohlížeč obrázky na data URL. Server data
// znovu dekóduje, ověří signaturu souboru a na disk uloží jen bezpečný formát.
export async function filesToDataUrls(files: FileList | null) {
  if (!files?.length) return []
  const selected = Array.from(files)
  if (selected.length > 8) throw new Error('Najednou můžeš nahrát maximálně 8 obrázků.')
  if (selected.some((file) => !allowedImageTypes.has(file.type))) throw new Error('Použij PNG, JPEG, WebP nebo GIF.')
  if (selected.some((file) => file.size > 1_200_000)) throw new Error('Jeden obrázek může mít maximálně 1,2 MB.')

  return Promise.all(selected.map((file) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Obrázek se nepodařilo načíst.'))
    reader.readAsDataURL(file)
  })))
}
