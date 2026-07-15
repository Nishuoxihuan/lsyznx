$httpClient.get("https://api.my-ip.io/ip", function(error, response, data) {
  if (error) {
    $done({
      title: "节点体检 Pro Max",
      content: "外网请求失败\n" + JSON.stringify(error),
      style: "alert"
    });
    return;
  }

  $done({
    title: "节点体检 Pro Max",
    content: "外网请求成功\nIP: " + String(data).trim(),
    style: "good"
  });
});
