
let body = JSON.parse($response.body)
let OPEN_AD = '/api/newstartad.php'
let PAGE_AD = '/api/setapp.php'
let VIP = '/api/userinfo.php'
let PAY = '/api/newreg.php'
let PLAY = 'list.php'

if (url.indexOf(OPEN_AD) !== -1) {
    body.data = [null,null,null]
    console.log('去除开屏广告')
}
if (url.indexOf(PAGE_AD) !== -1) {
    delete body.app
    delete body.popapp
    delete body.rotation
    delete body.ad
    delete body.vodad
    delete body.myad
    delete body.popad
    delete body.msg
    console.log('去除页面广告')
}
if (url.indexOf(VIP) !== -1) {
    body.userinfo.rights = '14'
    body.userinfo.role = '至尊SVIP'
    body.userinfo.vip = 3
    body.userinfo.vipdays = '18250'
    body.userinfo.vipend = '4099737600000'
    body.userinfo.vipenddate = '2099-12-01'
    body.userinfo.name = '联合国儿童基金会'
    body.vip = 3
    console.log('解锁至尊VIP')
}
if (url.indexOf(PAY) !== -1) {
    body.user.diamonds = '9999'
    body.user.money = '8888'
    console.log('解锁金币')
}
if (url.indexOf(PLAY) !== -1) {
    body.list[0].preview_url = body.data.vod_play_url.replace('正片$', '')
    body.data.preview_url = body.data.vod_play_url.replace('正片$', '')
    console.log('解锁视频:' + body.list[0].preview_url)
}
$done({'body': JSON.stringify(body)});