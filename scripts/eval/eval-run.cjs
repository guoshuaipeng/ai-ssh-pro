// c55: run inside Electron so the app's own safeStorage decrypts the configured key. The key is never printed or written.
const { app, safeStorage } = require('electron')
const fs = require('fs'), path = require('path')
app.setName('ai-ssh-pro')
app.whenReady().then(async () => {
  const [inFile, outFile] = process.argv.slice(-2)
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(app.getPath('appData'), 'ai-ssh-pro', 'ai-ssh-pro.json'), 'utf8')).ai
    const prov = cfg.providers.find((p) => p.id === cfg.activeProviderId) || cfg.providers[0]
    let key = prov.apiKey || ''
    if (key.startsWith('enc:v1:')) key = safeStorage.decryptString(Buffer.from(key.slice(7), 'base64'))
    const { system, cases } = JSON.parse(fs.readFileSync(inFile, 'utf8'))
    const out = []
    for (const c of cases) {
      const t0 = Date.now()
      const res = await fetch(prov.baseURL.replace(/\/$/, '') + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
        body: JSON.stringify({ model: cfg.model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: c.q }] })
      }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }))
      const body = res.ok ? (await res.json()).choices?.[0]?.message?.content ?? '' : 'HTTP ' + res.status + ' ' + (await res.text()).slice(0, 120).replace(key, '<key>')
      out.push({ ...c, raw: body, ms: Date.now() - t0 })
    }
    key = ''
    fs.writeFileSync(outFile, JSON.stringify({ model: cfg.model, provider: prov.id, out }, null, 1))
  } catch (e) { fs.writeFileSync(outFile, JSON.stringify({ error: String(e && e.message || e) })) }
  app.quit()
})
