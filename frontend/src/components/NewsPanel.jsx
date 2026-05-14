export default function NewsPanel({ news }) {
  if (!news || news.length === 0) {
    return <p style={{ color: "#999", fontSize: 14 }}>No recent news found.</p>
  }

  return (
    <div>
      {news.map((item, i) => (
        <a
          key={i}
          href={item.link}
          target="_blank"
          rel="noreferrer"
          style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid #f0f0f0", textDecoration: "none", color: "inherit" }}
        >
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#0066cc", flexShrink: 0, marginTop: 6 }} />
          <div>
            <div style={{ fontSize: 14, color: "#111", lineHeight: 1.5, marginBottom: 3 }}>{item.title}</div>
            <div style={{ fontSize: 12, color: "#999" }}>
              {item.source} · {item.time}
            </div>
          </div>
        </a>
      ))}
    </div>
  )
}
