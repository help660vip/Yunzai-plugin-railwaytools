# Copyright © Leaf developer 2023-2026
# 本文件负责实现“车站大屏”功能，使用第三方API，仅供参考，请勿用于实际乘车

import json
import datetime  
import httpx
from nonebot import on_command   # type: ignore
from nonebot.adapters import Event
from nonebot.adapters.onebot.v11 import Message, MessageSegment   # type: ignore
from nonebot.plugin import PluginMetadata  # type: ignore
from nonebot.params import CommandArg  # type: ignore
from nonebot.rule import to_me  # type: ignore
from .utils import utils
from .api import API  

station_screen = on_command("大屏",aliases={"dp","车站大屏"},priority=5,block=True)

@station_screen.handle()
async def handle_station_screen(event:Event, args: Message = CommandArg()):
    raw_message = str(event.get_message()).strip()
    command_part = utils.get_command_part(raw_message)
    valid_commands = ['大屏','dp','车站大屏']
    if command_part not in valid_commands:
        return
        
    if station_name_input := args.extract_plain_text():

        if "站" in station_name_input:
            station_name_input = station_name_input.replace("站","")
        elif "车站" in station_name_input:
            station_name_input = station_name_input.replace("车站","")
        else:
            pass

        async with httpx.AsyncClient(headers=API.headers) as client:
            url_station_screen = f"{API.api_station_screen}{station_name_input}"
            res_train_list = await client.get(url_station_screen)
            res_data = json.loads(res_train_list.text)

            if "error" in res_data:
                await station_screen.finish("您输入的车站名不存在或未收录，请重新输入！")
            
            else:
                data_list = res_data['data']
                count = 1 # 在每个列车信息前标数
                result = ""
                hr_line = "------------------------------ \n"
                for i in range(len(data_list)):
                    if i <= 9:
                        train_code = data_list[i][0]
                        start_station_name = data_list[i][1]
                        end_station_name = data_list[i][2]
                        departure_time = utils.time_Formatter_2(data_list[i][3])
                        waitingroom_and_check_in = data_list[i][4]
                        status = data_list[i][5]
                        result += f"{hr_line}【{count}】{train_code}（{start_station_name}——{end_station_name}）\n发车时间：{departure_time}\n候车室/检票口：{waitingroom_and_check_in}\n状态：{status}\n"
                        count += 1
                    else:
                        break
                station_screen_message = Message([
                    f"【{station_name_input}站】车站大屏如下：\n \n",
                    result,
                    hr_line,"\n",
                    "仅显示该车站部分列车信息。本车站大屏来源于第三方API，及供参考，请勿用于实际乘车！\n",
                ])
                await station_screen.finish(station_screen_message)
                
    else:
        await station_screen.finish("请输入正确的车站名！（如：上海）")