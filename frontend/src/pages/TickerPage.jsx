import { useEffect, useState } from "react"
import { fetchTicker, fetchChartData } from "../api"
import FundamentalsTable from "../components/FundamentalsTable"
import NewsPanel from "../components/NewsPanel"
import VisualDiagram from "../components/VisualDiagram"

export default function TickerPage({ symbol, onBack }) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)

  const [chartData, setChartData]       = useState(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [chartError, setChartError]     = useState(null)

  const [activeTab, setActiveTab] = useState("overview")   // "overview" | "visual"

  // ── fetch main ticker data ──────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true); setError(null)
    fetchTicker(symbol)
      .then(result => {
        console.log("Ticker API response:", result)
        setData(result)
      })
      .catch(err => {
        console.log("Ticker API error:", err)
        setError("Failed to load data. Please try again.")
      })
      .finally(() => setLoading(false))
  }, [symbol])

  // ── fetch chart data when user clicks Visual tab ───────────────────────────
  useEffect(() => {
    if (activeTab !== "visual") return
    if (chartData || chartLoading) return   // already loaded or in-flight

    setChartLoading(true); setChartError(null)
    fetchChartData(symbol)
      .then(result => {
        console.log("Chart API response:", result)
        setChartData(result)
      })
      .catch(err => {
        console.log("Chart API error:", err)
        setChartError("Failed to load chart data. Please try again.")
      })
      .finally(() => setChartLoading(false))
  }, [activeTab, symbol])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── render states ──────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", color: "#666" }}>
      Loading {symbol}…
    </div>
  )
  if (error) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <p style={{ color: "#cc3300" }}>{error}</p>
      <button onClick={onBack} style={btnStyle}>Back</button>
    </div>
  )
  if (!data) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", color: "#666" }}>
      Loading…
    </div>
  )

  const { brief, price, valuation, financials, dividends, next_earnings, news } = data
  const changePct = price.change_pct ? (price.change_pct * 100).toFixed(2) : null
  const isUp = changePct >= 0

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>

      {/* Back */}
      <button onClick={onBack} style={{ ...btnStyle, marginBottom: 20 }}>← Back to search</button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: "#111" }}>{symbol}</h1>
          <span style={{ fontSize: 18, color: "#444" }}>{brief.name}</span>
          {price.current && (
            <span style={{ fontSize: 20, fontWeight: 600, color: isUp ? "#1a7a2e" : "#cc3300", marginLeft: "auto" }}>
              ${Number(price.current).toFixed(2)}
              {changePct !== null && (
                <span style={{ fontSize: 14, marginLeft: 6 }}>
                  {isUp ? "+" : ""}{changePct}%
                </span>
              )}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
          {brief.sector   !== "N/A" && <Tag>{brief.sector}</Tag>}
          {brief.industry !== "N/A" && <Tag color="#e8f0fe" textColor="#1a4ba0">{brief.industry}</Tag>}
          {brief.exchange !== "N/A" && <Tag color="#f0f0f0" textColor="#555">{brief.exchange}</Tag>}
          {brief.country  !== "N/A" && <Tag color="#f0f0f0" textColor="#555">{brief.country}</Tag>}
        </div>
      </div>

      {/* ── TAB BAR ──────────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", borderBottom: "2px solid #e8e8e8", marginBottom: 20 }}>
        {[["overview", "📊 Overview"], ["visual", "🔮 Visual Diagram"]].map(([tab, label]) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "10px 22px",
              fontSize: 14,
              fontWeight: 600,
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #0066cc" : "2px solid transparent",
              marginBottom: -2,
              background: "transparent",
              color: activeTab === tab ? "#0066cc" : "#888",
              cursor: "pointer",
              transition: "color .15s",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <>
          {/* Company description */}
          {brief.description && brief.description !== "No description available." && (
            <div style={cardStyle}>
              <SectionTitle>About</SectionTitle>
              <p style={{ fontSize: 14, color: "#444", lineHeight: 1.7, margin: 0 }}>
                {brief.description.length > 500
                  ? brief.description.slice(0, 500) + "…"
                  : brief.description}
              </p>
              <div style={{ display: "flex", gap: 20, marginTop: 12, fontSize: 13, color: "#666", flexWrap: "wrap" }}>
                {brief.employees && <span>{Number(brief.employees).toLocaleString()} employees</span>}
                {brief.website && brief.website !== "N/A" && (
                  <a href={brief.website} target="_blank" rel="noreferrer" style={{ color: "#0066cc" }}>
                    {brief.website}
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Next earnings */}
          {next_earnings && (
            <div style={{ ...cardStyle, background: "#fffbea", border: "1px solid #f5d76e", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 20 }}>📅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#7a5c00", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  Next earnings date
                </div>
                <div style={{ fontSize: 17, fontWeight: 600, color: "#3d2e00", marginTop: 2 }}>{next_earnings}</div>
              </div>
            </div>
          )}

          {/* Fundamentals */}
          <div style={cardStyle}>
            <SectionTitle>Fundamentals</SectionTitle>
            <FundamentalsTable
              price={price}
              valuation={valuation}
              financials={financials}
              dividends={dividends}
            />
          </div>

          {/* News */}
          <div style={cardStyle}>
            <SectionTitle>Latest news</SectionTitle>
            <NewsPanel news={news} />
          </div>
        </>
      )}

      {/* ── VISUAL DIAGRAM TAB ───────────────────────────────────────────────── */}
      {activeTab === "visual" && (
        <div style={{ ...cardStyle, background: "#03030c", border: "1px solid #0a0a25", padding: 0, overflow: "hidden" }}>
          <VisualDiagram
            chartData={chartData}
            loading={chartLoading}
            error={chartError}
          />
        </div>
      )}

    </div>
  )
}

// ── shared sub-components ──────────────────────────────────────────────────────
function Tag({ children, color = "#e6f4ea", textColor = "#1a5c2a" }) {
  return (
    <span style={{ fontSize: 12, padding: "3px 10px", borderRadius: 99, background: color, color: textColor, fontWeight: 500 }}>
      {children}
    </span>
  )
}

function SectionTitle({ children }) {
  return (
    <h2 style={{ fontSize: 13, fontWeight: 600, color: "#888", textTransform: "uppercase", letterSpacing: "0.8px", margin: "0 0 14px" }}>
      {children}
    </h2>
  )
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #e8e8e8",
  borderRadius: 10,
  padding: "18px 20px",
  marginBottom: 14,
}

const btnStyle = {
  background: "transparent",
  border: "1px solid #ddd",
  borderRadius: 6,
  padding: "6px 14px",
  fontSize: 13,
  cursor: "pointer",
  color: "#555",
}
