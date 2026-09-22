#!/usr/bin/env node
/**
 * xueqiu.mjs — 雪球公开行情（匿名 cookie），MiMo 替代 DSH 的 xueqiu_* 工具面
 *
 * 用法:
 *   node xueqiu.mjs quote  SH600519,SZ300750,SH000001
 *   node xueqiu.mjs kline  SH600519 [day|week|month|5m|15m|30m|60m] [count]
 *   node xueqiu.mjs search 茅台
 *   node xueqiu.mjs news   [count]
 *
 * 说明: 无需登录；先访问 xueqiu.com/hq 播种匿名 cookie；400016 失效时自动重播再试。
 * volume 单位=股（A股 1手=100股）。与东财/新浪冲突时按交易技能冲突规则标注。
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
const STOCK = 'https://stock.xueqiu.com'
const SITE = 'https://www.xueqiu.com'

const SEED_URLS = ['https://xueqiu.com/hq', 'https://www.xueqiu.com/']
let cookie = ''

async function seedCookie() {
  for (const url of SEED_URLS) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000),
      })
      const seen = new Set()
      const pairs = []
      const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
      for (const raw of list) {
        const m = /^([^=;\s]+)=([^;]*)/.exec(String(raw || '').trim())
        if (m && !seen.has(m[1])) {
          seen.add(m[1])
          pairs.push(`${m[1]}=${m[2]}`)
        }
      }
      // Fallback: parse set-cookie from headers (Node sometimes folds)
      if (!seen.has('xq_a_token')) {
        const sc = res.headers.get('set-cookie') || ''
        for (const part of sc.split(/,(?=[^;]+=)/)) {
          const m = /^([^=;\s]+)=([^;]*)/.exec(part.trim())
          if (m && !seen.has(m[1])) {
            seen.add(m[1])
            pairs.push(`${m[1]}=${m[2]}`)
          }
        }
      }
      cookie = pairs.join('; ')
      if (seen.has('xq_a_token')) return cookie
    } catch {
      /* try next */
    }
  }
  // kline 常要求 u= 存在
  if (!/;\s*u=/.test(cookie) && cookie) cookie += '; u=' + Math.random().toString(36).slice(2)
  return cookie
}

async function ensureCookie(force = false) {
  if (cookie && !force) return cookie
  return seedCookie()
}

async function getJSON(base, path, params, depth = 0) {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  const url = base + path + (qs ? `?${qs}` : '')
  await ensureCookie()
  const headers = {
    'User-Agent': UA,
    Referer: base === STOCK ? 'https://xueqiu.com/' : 'https://www.xueqiu.com/',
    Accept: 'application/json, text/plain, */*',
  }
  if (cookie) headers.Cookie = cookie.replace(/['"]/g, '')
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) })
  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    if (depth < 1) {
      await ensureCookie(true)
      return getJSON(base, path, params, depth + 1)
    }
    throw new Error(`non-JSON from ${path}: ${text.slice(0, 200)}`)
  }
  const code = data?.error_code
  if (code === 400016 || code === '400016') {
    if (depth < 1) {
      await ensureCookie(true)
      return getJSON(base, path, params, depth + 1)
    }
    throw new Error('cookie_expired (400016) after reseed — wait 1-2 min and retry')
  }
  if (code && code !== 0) {
    throw new Error(`xueqiu error ${code}: ${data?.error_description || 'unknown'}`)
  }
  return data
}

const PERIOD = {
  day: 'day', week: 'week', month: 'month',
  '5m': '5m', '15m': '15m', '30m': '30m', '60m': '60m',
}

async function cmdQuote(symbolsArg) {
  const symbols = String(symbolsArg || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (!symbols.length) throw new Error('usage: quote SH600519,SZ300750')
  if (symbols.length > 20) throw new Error('max 20 symbols per call')
  const data = await getJSON(STOCK, '/v5/stock/batch/quote.json', {
    symbol: symbols.join(','),
    extend: 'detail',
  })
  const list = data?.data?.items || []
  const out = list.map((it) => {
    const q = it?.quote || {}
    return {
      symbol: it?.symbol || q.symbol,
      name: q.name,
      current: q.current,
      percent: q.percent,
      chg: q.chg,
      open: q.open,
      high: q.high,
      low: q.low,
      last_close: q.last_close,
      volume: q.volume,
      amount: q.amount,
      market_capital: q.market_capital,
      pe_ttm: q.pe_ttm,
      pb: q.pb,
      turnover_rate: q.turnover_rate,
    }
  })
  console.log(JSON.stringify({ source: 'xueqiu', count: out.length, items: out }, null, 2))
}

async function cmdKline(symbol, periodArg, countArg) {
  const symbol2 = String(symbol || '').trim()
  if (!symbol2) throw new Error('usage: kline SH600519 [day] [120]')
  const period = PERIOD[String(periodArg || 'day').toLowerCase()] || 'day'
  const count = Math.min(Math.max(parseInt(countArg, 10) || 120, 1), 500)
  const data = await getJSON(STOCK, '/v5/stock/chart/kline.json', {
    symbol: symbol2,
    begin: Date.now(),
    period,
    type: 'before',
    count: -count,
    indicator: 'kline',
  })
  const column = data?.data?.column || []
  const items = data?.data?.item || []
  if (!items.length) throw new Error(`empty kline for ${symbol2} period=${period} (check code like SH600519)`)
  const rows = items.map((arr) => {
    const o = {}
    column.forEach((c, i) => { o[c] = arr[i] })
    return o
  })
  console.log(JSON.stringify({ source: 'xueqiu', symbol: symbol2, period, count: rows.length, column, rows }, null, 2))
}

async function cmdSearch(q) {
  if (!q) throw new Error('usage: search 茅台')
  const data = await getJSON(SITE, '/query/v1/search/status.json', {
    q,
    count: 10,
  })
  // search status may differ — also try suggest API
  let items = data?.list || data?.items || []
  if (!items.length) {
    try {
      const sug = await getJSON(SITE, '/stock/search/suggest.json', { q, size: 10 })
      items = sug?.list || sug?.items || []
    } catch { /* ignore */ }
  }
  const out = items.map((it) => ({
    code: it.code || it.symbol || it.stock_code,
    name: it.name || it.title,
    market: it.market,
  })).filter((x) => x.code || x.name)
  console.log(JSON.stringify({ source: 'xueqiu', query: q, items: out }, null, 2))
}

async function cmdNews(countArg) {
  const count = Math.min(Math.max(parseInt(countArg, 10) || 10, 1), 30)
  const data = await getJSON(SITE, '/v5/stock/hot_news.json', { count }).catch(async () => {
    return getJSON(SITE, '/statuses/hot/listV2.json', { size: count })
  })
  const items = data?.data?.items || data?.items || data?.list || []
  const out = items.slice(0, count).map((it) => {
    const n = it.original_status || it
    return {
      title: n.title || n.description || n.text,
      time: n.created_at || n.time,
    }
  })
  console.log(JSON.stringify({ source: 'xueqiu', items: out }, null, 2))
}

async function main() {
  const [, , cmd, ...rest] = process.argv
  await ensureCookie()
  switch (cmd) {
    case 'quote': return cmdQuote(rest[0])
    case 'kline': return cmdKline(rest[0], rest[1], rest[2])
    case 'search': return cmdSearch(rest[0])
    case 'news': return cmdNews(rest[0])
    default:
      console.log('用法: node xueqiu.mjs <quote|kline|search|news> [args]')
      console.log('  quote  SH600519,SZ300750')
      console.log('  kline  SH600519 [day|week|month|5m|15m|30m|60m] [120]')
      console.log('  search 茅台')
      console.log('  news   [10]')
      process.exit(cmd ? 1 : 0)
  }
}

main().catch((e) => {
  console.error(String(e && e.message || e))
  process.exit(1)
})
