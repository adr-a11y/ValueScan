/**
 * Finance API integration — fetches S&P 500 stock data using the
 * Perplexity Finance connector tools (accessed via HTTP internally).
 * 
 * Since this backend cannot call tool functions directly, it uses
 * the finance data by fetching from the public finance parquet files
 * via DuckDB in a Python subprocess, OR by calling the finance API
 * proxy endpoint that's baked into the Perplexity infra.
 *
 * The approach: we use node-fetch to call our own /api/finance/* routes
 * which are proxy routes that call the finance tools via Python subprocess.
 */

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import type { Stock, ScreenerResult } from "@shared/schema";

const execAsync = promisify(exec);

// S&P 500 constituent tickers — using a canonical list
// We filter the full universe to these tickers
export const SP500_TICKERS = [
  "MMM","AOS","ABT","ABBV","ACN","ADBE","AMD","AES","AFL","A","APD","ABNB","AKAM","ALB","ARE","ALGN","ALLE","LNT","ALL","GOOGL","GOOG","MO","AMZN","AMCR","AEE","AAL","AEP","AXP","AIG","AMT","AWK","AMP","AME","AMGN","APH","ADI","ANSS","AON","APA","AAPL","AMAT","APTV","ACGL","ADM","ANET","AJG","AIZ","T","ATO","ADSK","ADP","AZO","AVB","AVY","AXON","BKR","BALL","BAC","BAX","BDX","WRB","BBY","TECH","BIIB","BLK","BX","BK","BA","BKNG","BWA","BSX","BMY","AVGO","BR","BRO","BF.B","BLDR","BXP","CHRW","CDNS","CZR","CPT","CPB","COF","CAH","KMX","CCL","CARR","CTLT","CAT","CBOE","CBRE","CDW","CE","COR","CNC","CNP","CF","CHTR","CVX","CMG","CB","CHD","CI","CINF","CTAS","CSCO","C","CFG","CLX","CME","CMS","KO","CTSH","CL","CMCSA","CAG","COP","ED","STZ","CEG","COO","CPRT","GLW","CPAY","CTVA","CSGP","COST","CTRA","CRWD","CCI","CSX","CMI","CVS","DHR","DRI","DVA","DAY","DE","DAL","XRAY","DVN","DXCM","FANG","DLR","DFS","DG","DLTR","D","DPZ","DOV","DOW","DHI","DTE","DUK","DD","EMN","ETN","EBAY","ECL","EIX","EW","EA","ELV","EMR","ENPH","ETR","EOG","EPAM","EQT","EFX","EQIX","EQR","ERIE","ESS","EL","ETSY","EG","EVRST","EXPD","EXPE","EXR","XOM","FFIV","FDS","FICO","FAST","FRT","FDX","FIS","FITB","FSLR","FE","FI","FMC","F","FTNT","FTV","FOXA","FOX","BEN","FCX","GRMN","IT","GE","GEHC","GEN","GNRC","GD","GIS","GM","GPC","GILD","GS","HAL","HIG","HAS","HCA","DOC","HSIC","HSY","HES","HPE","HLT","HOLX","HD","HON","HRL","HST","HWM","HPQ","HUBB","HUM","HBAN","HII","IBM","IEX","IDXX","ITW","INCY","IR","PODD","INTC","ICE","IFF","IP","IPG","INTU","ISRG","IVZ","INVH","IQV","IRM","JBHT","JBL","JKHY","J","JNJ","JCI","JPM","JNPR","K","KVUE","KDP","KEY","KEYS","KMB","KIM","KMI","KLAC","KHC","KR","LHX","LH","LRCX","LW","LVS","LDOS","LEN","LLY","LIN","LYV","LKQ","LMT","L","LOW","LULU","LYB","MTB","MRO","MPC","MKTX","MAR","MMC","MLM","MAS","MA","MTCH","MKC","MCD","MCK","MDT","MRK","META","MET","MTD","MGM","MCHP","MU","MSFT","MAA","MRNA","MHK","MOH","TAP","MDLZ","MPWR","MNST","MCO","MS","MOS","MSI","MSCI","NDAQ","NTAP","NFLX","NEM","NWSA","NWS","NEE","NKE","NI","NDSN","NSC","NTRS","NOC","NCLH","NRG","NUE","NVDA","NVR","NXPI","ORLY","OXY","ODFL","OMC","ON","OKE","ORCL","OTIS","PCAR","PKG","PLTR","PANW","PARA","PH","PAYX","PAYC","PYPL","PNR","PEP","PFE","PCG","PM","PSX","PNW","PNC","POOL","PPG","PPL","PFG","PG","PGR","PLD","PRU","PEG","PTC","PSA","PHM","QRVO","PWR","QCOM","RL","RJF","RTX","O","REG","REGN","RF","RSG","RMD","RVTY","ROK","ROL","ROP","ROST","RCL","SPGI","CRM","SBAC","SLB","STX","SRE","NOW","SHW","SPG","SWKS","SJM","SW","SNA","SOLV","SO","LUV","SWK","SBUX","STT","STLD","STE","SYK","SMCI","SYF","SNPS","SYY","TMUS","TROW","TTWO","TPR","TRGP","TGT","TEL","TDY","TFX","TER","TSLA","TXN","TPL","TXT","TMO","TJX","TSCO","TT","TDG","TRV","TRMB","TFC","TYL","TSN","USB","UBER","UDR","UHS","UNP","UAL","UPS","URI","UNH","UHS","VLO","VTR","VRSN","VRSK","VZ","VRTX","VTRS","VLTO","V","VST","VFC","VLTO","VMC","WRK","WAB","WBA","WMT","WBD","WM","WAT","WEC","WFC","WELL","WST","WDC","WY","WMB","WTW","GWW","WYNN","XEL","XYL","YUM","ZBRA","ZBH","ZTS"
];

interface FinanceParquetData {
  sp500Stocks: Stock[];
  lastUpdated: string;
}

// Read data from the committed JSON cache file (fast, no Python needed)
export async function fetchSP500ScreenerData(): Promise<FinanceParquetData> {
  const outputPath = path.join(process.cwd(), "server/stocks_cache.json");
  const raw = fs.readFileSync(outputPath, "utf-8");
  const data = JSON.parse(raw);
  return data;
}

// Run the Python script to fetch fresh data from Yahoo Finance (used by refresh endpoint)
export async function refreshSP500Data(): Promise<FinanceParquetData> {
  const scriptPath = path.join(process.cwd(), "server/fetch_stocks.py");
  const outputPath = path.join(process.cwd(), "server/stocks_cache.json");

  const { stdout, stderr } = await execAsync(`python3 ${scriptPath}`, {
    timeout: 600000, // 10 minutes
    maxBuffer: 100 * 1024 * 1024,
  });

  if (stderr && !stderr.includes("UserWarning") && !stderr.includes("FutureWarning") && !stderr.includes("HTTP Error 404")) {
    console.error("Python script stderr:", stderr.substring(0, 500));
  }

  const raw = fs.readFileSync(outputPath, "utf-8");
  const data = JSON.parse(raw);
  return data;
}
