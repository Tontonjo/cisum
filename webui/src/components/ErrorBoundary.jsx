// Cisum web player v0.9.0 - Error screen: replaces the blank page when the interface crashes.
import { Component } from 'react'

const QUEUE_KEY = 'cisum-queue' // saved play queue (store/player.js)

const box = { fontFamily: 'system-ui, sans-serif', maxWidth: 680, margin: '64px auto', padding: '0 16px', color: '#1a1c22' }
const button = { padding: '10px 20px', borderRadius: 999, border: '1px solid #74777f', background: 'transparent', cursor: 'pointer', marginRight: 8, marginTop: 8, font: 'inherit' }

/** Catches render errors of the whole application and shows what happened with ways to recover. */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Cisum crashed', error, info?.componentStack)
    this.componentStack = info?.componentStack || ''
  }

  resetPlayer = () => {
    try {
      localStorage.removeItem(QUEUE_KEY)
    } catch {
      /* storage unavailable */
    }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const details = `${error?.stack || error}\n${this.componentStack || ''}\nPage: ${window.location.href}\nBrowser: ${navigator.userAgent}`
    return (
      <div style={box} role="alert">
        <h1 style={{ fontWeight: 500 }}>Something went wrong</h1>
        <p>The page could not be displayed. Reload it; if it happens again, reset the player (the play queue saved in this browser is cleared, nothing else).</p>
        <p style={{ fontFamily: 'monospace', background: '#eef0f6', padding: 12, borderRadius: 8, overflowWrap: 'anywhere' }}>{String(error?.message || error)}</p>
        <button type="button" style={button} onClick={() => window.location.reload()}>Reload</button>
        <button type="button" style={button} onClick={this.resetPlayer}>Reset player and reload</button>
        <button type="button" style={button} onClick={() => navigator.clipboard?.writeText(details)}>Copy details</button>
        <details style={{ marginTop: 16 }}>
          <summary>Technical details</summary>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{details}</pre>
        </details>
      </div>
    )
  }
}
