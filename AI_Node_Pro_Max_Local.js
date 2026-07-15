function get(url, callback) {
  var start = Date.now();

  $httpClient.get(
    {
      url: url,
      timeout: 15,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "*/*"
      }
    },
    function (error, response, data) {
      var elapsed = Date.now() - start;
      callback(error, response, data, elapsed);
    }
  );
}

function siteSpeed(name, url, callback) {
  get(url, function (error, response, data, elapsed) {
    var status = response ? response.status : 0;

    // 200、重定向、403 都代表已成功连接到目标服务
    var reachable = !error &&
      [200, 301, 302, 307, 308, 403].indexOf(status) !== -1;

    callback({
      name: name,
      ms: elapsed,
      ok: reachable
    });
  });
}

function output(geo, chatgpt, claude, gemini) {
  var city = geo.city || "未知";
  var timezone = geo.timezone || "未知";

  var type = "普通 IP";
  if (geo.mobile) {
    type = "移动 IP";
  } else if (geo.hosting) {
    type = "机房 IP";
  }

  var speedLine =
    "🚀 速度  ChatGPT " + (chatgpt.ok ? chatgpt.ms + "ms" : "不可用") +
    " · Claude " + (claude.ok ? claude.ms + "ms" : "不可用") +
    " · Gemini " + (gemini.ok ? gemini.ms + "ms" : "不可用");

  $done({
    title: "节点体检 Pro Max",
    content:
      "📍 城市  " + city + " · " + timezone + "\n" +
      "🏠 类型  " + type + "\n" +
      speedLine,
    style: "info",
    icon: "network"
  });
}

get(
  "http://ip-api.com/json/?fields=status,city,timezone,hosting,mobile",
  function (error, response, data) {
    var geo = {
      city: "未知",
      timezone: "未知",
      hosting: false,
      mobile: false
    };

    try {
      if (!error && response && response.status === 200) {
        var result = JSON.parse(data);

        if (result.status === "success") {
          geo.city = result.city || "未知";
          geo.timezone = result.timezone || "未知";
          geo.hosting = result.hosting === true;
          geo.mobile = result.mobile === true;
        }
      }
    } catch (e) {}

    siteSpeed("ChatGPT", "https://chatgpt.com/", function (chatgpt) {
      siteSpeed("Claude", "https://claude.ai/", function (claude) {
        siteSpeed("Gemini", "https://gemini.google.com/", function (gemini) {
          output(geo, chatgpt, claude, gemini);
        });
      });
    });
  }
);
