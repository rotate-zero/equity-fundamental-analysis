"""
chart_router.py
Price data:        FMP  /stable/historical-price-eod/full
Fundamentals:      Alpha Vantage  INCOME_STATEMENT + CASH_FLOW  (free tier)

Mount in main.py:
    from chart_router import router as chart_router
    app.include_router(chart_router)
"""

from fastapi import APIRouter, HTTPException
from datetime import datetime
import asyncio, httpx

router = APIRouter()

FMP_KEY  = "ys6mmlbxqX3ttCGFP1tD0ggbMfz9VgUl"
FMP_BASE = "https://financialmodelingprep.com/stable"

AV_KEY   = "VKQEPMVA9987HPWI"          # ← replace with your key
AV_BASE  = "https://www.alphavantage.co/query"

_cache: dict = {}
CACHE_MIN = 60


# ── cache ─────────────────────────────────────────────────────────────────────
def _fresh(symbol):
    if symbol not in _cache:
        return False
    return (datetime.now() - _cache[symbol]["ts"]).total_seconds() < CACHE_MIN * 60


# ── http helpers ──────────────────────────────────────────────────────────────
async def _fmp(client, path):
    sep = "&" if "?" in path else "?"
    r = await client.get(f"{FMP_BASE}{path}{sep}apikey={FMP_KEY}", timeout=15)
    r.raise_for_status()
    return r.json()

async def _av(client, params):
    p = {**params, "apikey": AV_KEY}
    r = await client.get(AV_BASE, params=p, timeout=20)
    r.raise_for_status()
    return r.json()


# ── price helpers ─────────────────────────────────────────────────────────────
def _safe_float(val):
    try:
        if val is None or str(val).strip() in ("", "None", "nan"):
            return 0.0
        return float(val)
    except Exception:
        return 0.0

def _first_nonzero(row, *keys):
    """Return the first non-zero float from the given keys in row."""
    for k in keys:
        v = _safe_float(row.get(k))
        if v != 0.0:
            return v
    return 0.0

def _extract_daily(raw):
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("historical") or raw.get("data") or []
    return []

def _resample_weekly(rows):
    weeks = {}
    for r in rows:
        try:
            d = datetime.strptime(r["date"][:10], "%Y-%m-%d")
        except Exception:
            continue
        k = f"{d.isocalendar()[0]}-W{d.isocalendar()[1]:02d}"
        if k not in weeks:
            weeks[k] = {"date": r["date"][:10], "close": r.get("close") or r.get("adjClose"),
                        "open": r.get("open"), "high": r.get("high"),
                        "low": r.get("low"),  "volume": r.get("volume", 0)}
    return [weeks[k] for k in sorted(weeks)[-9:]]

def _resample_monthly(rows):
    months = {}
    for r in rows:
        k = r["date"][:7]
        if k not in months:
            months[k] = {"date": r["date"][:10], "close": r.get("close") or r.get("adjClose"),
                         "open": r.get("open"), "high": r.get("high"),
                         "low": r.get("low"),  "volume": r.get("volume", 0)}
    return [months[k] for k in sorted(months)[-9:]]

def _enrich(rows):
    out = []
    for row in rows:
        r = dict(row)
        hi, lo = r.get("high") or 0, r.get("low") or 0
        cl, vol = r.get("close") or r.get("adjClose") or 0, r.get("volume") or 0
        rng = hi - lo
        if rng > 0:
            r["buy_volume"]  = int(vol * (cl - lo) / rng)
            r["sell_volume"] = int(vol * (hi - cl) / rng)
        else:
            r["buy_volume"] = r["sell_volume"] = int(vol // 2)
        r["total"] = int(vol)
        if "adjClose" in r and "close" not in r:
            r["close"] = r["adjClose"]
        out.append(r)
    return out


# ── fundamentals helpers ──────────────────────────────────────────────────────
def _parse_av(data: dict) -> list:
    """
    Parse AV INCOME_STATEMENT or CASH_FLOW dict.
    Returns list newest-first with normalised field names.
    Falls back across multiple AV field names so N/A quarters still get a value.
    """
    rows = []
    for r in data.get("quarterlyReports", []):
        rows.append({
            "period": r.get("fiscalDateEnding", "")[:7],
            "date":   r.get("fiscalDateEnding", ""),
            # income fields
            "revenue":   _first_nonzero(r, "totalRevenue", "grossProfit"),
            "netIncome": _first_nonzero(r, "netIncome",
                                           "netIncomeFromContinuingOperations",
                                           "comprehensiveIncomeNetOfTax",
                                           "ebit"),
            # cash flow fields (AV lowercase 'f': operatingCashflow)
            "operatingCashFlow": _first_nonzero(r, "operatingCashflow",
                                                    "operatingCashFlow",
                                                    "profitLoss",
                                                    "netIncome"),
        })
    return rows   # newest-first


def _yoy(curr, prior):
    """YoY % change. Returns directional ±100 when prior=0 to avoid N/A arms."""
    if curr is None:
        return None
    if prior and prior != 0:
        return round((curr - prior) / abs(prior) * 100, 1)
    if curr != 0:
        return 100.0 if curr > 0 else -100.0
    return None


def _build_quarterly(rows: list, field: str) -> list:
    """
    Newest-first rows → 4 most-recent quarters with YoY.
    Compares row[i] vs row[i+4] (same quarter last year).
    Returns oldest-first list of 4 dicts for the canvas arms.
    """
    if len(rows) < 5:
        return []

    result = []
    for i in range(3, -1, -1):          # 3=oldest-of-4, 0=newest
        curr_row  = rows[i]
        prior_row = rows[i + 4] if i + 4 < len(rows) else {}
        curr_val  = curr_row.get(field, 0) or 0
        prior_val = prior_row.get(field, 0) or 0
        period    = curr_row.get("period", "")
        val_b     = round(curr_val / 1e9, 2)
        result.append({
            "period": period,
            "value":  curr_val,
            "yoy":    _yoy(curr_val, prior_val),
            "label":  f"{period}  ${val_b}B",
        })
    return result   # result[0]=oldest arm, result[3]=newest arm


# ── debug endpoints ───────────────────────────────────────────────────────────

@router.get("/chart-debug-fund/{symbol}")
async def debug_fund(symbol: str):
    """Raw AV response summary + processed quarterly output."""
    symbol = symbol.upper().strip()
    out = {}
    async with httpx.AsyncClient() as client:
        for fn in ["INCOME_STATEMENT", "CASH_FLOW"]:
            try:
                data = await _av(client, {"function": fn, "symbol": symbol})
                qtrs = data.get("quarterlyReports", [])
                r0 = qtrs[0] if qtrs else {}
                parsed = _parse_av(data)
                field = "revenue" if fn == "INCOME_STATEMENT" else "operatingCashFlow"
                built = _build_quarterly(parsed, field)
                out[fn] = {
                    "quarterly_count": len(qtrs),
                    "parsed_count":    len(parsed),
                    "built_quarters":  len(built),
                    "built_data":      built,
                    "first_quarter":   r0.get("fiscalDateEnding"),
                    "sample_raw":      {k: r0.get(k) for k in
                                        ["totalRevenue","netIncome","operatingCashflow","grossProfit","profitLoss"]
                                        if k in r0},
                }
            except Exception as e:
                out[fn] = {"error": str(e)}
    return out


# ── main chart endpoint ───────────────────────────────────────────────────────

@router.get("/chart/{symbol}")
async def get_chart_data(symbol: str):
    symbol = symbol.upper().strip()

    if _fresh(symbol):
        return _cache[symbol]["data"]

    async with httpx.AsyncClient() as client:
        price_r, income_r, cashflow_r, profile_r = await asyncio.gather(
            _fmp(client, f"/historical-price-eod/full?symbol={symbol}&limit=270"),
            _av(client,  {"function": "INCOME_STATEMENT", "symbol": symbol}),
            _av(client,  {"function": "CASH_FLOW",        "symbol": symbol}),
            _fmp(client, f"/profile?symbol={symbol}"),
            return_exceptions=True,
        )

    # ── price ─────────────────────────────────────────────────────────────────
    if isinstance(price_r, Exception):
        raise HTTPException(502, f"Price fetch failed: {price_r}")

    raw_daily = _extract_daily(price_r)
    if not raw_daily:
        raise HTTPException(404, f"No price data for '{symbol}'")

    daily_9   = _enrich(list(reversed(raw_daily[:9])))
    weekly_9  = _enrich(_resample_weekly(raw_daily))
    monthly_9 = _enrich(_resample_monthly(raw_daily))

    # ── current price ─────────────────────────────────────────────────────────
    current_price = None
    change_pct    = None
    if not isinstance(profile_r, Exception) and profile_r:
        p = profile_r[0] if isinstance(profile_r, list) else profile_r
        current_price = p.get("price")
        change = p.get("changes")
        if current_price and change is not None:
            base = current_price - change
            if base:
                change_pct = round(change / base * 100, 2)

    # ── fundamentals ─────────────────────────────────────────────────────────
    revenue    = []
    net_income = []
    cash_flow  = []

    if not isinstance(income_r, Exception) and isinstance(income_r, dict):
        inc = _parse_av(income_r)
        revenue    = _build_quarterly(inc, "revenue")
        net_income = _build_quarterly(inc, "netIncome")
        if not revenue:
            print(f"[chart] {symbol} income: only {len(inc)} parsed rows, need 5+")
    else:
        print(f"[chart] {symbol} income error: {income_r}")

    if not isinstance(cashflow_r, Exception) and isinstance(cashflow_r, dict):
        cf = _parse_av(cashflow_r)
        cash_flow = _build_quarterly(cf, "operatingCashFlow")
        if not cash_flow:
            print(f"[chart] {symbol} cashflow: only {len(cf)} parsed rows, need 5+")
    else:
        print(f"[chart] {symbol} cashflow error: {cashflow_r}")

    result = {
        "symbol":        symbol,
        "current_price": current_price,
        "change_pct":    change_pct,
        "daily":         daily_9,
        "weekly":        weekly_9,
        "monthly":       monthly_9,
        "revenue":       revenue,
        "net_income":    net_income,
        "cash_flow":     cash_flow,
    }

    _cache[symbol] = {"data": result, "ts": datetime.now()}
    return result
