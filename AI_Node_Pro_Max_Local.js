const GROUP = "我的节点";
const TIMEOUT = 12000;

function httpGet(url, headers = {}, policy = GROUP, timeout = TIMEOUT) {
  return new Promise((resolve) => {
    const start = Date.now();
    $httpClient.get({ url, headers, policy, timeout }, (error, response, data) => {
      resolve({ error, response, data, ms: Date.now() - start });
    });
  });
}

function safeJson(str) { try { return JSON.parse(str); } catch (e) { return null; } }
function t(v, d = "未知") { return v === undefined || v === null || v === "" ? d : String(v); }
function flagEmoji(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "🌍";
  return String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt()));
}
function parseAbuserScore(v) {
  const s = String(v || "");
  const m = s.match(/([0-9]+\.?[0-9]*)/);
  return m ? parseFloat(m[1]) : null;
}
function riskLabel(risk) {
  if (risk >= 80) return "极高";
  if (risk >= 60) return "高";
  if (risk >= 40) return "中";
  if (risk >= 20) return "低";
  return "很低";
}
function latencyLabel(ms) {
  if (!isFinite(ms)) return "未知";
  if (ms < 500) return "优秀";
  if (ms < 1200) return "正常";
  if (ms < 2500) return "偏慢";
  return "很慢";
}
function dnsLabel(ms) {
  if (!isFinite(ms)) return "失败";
  if (ms < 400) return "正常";
  if (ms < 1000) return "偏慢";
  return "异常";
}
function calcRisk(info) {
  let risk = 8;
  if (info.hosting) risk += 28;
  if (info.proxy) risk += 16;
  if (info.vpn) risk += 12;
  if (info.tor) risk += 35;
  if (info.warp) risk += 8;
  if (/datacenter|hosting|business|server/i.test(String(info.type || ""))) risk += 15;
  const score = info.abuserScore;
  if (score !== null) {
    if (score >= 0.2) risk += 28;
    else if (score >= 0.03) risk += 18;
    else if (score >= 0.0085) risk += 10;
    else if (score >= 0.0005) risk += 4;
  }
  risk = Math.max(0, Math.min(100, risk));
  return { risk, purity: 100 - risk, label: riskLabel(risk) };
}
function typeCN(type, hosting) {
  if (hosting || /datacenter|hosting|business|server/i.test(String(type || ""))) return "数据中心";
  if (/residential|isp|home/i.test(String(type || ""))) return "家宽";
  if (/education/i.test(String(type || ""))) return "教育网";
  return t(type, "未知");
}

async function getIPFromIpapi(url) {
  const r = await httpGet(url, { "Accept": "application/json" });
  const obj = safeJson(r.data || "");
  if (r.error || !r.response || r.response.status !== 200 || !obj) return null;
  const company = obj.company || {};
  const asn = obj.asn || {};
  const location = obj.location || {};
  return {
    ip: obj.ip,
    country: location.country_code || obj.country_code || location.country,
    countryName: location.country || obj.country,
    city: location.city || obj.city,
    region: location.state || obj.region,
    isp: company.name || asn.org || asn.name,
    asn: asn.asn ? `AS${asn.asn}` : (obj.asn ? `AS${obj.asn}` : "未知"),
    asnName: asn.org || asn.name || company.name,
    type: company.type || (obj.is_datacenter ? "datacenter" : "unknown"),
    hosting: !!(obj.is_datacenter || company.is_datacenter),
    proxy: !!obj.is_proxy,
    vpn: !!obj.is_vpn,
    tor: !!obj.is_tor,
    warp: /cloudflare/i.test(String(company.name || asn.org || asn.name || "")),
    abuserScore: parseAbuserScore(company.abuser_score || asn.abuser_score),
    abuserText: company.abuser_score || asn.abuser_score || "未知",
    ms: r.ms
  };
}

async function getIPv4Info() {
  const direct = await getIPFromIpapi("https://api.ipapi.is/?q=me");
  if (direct) return direct;
  const f = await httpGet("https://ipinfo.io/json", { "Accept": "application/json" });
  const o = safeJson(f.data || "");
  if (!f.error && f.response && f.response.status === 200 && o) {
    const org = String(o.org || "");
    return {
      ip: o.ip, country: o.country, countryName: o.country, city: o.city, region: o.region,
      isp: org, asn: org.match(/AS\d+/)?.[0] || "未知", asnName: org,
      type: /hosting|datacenter|colo|server|amazon|google|microsoft|oracle|digitalocean|vultr|linode/i.test(org) ? "datacenter" : "unknown",
      hosting: /hosting|datacenter|colo|server|amazon|google|microsoft|oracle|digitalocean|vultr|linode/i.test(org),
      proxy: false, vpn: false, tor: false, warp: /cloudflare/i.test(org), abuserScore: null, abuserText: "未知", ms: f.ms
    };
  }
  return null;
}

async function getIPv6Info() {
  return await getIPFromIpapi("https://api64.ipapi.is/?q=me");
}

async function detectSite(name, url, keys) {
  const r = await httpGet(url, { "User-Agent": "Mozilla/5.0", "Accept-Language": "en-US,en;q=0.9" }, GROUP, 15000);
  if (r.error || !r.response) return { name, ok: false, text: "不可用", ms: r.ms };
  const code = r.response.status || 0;
  const body = String(r.data || "").toLowerCase();
  const hit = keys.some(k => body.includes(k));
  const ok = [200,301,302,307,308,403].includes(code) && (hit || code === 403);
  return { name, ok, text: ok ? (name === "Gemini" ? "入口可达" : "可用") : `异常 ${code}`, ms: r.ms, code };
}

async function testDNS() {
  const r = await httpGet("https://cloudflare-dns.com/dns-query?name=chatgpt.com&type=A", { "accept": "application/dns-json" }, GROUP, 10000);
  const obj = safeJson(r.data || "");
  const answers = obj && Array.isArray(obj.Answer) ? obj.Answer.length : 0;
  return { ok: !r.error && r.response && r.response.status === 200 && answers > 0, ms: r.ms, answers };
}

function consistency(v4, v6) {
  if (!v4 && !v6) return "未知";
  if (v4 && v6) {
    if (v4.country && v6.country && v4.country === v6.country) return "IPv4/IPv6 一致";
    return `IPv4 ${t(v4.country, "?")} / IPv6 ${t(v6.country, "?")}`;
  }
  return v4 ? "仅 IPv4" : "仅 IPv6";
}

(async () => {
  const [v4, v6, chatgpt, claude, gemini, dns] = await Promise.all([
    getIPv4Info(),
    getIPv6Info(),
    detectSite("ChatGPT", "https://chatgpt.com/", ["chatgpt", "openai"]),
    detectSite("Claude", "https://claude.ai/", ["claude", "anthropic"]),
    detectSite("Gemini", "https://gemini.google.com/", ["gemini", "google"]),
    testDNS()
  ]);

  const info = v4 || v6 || {};
  const geo = [info.city, info.region, info.countryName || info.country].filter(Boolean).join(" ") || "未知";
  const flag = flagEmoji(info.country);
  const scored = calcRisk(info);
  const warp = info.warp ? "on" : "off";
  const netFlags = [info.hosting ? "机房" : null, info.proxy ? "Proxy" : null, info.vpn ? "VPN" : null, info.tor ? "Tor" : null].filter(Boolean).join("/") || "正常";
  const aiLatency = [chatgpt.ms, claude.ms, gemini.ms].filter(n => isFinite(n));
  const avgAi = aiLatency.length ? Math.round(aiLatency.reduce((a,b)=>a+b,0) / aiLatency.length) : NaN;
  const v4Flag = v4 ? flagEmoji(v4.country) : "—";
  const v6Flag = v6 ? flagEmoji(v6.country) : "—";

  const lines = [
    `🤖 ChatGPT  ${chatgpt.ok ? "✅" : "❌"} ${chatgpt.text} (${chatgpt.ms}ms)`,
    `🧠 Claude  ${claude.ok ? "✅" : "❌"} ${claude.text} (${claude.ms}ms)`,
    `✨ Gemini  ${gemini.ok ? "🌐" : "❌"} ${gemini.text} (${gemini.ms}ms)`,
    `────────────`,
    `主出口 IP：${t(info.ip)}`,
    `归属：${flag} ${geo}`,
    `运营商：${t(info.isp)}`,
    `ASN：${t(info.asn)} ${t(info.asnName, "")}`.trim(),
    `类型：${typeCN(info.type, info.hosting)}`,
    `网络标记：${netFlags}`,
    `风险：${scored.label} ${scored.risk}/100，纯净度：${scored.purity}/100`,
    `Abuser：${t(info.abuserText)}`,
    `WARP：${warp}`,
    `────────────`,
    `IPv4：${v4 ? `${v4Flag} ${t(v4.ip)} ${t(v4.countryName || v4.country)}` : "不可用"}`,
    `IPv6：${v6 ? `${v6Flag} ${t(v6.ip)} ${t(v6.countryName || v6.country)}` : "不可用"}`,
    `地区一致性：${consistency(v4, v6)}`,
    `DNS：${dns.ok ? "正常" : "异常"} (${dns.ms}ms, ${dns.answers || 0} answers)`,
    `AI 延迟：${isFinite(avgAi) ? `${avgAi}ms / ${latencyLabel(avgAi)}` : "未知"}`,
    `IP 查询：${info.ms ? `${info.ms}ms` : "未知"}`,
    `────────────`,
    `Gemini 检测：Web 半严格`,
    `说明：网页可达，不代表登录后一定可对话`,
    `策略组：${GROUP}`,
    `更新：${new Date().toLocaleString("zh-CN", { hour12: false })}`
  ];

  const okCount = [chatgpt.ok, claude.ok, gemini.ok].filter(Boolean).length;
  const style = okCount === 3 ? "good" : okCount >= 1 ? "info" : "alert";

  $done({
    title: "节点体检 Pro Max",
    content: lines.join("\n"),
    style,
    icon: "waveform.path.ecg",
    "icon-color": okCount === 3 ? "#34C759" : okCount >= 1 ? "#0A84FF" : "#FF9F0A"
  });
})();
