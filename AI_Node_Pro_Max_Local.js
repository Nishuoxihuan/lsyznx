from pathlib import Path
out=Path('output'); out.mkdir(exist_ok=True)
js='''function get(url, callback) {
  var start = Date.now();
  $httpClient.get({ url: url, timeout: 15, headers: { "User-Agent": "Mozilla/5.0", "Accept": "*/*" } }, function (error, response, data) {
    callback(error, response, data, Date.now() - start);
  });
}
function siteSpeed(url, callback) {
  get(url, function (error, response, data, ms) {
    var status = response ? response.status : 0;
    callback({ ok: !error && [200, 301, 302, 307, 308, 403].indexOf(status) !== -1, ms: ms });
  });
}
function pad(n) { return n < 10 ? "0" + n : String(n); }
function flag(code) {
  if (!code || String(code).length !== 2) return "🏳️";
  code = String(code).toUpperCase();
  return String.fromCodePoint(code.charCodeAt(0) + 127397, code.charCodeAt(1) + 127397);
}
function localTime(offset) {
  if (typeof offset !== "number") return "未知";
  var d = new Date(Date.now() + offset * 1000);
  return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()) + " " + pad(d.getUTCHours()) + ":" + pad(d.getUTCMinutes()) + ":" + pad(d.getUTCSeconds());
}
function speed(r) { return r.ok ? r.ms + "ms" : "不可用"; }
function finish(geo, chatgpt, claude, gemini) {
  var type = geo.mobile ? "移动 IP" : (geo.hosting ? "机房 IP" : "普通 IP");
  $done({
    title: "节点体检 Pro Max",
    content: "📍 城市  " + flag(geo.countryCode) + " " + geo.city + " · " + geo.timezone + "\\n" +
      "🕒 时间  " + localTime(geo.offset) + "\\n" +
      "🌐 落地 IP  " + geo.ip + "\\n" +
      "🏠 类型  " + type + "\\n" +
      "🚀 速度  ChatGPT " + speed(chatgpt) + " · Claude " + speed(claude) + " · Gemini " + speed(gemini),
    style: "info", icon: "network"
  });
}
get("http://ip-api.com/json/?lang=zh-CN&fields=status,query,countryCode,city,timezone,offset,hosting,mobile", function (error, response, data) {
  var geo = { city: "未知", timezone: "未知", offset: null, ip: "未知", countryCode: "", hosting: false, mobile: false };
  try {
    if (!error && response && response.status === 200) {
      var r = JSON.parse(data);
      if (r.status === "success") {
        geo.city = r.city || "未知"; geo.timezone = r.timezone || "未知"; geo.offset = r.offset;
        geo.ip = r.query || "未知"; geo.countryCode = r.countryCode || "";
        geo.hosting = r.hosting === true; geo.mobile = r.mobile === true;
      }
    }
  } catch (e) {}
  siteSpeed("https://chatgpt.com/", function (chatgpt) {
    siteSpeed("https://claude.ai/", function (claude) {
      siteSpeed("https://gemini.google.com/", function (gemini) { finish(geo, chatgpt, claude, gemini); });
    });
  });
});
'''
module='''#!name=节点体检 Pro Max
#!desc=显示出口城市、当地时间、落地 IP、IP 类型及 AI 服务测速
#!category=Panel

[Panel]
节点体检 Pro Max = title="节点体检 Pro Max",content="点击刷新开始检测",style=info,script-name=节点体检 Pro Max,update-interval=300

[Script]
节点体检 Pro Max = type=generic,timeout=60,script-path=https://raw.githubusercontent.com/Nishuoxihuan/lsyznx/refs/heads/main/AI_Node_Pro_Max_Local.js
'''
(out/'AI_Node_Pro_Max_Local.js').write_text(js, encoding='utf-8')
(out/'AI_Node_Pro_Max_Remote.sgmodule').write_text(module, encoding='utf-8')
print([(p.name, p.suffix, p.stat().st_size) for p in [out/'AI_Node_Pro_Max_Local.js', out/'AI_Node_Pro_Max_Remote.sgmodule']])
