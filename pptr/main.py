import json
import os
import hashlib
import asyncio
from pathlib import Path

import httpx
from playwright.async_api import async_playwright

# 加载配置
with open('config.json', 'r', encoding='utf-8') as f:
    cfg = json.load(f)

# 目录
LOGS_DIR = Path('./ws_logs')
AVATAR_DIR = Path('./avatars')
TARGET_WS_URL = 'wss://frontier-pc.douyin.com/ws/v2'

LOGS_DIR.mkdir(exist_ok=True)
AVATAR_DIR.mkdir(exist_ok=True)

# 页面引用
page_map = {}


# ==================== FastGPT 调用 ====================
def get_chat_id(user_id: str) -> str:
    return hashlib.md5(user_id.encode()).hexdigest()[:16]


async def call_fastgpt(user_id: str, message: str) -> str:
    try:
        chat_id = get_chat_id(user_id)
        print(f"[FastGPT] 用户: {user_id}, ChatID: {chat_id}")
        print(f"[FastGPT] 消息: {message}")

        async with httpx.AsyncClient(timeout=cfg['fastgpt']['timeout'] / 1000) as client:
            resp = await client.post(
                cfg['fastgpt']['baseUrl'],
                headers={
                    'Authorization': f"Bearer {cfg['fastgpt']['apiKey']}",
                    'Content-Type': 'application/json'
                },
                json={
                    'chatId': chat_id,
                    'stream': False,
                    'detail': False,
                    'messages': [{'role': 'user', 'content': message}]
                }
            )

        if resp.status_code == 200:
            data = resp.json()
            choices = data.get('choices', [])
            if choices:
                reply = choices[0].get('message', {}).get('content', '抱歉，我无法回答')
                print(f"[FastGPT] 回复: {reply}")
                return reply
        return '服务异常，请稍后重试'
    except httpx.TimeoutException:
        return '回复超时，请稍后重试'
    except Exception as e:
        print(f"[FastGPT错误] {e}")
        return '服务异常，请稍后重试'


# ==================== 发送私信回复 ====================
async def send_reply(page, reply_text: str) -> bool:
    try:
        input_selector = '[data-e2e="im-input"]'
        await page.wait_for_selector(input_selector, timeout=5000)
        await page.click(input_selector)
        await page.keyboard.type(reply_text, delay=50)

        send_btn_selector = '[data-e2e="im-send-btn"]'
        await page.wait_for_selector(send_btn_selector, timeout=3000)
        await page.click(send_btn_selector)

        print(f"[自动回复] 已发送: {reply_text}")
        return True
    except Exception as e:
        print(f"[自动回复] 发送失败: {e}")
        return False


# ==================== 下载头像 ====================
async def download_image(url: str, author_id: str) -> str | None:
    try:
        if not url:
            return None
        safe_id = str(author_id).replace('/', '_').replace('\\', '_')
        file_path = AVATAR_DIR / f"avatar_{safe_id}.jpeg"

        if file_path.exists():
            return str(file_path)

        async with httpx.AsyncClient() as client:
            resp = await client.get(url)
            file_path.write_bytes(resp.content)
        return str(file_path)
    except Exception as e:
        print(f"头像下载失败: {e}")
        return None


# ==================== WebSocket 消息处理 ====================
async def handle_ws_message(account, payload: str):
    try:
        import base64
        buffer = base64.b64decode(payload)
        text = buffer.decode('utf-8', errors='ignore')

        import re
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if not match:
            return

        data = json.loads(match.group())
        print(f"[json] 原始 JSON:", data)

        nickname = data.get('title', '未知用户')
        message = data.get('text', '[无内容]')
        avatar_url = data.get('image_url', '')
        author_id = str(data.get('ttpush_event_extra', {}).get('author_id', 'unknown_uid'))

        if cfg.get('saveAvatars'):
            await download_image(avatar_url, author_id)

        print(f"[{account['name']}] 昵称: {nickname}")
        print(f"[{account['name']}] 内容: {message}")

        # 自动回复
        if cfg.get('autoReply') and message and message != '[无内容]':
            page = page_map.get(account['id'])
            if page:
                print(f"[{account['name']}] 正在调用 AI 生成回复...")
                ai_reply = await call_fastgpt(author_id, message)
                await send_reply(page, ai_reply)

        # 保存 WebSocket 数据
        if cfg.get('saveWebSocketData'):
            file_path = LOGS_DIR / f"{int(asyncio.get_event_loop().time() * 1000)}.bin"
            file_path.write_bytes(buffer)

    except Exception as e:
        print(f"[{account['name']}] 处理 WebSocket 数据时出错: {e}")


# ==================== 启动浏览器会话 ====================
async def start_browser_session(playwright, account):
    try:
        user_data_dir = f"./userData_{account['id']}"
        
        browser = await playwright.chromium.launch_persistent_context(
            user_data_dir,
            headless=False,
            viewport=None,
            executable_path=r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
            args=['--start-maximized']
        )

        page = browser.pages[0] if browser.pages else await browser.new_page()
        page_map[account['id']] = page

        # 监听 WebSocket
        async def on_ws(ws):
            if ws.url.startswith(TARGET_WS_URL):
                print(f"[{account['name']}] 捕捉到目标 WebSocket: {ws.url}")

                def on_message(msg):
                    if isinstance(msg, bytes):
                        import base64
                        asyncio.create_task(handle_ws_message(account, base64.b64encode(msg).decode()))

                ws.on('framereceived', on_message)

        page.on('websocket', on_ws)

        await page.goto(cfg['Url'])
        print(f"[{account['name']}] Playwright 实例就绪，开始监听 WebSocket 消息...")

        return browser
    except Exception as e:
        print(f"[{account['name']}] 启动失败: {e}")
        return None


# ==================== 主函数 ====================
async def main():
    async with async_playwright() as playwright:
        browsers = []
        for account in cfg['accounts']:
            browser = await start_browser_session(playwright, account)
            if browser:
                browsers.append(browser)

        if browsers:
            print("所有账号已启动，按 Ctrl+C 退出...")
            try:
                while True:
                    await asyncio.sleep(1)
            except KeyboardInterrupt:
                print("正在关闭...")
                for browser in browsers:
                    await browser.close()


if __name__ == '__main__':
    asyncio.run(main())
