import { useState } from "react"
import SearchPage from "./pages/SearchPage"
import TickerPage from "./pages/TickerPage"

export default function App() {
  const [currentSymbol, setCurrentSymbol] = useState(null)

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa", fontFamily: "system-ui, sans-serif" }}>
      {currentSymbol ? (
        <TickerPage symbol={currentSymbol} onBack={() => setCurrentSymbol(null)} />
      ) : (
        <SearchPage onSelect={setCurrentSymbol} />
      )}
    </div>
  )
}
