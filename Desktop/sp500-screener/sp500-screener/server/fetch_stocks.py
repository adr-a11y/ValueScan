#!/usr/bin/env python3
"""
Fetches S&P 500 stock data using Yahoo Finance (yfinance + yahooquery).
No parquet files needed — works anywhere including Render.

Outputs:
  server/stocks_cache.json     — main screener data
  server/earnings_cache.json   — earnings dates
  server/technicals_cache.json — technical indicators
"""
import json
import os
import sys
import math
import time
import warnings
from datetime import datetime, timedelta

warnings.filterwarnings("ignore")

OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "stocks_cache.json")
EARNINGS_PATH = os.path.join(os.path.dirname(__file__), "earnings_cache.json")
TECHNICALS_PATH = os.path.join(os.path.dirname(__file__), "technicals_cache.json")

SP500_TICKERS = [
    "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM","ALB","ARE",
    "ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE","AAL","AEP","AXP","AIG",
    "AMT","AWK","AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","AAPL","AMAT","APTV","ACGL",
    "ADM","ANET","AJG","AIZ","T","ATO","ADSK","ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC",
    "BAX","BDX","WRB","BBY","TECH","BIIB","BLK","BX","BK","BA","BKNG","BWA","BSX","BMY","AVGO",
    "BR","BRO","BLDR","BXP","CHRW","CDNS","CZR","CPT","CPB","COF","CAH","KMX","CCL","CARR",
    "CTLT","CAT","CBOE","CBRE","CDW","CE","COR","CNC","CNP","CF","CHTR","CVX","CMG","CB","CHD",
    "CI","CINF","CTAS","CSCO","C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CAG","COP",
    "ED","STZ","CEG","COO","CPRT","GLW","CPAY","CTVA","CSGP","COST","CTRA","CRWD","CCI","CSX",
    "CMI","CVS","DHR","DRI","DVA","DAY","DE","DAL","XRAY","DVN","DXCM","FANG","DLR","DFS","DG",
    "DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK","DD","EMN","ETN","EBAY","ECL","EIX","EW",
    "EA","ELV","EMR","ENPH","ETR","EOG","EPAM","EQT","EFX","EQIX","EQR","ERIE","ESS","EL",
    "ETSY","EG","EXPD","EXPE","EXR","XOM","FFIV","FDS","FICO","FAST","FRT","FDX","FIS","FITB",
    "FSLR","FE","FI","FMC","F","FTNT","FTV","FOXA","FOX","BEN","FCX","GRMN","IT","GE","GEHC",
    "GEN","GNRC","GD","GIS","GM","GPC","GILD","GS","HAL","HIG","HAS","HCA","DOC","HSIC","HSY",
    "HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM","HPQ","HUBB","HUM","HBAN","HII",
    "IBM","IEX","IDXX","ITW","INCY","IR","PODD","INTC","ICE","IFF","IP","IPG","INTU","ISRG",
    "IVZ","INVH","IQV","IRM","JBHT","JBL","JKHY","J","JNJ","JCI","JPM","JNPR","K","KVUE",
    "KDP","KEY","KEYS","KMB","KIM","KMI","KLAC","KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS",
    "LEN","LLY","LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB","MTB","MRO","MPC","MKTX","MAR",
    "MMC","MLM","MAS","MA","MTCH","MKC","MCD","MCK","MDT","MRK","META","MET","MTD","MGM","MCHP",
    "MU","MSFT","MAA","MRNA","MHK","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS","MSI",
    "MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS","NEE","NKE","NI","NDSN","NSC","NTRS","NOC",
    "NCLH","NRG","NUE","NVDA","NVR","NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS",
    "PCAR","PKG","PLTR","PH","PAYX","PAYC","PYPL","PNR","PEP","PFE","PCG","PM","PSX","PNW",
    "PNC","POOL","PPG","PPL","PFG","PG","PGR","PLD","PRU","PEG","PTC","PSA","PHM","QRVO","PWR",
    "QCOM","DGX","RL","RJF","RTX","O","REG","REGN","RF","RSG","RMD","RVTY","ROK","ROL","ROP",
    "ROST","RCL","SPGI","CRM","SBAC","SLB","STX","SRE","NOW","SHW","SPG","SWKS","SJM","SNA",
    "SOLV","SO","LUV","SWK","SBUX","STT","STLD","STE","SYK","SMCI","SYF","SNPS","SYY","TMUS",
    "TROW","TTWO","TPR","TRGP","TGT","TEL","TDY","TFX","TER","TSLA","TXN","TXT","TMO","TJX",
    "TSCO","TT","TDG","TRV","TRMB","TFC","TYL","TSN","USB","UBER","UDR","ULTA","UNP","UAL",
    "UPS","URI","UNH","UHS","VLO","VTR","VLTO","VRSN","VRSK","VZ","VRTX","VTRS","VICI","V",
    "VST","VFC","VLTO","WAB","WBA","WMT","DIS","WBD","WM","WAT","WEC","WFC","WELL","WST","WDC",
    "WRK","WY","WHR","WMB","WTW","GWW","WYNN","XEL","XYL","YUM","ZBRA","ZBH","ZTS"
]
# Deduplicate
SP500_TICKERS = list(dict.fromkeys(SP500_TICKERS))


def safe_float(val):
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, 4)
    except:
        return None

def safe_int(val):
    if val is None:
        return None
    try:
        if isinstance(val, float) and math.isnan(val):
            return None
        return int(val)
    except:
        return None

def safe_str(val):
    if val is None:
        return None
    s = str(val)
    if s.lower() in ('nan', 'none', 'nat', ''):
        return None
    return s


def compute_technicals(history_df, symbol):
    """Compute RSI, MACD, SMA, EMA, Bollinger, Stochastic, ATR, volume ratio."""
    try:
        import pandas as pd
        import numpy as np

        df = history_df.copy()
        if len(df) < 30:
            return {}

        close = df['Close']
        high = df['High']
        low = df['Low']
        volume = df['Volume']

        # RSI(14)
        delta = close.diff()
        gain = delta.clip(lower=0).rolling(14).mean()
        loss = (-delta.clip(upper=0)).rolling(14).mean()
        rs = gain / loss.replace(0, float('nan'))
        rsi = 100 - (100 / (1 + rs))
        rsi14 = safe_float(rsi.iloc[-1])

        # MACD(12,26,9)
        ema12 = close.ewm(span=12, adjust=False).mean()
        ema26 = close.ewm(span=26, adjust=False).mean()
        macd_line = ema12 - ema26
        macd_signal = macd_line.ewm(span=9, adjust=False).mean()
        macd_hist = macd_line - macd_signal
        macd_line_val = safe_float(macd_line.iloc[-1])
        macd_signal_val = safe_float(macd_signal.iloc[-1])
        macd_hist_val = safe_float(macd_hist.iloc[-1])
        macd_bullish = bool(macd_line_val and macd_signal_val and macd_line_val > macd_signal_val)
        macd_crossover = bool(
            len(macd_line) > 2 and
            macd_line.iloc[-2] <= macd_signal.iloc[-2] and
            macd_line.iloc[-1] > macd_signal.iloc[-1]
        )

        # SMAs
        sma20 = safe_float(close.rolling(20).mean().iloc[-1])
        sma50 = safe_float(close.rolling(50).mean().iloc[-1])
        sma200 = safe_float(close.rolling(200).mean().iloc[-1]) if len(df) >= 200 else None

        # EMAs
        ema20 = safe_float(close.ewm(span=20, adjust=False).mean().iloc[-1])
        ema50 = safe_float(close.ewm(span=50, adjust=False).mean().iloc[-1])

        cur_price = safe_float(close.iloc[-1])
        above_sma20 = bool(cur_price and sma20 and cur_price > sma20)
        above_sma50 = bool(cur_price and sma50 and cur_price > sma50)
        above_sma200 = bool(cur_price and sma200 and cur_price > sma200)

        # Golden cross
        sma50_prev = safe_float(close.rolling(50).mean().iloc[-2]) if len(df) >= 51 else None
        sma200_prev = safe_float(close.rolling(200).mean().iloc[-2]) if len(df) >= 201 else None
        golden_cross = bool(
            sma50 and sma200 and sma50_prev and sma200_prev and
            sma50_prev <= sma200_prev and sma50 > sma200
        )

        # Bollinger Bands (20, 2σ)
        bb_mid = close.rolling(20).mean()
        bb_std = close.rolling(20).std()
        bb_upper = bb_mid + 2 * bb_std
        bb_lower = bb_mid - 2 * bb_std
        bb_upper_val = safe_float(bb_upper.iloc[-1])
        bb_mid_val = safe_float(bb_mid.iloc[-1])
        bb_lower_val = safe_float(bb_lower.iloc[-1])
        bb_range = (bb_upper_val - bb_lower_val) if (bb_upper_val and bb_lower_val) else None
        bb_pct_b = safe_float(
            (cur_price - bb_lower_val) / bb_range if (cur_price and bb_range and bb_range > 0) else None
        )

        # Stochastic %K/%D (14,3)
        low14 = low.rolling(14).min()
        high14 = high.rolling(14).max()
        stoch_range = high14 - low14
        stoch_k_raw = 100 * (close - low14) / stoch_range.replace(0, float('nan'))
        stoch_k = stoch_k_raw.rolling(3).mean()
        stoch_d = stoch_k.rolling(3).mean()
        stoch_k_val = safe_float(stoch_k.iloc[-1])
        stoch_d_val = safe_float(stoch_d.iloc[-1])

        # ATR(14)
        prev_close = close.shift(1)
        tr = pd.concat([
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs()
        ], axis=1).max(axis=1)
        atr14 = safe_float(tr.rolling(14).mean().iloc[-1])

        # Volume ratio (current vs 20-day avg)
        vol_avg = volume.rolling(20).mean()
        vol_ratio = safe_float(volume.iloc[-1] / vol_avg.iloc[-1] if vol_avg.iloc[-1] > 0 else None)

        # Trend composite
        signals = []
        if rsi14 and rsi14 < 30: signals.append("RSI Oversold")
        if rsi14 and rsi14 > 70: signals.append("RSI Overbought")
        if macd_bullish: signals.append("MACD Bullish")
        if macd_crossover: signals.append("MACD Crossover")
        if above_sma200: signals.append("Above 200 SMA")
        if golden_cross: signals.append("Golden Cross")
        if bb_pct_b is not None and bb_pct_b < 0.1: signals.append("Near BB Lower")
        if bb_pct_b is not None and bb_pct_b > 0.9: signals.append("Near BB Upper")

        bullish_count = sum([
            1 if above_sma20 else 0,
            1 if above_sma50 else 0,
            1 if above_sma200 else 0,
            1 if macd_bullish else 0,
            1 if (rsi14 and 40 < rsi14 < 70) else 0,
        ])
        if bullish_count >= 4:
            trend = "Bullish"
        elif bullish_count == 3:
            trend = "Neutral-Bullish"
        elif bullish_count == 2:
            trend = "Neutral-Bearish"
        else:
            trend = "Bearish"

        return {
            "rsi14": rsi14,
            "stochK": stoch_k_val,
            "stochD": stoch_d_val,
            "macdLine": macd_line_val,
            "macdSignal": macd_signal_val,
            "macdHistogram": macd_hist_val,
            "macdBullish": macd_bullish,
            "macdCrossover": macd_crossover,
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "ema20": ema20,
            "ema50": ema50,
            "aboveSma20": above_sma20,
            "aboveSma50": above_sma50,
            "aboveSma200": above_sma200,
            "goldenCross": golden_cross,
            "bbUpper": bb_upper_val,
            "bbMid": bb_mid_val,
            "bbLower": bb_lower_val,
            "bbPctB": bb_pct_b,
            "atr14": atr14,
            "volRatio": vol_ratio,
            "trendSignals": signals,
            "trend": trend,
        }
    except Exception as e:
        print(f"  Technicals error for {symbol}: {e}", file=sys.stderr)
        return {}


# ── Negative/positive keyword lists for news sentiment ───────────────────────
_NEG_KEYWORDS = [
    # Legal & regulatory
    'lawsuit', 'sued', 'litigation', 'fraud', 'investigation', 'probe',
    'sec charges', 'doj', 'ftc', 'fine', 'penalty', 'settlement',
    'indicted', 'subpoena', 'class action', 'recall', 'violation',
    'misconduct', 'accounting irregularit', 'restatement',
    # Financial distress
    'bankruptcy', 'bankrupt', 'default', 'downgrade', 'credit cut',
    'misses estimates', 'misses expectations', 'below expectations',
    'disappoints', 'issues warning', 'profit warning',
    'layoffs', 'mass layoff', 'restructuring charges', 'writedown',
    'write-off', 'impairment', 'plunges', 'tumbles',
    # Executive
    'ceo resigns', 'ceo fired', 'ceo ousted', 'cfo resigns',
    'executive departure', 'board ousts',
    # Macro risk (company-specific)
    'sanctions', 'export ban', 'trading halted', 'delisted',
]
_POS_KEYWORDS = [
    'beats estimates', 'beats expectations', 'exceeds estimates',
    'record revenue', 'record earnings', 'record profit',
    'raises guidance', 'raises forecast', 'upgraded', 'price target raised',
    'buyback', 'share repurchase', 'special dividend',
    'strong growth', 'strong demand', 'surges', 'rallies',
    'new contract', 'major contract', 'strategic partnership',
]


def fetch_news_sentiment(symbol):
    """
    Fetch up to 8 recent Yahoo Finance headlines for the symbol.
    Returns (sentiment_score, news_risk, top_headlines).
      sentiment_score: float, positive = good news, negative = bad news
      news_risk: 'High' | 'Moderate' | 'Low'
      top_headlines: list of {title, url, date, sentiment}
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        articles = ticker.news or []
        if not articles:
            return 0.0, 'Low', []

        neg_hits = 0
        pos_hits = 0
        headlines = []

        for article in articles[:8]:
            content = article.get('content', {})
            if not isinstance(content, dict):
                continue
            title = (content.get('title') or '').lower()
            summary = (content.get('summary') or '').lower()
            text = title + ' ' + summary
            url_obj = content.get('canonicalUrl') or {}
            url = url_obj.get('url', '') if isinstance(url_obj, dict) else ''
            pub_date = (content.get('pubDate') or '')[:10]
            orig_title = content.get('title') or ''

            article_neg = sum(1 for kw in _NEG_KEYWORDS if kw in text)
            article_pos = sum(1 for kw in _POS_KEYWORDS if kw in text)
            neg_hits += article_neg
            pos_hits += article_pos

            if article_neg > 0:
                sent = 'negative'
            elif article_pos > 0:
                sent = 'positive'
            else:
                sent = 'neutral'

            if orig_title:
                headlines.append({
                    'title': orig_title,
                    'url': url,
                    'date': pub_date,
                    'sentiment': sent,
                })

        total = len(articles[:8])
        # Risk threshold: 2+ distinct negative hits = High, 1 = Moderate
        if neg_hits >= 2:
            risk = 'High'
        elif neg_hits == 1:
            risk = 'Moderate'
        else:
            risk = 'Low'

        score = round((pos_hits - neg_hits) / max(total, 1), 2)
        return score, risk, headlines[:5]
    except Exception:
        return 0.0, 'Low', []



def fetch_blackrock_holding(symbol):
    """
    Fetch BlackRock's latest institutional holding for the symbol.
    Returns dict with: increased (bool), pctChange (float), shares (int), dateReported (str)
    or None if BlackRock is not in the top holders list.
    """
    try:
        import yfinance as yf
        ticker = yf.Ticker(symbol)
        ih = ticker.institutional_holders
        if ih is None or ih.empty:
            return None
        br = ih[ih['Holder'].str.contains('Blackrock|BlackRock|blackrock', case=False, na=False)]
        if br.empty:
            return None
        row = br.iloc[0]
        pct_change = row.get('pctChange')
        shares = row.get('Shares')
        date_reported = row.get('Date Reported')
        if pct_change is None:
            return None
        pct_change_f = float(pct_change)
        return {
            'blackrockIncreased': pct_change_f > 0,
            'blackrockPctChange': round(pct_change_f * 100, 2),  # convert to % (e.g. 0.0073 -> 0.73)
            'blackrockShares': int(shares) if shares is not None else None,
            'blackrockDateReported': str(date_reported)[:10] if date_reported is not None else None,
        }
    except Exception:
        return None


def compute_undervaluation_score(stock):
    score = 0
    consensus = (stock.get('analystConsensus') or '').lower()
    if 'strong buy' in consensus:
        score += 30
    elif 'buy' in consensus:
        score += 25
    elif 'hold' in consensus:
        score += 10

    rating = stock.get('overallRating') or ''
    rating_pts = {'S': 25, 'S-': 23, 'A+': 22, 'A': 20, 'A-': 18,
                  'B+': 15, 'B': 12, 'B-': 10, 'C+': 6, 'C': 4, 'C-': 2}
    score += rating_pts.get(rating, 0)

    dcf = stock.get('dcfScore') or 0
    score += min(int(dcf) * 3, 15)

    pe_s = stock.get('peScore') or 0
    score += min(int(pe_s) * 2, 10)

    pb_s = stock.get('pbScore') or 0
    score += min(int(pb_s) * 2, 10)

    pct_below = stock.get('pctBelowYearHigh') or 0
    if pct_below > 30:
        score += 10
    elif pct_below > 20:
        score += 7
    elif pct_below > 10:
        score += 4

    # News risk penalty
    news_risk = stock.get('newsRisk') or 'Low'
    if news_risk == 'High':
        score -= 15
    elif news_risk == 'Moderate':
        score -= 5

    return min(max(score, 0), 100)


def main():
    import yfinance as yf
    import pandas as pd

    print("Starting S&P 500 data fetch via Yahoo Finance...", file=sys.stderr)
    print(f"Fetching data for {len(SP500_TICKERS)} tickers", file=sys.stderr)

    today = datetime.now()
    min_date = today - timedelta(weeks=6)
    max_date = today - timedelta(weeks=2)

    # ── Step 1: Bulk download quotes + info ──────────────────────────────────
    # Download 1-year price history for all tickers in one batch call
    print("Downloading price history (1 year, all tickers)...", file=sys.stderr)
    try:
        hist_all = yf.download(
            SP500_TICKERS,
            period="1y",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        print(f"ERROR downloading price history: {e}", file=sys.stderr)
        sys.exit(1)

    print("Price history downloaded. Fetching fundamental data...", file=sys.stderr)

    # ── Step 2: Fetch fundamentals via yahooquery (faster batch) ─────────────
    try:
        from yahooquery import Ticker
        yq = Ticker(SP500_TICKERS, asynchronous=True)
        summary_detail = yq.summary_detail
        key_stats = yq.key_stats
        financial_data = yq.financial_data
        earnings_data = yq.earnings
        asset_profile = yq.asset_profile
    except Exception as e:
        print(f"WARNING: yahooquery batch fetch failed: {e}", file=sys.stderr)
        summary_detail = {}
        key_stats = {}
        financial_data = {}
        earnings_data = {}
        asset_profile = {}

    print("Fundamentals fetched. Computing per-stock data...", file=sys.stderr)

    stocks = []
    earnings_map = {}
    technicals_map = {}

    for i, symbol in enumerate(SP500_TICKERS):
        try:
            # ── Price history for this ticker ────────────────────────────────
            if len(SP500_TICKERS) == 1:
                hist = hist_all
            else:
                try:
                    hist = hist_all[symbol].dropna(how='all')
                except:
                    hist = pd.DataFrame()

            if hist.empty or len(hist) < 5:
                continue

            cur_price = safe_float(hist['Close'].iloc[-1])
            if not cur_price or cur_price <= 0:
                continue

            prev_close = safe_float(hist['Close'].iloc[-2]) if len(hist) >= 2 else cur_price
            day_change = safe_float(cur_price - prev_close) if prev_close else None
            day_change_pct = safe_float((cur_price - prev_close) / prev_close * 100) if prev_close else None

            year_high = safe_float(hist['High'].max())
            year_low = safe_float(hist['Low'].min())
            volume = safe_float(hist['Volume'].iloc[-1])
            avg_volume = safe_float(hist['Volume'].rolling(20).mean().iloc[-1])

            pct_below_year_high = safe_float(
                (year_high - cur_price) / year_high * 100 if year_high and year_high > 0 else None
            )

            # ── Fundamentals ─────────────────────────────────────────────────
            sd = summary_detail.get(symbol, {}) if isinstance(summary_detail, dict) else {}
            ks = key_stats.get(symbol, {}) if isinstance(key_stats, dict) else {}
            fd = financial_data.get(symbol, {}) if isinstance(financial_data, dict) else {}

            if isinstance(sd, str): sd = {}
            if isinstance(ks, str): ks = {}
            if isinstance(fd, str): fd = {}

            ap = asset_profile.get(symbol, {}) if isinstance(asset_profile, dict) else {}
            if isinstance(ap, str): ap = {}

            company_name = safe_str(ap.get('longName') or ap.get('shortName')) or symbol
            market_cap = safe_float(sd.get('marketCap') or ks.get('marketCap'))
            pe = safe_float(sd.get('trailingPE') or sd.get('forwardPE'))
            pb = safe_float(sd.get('priceToBook'))
            beta = safe_float(sd.get('beta'))
            shares = safe_float(ks.get('sharesOutstanding'))
            sector = safe_str(ap.get('sector') or sd.get('sector', ''))
            industry = safe_str(ap.get('industry') or sd.get('industry', ''))

            # ── Analyst consensus from financial_data.recommendationKey ─────────
            analyst_buy = 0
            analyst_hold = 0
            analyst_sell = 0
            analyst_strong_buy = 0
            analyst_strong_sell = 0
            analyst_consensus = "Hold"
            rec_mean = None

            try:
                rec_key = safe_str(fd.get('recommendationKey'))
                rec_mean = safe_float(fd.get('recommendationMean'))
                num_analysts = safe_int(fd.get('numberOfAnalystOpinions')) or 0

                if rec_key:
                    rec_key_lower = rec_key.lower().replace('_', ' ')
                    if rec_key_lower in ('strong buy', 'strongbuy'):
                        analyst_consensus = "Strong Buy"
                        analyst_strong_buy = num_analysts
                    elif rec_key_lower == 'buy':
                        analyst_consensus = "Buy"
                        analyst_buy = num_analysts
                    elif rec_key_lower == 'hold':
                        analyst_consensus = "Hold"
                        analyst_hold = num_analysts
                    elif rec_key_lower in ('underperform', 'sell'):
                        analyst_consensus = "Sell"
                        analyst_sell = num_analysts
                    elif rec_key_lower in ('strong sell', 'strongsell'):
                        analyst_consensus = "Sell"
                        analyst_strong_sell = num_analysts
                    else:
                        analyst_consensus = "Hold"
                        analyst_hold = num_analysts
                elif rec_mean is not None:
                    # Fallback: map recommendationMean (1=strong buy, 5=strong sell)
                    if rec_mean <= 1.5:
                        analyst_consensus = "Strong Buy"
                    elif rec_mean <= 2.5:
                        analyst_consensus = "Buy"
                    elif rec_mean <= 3.5:
                        analyst_consensus = "Hold"
                    else:
                        analyst_consensus = "Sell"
            except Exception:
                pass

            analyst_total = analyst_strong_buy + analyst_buy + analyst_hold + analyst_sell + analyst_strong_sell

            # ── Earnings date ─────────────────────────────────────────────────
            last_earnings_date = None
            earnings_weeks_ago = None
            try:
                ed = earnings_data.get(symbol) if isinstance(earnings_data, dict) else None
                if ed and isinstance(ed, dict):
                    chart = ed.get('earningsChart', {})
                    quarterly = chart.get('quarterly', [])
                    if quarterly:
                        # reportedDate is a Unix timestamp
                        reported_timestamps = [q.get('reportedDate') for q in quarterly if q.get('reportedDate')]
                        if reported_timestamps:
                            last_ts = max(reported_timestamps)
                            last_date = datetime.fromtimestamp(last_ts)
                            last_earnings_date = last_date.strftime("%Y-%m-%d")
                            earnings_map[symbol] = last_earnings_date
                            diff_days = (today - last_date).days
                            earnings_weeks_ago = round(diff_days / 7, 1)
            except Exception:
                pass

            # ── Scores and Overall Rating ──────────────────────────────────────
            pe_score = None
            pb_score = None
            dcf_score = None
            roe_score = None
            roa_score = None
            de_score = None
            overall_rating = None

            # Derive overallRating from recommendationMean:
            # 1.0-1.5 = S (Strong Buy), 1.5-2.0 = A (Buy)
            # 2.0-2.75 = B (Hold/Buy), 2.75-3.5 = C (Hold), 3.5+ = D (Sell)
            if rec_mean is not None:
                if rec_mean <= 1.5:
                    overall_rating = "S"
                elif rec_mean <= 2.0:
                    overall_rating = "A"
                elif rec_mean <= 2.75:
                    overall_rating = "B"
                elif rec_mean <= 3.5:
                    overall_rating = "C"
                else:
                    overall_rating = "D"

            # PE score: lower P/E = higher score (1-5)
            if pe and pe > 0:
                if pe < 10:   pe_score = 5
                elif pe < 15: pe_score = 4
                elif pe < 20: pe_score = 3
                elif pe < 30: pe_score = 2
                else:         pe_score = 1

            # PB score: use key_stats priceToBook (more reliable)
            pb_val = safe_float(ks.get('priceToBook'))
            if pb_val and pb_val > 0:
                pb = pb_val  # update pb for stock output
                if pb_val < 1:   pb_score = 5
                elif pb_val < 2: pb_score = 4
                elif pb_val < 3: pb_score = 3
                elif pb_val < 5: pb_score = 2
                else:            pb_score = 1
            elif pb and pb > 0:
                if pb < 1:   pb_score = 5
                elif pb < 2: pb_score = 4
                elif pb < 3: pb_score = 3
                elif pb < 5: pb_score = 2
                else:        pb_score = 1

            # ROE score: higher = better. returnOnEquity is a decimal (e.g. 0.15 = 15%)
            roe_raw = safe_float(fd.get('returnOnEquity'))
            if roe_raw is not None:
                roe_pct = roe_raw * 100
                if roe_pct >= 30:   roe_score = 5
                elif roe_pct >= 20: roe_score = 4
                elif roe_pct >= 12: roe_score = 3
                elif roe_pct >= 6:  roe_score = 2
                elif roe_pct > 0:   roe_score = 1

            # ROA score: higher = better. returnOnAssets is a decimal
            roa_raw = safe_float(fd.get('returnOnAssets'))
            if roa_raw is not None:
                roa_pct = roa_raw * 100
                if roa_pct >= 15:   roa_score = 5
                elif roa_pct >= 10: roa_score = 4
                elif roa_pct >= 5:  roa_score = 3
                elif roa_pct >= 2:  roa_score = 2
                elif roa_pct > 0:   roa_score = 1

            # Debt/Equity score: lower = better. debtToEquity from yahooquery is in % (e.g. 102.63 means 1.03x)
            de_raw = safe_float(fd.get('debtToEquity'))
            if de_raw is not None and de_raw >= 0:
                if de_raw < 20:    de_score = 5
                elif de_raw < 50:  de_score = 4
                elif de_raw < 100: de_score = 3
                elif de_raw < 200: de_score = 2
                else:              de_score = 1

            # DCF proxy via EV/EBITDA: lower = cheaper = higher score
            ev_ebitda = safe_float(ks.get('enterpriseToEbitda'))
            if ev_ebitda and ev_ebitda > 0:
                if ev_ebitda < 8:    dcf_score = 5
                elif ev_ebitda < 12: dcf_score = 4
                elif ev_ebitda < 18: dcf_score = 3
                elif ev_ebitda < 25: dcf_score = 2
                else:                dcf_score = 1

            # ── Technicals ────────────────────────────────────────────────────
            tech = compute_technicals(hist, symbol)
            if tech:
                technicals_map[symbol] = tech

            # ── News Sentiment ────────────────────────────────────────────────
            news_score, news_risk, news_headlines = fetch_news_sentiment(symbol)

            # ── BlackRock Holdings ────────────────────────────────────────────
            br_data = fetch_blackrock_holding(symbol)

            # ── Upside estimate ───────────────────────────────────────────────
            upside = None
            if pct_below_year_high and 'buy' in analyst_consensus.lower():
                upside = round(pct_below_year_high * 0.7, 1)

            stock = {
                "symbol": symbol,
                "companyName": company_name,
                "sector": sector,
                "industry": industry,
                "price": cur_price,
                "change": day_change,
                "changesPercentage": day_change_pct,
                "marketCap": market_cap,
                "yearHigh": year_high,
                "yearLow": year_low,
                "volume": volume,
                "avgVolume": avg_volume,
                "pe": pe,
                "priceToBook": pb,
                "evToEbitda": None,
                "overallRating": overall_rating,
                "dcfScore": dcf_score,
                "roeScore": roe_score,
                "roaScore": roa_score,
                "debtEquityScore": de_score,
                "peScore": pe_score,
                "pbScore": pb_score,
                "analystConsensus": analyst_consensus,
                "analystBuy": analyst_buy,
                "analystHold": analyst_hold,
                "analystSell": analyst_sell,
                "analystStrongBuy": analyst_strong_buy,
                "analystStrongSell": analyst_strong_sell,
                "analystTotal": analyst_total,
                "analystPriceTarget": safe_float(fd.get('targetMeanPrice')),
                "lastEarningsDate": last_earnings_date,
                "earningsWeeksAgo": earnings_weeks_ago,
                "pctBelowYearHigh": pct_below_year_high,
                "upside": upside,
                "historicPeMedian": None,
                "pctBelowHistoricPeMedian": None,
                "beta": beta,
                "description": None,
                # Technicals
                "rsi14": tech.get("rsi14"),
                "stochK": tech.get("stochK"),
                "stochD": tech.get("stochD"),
                "macdLine": tech.get("macdLine"),
                "macdSignal": tech.get("macdSignal"),
                "macdHistogram": tech.get("macdHistogram"),
                "macdBullish": tech.get("macdBullish"),
                "macdCrossover": tech.get("macdCrossover"),
                "sma20": tech.get("sma20"),
                "sma50": tech.get("sma50"),
                "sma200": tech.get("sma200"),
                "ema20": tech.get("ema20"),
                "ema50": tech.get("ema50"),
                "aboveSma20": tech.get("aboveSma20"),
                "aboveSma50": tech.get("aboveSma50"),
                "aboveSma200": tech.get("aboveSma200"),
                "goldenCross": tech.get("goldenCross"),
                "bbUpper": tech.get("bbUpper"),
                "bbMid": tech.get("bbMid"),
                "bbLower": tech.get("bbLower"),
                "bbPctB": tech.get("bbPctB"),
                "atr14": tech.get("atr14"),
                "volRatio": tech.get("volRatio"),
                "trendSignals": tech.get("trendSignals", []),
                "trend": tech.get("trend"),
                # News sentiment
                "newsSentimentScore": news_score,
                "newsRisk": news_risk,
                "newsHeadlines": news_headlines,
                # BlackRock institutional holding
                "blackrockIncreased": br_data.get('blackrockIncreased') if br_data else None,
                "blackrockPctChange": br_data.get('blackrockPctChange') if br_data else None,
                "blackrockShares": br_data.get('blackrockShares') if br_data else None,
                "blackrockDateReported": br_data.get('blackrockDateReported') if br_data else None,
            }

            stock["_undervaluationScore"] = compute_undervaluation_score(stock)
            stocks.append(stock)

            if (i + 1) % 50 == 0:
                print(f"  Processed {i+1}/{len(SP500_TICKERS)} tickers...", file=sys.stderr)

        except Exception as e:
            print(f"  Error processing {symbol}: {e}", file=sys.stderr)
            continue

    print(f"\nProcessed {len(stocks)} stocks.", file=sys.stderr)

    # Sort by undervaluation score
    stocks.sort(key=lambda x: x.get("_undervaluationScore", 0), reverse=True)

    # ── Save outputs ──────────────────────────────────────────────────────────
    result = {
        "sp500Stocks": stocks,
        "lastUpdated": datetime.now().isoformat(),
        "total": len(stocks),
        "sp500Count": len(SP500_TICKERS),
    }

    with open(OUTPUT_PATH, 'w') as f:
        json.dump(result, f, default=str)
    print(f"Saved {len(stocks)} stocks to stocks_cache.json", file=sys.stderr)

    with open(EARNINGS_PATH, 'w') as f:
        json.dump(earnings_map, f)
    print(f"Saved {len(earnings_map)} earnings dates to earnings_cache.json", file=sys.stderr)

    with open(TECHNICALS_PATH, 'w') as f:
        json.dump(technicals_map, f)
    print(f"Saved {len(technicals_map)} technicals to technicals_cache.json", file=sys.stderr)

    print("SUCCESS", flush=True)


if __name__ == "__main__":
    main()
