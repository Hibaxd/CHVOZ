import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type Language = 'cs' | 'en' | 'de'

const messages = {
  cs: {
    login: 'PŘIHLÁŠENÍ', account: 'ÚČET', logout: 'ODHLÁSIT', inventory: 'NASKLADNĚNÍ',
    gallery: 'GALERIE', archive: 'ARCHIV', shop: 'OBCHOD', about: 'O NÁS', shipping: 'DOPRAVA A PLATBA',
    contacts: 'KONTAKTY', information: 'INFORMACE', email: 'E-mail', password: 'Heslo', username: 'Uživatelské jméno',
    signIn: 'Přihlásit se', register: 'Registrovat se', createAccount: 'Vytvořit účet', noAccount: 'Ještě nemáš účet?',
    hasAccount: 'Účet už máš?', welcome: 'PŘIHLÁŠENÝ ÚČET', role: 'ROLE', save: 'ULOŽIT', addRow: 'PŘIDAT ŘÁDEK',
    available: 'DOSTUPNÉ NYNÍ', all: 'VŠE', apparel: 'ODĚV', object: 'OBJEKT', accessory: 'DOPLNĚK', objects: 'OBJEKTŮ',
    addToCart: 'Přidat do košíku', inStock: 'SKLADEM', last: 'POSLEDNÍ', size: 'VEL.', chooseSize: 'VYBER VELIKOST', backShop: 'ZPĚT / OBCHOD',
    aboutTitle: 'CHVOZ NENÍ\nJEN ZNAČKA.', aboutLead: 'Je to záznam míst, lidí a obrazů, které většinou zmizí dřív, než si jich někdo všimne.',
    aboutP1: 'CHVOZ vznikl v Praze z potřeby převádět šum kolem nás do fyzických objektů. Každý drop je uzavřená kapitola: oděv, kovový artefakt nebo obrazová stopa v malé sérii.',
    aboutP2: 'Vyrábíme lokálně, pomalu a bez sezónního kalendáře. Nehoníme trendy ani nekopírujeme velké série. Jakmile objekt zmizí, zůstává jen v archivu.', currentDrop: 'Prohlédnout aktuální drop',
    shippingTitle: 'DOPRAVA\nA PLATBA', shippingIntro: 'Všechno důležité před tím, než objekt opustí studio.',
    shipping1: 'Zásilkovna 89 Kč / PPL na adresu 129 Kč. Objednávky nad 2 500 Kč posíláme po ČR zdarma.', payment: 'PLATBA',
    shipping2: 'Dobírkou nebo bankovním převodem po nastavení účtu. Online kartu aktivujeme po připojení platební brány. Všechny ceny jsou včetně DPH.', dispatch: 'ODESLÁNÍ',
    shipping3: 'Skladové kusy balíme do 2—3 pracovních dnů. Po odeslání dostaneš e-mail s trackingem.', returns: 'VRÁCENÍ', shipping4: 'Nenošené zboží můžeš vrátit do 14 dnů. Napiš na studio@chvoz.cz a pošleme další kroky.',
    name: 'Název', price: 'Cena', stock: 'Počet kusů', category: 'Kategorie', edition: 'Edice', sizes: 'Velikosti oddělené čárkou', description: 'Popis', images: 'Obrázky', productCode: 'Kód produktu', productPoints: 'TEXTOVÉ BODY PRODUKTU', year: 'Rok', seriesCode: 'Kód série', objectCount: 'Počet objektů',
    cart: 'KOŠÍK', emptyCart: 'Košík je zatím prázdný.', browse: 'Projít objekty', subtotal: 'Mezisoučet', shippingNext: 'Doprava bude vypočítána v dalším kroku.', toCheckout: 'Pokračovat k pokladně', remove: 'Odstranit', checkout: 'POKLADNA', contact: 'KONTAKT', phone: 'Telefon', delivery: 'DORUČENÍ', firstName: 'Jméno', surname: 'Příjmení', address: 'Adresa', city: 'Město', zip: 'PSČ', shippingMethod: 'ZPŮSOB DOPRAVY', completeOrder: 'Dokončit objednávku', yourSelection: 'TVŮJ VÝBĚR',
    packeta: 'Zásilkovna', pplAddress: 'PPL na adresu', free: 'ZDARMA', bankTransfer: 'Bankovní převod', cashOnDelivery: 'Dobírka', notConfigured: 'NENÍ NASTAVEN', shippingCost: 'DOPRAVA', total: 'CELKEM', oneSize: 'JEDNA VELIKOST', savingOrder: 'UKLÁDÁM OBJEDNÁVKU…', gatewayNote: 'Online platby kartou se aktivují až po připojení obchodnického účtu platební brány. Backend je nikdy neoznačí jako zaplacené jen podle návratu prohlížeče.', serverPriceNote: 'Finální cenu i dostupnost vždy ověřuje server.',
    soldOut: 'VYPRODÁNO', archiveQuestion: 'Chceš zachytit další drop dřív, než zmizí?', currentObjects: 'Aktuální objekty',
    openImage: 'ZVĚTŠIT OBRÁZEK', closeImage: 'Zavřít obrázek', previousImage: 'Předchozí obrázek', nextImage: 'Další obrázek',
  },
  en: {
    login: 'SIGN IN', account: 'ACCOUNT', logout: 'SIGN OUT', inventory: 'INVENTORY',
    gallery: 'GALLERY', archive: 'ARCHIVE', shop: 'SHOP', about: 'ABOUT', shipping: 'SHIPPING & PAYMENT',
    contacts: 'CONTACTS', information: 'INFORMATION', email: 'Email', password: 'Password', username: 'Username',
    signIn: 'Sign in', register: 'Register', createAccount: 'Create account', noAccount: 'No account yet?',
    hasAccount: 'Already registered?', welcome: 'SIGNED-IN ACCOUNT', role: 'ROLE', save: 'SAVE', addRow: 'ADD ROW',
    available: 'AVAILABLE NOW', all: 'ALL', apparel: 'APPAREL', object: 'OBJECT', accessory: 'ACCESSORY', objects: 'OBJECTS',
    addToCart: 'Add to cart', inStock: 'IN STOCK', last: 'LAST', size: 'SIZE', chooseSize: 'CHOOSE SIZE', backShop: 'BACK / SHOP',
    aboutTitle: 'CHVOZ IS NOT\nJUST A BRAND.', aboutLead: 'It is a record of places, people and images that usually disappear before anyone notices them.',
    aboutP1: 'CHVOZ was created in Prague from the need to turn the noise around us into physical objects. Each drop is a closed chapter: a garment, a metal artefact or a visual trace in a small series.',
    aboutP2: 'We make locally, slowly and without a seasonal calendar. We do not chase trends or copy mass production. Once an object disappears, it remains only in the archive.', currentDrop: 'View current drop',
    shippingTitle: 'SHIPPING\n& PAYMENT', shippingIntro: 'Everything important before the object leaves the studio.',
    shipping1: 'Packeta €4 / delivery to address €6. Orders over €100 ship free within Czechia.', payment: 'PAYMENT',
    shipping2: 'Cash on delivery or bank transfer when configured. Card payments become available after connecting a payment gateway. All prices include VAT.', dispatch: 'DISPATCH',
    shipping3: 'In-stock pieces are packed within 2—3 business days. You will receive tracking by email.', returns: 'RETURNS', shipping4: 'Unworn goods can be returned within 14 days. Email studio@chvoz.cz for the next steps.',
    name: 'Name', price: 'Price', stock: 'Stock', category: 'Category', edition: 'Edition', sizes: 'Sizes separated by commas', description: 'Description', images: 'Images', productCode: 'Product code', productPoints: 'PRODUCT TEXT POINTS', year: 'Year', seriesCode: 'Series code', objectCount: 'Object count',
    cart: 'CART', emptyCart: 'Your cart is empty.', browse: 'Browse objects', subtotal: 'Subtotal', shippingNext: 'Shipping is calculated in the next step.', toCheckout: 'Continue to checkout', remove: 'Remove', checkout: 'CHECKOUT', contact: 'CONTACT', phone: 'Phone', delivery: 'DELIVERY', firstName: 'First name', surname: 'Last name', address: 'Address', city: 'City', zip: 'Postcode', shippingMethod: 'SHIPPING METHOD', completeOrder: 'Complete order', yourSelection: 'YOUR SELECTION',
    packeta: 'Packeta pickup point', pplAddress: 'PPL home delivery', free: 'FREE', bankTransfer: 'Bank transfer', cashOnDelivery: 'Cash on delivery', notConfigured: 'NOT CONFIGURED', shippingCost: 'SHIPPING', total: 'TOTAL', oneSize: 'ONE SIZE', savingOrder: 'SAVING ORDER…', gatewayNote: 'Online card payments will be enabled after connecting a merchant payment-gateway account. The backend never marks an order as paid solely from a browser return.', serverPriceNote: 'The server always verifies the final price and availability.',
    soldOut: 'SOLD OUT', archiveQuestion: 'Want to catch the next drop before it disappears?', currentObjects: 'Current objects',
    openImage: 'ENLARGE IMAGE', closeImage: 'Close image', previousImage: 'Previous image', nextImage: 'Next image',
  },
  de: {
    login: 'ANMELDEN', account: 'KONTO', logout: 'ABMELDEN', inventory: 'LAGER',
    gallery: 'GALERIE', archive: 'ARCHIV', shop: 'SHOP', about: 'ÜBER UNS', shipping: 'VERSAND & ZAHLUNG',
    contacts: 'KONTAKTE', information: 'INFORMATIONEN', email: 'E-Mail', password: 'Passwort', username: 'Benutzername',
    signIn: 'Anmelden', register: 'Registrieren', createAccount: 'Konto erstellen', noAccount: 'Noch kein Konto?',
    hasAccount: 'Schon registriert?', welcome: 'ANGEMELDETES KONTO', role: 'ROLLE', save: 'SPEICHERN', addRow: 'ZEILE HINZUFÜGEN',
    available: 'JETZT VERFÜGBAR', all: 'ALLE', apparel: 'KLEIDUNG', object: 'OBJEKT', accessory: 'ACCESSOIRE', objects: 'OBJEKTE',
    addToCart: 'In den Warenkorb', inStock: 'AUF LAGER', last: 'LETZTE', size: 'GR.', chooseSize: 'GRÖSSE WÄHLEN', backShop: 'ZURÜCK / SHOP',
    aboutTitle: 'CHVOZ IST NICHT\nNUR EINE MARKE.', aboutLead: 'Es ist eine Aufzeichnung von Orten, Menschen und Bildern, die meist verschwinden, bevor sie jemand bemerkt.',
    aboutP1: 'CHVOZ entstand in Prag aus dem Bedürfnis, das Rauschen um uns herum in physische Objekte zu verwandeln. Jeder Drop ist ein abgeschlossenes Kapitel: Kleidung, Metallartefakt oder Bildspur in Kleinserie.',
    aboutP2: 'Wir produzieren lokal, langsam und ohne Saisonkalender. Wir jagen keinen Trends hinterher und kopieren keine Massenware. Verschwindet ein Objekt, bleibt es nur im Archiv.', currentDrop: 'Aktuellen Drop ansehen',
    shippingTitle: 'VERSAND\n& ZAHLUNG', shippingIntro: 'Alles Wichtige, bevor das Objekt das Studio verlässt.',
    shipping1: 'Packeta 4 € / Lieferung an die Adresse 6 €. Ab 100 € versandkostenfrei innerhalb Tschechiens.', payment: 'ZAHLUNG',
    shipping2: 'Nachnahme oder Überweisung nach der Konfiguration. Kartenzahlungen werden nach Anschluss eines Zahlungsanbieters verfügbar. Alle Preise enthalten MwSt.', dispatch: 'VERSAND',
    shipping3: 'Lagerware wird innerhalb von 2—3 Werktagen verpackt. Die Sendungsnummer kommt per E-Mail.', returns: 'RÜCKGABE', shipping4: 'Ungetragene Ware kann innerhalb von 14 Tagen zurückgegeben werden. Schreibe an studio@chvoz.cz.',
    name: 'Name', price: 'Preis', stock: 'Bestand', category: 'Kategorie', edition: 'Edition', sizes: 'Größen durch Kommas getrennt', description: 'Beschreibung', images: 'Bilder', productCode: 'Produktcode', productPoints: 'PRODUKTMERKMALE', year: 'Jahr', seriesCode: 'Seriencode', objectCount: 'Anzahl Objekte',
    cart: 'WARENKORB', emptyCart: 'Dein Warenkorb ist leer.', browse: 'Objekte ansehen', subtotal: 'Zwischensumme', shippingNext: 'Versand wird im nächsten Schritt berechnet.', toCheckout: 'Weiter zur Kasse', remove: 'Entfernen', checkout: 'KASSE', contact: 'KONTAKT', phone: 'Telefon', delivery: 'LIEFERUNG', firstName: 'Vorname', surname: 'Nachname', address: 'Adresse', city: 'Stadt', zip: 'PLZ', shippingMethod: 'VERSANDART', completeOrder: 'Bestellung abschließen', yourSelection: 'DEINE AUSWAHL',
    packeta: 'Packeta-Abholstelle', pplAddress: 'PPL-Hauszustellung', free: 'KOSTENLOS', bankTransfer: 'Überweisung', cashOnDelivery: 'Nachnahme', notConfigured: 'NICHT EINGERICHTET', shippingCost: 'VERSAND', total: 'GESAMT', oneSize: 'EINHEITSGRÖSSE', savingOrder: 'BESTELLUNG WIRD GESPEICHERT…', gatewayNote: 'Online-Kartenzahlungen werden nach Anbindung eines Händlerkontos beim Zahlungsanbieter aktiviert. Das Backend markiert eine Bestellung niemals allein aufgrund der Browser-Rückkehr als bezahlt.', serverPriceNote: 'Endpreis und Verfügbarkeit werden immer vom Server geprüft.',
    soldOut: 'AUSVERKAUFT', archiveQuestion: 'Willst du den nächsten Drop sehen, bevor er verschwindet?', currentObjects: 'Aktuelle Objekte',
    openImage: 'BILD VERGRÖSSERN', closeImage: 'Bild schließen', previousImage: 'Vorheriges Bild', nextImage: 'Nächstes Bild',
  },
} as const

type MessageKey = keyof typeof messages.cs
interface LanguageValue { language: Language; setLanguage: (language: Language) => void; t: (key: MessageKey) => string }
const LanguageContext = createContext<LanguageValue | null>(null)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => (localStorage.getItem('chvoz-language') as Language) || 'cs')
  const setLanguage = (next: Language) => { localStorage.setItem('chvoz-language', next); setLanguageState(next); document.documentElement.lang = next }
  const value = useMemo(() => ({ language, setLanguage, t: (key: MessageKey) => messages[language][key] }), [language])
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error('useLanguage musí být uvnitř LanguageProvider')
  return context
}
