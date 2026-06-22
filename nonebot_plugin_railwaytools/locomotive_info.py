# Copyright © Leaf developer 2023-2026
# 本文件负责实现“查询列车与动车组信息”功能，由原“/下关站”演化而来

import httpx
import json
from httpx import AsyncClient
from nonebot import on_command
from nonebot.adapters import Event
from nonebot.adapters.onebot.v11 import Message, MessageSegment
from nonebot.params import CommandArg
from nonebot.rule import to_me
from .utils import utils
from .api import API

locomotive_info = on_command("机车信息",aliases={"jcxx"},priority=5,block=True)

# 查询思路：根据优先级，逐级查询，如果第一级没有，就去第二级查
# leaf2006/CR-Locomotive-Allocation存档 -> 下关站
@locomotive_info.handle() # 查询车型信息
async def handle_locomotive_info(event:Event, args: Message = CommandArg()):
    raw_message = str(event.get_message()).strip()
    command_part = utils.get_command_part(raw_message)
    valid_commands = ['机车信息','jcxx']
    if command_part not in valid_commands:
        return
    
    if input_train_id := args.extract_plain_text():
        await locomotive_info.send("正在加载，时间可能略久...")
        
        hr_line = "------------------------------\n"
        # leaf2006/CR-Locomotive-Allocation 查询
        async with httpx.AsyncClient(headers=API.headers, timeout=30.0) as client:
            resp = await client.get(API.api_cr_locomotive_allocation)

            resp_data = json.loads(resp.text)
            match_raw_result = []
            for model_type, trains in resp_data.items():
                if isinstance(trains, list):
                    for train in trains:
                        if isinstance(train, dict) and train.get("id") == input_train_id.upper():
                            match_raw_result.append(train)
            result = ""
            if match_raw_result:
                for train in match_raw_result:
                    train_id = "车号：" + train.get('id') + "\n" if train.get('id') else ""
                    allocation = "配属：" + train.get('allocation') + "\n" if train.get('allocation') else ""
                    manufacturer = "生产厂家：" + train.get('manufacturer') + "\n" if train.get('manufacturer') else ""
                    pro_id = train.get('pro_id', '')
                    photo_author = "拍摄者：" + train.get('photo_author') + "\n" if train.get('photo_author') else ""
                    photo_date = "拍摄日期：" + train.get('photo_date') + "\n" if train.get('photo_date') else ""
                    photo_url = train.get('photo_url','')
                    if photo_url:
                        photo = MessageSegment.image(photo_url)
                    else:
                        photo = ""
                    
                    result += photo + train_id + allocation + manufacturer + photo_author + photo_date + hr_line
                attribution = "数据来源：轨上名录 CR-Locomotive-Allocation\n项目地址：github.com/leaf2006/CR-Locomotive-Allocation"
                locomotive_output = "【" + input_train_id.upper() + "】共检索到" + str(len(match_raw_result)) + "个结果：\n" + hr_line + result + attribution
                await locomotive_info.finish(locomotive_output)
            else:
                pass
        
        # www.xiaguanzhan.com
        try:
            async with httpx.AsyncClient(headers=API.headers, timeout=30.0) as client:
                data = {
                    "keyword": input_train_id.lower()
                }
                resp = await client.post(API.api_xiaguanzhan, data=data)
                resp.encoding = "gb2312"
                
                # 获取基本信息
                first_match = utils.xiaguanzhan_first_match
                title = first_match(r'<h1><span class="blue"><a href="ProView\.asp\?ProId=[^"]*" title="[^"]*" target="_blank">(.*?)</a></span></h1>', resp.text)
                if title == None:
                    await locomotive_info.finish(f"暂无{input_train_id.upper()}的信息！")
                manufacturer = first_match(r'生产厂商：(.*?)<BR>', resp.text) or "暂无数据"
                shoot_date = first_match(r'拍摄日期：(.*?)<BR>', resp.text) or "暂无数据"
                shoot_author = first_match(r'拍摄作者：(.*?)</FONT>', resp.text) or "暂无数据"
                photo_url = first_match(r'下载地址：<a href="(.*?)" target="_blank">', resp.text) or "暂无数据"
                locomotive_allocation = first_match(r'拍摄配属：(.*?)<BR>', resp.text) or "暂无数据"

                title_separate = title.split(' ')
                locomotive_no = title_separate[1]

                xiaguanzhan_photo_output = Message ([
                hr_line,
                MessageSegment.image(photo_url),
                f"车号：{locomotive_no}\n",
                f"配属：{locomotive_allocation}\n",
                f"生产厂家：{manufacturer}\n",
                f"拍摄者：{shoot_author}\n",
                f"拍摄日期：{shoot_date}\n",
                hr_line,
                "数据来源：下关站-铁路摄影馆",
                ])
                await locomotive_info.finish(xiaguanzhan_photo_output)      

        except httpx.ReadTimeout:
            await locomotive_info.finish("暂时无法访问下关站，请稍后再试！")

    else:
        await locomotive_info.finish("请输入正确的车号！如：CRH2A-2001")
