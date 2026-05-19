from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from chart_router import router as chart_router
#from fastapi.staticfiles import StaticFiles
import asyncio
import httpx
import feedparser

app = FastAPI(title="Ticker Research API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
    ],
    allow_methods=["GET"],
    allow_headers=["*"],
)

@app.get("/test-chart")
async def test_chart():
    return {"status": "chart router test ok"}

app.include_router(chart_router)

FMP_KEY  = "ys6mmlbxqX3ttCGFP1tD0ggbMfz9VgUl"
FMP_BASE = "https://financialmodelingprep.com/stable"

_cache = {}
CACHE_MINUTES = 60


def _is_fresh(symbol):
    if symbol not in _cache:
        return False
    age = (datetime.now() - _cache[symbol]["ts"]).total_seconds()
    return age < CACHE_MINUTES * 60


async def _get(client, path):
    sep = "&" if "?" in path else "?"
    url = f"{FMP_BASE}{path}{sep}apikey={FMP_KEY}"
    r = await client.get(url, timeout=10)
    r.raise_for_status()
    return r.json()


def _parse_news_rss(symbol):
    try:
        feed = feedparser.parse(
            f"https://finance.yahoo.com/rss/headline?s={symbol}"
        )
        news = []
        for entry in feed.entries[:10]:
            try:
                pub_dt = datetime(*entry.published_parsed[:6])
                h = (datetime.now() - pub_dt).total_seconds() / 3600
                if h < 1:
                    tl = "Just now"
                elif h < 24:
                    tl = f"{int(h)}h ago"
                else:
                    tl = f"{int(h / 24)}d ago"
            except Exception:
                tl = ""
            news.append({
                "title":  entry.get("title", ""),
                "link":   entry.get("link", ""),
                "source": entry.get("source", {}).get("title", "Yahoo Finance"),
                "time":   tl,
            })
        return news
    except Exception:
        return []


#@app.get("/")
#async def root():
#    return {"message": "Ticker API running", "example": "/ticker/AAPL"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/search/{symbol}")
async def search(symbol: str):
    symbol = symbol.upper().strip()
    async with httpx.AsyncClient() as client:
        try:
            data = await _get(client, f"/profile?symbol={symbol}")
            if not data or (isinstance(data, list) and len(data) == 0):
                raise HTTPException(
                    status_code=404, detail=f"'{symbol}' not found."
                )
            p = data[0] if isinstance(data, list) else data
            return {
                "symbol":   symbol,
                "name":     p.get("companyName") or p.get("name", ""),
                "exchange": p.get("exchange", ""),
            }
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=404, detail=f"'{symbol}' not found. ({e})"
            )


@app.get("/ticker/{symbol}")
async def get_ticker(symbol: str):
    symbol = symbol.upper().strip()

    if _is_fresh(symbol):
        return _cache[symbol]["data"]

    async with httpx.AsyncClient() as client:
        try:
            profile_r, ratios_r, income_r, calendar_r = await asyncio.gather(
                _get(client, f"/profile?symbol={symbol}"),
                _get(client, f"/ratios-ttm?symbol={symbol}"),
                _get(client, f"/income-statement?symbol={symbol}&limit=1"),
                _get(client, f"/earnings?symbol={symbol}&limit=5"),
                return_exceptions=True,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    if not profile_r or isinstance(profile_r, Exception):
        raise HTTPException(
            status_code=404, detail=f"Ticker '{symbol}' not found."
        )
    if isinstance(profile_r, list) and len(profile_r) == 0:
        raise HTTPException(
            status_code=404, detail=f"Ticker '{symbol}' not found."
        )

    p = profile_r[0] if isinstance(profile_r, list) else profile_r

    brief = {
        "name":        p.get("companyName") or p.get("name"),
        "description": p.get("description", "No description available."),
        "sector":      p.get("sector", "N/A"),
        "industry":    p.get("industry", "N/A"),
        "country":     p.get("country", "N/A"),
        "website":     p.get("website", "N/A"),
        "employees":   p.get("fullTimeEmployees"),
        "exchange":    p.get("exchange", "N/A"),
        "image":       p.get("image"),
        "ipo_date":    p.get("ipoDate"),
    }

    raw_range = str(p.get("range") or "")
    low52, high52 = None, None
    if "-" in raw_range:
        parts = raw_range.split("-")
        try:
            low52  = float(parts[0].strip())
            high52 = float(parts[1].strip())
        except Exception:
            pass

    current = p.get("price")
    change  = p.get("changes")
    chg_pct = (change / (current - change)) if current and change else None

    price = {
        "current":        current,
        "change":         change,
        "change_pct":     chg_pct,
        "week_52_high":   high52,
        "week_52_low":    low52,
        "day_high":       None,
        "day_low":        None,
        "previous_close": None,
    }

    valuation = {
        "market_cap":       p.get("mktCap"),
        "beta":             p.get("beta"),
        "pe_ratio":         p.get("pe"),
        "forward_pe":       None,
        "pb_ratio":         None,
        "ps_ratio":         None,
        "peg_ratio":        None,
        "enterprise_value": None,
    }

    financials = {
        "eps_ttm":          None,
        "revenue_ttm":      None,
        "gross_margin":     None,
        "profit_margin":    None,
        "operating_margin": None,
        "roe":              None,
        "roa":              None,
        "debt_to_equity":   None,
        "current_ratio":    None,
        "free_cash_flow":   None,
    }

    dividends = {
        "dividend_yield":     None,
        "shares_outstanding": None,
        "short_ratio":        None,
    }

    if ratios_r and not isinstance(ratios_r, Exception):
        r = (ratios_r[0] if isinstance(ratios_r, list)
             and len(ratios_r) > 0 else {})
        valuation.update({
            "pe_ratio":         r.get("peRatioTTM"),
            "forward_pe":       r.get("priceEarningsRatioTTM"),
            "pb_ratio":         r.get("priceToBookRatioTTM"),
            "ps_ratio":         r.get("priceToSalesRatioTTM"),
            "peg_ratio":        r.get("priceEarningsToGrowthRatioTTM"),
            "enterprise_value": r.get("enterpriseValueTTM"),
        })
        financials.update({
            "gross_margin":     r.get("grossProfitMarginTTM"),
            "profit_margin":    r.get("netProfitMarginTTM"),
            "operating_margin": r.get("operatingProfitMarginTTM"),
            "roe":              r.get("returnOnEquityTTM"),
            "roa":              r.get("returnOnAssetsTTM"),
            "debt_to_equity":   r.get("debtEquityRatioTTM"),
            "current_ratio":    r.get("currentRatioTTM"),
            "free_cash_flow":   r.get("freeCashFlowPerShareTTM"),
            "eps_ttm":          r.get("netIncomePerShareTTM"),
        })
        dividends["dividend_yield"] = r.get("dividendYieldTTM")

    if (income_r and not isinstance(income_r, Exception)
            and isinstance(income_r, list) and len(income_r) > 0):
        financials["revenue_ttm"] = income_r[0].get("revenue")
        if not financials["eps_ttm"]:
            financials["eps_ttm"] = income_r[0].get("eps")

    next_earnings = None
    today = datetime.now().date()
    if (calendar_r and not isinstance(calendar_r, Exception)
            and isinstance(calendar_r, list)):
        future = []
        for event in calendar_r:
            ds = event.get("date", "")
            try:
                d = datetime.strptime(ds[:10], "%Y-%m-%d").date()
                if d >= today:
                    future.append(d)
            except Exception:
                continue
        if future:
            future.sort()
            next_earnings = future[0].strftime("%B %d, %Y")

    loop = asyncio.get_event_loop()
    news = await loop.run_in_executor(None, _parse_news_rss, symbol)

    result = {
        "symbol":        symbol,
        "brief":         brief,
        "price":         price,
        "valuation":     valuation,
        "financials":    financials,
        "dividends":     dividends,
        "next_earnings": next_earnings,
        "news":          news,
    }

    _cache[symbol] = {"data": result, "ts": datetime.now()}
    return result

@app.get("/health")
def health():
    return {"status": "ok"}

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="dist", html=True), name="static")