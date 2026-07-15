$httpClient.get("https://api.ip.sb/ip", function(error, response, data) {
  if (error) {
    $done({
      title: "节点体检 Pro Max",
      content: "外网请求失败\n" + JSON.stringify(error),
      style: "alert"
    });
    return;
  }

  const ip = String(data || "").trim();

  $done({
    title: "节点体检 Pro Max",
    content: "外网请求成功\nIP: " + ip,
    style: "good",
    icon: "checkmark.circle",
    "icon-color": "#34C759"
  });
});
