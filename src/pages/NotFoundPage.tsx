import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="page-view page-shell simple-message">
      <span>[ TAPE ENDED / 404 ]</span>
      <h1>OBRAZ SE ZTRATIL.</h1>
      <Link to="/" className="button button--light">Návrat na signál</Link>
    </div>
  )
}
