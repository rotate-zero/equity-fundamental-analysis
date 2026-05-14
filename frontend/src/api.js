const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000"

export async function searchTicker(symbol) {
  const res = await fetch(`${BASE}/search/${symbol}`)
  if (!res.ok) throw new Error("Not found")
  return res.json()
}

export async function fetchTicker(symbol) {
  const res = await fetch(`${BASE}/ticker/${symbol}`)
  if (!res.ok) throw new Error("Failed to fetch ticker data")
  return res.json()
}

export async function fetchChartData(symbol) {
  const res = await fetch(`${BASE}/chart/${symbol}`)
  if (!res.ok) throw new Error("Failed to fetch chart data")
  return res.json()
}
