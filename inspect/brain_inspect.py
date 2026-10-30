"""用独立调试 Chrome 打开 BRAIN 未提交页面，抓取真实 DOM 并实测插件。
用法：
  python inspect.py            # 打开浏览器，等待登录，然后抓取
  LOGIN_WAIT=600 python inspect.py
环境变量：
  LOGIN_WAIT  等待手动登录的秒数（默认 300）
  DO_TEST     1 = 抓取后额外做一次「保存 -> 刷新 -> 检查恢复」实验
"""
import os
import sys
import json
import time

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By

BASE = r"E:\quant\workspace\search_enhanced"
PROFILE = os.path.join(BASE, ".chrome-brain-profile")
EXT = os.path.join(BASE, "brain-filter-saver")
OUT = os.path.join(BASE, "inspect")
CD = r"C:\Users\lyu\AppData\Local\chromedriver\chromedriver.exe"
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TARGET = "https://platform.worldquantbrain.com/alphas/unsubmitted"
os.makedirs(OUT, exist_ok=True)
LOGIN_WAIT = int(os.environ.get("LOGIN_WAIT", "300"))


def log(*a):
    print("[%s]" % time.strftime("%H:%M:%S"), *a, flush=True)


DUMP_JS = """
const sel = 'input,select,textarea,[role="checkbox"],[role="switch"],[role="radio"],[role="combobox"]';
const out = [];
document.querySelectorAll(sel).forEach((el, i) => {
  let r = {w:0,h:0,x:0,y:0};
  try { const b = el.getBoundingClientRect(); r = {w:Math.round(b.width),h:Math.round(b.height),x:Math.round(b.x),y:Math.round(b.y)}; } catch(e){}
  let val = null;
  try { val = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value; } catch(e){}
  out.push({
    i, tag: el.tagName, type: el.type || '', id: el.id || '', name: el.name || '',
    cls: (el.className || '').toString().slice(0, 160),
    role: el.getAttribute('role') || '',
    ariaLabel: el.getAttribute('aria-label') || '',
    ariaChecked: el.getAttribute('aria-checked') || '',
    ariaControls: el.getAttribute('aria-controls') || '',
    placeholder: el.getAttribute('placeholder') || '',
    title: el.getAttribute('title') || '',
    dataTestId: el.getAttribute('data-testid') || '',
    value: val,
    text: (el.textContent || '').replace(/\\s+/g,' ').trim().slice(0, 100),
    disabled: !!el.disabled,
    visible: r.w > 0 && r.h > 0,
    rect: r,
    parentTag: el.parentElement ? el.parentElement.tagName : '',
    inRow: !!(el.closest && el.closest('tr,[role="row"]')),
    html: el.outerHTML.replace(/\\s+/g,' ').slice(0, 500)
  });
});
return JSON.stringify(out);
"""


def start_browser():
    opts = Options()
    opts.binary_location = CHROME
    opts.add_argument("--user-data-dir=" + PROFILE)
    opts.add_argument("--profile-directory=Default")
    opts.add_argument("--no-first-run")
    opts.add_argument("--no-default-browser-check")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_argument("--window-size=1680,1050")
    if os.environ.get("LOAD_EXT") == "1":
        opts.add_argument("--load-extension=" + EXT)
    opts.add_experimental_option("detach", True)
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    drv = webdriver.Chrome(service=Service(CD), options=opts)
    log("浏览器已启动")
    return drv


def wait_login(drv, seconds):
    deadline = time.time() + seconds
    log("等待登录，请在打开的 Chrome 窗口中完成登录（最多 %d 秒）..." % seconds)
    while time.time() < deadline:
        try:
            url = drv.current_url
        except Exception:
            time.sleep(2)
            continue
        if (not url) or url.startswith("about:") or url.startswith("chrome"):
            try:
                drv.get(TARGET)
            except Exception:
                pass
            time.sleep(2)
            continue
        if url and "login" not in url.lower():
            try:
                hits = drv.find_elements(By.CSS_SELECTOR, "header,nav,table,[role='row'],main")
                if hits:
                    log("检测到已登录: %s" % url)
                    return True
            except Exception:
                pass
        time.sleep(2)
    log("NEED_LOGIN: 超时仍未检测到登录状态")
    return False


def dump(drv, tag=""):
    suffix = ("_" + tag) if tag else ""
    time.sleep(3)
    html = drv.execute_script("return document.body.parentElement.outerHTML;")
    with open(os.path.join(OUT, "page%s.html" % suffix), "w", encoding="utf-8") as f:
        f.write(html)
    log("已保存 page%s.html (%d 字符)" % (suffix, len(html)))

    raw = drv.execute_script(DUMP_JS)
    items = json.loads(raw)
    with open(os.path.join(OUT, "controls%s.json" % suffix), "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    log("已保存 controls%s.json（%d 个控件）" % (suffix, len(items)))

    try:
        injected = drv.execute_script("return !!window.__BRAIN_OPT_SAVER__;")
    except Exception:
        injected = False
    log("插件 content script 已注入: %s" % injected)

    try:
        drv.save_screenshot(os.path.join(OUT, "shot%s.png" % suffix))
        log("已保存 shot%s.png" % suffix)
    except Exception as e:
        log("截图失败: %s" % e)
    return items


def main():
    drv = start_browser()
    time.sleep(2)
    try:
        hs = drv.window_handles
        log("窗口数: %d" % len(hs))
        if hs:
            drv.switch_to.window(hs[0])
    except Exception as e:
        log("切换窗口异常: %s" % e)
    for attempt in range(4):
        try:
            drv.get(TARGET)
            log("导航成功 -> %s" % drv.current_url)
            break
        except Exception as e:
            log("导航重试 %d: %s" % (attempt, e))
            time.sleep(3)

    if not wait_login(drv, LOGIN_WAIT):
        log("浏览器保持打开（detach），登录后重新运行本脚本即可。")
        return 1

    log("等待页面渲染 25 秒...")
    time.sleep(25)
    try:
        if "unsubmitted" not in drv.current_url:
            drv.get(TARGET)
            time.sleep(20)
    except Exception:
        pass
    log("当前 URL: %s" % drv.current_url)
    dump(drv, "full")
    log("DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
