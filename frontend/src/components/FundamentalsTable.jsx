function fmt(val, type = "number") {
  if (val === null || val === undefined) return "—"
  if (type === "currency") {
    if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`
    if (val >= 1e9)  return `$${(val / 1e9).toFixed(2)}B`
    if (val >= 1e6)  return `$${(val / 1e6).toFixed(2)}M`
    return `$${Number(val).toLocaleString()}`
  }
  if (type === "percent") return `${(val * 100).toFixed(2)}%`
  if (type === "x")       return `${Number(val).toFixed(2)}x`
  if (type === "dollar")  return `$${Number(val).toFixed(2)}`
  return Number(val).toLocaleString()
}

const GROUPS = [
  {
    label: "Price",
    rows: [
      { label: "Current price",    key: ["price", "current"],        type: "dollar" },
      { label: "Previous close",   key: ["price", "previous_close"], type: "dollar" },
      { label: "Day high",         key: ["price", "day_high"],       type: "dollar" },
      { label: "Day low",          key: ["price", "day_low"],        type: "dollar" },
      { label: "52-week high",     key: ["price", "week_52_high"],   type: "dollar" },
      { label: "52-week low",      key: ["price", "week_52_low"],    type: "dollar" },
    ],
  },
  {
    label: "Valuation",
    rows: [
      { label: "Market cap",       key: ["valuation", "market_cap"],      type: "currency" },
      { label: "Enterprise value", key: ["valuation", "enterprise_value"], type: "currency" },
      { label: "P/E (trailing)",   key: ["valuation", "pe_ratio"],         type: "x" },
      { label: "P/E (forward)",    key: ["valuation", "forward_pe"],       type: "x" },
      { label: "P/B ratio",        key: ["valuation", "pb_ratio"],         type: "x" },
      { label: "P/S ratio",        key: ["valuation", "ps_ratio"],         type: "x" },
      { label: "PEG ratio",        key: ["valuation", "peg_ratio"],        type: "x" },
    ],
  },
  {
    label: "Financials",
    rows: [
      { label: "Revenue (TTM)",    key: ["financials", "revenue_ttm"],      type: "currency" },
      { label: "EPS (TTM)",        key: ["financials", "eps_ttm"],          type: "dollar" },
      { label: "EPS (forward)",    key: ["financials", "eps_forward"],      type: "dollar" },
      { label: "Gross margin",     key: ["financials", "gross_margin"],     type: "percent" },
      { label: "Profit margin",    key: ["financials", "profit_margin"],    type: "percent" },
      { label: "Operating margin", key: ["financials", "operating_margin"], type: "percent" },
      { label: "ROE",              key: ["financials", "roe"],              type: "percent" },
      { label: "ROA",              key: ["financials", "roa"],              type: "percent" },
      { label: "Debt / equity",    key: ["financials", "debt_to_equity"],   type: "x" },
      { label: "Current ratio",    key: ["financials", "current_ratio"],    type: "x" },
      { label: "Free cash flow",   key: ["financials", "free_cash_flow"],   type: "currency" },
    ],
  },
  {
    label: "Dividends & shares",
    rows: [
      { label: "Dividend yield",    key: ["dividends", "dividend_yield"],      type: "percent" },
      { label: "Dividend rate",     key: ["dividends", "dividend_rate"],       type: "dollar" },
      { label: "Payout ratio",      key: ["dividends", "payout_ratio"],        type: "percent" },
      { label: "Beta",              key: ["dividends", "beta"],                type: "number" },
      { label: "Shares outstanding",key: ["dividends", "shares_outstanding"], type: "number" },
      { label: "Float",             key: ["dividends", "float_shares"],        type: "number" },
      { label: "Short ratio",       key: ["dividends", "short_ratio"],         type: "x" },
    ],
  },
]

export default function FundamentalsTable({ price, valuation, financials, dividends }) {
  const sources = { price, valuation, financials, dividends }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20 }}>
      {GROUPS.map(group => (
        <div key={group.label}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 8 }}>
            {group.label}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {group.rows.map(row => {
                const [source, field] = row.key
                const val = sources[source]?.[field]
                return (
                  <tr key={row.label} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "6px 0", fontSize: 13, color: "#666" }}>{row.label}</td>
                    <td style={{ padding: "6px 0", fontSize: 13, fontWeight: 500, color: "#111", textAlign: "right" }}>
                      {fmt(val, row.type)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
