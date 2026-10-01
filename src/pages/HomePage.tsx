import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowIcon } from '../components/Icons'

const portalLinks = [
  { index: '01', label: 'CHVOZ_STORE', sub: './OBJECTS_READY_TO_SHIP', to: '/obchod' },
  { index: '02', label: 'ARCHIVE.BORN.FROM.CHVOZ', sub: '/2023—2026_MEMORY_FILES', to: '/archiv' },
  { index: '03', label: 'CHZ_GALLERY_', sub: 'IMG://LIFE_BETWEEN_FRAMES', to: '/galerie' },
]

function SystemClock() {
  const [time, setTime] = useState(() => new Date())

  // Čas se aktualizuje každou sekundu a posiluje dojem živého terminálu.
  useEffect(() => {
    const interval = window.setInterval(() => setTime(new Date()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  return <span>{time.toLocaleTimeString('cs-CZ', { hour12: false })} CET</span>
}

export function HomePage() {
  return (
    <section className="home-hero">
      <div className="page-shell home-hero__grid">
        {/* Hlavní vstupy jsou jedinou navigací do obsahových sekcí webu. */}
        <nav className="portal-menu" aria-label="Hlavní rozcestník">
          {portalLinks.map((item) => (
            <Link className="portal-link" to={item.to} key={item.to}>
              <span className="portal-link__top">
                <span>{item.index}</span>
                <strong>{item.label}</strong>
                <ArrowIcon />
              </span>
              <span className="portal-link__sub" data-hover="ENTER/OPEN_CHANNEL">
                {item.sub}
              </span>
            </Link>
          ))}
        </nav>
      </div>

      {/* Spodní stavová lišta odkazuje na estetiku VHS přehrávače. */}
      <div className="hero-status">
        <div className="page-shell">
          <span>SP</span>
          <span className="record-dot">REC</span>
          <span>CH_03</span>
          <span>TRACKING +02</span>
          <SystemClock />
        </div>
      </div>
    </section>
  )
}
