# Copyright © Leaf developer 2023-2026
# 这里存储本插件所需使用的所有API入口与链接

class API:
    api_12306 = "https://mobile.12306.cn/wxxcx/wechat/main/travelServiceQrcodeTrainInfo"
    api_rail_re = "https://api.rail.re/"
    api_EMU_route_schedule = "https://rail.re/img/"
    api_station_screen = "https://www.12036.com:8095/station/"
    api_cnrail_geogv = "http://cnrail.geogv.org/api/"
    api_cr_locomotive_allocation = "https://cdn.jsdelivr.net/gh/leaf2006/CR-Locomotive-Allocation@main/data/raw_result.json"
    
    headers = { # 加个请求头，保险一点
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }