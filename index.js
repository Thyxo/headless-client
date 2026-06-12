'use strict'

const http = require('http')
const { randomUUID } = require('crypto')
const mineflayer = require('mineflayer')

const PORT = Number(process.env.WEB_PORT || 3000)

const DEFAULT_BOT = {
  name: 'Main bot',
  host: process.env.MC_HOST || 'play.example.com',
  port: Number(process.env.MC_PORT || 25565),
  username: process.env.MC_USERNAME || 'player@example.com',
  avatar: process.env.MC_AVATAR || 'MHF_Steve',
  auth: process.env.MC_AUTH || 'microsoft',
  version: '1.8.9',
  reconnectDelayMs: 10000,
  antiKickEnabled: false,
  antiKickIntervalMs: 60000
}

const bots = new Map()

function timestamp () {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function stripMinecraftFormatting (text) {
  return String(text ?? '')
    .replace(/\u00A7[0-9a-fk-or]/gi, '')
    .replace(/&[0-9a-fk-or]/gi, '')
}

function createBotRecord (input = {}) {
  const config = {
    ...DEFAULT_BOT,
    name: input.name || DEFAULT_BOT.name,
    host: input.host || DEFAULT_BOT.host,
    port: Number(input.port || DEFAULT_BOT.port),
    username: input.username || DEFAULT_BOT.username,
    avatar: input.avatar || safeAvatarIdentifier(input.username) || DEFAULT_BOT.avatar,
    auth: input.auth || DEFAULT_BOT.auth
  }

  const record = {
    id: randomUUID(),
    config,
    bot: null,
    reconnectTimer: null,
    antiKickTimer: null,
    status: 'stopped',
    loggedIn: false,
    shouldReconnect: false,
    lastMessage: 'Ready',
    logs: []
  }

  bots.set(record.id, record)
  log(record, 'System', 'Bot created')
  return record
}

function log (record, scope, message) {
  const line = { time: timestamp(), scope, message: stripMinecraftFormatting(message) }
  record.lastMessage = line.message
  record.logs.push(line)
  record.logs = record.logs.slice(-80)
  console.log(`[${line.time}] [${record.config.name}] [${scope}] ${line.message}`)
}

function safeAvatarIdentifier (value) {
  const text = String(value || '').trim()
  if (/^[a-zA-Z0-9_]{3,16}$/.test(text)) return text
  if (/^[a-fA-F0-9-]{32,36}$/.test(text)) return text
  return ''
}

function publicBot (record) {
  const inventory = record.bot?.inventory?.slots
    ?.map((item, slot) => item ? {
      slot,
      name: item.name,
      displayName: item.displayName,
      count: item.count
    } : null)
    .filter(Boolean) || []

  return {
    id: record.id,
    config: record.config,
    status: record.status,
    loggedIn: record.loggedIn,
    lastMessage: record.lastMessage,
    inventory,
    logs: record.logs
  }
}

function startBot (record) {
  if (record.bot || record.status === 'connecting') return

  clearTimers(record)
  record.status = 'connecting'
  record.loggedIn = false
  record.shouldReconnect = true
  log(record, 'System', `Connecting to ${record.config.host}:${record.config.port}`)

  const bot = mineflayer.createBot({
    host: record.config.host,
    port: record.config.port,
    username: record.config.username,
    auth: record.config.auth,
    version: record.config.version
  })

  record.bot = bot

  bot.once('login', () => {
    record.loggedIn = true
    record.status = 'online'
    log(record, 'System', `Logged in as ${bot.username}`)
    startAntiKick(record)
  })

  bot.on('chat', (username, message) => log(record, 'Chat', `${username}: ${message}`))

  bot.on('messagestr', (message, position) => {
    if (position === 2) return
    const clean = stripMinecraftFormatting(message).trim()
    if (!clean || clean.includes(': ')) return
    log(record, 'Chat', clean)
  })

  bot.on('kicked', (reason) => {
    record.loggedIn = false
    log(record, 'System', `Kicked: ${formatReason(reason)}`)
  })

  bot.on('end', (reason) => {
    record.bot = null
    record.loggedIn = false
    record.status = 'stopped'
    clearTimers(record)

    if (!record.shouldReconnect) {
      log(record, 'System', 'Stopped')
      return
    }

    log(record, 'System', `Disconnected: ${formatReason(reason)}`)
    scheduleReconnect(record)
  })

  bot.on('error', (err) => log(record, 'System', `Error: ${err.message}`))
}

function stopBot (record) {
  record.shouldReconnect = false
  record.status = 'stopping'
  clearTimers(record)

  if (!record.bot) {
    record.status = 'stopped'
    record.loggedIn = false
    log(record, 'System', 'Stopped')
    return
  }

  record.bot.end()
}

function scheduleReconnect (record) {
  if (!record.shouldReconnect || record.reconnectTimer) return
  record.status = 'reconnecting'
  log(record, 'System', `Reconnecting in ${record.config.reconnectDelayMs / 1000}s`)
  record.reconnectTimer = setTimeout(() => {
    record.reconnectTimer = null
    startBot(record)
  }, record.config.reconnectDelayMs)
}

function startAntiKick (record) {
  if (!record.config.antiKickEnabled) return
  record.antiKickTimer = setInterval(() => {
    if (!record.bot || !record.loggedIn) return
    try {
      record.bot.swingArm('right')
      log(record, 'System', 'Anti-kick action sent')
    } catch (err) {
      log(record, 'System', `Anti-kick failed: ${err.message}`)
    }
  }, record.config.antiKickIntervalMs)
}

function clearTimers (record) {
  if (record.reconnectTimer) clearTimeout(record.reconnectTimer)
  if (record.antiKickTimer) clearInterval(record.antiKickTimer)
  record.reconnectTimer = null
  record.antiKickTimer = null
}

function formatReason (reason) {
  if (!reason) return 'No reason provided'
  if (typeof reason === 'string') return stripMinecraftFormatting(reason)
  try {
    return stripMinecraftFormatting(JSON.stringify(reason))
  } catch {
    return String(reason)
  }
}

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms) || 0)))
}

function requireOnline (record) {
  if (!record.bot || !record.loggedIn) throw new Error('Bot is not online')
}

async function runControl (record, input = {}) {
  requireOnline(record)
  const bot = record.bot
  const action = String(input.action || '').toLowerCase()
  const duration = Math.min(Number(input.duration || 350), 30000)

  if (['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint'].includes(action)) {
    bot.setControlState(action, true)
    await sleep(duration)
    bot.setControlState(action, false)
    log(record, 'Control', `${action} ${duration}ms`)
    return
  }

  if (action === 'stopmove') {
    for (const key of ['forward', 'back', 'left', 'right', 'jump', 'sneak', 'sprint']) bot.setControlState(key, false)
    log(record, 'Control', 'Stopped movement')
    return
  }

  if (action === 'hotbar') {
    const slot = Math.max(1, Math.min(9, Number(input.slot || 1))) - 1
    bot.setQuickBarSlot(slot)
    log(record, 'Control', `Selected hotbar ${slot + 1}`)
    return
  }

  if (action === 'swing') {
    bot.swingArm('right')
    log(record, 'Control', 'Swing arm')
    return
  }

  if (action === 'use') {
    bot.activateItem()
    log(record, 'Control', 'Use held item')
    return
  }

  if (action === 'deactivate') {
    bot.deactivateItem()
    log(record, 'Control', 'Stopped using item')
    return
  }

  if (action === 'drop') {
    await bot.tossStack(bot.heldItem)
    log(record, 'Control', 'Dropped held stack')
    return
  }

  if (action === 'click') {
    const slot = Number(input.slot)
    if (!Number.isInteger(slot)) throw new Error('Slot must be a number')
    await bot.clickWindow(slot, Number(input.button || 0), Number(input.mode || 0))
    log(record, 'Control', `Clicked inventory slot ${slot}`)
    return
  }

  throw new Error(`Unknown control action: ${action}`)
}

async function runMacro (record, script = '') {
  const lines = String(script).split(/\r?\n/).map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  log(record, 'Macro', `Running ${lines.length} steps`)

  for (const line of lines) {
    const [command, ...args] = line.split(/\s+/)
    const cmd = command.toLowerCase()

    if (cmd === 'wait') {
      await sleep(args[0] || 500)
      continue
    }

    if (cmd === 'chat') {
      requireOnline(record)
      const message = line.slice(command.length).trim()
      record.bot.chat(message)
      log(record, 'Macro', `chat ${message}`)
      continue
    }

    if (cmd === 'hotbar') {
      await runControl(record, { action: 'hotbar', slot: args[0] })
      continue
    }

    if (cmd === 'click') {
      await runControl(record, { action: 'click', slot: args[0], button: args[1] || 0, mode: args[2] || 0 })
      continue
    }

    const aliases = { stop: 'stopmove' }
    await runControl(record, { action: aliases[cmd] || cmd, duration: args[0] || 350 })
  }

  log(record, 'Macro', 'Done')
}

function sendJson (res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json)
  })
  res.end(json)
}

async function readJson (req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function findBot (id, res) {
  const record = bots.get(id)
  if (!record) sendJson(res, 404, { error: 'Bot not found' })
  return record
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`)

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(HTML)
      return
    }

    if (req.method === 'GET' && url.pathname === '/api/bots') {
      sendJson(res, 200, [...bots.values()].map(publicBot))
      return
    }

    if (req.method === 'POST' && url.pathname === '/api/bots') {
      const body = await readJson(req)
      sendJson(res, 201, publicBot(createBotRecord(body)))
      return
    }

    const match = url.pathname.match(/^\/api\/bots\/([^/]+)(?:\/([^/]+))?$/)
    if (match && req.method === 'POST') {
      const record = findBot(match[1], res)
      if (!record) return

      if (match[2] === 'start') startBot(record)
      else if (match[2] === 'stop') stopBot(record)
      else if (match[2] === 'chat') {
        const body = await readJson(req)
        if (!record.bot || !record.loggedIn) throw new Error('Bot is not online')
        record.bot.chat(String(body.message || ''))
        log(record, 'You', body.message || '')
      } else if (match[2] === 'control') {
        const body = await readJson(req)
        await runControl(record, body)
      } else if (match[2] === 'macro') {
        const body = await readJson(req)
        await runMacro(record, body.script)
      } else {
        sendJson(res, 404, { error: 'Unknown action' })
        return
      }

      sendJson(res, 200, publicBot(record))
      return
    }

    if (match && req.method === 'DELETE') {
      const record = findBot(match[1], res)
      if (!record) return
      stopBot(record)
      bots.delete(record.id)
      sendJson(res, 200, { ok: true })
      return
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    sendJson(res, 500, { error: err.message })
  }
})

const HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bot Control</title>
  <style>
    :root { color-scheme: dark; --bg:#0f1115; --panel:#171b20; --panel2:#20262d; --line:#2c3540; --text:#f4f6f8; --muted:#9bb0c2; --good:#42d392; --bad:#ff6b6b; --accent:#77c8ff; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; font-family:Inter, Segoe UI, Arial, sans-serif; background:var(--bg); color:var(--text); }
    header { padding:18px clamp(16px, 4vw, 34px); border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; align-items:center; }
    h1 { margin:0; font-size:clamp(24px, 3vw, 34px); letter-spacing:0; }
    .sub, .meta { color:var(--muted); font-size:13px; }
    main { min-width:0; }
    .accounts { border-bottom:1px solid var(--line); padding:14px clamp(16px, 4vw, 34px); display:flex; align-items:center; gap:12px; overflow-x:auto; background:#12161b; }
    .account { border:1px solid var(--line); background:var(--panel); color:var(--text); border-radius:8px; display:flex; align-items:center; gap:10px; min-width:205px; max-width:260px; padding:10px; text-align:left; }
    .account.active { outline:2px solid var(--accent); background:var(--panel2); }
    .account.add { justify-content:center; min-width:132px; border-style:dashed; color:var(--accent); }
    .account img, .hero-face, .face-preview img { width:48px; height:48px; image-rendering:pixelated; border-radius:6px; background:#090b0e; flex:none; }
    .account-name, .name { font-weight:900; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .account-user { color:var(--muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .dot { width:9px; height:9px; border-radius:99px; background:#56616d; display:inline-block; margin-right:6px; }
    .dot.online { background:var(--good); }
    .detail { padding:18px clamp(16px, 4vw, 34px); }
    .bot, dialog form { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    .bot { padding:18px; display:grid; gap:14px; }
    .top { display:flex; justify-content:space-between; gap:14px; align-items:center; }
    .identity { display:flex; align-items:center; gap:13px; min-width:0; }
    .name { font-size:22px; }
    .status { border:1px solid var(--line); border-radius:999px; padding:5px 9px; color:var(--muted); font-size:12px; text-transform:uppercase; white-space:nowrap; }
    .status.online { color:var(--good); border-color:color-mix(in srgb, var(--good), transparent 55%); }
    button { border:0; border-radius:6px; padding:10px 12px; font-weight:800; cursor:pointer; color:#071014; background:var(--accent); }
    button.stop { background:var(--bad); color:#190707; }
    button.start { background:var(--good); }
    button.ghost { background:#252c33; color:var(--text); }
    input, select, textarea { width:100%; border:1px solid var(--line); border-radius:6px; background:#0d0f11; color:var(--text); padding:10px 11px; font-size:14px; }
    textarea { min-height:130px; resize:vertical; font-family:Consolas, monospace; }
    label { display:grid; gap:6px; color:var(--muted); font-size:13px; }
    .actions, .chat { display:flex; flex-wrap:wrap; gap:8px; }
    .chat { flex-wrap:nowrap; }
    .panel { border:1px solid var(--line); border-radius:8px; padding:12px; display:grid; gap:10px; }
    .pad { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:8px; max-width:280px; }
    .pad button, .hotbar button { min-height:38px; }
    .hotbar { display:grid; grid-template-columns:repeat(9, minmax(34px, 1fr)); gap:6px; }
    .split { display:grid; grid-template-columns:minmax(280px, .9fr) minmax(320px, 1.1fr); gap:12px; }
    .items { display:grid; grid-template-columns:repeat(auto-fill, minmax(120px, 1fr)); gap:6px; max-height:130px; overflow:auto; }
    .item { border:1px solid var(--line); border-radius:6px; padding:7px; color:var(--muted); background:#0d0f11; cursor:pointer; font-size:12px; }
    .logs { background:#0d0f11; border:1px solid var(--line); border-radius:6px; padding:10px; height:170px; overflow:auto; font-family:Consolas, monospace; font-size:12px; color:#cbd5dc; }
    .line { margin:0 0 4px; }
    .empty { color:var(--muted); padding:30px; border:1px dashed var(--line); border-radius:8px; text-align:center; }
    dialog { width:min(520px, calc(100vw - 24px)); background:transparent; border:0; padding:0; color:var(--text); }
    dialog::backdrop { background:rgba(0,0,0,.65); }
    dialog form { padding:16px; display:grid; gap:12px; }
    .face-preview { display:flex; align-items:center; gap:12px; padding:10px; border:1px solid var(--line); border-radius:8px; background:#0d1014; }
    @media (max-width: 900px) { header { align-items:start; flex-direction:column; } .split { grid-template-columns:1fr; } .hotbar { grid-template-columns:repeat(3, 1fr); } .chat { flex-wrap:wrap; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Bot Control</h1>
      <div class="sub">Local Minecraft 1.8.9 account dashboard</div>
    </div>
    <div class="actions"><button onclick="openAdd()">Add Account</button><button class="ghost" onclick="refresh()">Refresh</button></div>
  </header>
  <main>
    <nav id="accounts" class="accounts"></nav>
    <section id="bots" class="detail"></section>
  </main>
  <dialog id="addDialog">
    <form id="botForm" method="dialog">
      <strong>Add account</strong>
      <div class="face-preview"><img id="facePreview" src="https://mc-heads.net/avatar/${encodeURIComponent(DEFAULT_BOT.avatar)}/64.png" alt=""><div><strong id="faceName">${DEFAULT_BOT.avatar}</strong><div class="meta">Use Minecraft username or UUID, not your email.</div></div></div>
      <label>Display name <input name="name" value="Main bot"></label>
      <label>Server <input name="host" value="${DEFAULT_BOT.host}"></label>
      <label>Port <input name="port" type="number" value="${DEFAULT_BOT.port}"></label>
      <label>Login username/email <input name="username" value="${DEFAULT_BOT.username}"></label>
      <label>Avatar name/UUID <input name="avatar" value="${DEFAULT_BOT.avatar}" placeholder="MHF_Steve, Notch, or UUID"></label>
      <label>Auth <select name="auth"><option value="microsoft">microsoft</option><option value="offline">offline</option></select></label>
      <div class="actions"><button type="submit">Add Account</button><button type="button" class="ghost" onclick="closeAdd()">Cancel</button></div>
    </form>
  </dialog>
  <script>
    const list = document.querySelector('#bots')
    const accounts = document.querySelector('#accounts')
    const form = document.querySelector('#botForm')
    const addDialog = document.querySelector('#addDialog')
    const avatarInput = form.querySelector('input[name="avatar"]')
    const facePreview = document.querySelector('#facePreview')
    const faceName = document.querySelector('#faceName')
    const defaultMacro = 'forward 1000\\nwait 300\\njump 300\\nhotbar 1\\nswing\\nchat /spawn'
    const macroDrafts = new Map()
    let selectedBotId = null

    async function api(path, options = {}) {
      const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Request failed')
      return data
    }

    async function refresh() {
      saveMacroDrafts()
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return
      const logPositions = getLogPositions()
      const bots = await api('/api/bots')
      if (!bots.some(bot => bot.id === selectedBotId)) selectedBotId = bots[0]?.id || null
      accounts.innerHTML = bots.map(renderAccount).join('') + '<button class="account add" onclick="openAdd()">+ Add</button>'
      const selected = bots.find(bot => bot.id === selectedBotId)
      list.innerHTML = selected ? renderBot(selected) : '<div class="empty">Add an account from the top bar, then select it here.</div>'
      restoreLogPositions(logPositions)
    }

    function headUrl(username, size = 64) {
      return 'https://mc-heads.net/avatar/' + encodeURIComponent(username || 'MHF_Steve') + '/' + size + '.png'
    }

    function renderAccount(bot) {
      const online = bot.status === 'online'
      return '<button class="account ' + (bot.id === selectedBotId ? 'active' : '') + '" onclick="selectBot(\\'' + bot.id + '\\')">' +
        '<img src="' + headUrl(bot.config.avatar, 48) + '" alt="" onerror="this.src=\\'' + headUrl('MHF_Steve', 48) + '\\'">' +
        '<div><div class="account-name">' + escapeHtml(bot.config.name) + '</div><div class="account-user"><span class="dot ' + (online ? 'online' : '') + '"></span>' + escapeHtml(bot.config.username) + '</div></div>' +
      '</button>'
    }

    function renderBot(bot) {
      const online = bot.status === 'online'
      const logs = bot.logs.map(l => '<p class="line">[' + l.time + '] [' + l.scope + '] ' + escapeHtml(l.message) + '</p>').join('')
      return '<article class="bot">' +
        '<div class="top"><div class="identity"><img class="hero-face" src="' + headUrl(bot.config.avatar, 64) + '" alt="" onerror="this.src=\\'' + headUrl('MHF_Steve', 64) + '\\'"><div><div class="name">' + escapeHtml(bot.config.name) + '</div><div class="meta">' + escapeHtml(bot.config.username) + ' @ ' + escapeHtml(bot.config.host) + ':' + bot.config.port + '</div></div></div><span class="status ' + (online ? 'online' : '') + '">' + bot.status + '</span></div>' +
        '<div class="actions"><button class="start" onclick="action(\\'' + bot.id + '\\', \\'start\\')">Start</button><button class="stop" onclick="action(\\'' + bot.id + '\\', \\'stop\\')">Stop</button><button class="ghost" onclick="removeBot(\\'' + bot.id + '\\')">Delete</button></div>' +
        '<div class="chat"><input id="chat-' + bot.id + '" placeholder="Send chat or command"><button onclick="chat(\\'' + bot.id + '\\')">Send</button></div>' +
        '<div class="split">' +
          '<div class="panel"><strong>Move</strong><div class="pad">' +
            '<span></span><button onmousedown="control(\\'' + bot.id + '\\', \\'forward\\', 350)">W</button><span></span>' +
            '<button onmousedown="control(\\'' + bot.id + '\\', \\'left\\', 350)">A</button><button onclick="control(\\'' + bot.id + '\\', \\'stopmove\\')">Stop</button><button onmousedown="control(\\'' + bot.id + '\\', \\'right\\', 350)">D</button>' +
            '<button onclick="control(\\'' + bot.id + '\\', \\'sneak\\', 700)">Sneak</button><button onmousedown="control(\\'' + bot.id + '\\', \\'back\\', 350)">S</button><button onclick="control(\\'' + bot.id + '\\', \\'jump\\', 350)">Jump</button>' +
          '</div><div class="actions"><button class="ghost" onclick="control(\\'' + bot.id + '\\', \\'sprint\\', 1200)">Sprint</button><button class="ghost" onclick="control(\\'' + bot.id + '\\', \\'swing\\')">Swing</button><button class="ghost" onclick="control(\\'' + bot.id + '\\', \\'use\\')">Use</button><button class="ghost" onclick="control(\\'' + bot.id + '\\', \\'deactivate\\')">Stop Use</button></div></div>' +
          '<div class="panel"><strong>Hotbar</strong><div class="hotbar">' + Array.from({ length: 9 }, (_, i) => '<button class="ghost" onclick="control(\\'' + bot.id + '\\', \\'hotbar\\', 0, { slot: ' + (i + 1) + ' })">' + (i + 1) + '</button>').join('') + '</div><strong>Inventory</strong><div class="items">' + renderItems(bot) + '</div></div>' +
        '</div>' +
        '<div class="panel"><strong>Macro</strong><textarea id="macro-' + bot.id + '" data-bot-id="' + bot.id + '" spellcheck="false">' + escapeHtml(macroDrafts.get(bot.id) || defaultMacro) + '</textarea><button onclick="macro(\\'' + bot.id + '\\')">Run Macro</button><div class="meta">Commands: forward/back/left/right/jump/sneak/sprint ms, wait ms, hotbar 1-9, swing, use, deactivate, drop, click slot, chat text.</div></div>' +
        '<div class="logs" data-bot-id="' + bot.id + '">' + (logs || '<span class="meta">No logs yet.</span>') + '</div>' +
      '</article>'
    }

    function saveMacroDrafts() {
      document.querySelectorAll('textarea[data-bot-id]').forEach(input => {
        macroDrafts.set(input.dataset.botId, input.value)
      })
    }

    function getLogPositions() {
      const positions = new Map()
      document.querySelectorAll('.logs[data-bot-id]').forEach(log => {
        positions.set(log.dataset.botId, {
          top: log.scrollTop,
          bottom: log.scrollHeight - log.scrollTop - log.clientHeight
        })
      })
      return positions
    }

    function restoreLogPositions(positions) {
      document.querySelectorAll('.logs[data-bot-id]').forEach(log => {
        const old = positions.get(log.dataset.botId)
        if (!old) return
        log.scrollTop = old.bottom < 12 ? log.scrollHeight : old.top
      })
    }

    function renderItems(bot) {
      if (!bot.inventory.length) return '<span class="meta">Inventory appears after the bot is online.</span>'
      return bot.inventory.map(item => '<button class="item" onclick="control(\\'' + bot.id + '\\', \\'click\\', 0, { slot: ' + item.slot + ' })">#' + item.slot + ' ' + escapeHtml(item.displayName || item.name) + ' x' + item.count + '</button>').join('')
    }

    function selectBot(id) {
      selectedBotId = id
      refresh()
    }

    function openAdd() {
      addDialog.showModal()
      setTimeout(() => form.querySelector('input[name="name"]').focus(), 0)
    }

    function closeAdd() {
      addDialog.close()
    }

    async function action(id, name) {
      await api('/api/bots/' + id + '/' + name, { method: 'POST', body: '{}' })
      refresh()
    }

    async function chat(id) {
      const input = document.querySelector('#chat-' + id)
      if (!input.value.trim()) return
      await api('/api/bots/' + id + '/chat', { method: 'POST', body: JSON.stringify({ message: input.value }) })
      input.value = ''
      refresh()
    }

    async function control(id, name, duration = 350, extra = {}) {
      await api('/api/bots/' + id + '/control', { method: 'POST', body: JSON.stringify({ action: name, duration, ...extra }) })
      refresh()
    }

    async function macro(id) {
      const input = document.querySelector('#macro-' + id)
      macroDrafts.set(id, input.value)
      await api('/api/bots/' + id + '/macro', { method: 'POST', body: JSON.stringify({ script: input.value }) })
      refresh()
    }

    async function removeBot(id) {
      await api('/api/bots/' + id, { method: 'DELETE' })
      if (selectedBotId === id) selectedBotId = null
      refresh()
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]))
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      const data = Object.fromEntries(new FormData(form).entries())
      const bot = await api('/api/bots', { method: 'POST', body: JSON.stringify(data) })
      selectedBotId = bot.id
      closeAdd()
      refresh()
    })

    avatarInput.addEventListener('input', () => {
      const avatar = avatarInput.value.trim() || 'MHF_Steve'
      facePreview.src = headUrl(avatar, 64)
      faceName.textContent = avatar
    })

    refresh()
    setInterval(refresh, 2500)
  </script>
</body>
</html>`

createBotRecord(DEFAULT_BOT)

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Bot control is running at http://127.0.0.1:${PORT}`)
})

function shutdown () {
  for (const record of bots.values()) stopBot(record)
  server.close(() => process.exit(0))
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
