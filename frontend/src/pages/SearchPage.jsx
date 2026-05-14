import { useState } from "react"
import { searchTicker } from "../api"

export default function SearchPage({ onSelect }) {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSearch = async () => {
    const q = query.trim().toUpperCase()
    if (!q) return
    setError(null)
    setLoading(true)
    try {
      const result = await searchTicker(q)
      onSelect(result.symbol)
    } catch (e) {
      setError(`"${q}" not found. Check the ticker symbol and try again.`)
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e) => {
    if (e.key === "Enter") handleSearch()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" }}>
      <div style={{ maxWidth: 480, width: "100%", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 600, color: "#111", marginBottom: 8 }}>Stock Research</h1>
        <p style={{ color: "#666", marginBottom: 32, fontSize: 15 }}>Enter a ticker symbol to see fundamentals, financials, and latest news</p>

        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={e => { setQuery(e.target.value.toUpperCase()); setError(null) }}
            onKeyDown={handleKey}
            placeholder="e.g. AAPL, TSLA, MSFT"
            autoFocus
            style={{ flex: 1, height: 44, padding: "0 16px", fontSize: 16, border: "1px solid #ddd", borderRadius: 8, outline: "none", background: "#fff" }}
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            style={{ height: 44, padding: "0 24px", background: loading ? "#999" : "#0066cc", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 500, cursor: loading ? "not-allowed" : "pointer" }}
          >
            {loading ? "..." : "Search"}
          </button>
        </div>

        {error && (
          <p style={{ marginTop: 16, color: "#cc3300", fontSize: 14 }}>{error}</p>
        )}

        <p style={{ marginTop: 32, fontSize: 13, color: "#aaa" }}>Try: AAPL · NVDA · TSLA · MSFT · AMZN</p>
      </div>
    </div>
  )
}
