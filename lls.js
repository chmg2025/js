let body = JSON.parse($response.body)
body.Data.price = 0
body.Data.isVip = true
body.Data.videoInfo.gold = 0
$done({body:JSON.stringify(body)})
