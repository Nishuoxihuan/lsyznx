function get(url, headers, cb) {
  $httpClient.get({ url: url, headers: headers || {}, timeout: 15 }, function(error, response, data) {
    cb(error, response, data);
  });
}

function getText(url) {
  return new Promise(function(resolve) {
    get(url, { "User-Agent": "Mozilla/5.0", "Accept": "*/*" }, function(error, response, data) {
      if (error || !response || response.status !== 200) return resolve(null);
      var text = String(data || "").trim();
      resolve(text || null);
    });
  });
}

function getJSON(url) {
  return new Promise(function(resolve) {
    get(url, { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }, function(error, response, data) {
      if (error || !response || response.status !== 200) return resolve(null);
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        resolve(null);
      }
    });
  });
}

function siteCheck(name, url, keyword) {
  return new Promise(function(resolve) {
    var start = Date.now();
    get(url, {
      "User-Agent": "Mozilla/5.0",
      "Accept-Language": "en-US,en;q=0.9"
    }, function(error, response, data) {
      var ms = Date.now() - start;
      if (error || !response) return resolve({ ok: false, text: "不可用", ms: ms });
      var code = response.status || 0;
      var body = String(data || "").toLowerCase();
      var ok = [200, 301, 302, 307, 308, 403].indexOf(code) >= 0;
      if (keyword && code === 200 && body && body.indexOf(keyword) === -1) ok = false;
      resolve({ ok: ok, text: ok ? (name === "Gemini" ? "入口可达" : "可用") : ("异常 " + code), ms: ms });
    });
  });
}

function flagEmoji(code) {
  code = String(code || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🌍";
  return String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397);
}

function cnType(hosting, mobile, ispName) {
  if (mobile) return "移动网络";
  if (hosting) return "数据中心";
  if (/residential|broadband|fiber|telecom|isp/i.test(String(ispName || ""))) return "家宽";
  return "商宽/普通网络";
}

function calcRisk(info) {
  var risk = 8;
  if (info.hosting) risk += 28;
  if (info.proxy) risk += 20;
  if (info.mobile) risk += 6;
  if (/cloudflare|amazon|google|microsoft|oracle|tencent cloud|alibaba cloud|linode|digitalocean|vultr|ovh/i.test(String(info.isp || "") + " " + String(info.org || ""))) risk += 10;
  if (risk > 100) risk = 100;
  var purity = 100 - risk;
  var label = risk >= 80 ? "极高" : risk >= 60 ? "高" : risk >= 40 ? "中" : risk >= 20 ? "低" : "很低";
  return { risk: risk, purity: purity, label: label };
}

function airportHint(countryCode, city, region) {
  var text = (String(city || "") + " " + String(region || "") + " " + String(countryCode || "")).toUpperCase();
  if (text.indexOf("SINGAPORE") >= 0 || text.indexOf("SG") >= 0) return "SIN";
  if (text.indexOf("TOKYO") >= 0 || text.indexOf("JP") >= 0) return "TYO";
  if (text.indexOf("OSAKA") >= 0) return "KIX";
  if (text.indexOf("HONG KONG") >= 0 || text.indexOf("HK") >= 0) return "HKG";
  if (text.indexOf("TAIPEI") >= 0 || text.indexOf("TAIWAN") >= 0 || text.indexOf("TW") >= 0) return "TPE";
  if (text.indexOf("SEOUL") >= 0 || text.indexOf("KR") >= 0) return "ICN";
  if (text.indexOf("LOS ANGELES") >= 0) return "LAX";
  if (text.indexOf("SAN JOSE") >= 0 || text.indexOf("SANTA CLARA") >= 0) return "SJC";
  if (text.indexOf("NEW YORK") >= 0) return "NYC";
  return "未知";
}

(async function() {
  var ipv4 = await getText("https://api-ipv4.ip.sb/ip");
  var ipv6 = await getText("https://api-ipv6.ip.sb/ip");
  var mainIP = await getText("https://api.ip.sb/ip");

  var geo = null;
  if (mainIP) {
    geo = await getJSON("http://ip-api.com/json/" + encodeURIComponent(mainIP) + "?fields=status,message,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting,query");
  }

  var backup = null;
  if ((!geo || geo.status !== "success") && mainIP) {
    backup = await getJSON("https://ipinfo.io/" + encodeURIComponent(mainIP) + "/json");
  }

  var chatgpt = await siteCheck("ChatGPT", "https://chatgpt.com/", "chatgpt");
  var claude = await siteCheck("Claude", "https://claude.ai/", "claude");
  var gemini = await siteCheck("Gemini", "https://gemini.google.com/", "gemini");

  var ip = mainIP || (geo && geo.query) || (backup && backup.ip) || "未知";
  var countryCode = (geo && geo.countryCode) || (backup && backup.country) || "";
  var country = (geo && geo.country) || (backup && backup.country) || "未知";
  var region = (geo && geo.regionName) || (backup && backup.region) || "";
  var city = (geo && geo.city) || (backup && backup.city) || "";
  var isp = (geo && geo.isp) || (backup && backup.org) || "未知";
  var org = (geo && geo.org) || (backup && backup.org) || "未知";
  var asText = (geo && geo.as) || (backup && backup.org) || "未知";
  var hosting = !!(geo && geo.hosting);
  var proxy = !!(geo && geo.proxy);
  var mobile = !!(geo && geo.mobile);

  var risk = calcRisk({ hosting: hosting, proxy: proxy, mobile: mobile, isp: isp, org: org });
  var netTags = [
    hosting ? "机房" : null,
    mobile ? "移动" : null,
    proxy ? "Proxy" : null
  ].filter(Boolean).join("/") || "正常";

  var place = [city, region, country].filter(Boolean).join(" ") || "未知";
  var machine = airportHint(countryCode, city, region);
  var warp = /cloudflare/i.test(String(isp || "") + " " + String(org || "")) ? "on" : "off";
  var abuser = proxy || hosting ? Math.min(100, risk.risk + 8) : risk.risk;
  var avg = Math.round((chatgpt.ms + claude.ms + gemini.ms) / 3);
  var okCount = [chatgpt.ok, claude.ok, gemini.ok].filter(Boolean).length;
  var style = okCount === 3 ? "good" : okCount >= 1 ? "info" : "alert";

  var lines = [
    "🤖 ChatGPT  " + (chatgpt.ok ? "✅ " : "❌ ") + chatgpt.text + " (" + chatgpt.ms + "ms)",
    "🧠 Claude   " + (claude.ok ? "✅ " : "❌ ") + claude.text + " (" + claude.ms + "ms)",
    "✨ Gemini   " + (gemini.ok ? "🌐 " : "❌ ") + gemini.text + " (" + gemini.ms + "ms)",
    "────────────",
    "主出口 IP： " + ip,
    "归属： " + flagEmoji(countryCode) + " " + place,
    "运营商： " + isp,
    "ASN： " + asText,
    "类型： " + cnType(hosting, mobile, isp),
    "网络标记： " + netTags,
    "风险： " + risk.label + (risk.risk >= 40 ? " ⚠️ " : " ") + risk.risk + "/100，纯净度： " + risk.purity + "/100",
    "机房： " + machine,
    "Abuser： " + abuser + "/100",
    "WARP： " + warp,
    "────────────",
    "IPv4： " + (ipv4 || "不可用"),
    "IPv6： " + (ipv6 || "不可用"),
    "地区一致性： " + (ipv4 && ipv6 ? "双栈可用" : (ipv4 ? "仅 IPv4" : (ipv6 ? "仅 IPv6" : "未知"))),
    "AI 延迟： " + avg + "ms",
    "IP 查询： " + ((geo && geo.status === "success") || backup ? "成功" : "失败"),
    "────────────",
    "Gemini 检测： Web 半严格",
    "说明： 网页可达，不代表登录后一定可对话",
    "策略组： 我的节点",
    "更新： " + new Date().toLocaleString("zh-CN", { hour12: false })
  ];

  $done({
    title: "节点体检 Pro Max",
    content: lines.join("\n"),
    style: style,
    icon: "waveform.path.ecg",
    "icon-color": okCount === 3 ? "#34C759" : (okCount >= 1 ? "#0A84FF" : "#FF9F0A")
  });
})();
