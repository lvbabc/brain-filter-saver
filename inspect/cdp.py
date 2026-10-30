"""用 CDP（Chrome DevTools Protocol）直接驱动调试 Chrome，绕开 Selenium 兼容问题。

用法：
  python cdp.py dump            # 确保浏览器在跑 -> 等登录 -> 抓 DOM
  python cdp.py eval file.js    # 在当前页面执行一段 JS，打印返回值
  python cdp.py goto <url>      # 导航
  python cdp.py shot [name]     # 截图

环境变量：
  LOGIN_WAIT  等待手动登录秒数（默认 900）
  EXTRA_WAIT  登录后额外等待渲染秒数（默认 20）
"""
import os
import io
import sys
import json
import time
import base64
import subprocess
import urllib.request

import websocket  # websocket-client

BASE = r"E:\quant\workspace\search_enhanced"
PROFILE = os.path.join(BASE, ".chrome-brain-profile")
OUT = os.path.join(BASE, "inspect")
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
TARGET = "https://platform.worldquantbrain.com/alphas/unsubmitted"
PORT = 9222
LOGIN_WAIT = int(os.environ.get("LOGIN_WAIT", "900"))
EXTRA_WAIT = int(os.environ.get("EXTRA_WAIT", "20"))
os.makedirs(OUT, exist_ok=True)

_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))  # 绕开本机 HTTP 代理


def log(*a):
    print("[%s]" % time.strftime("%H:%M:%S"), *a, flush=True)


def http_json(url, method="GET"):
    req = urllib.request.Request(url, method=method)
    with _opener.open(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def ensure_browser():
    try:
        v = http_json("http://127.0.0.1:%d/json/version" % PORT)
        log("已连接到调试浏览器: %s" % v.get("Browser"))
        return v
    except Exception as e:
        log("未发现调试浏览器 (%s)，正在启动…" % e)
    args = [
        CHROME,
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=" + PROFILE,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1680,1050",
        TARGET,
    ]
    subprocess.Popen(args, close_fds=True)
    for _ in range(60):
        time.sleep(1)
        try:
            v = http_json("http://127.0.0.1:%d/json/version" % PORT)
            log("调试浏览器已启动: %s" % v.get("Browser"))
            return v
        except Exception:
            pass
    raise RuntimeError("无法启动调试浏览器")


def get_page_target():
    for _ in range(30):
        try:
            tabs = http_json("http://127.0.0.1:%d/json/list" % PORT)
        except Exception:
            time.sleep(1)
            continue
        for t in tabs:
            if t.get("type") == "page" and "worldquantbrain.com" in (t.get("url") or ""):
                return t
        for t in tabs:
            if t.get("type") == "page" and t.get("url", "").startswith("http"):
                return t
        time.sleep(1)
    raise RuntimeError("找不到可用的页面 target")


class Page:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=180)
        self._id = 0

    def call(self, method, params=None):
        self._id += 1
        self.ws.send(json.dumps({"id": self._id, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self._id:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, json.dumps(msg["error"], ensure_ascii=False)))
                return msg.get("result", {})

    def js(self, expr, await_promise=False):
        r = self.call("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": await_promise,
        })
        if r.get("exceptionDetails"):
            raise RuntimeError(json.dumps(r["exceptionDetails"], ensure_ascii=False)[:800])
        return r.get("result", {}).get("value")

    def goto(self, url):
        self.call("Page.navigate", {"url": url})

    def url(self):
        return self.js("location.href")

    def shot(self, name="shot"):
        r = self.call("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(r["data"])
        p = os.path.join(OUT, name + ".png")
        with open(p, "wb") as f:
            f.write(data)
        log("截图 -> %s (%d KB)" % (p, len(data) // 1024))
        return p

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


CONNECT_JS = "(function(){return {injected: !!window.__BRAIN_OPT_SAVER__, href: location.href, title: document.title};})()"


def wait_login(page, seconds):
    deadline = time.time() + seconds
    log("等待登录：请在调试 Chrome 窗口完成登录（最多 %d 秒）" % seconds)
    while time.time() < deadline:
        try:
            u = page.url()
        except Exception:
            time.sleep(2)
            continue
        if u and "login" not in u.lower() and "worldquantbrain" in u.lower():
            try:
                n = page.js("document.querySelectorAll('header,nav,table,[role=row],main').length")
                if n and int(n) > 0:
                    log("已登录: %s" % u)
                    return True
            except Exception:
                pass
        time.sleep(2)
    log("NEED_LOGIN: 超时，浏览器保持打开，登录后重跑本脚本")
    return False


DUMP_JS = r"""
(function(){
  var sel = 'input,select,textarea,[role="checkbox"],[role="switch"],[role="radio"],[role="combobox"],[role="listbox"],[role="button"]';
  var out = [];
  document.querySelectorAll(sel).forEach(function(el, i){
    var b = {w:0,h:0,x:0,y:0};
    try { var r = el.getBoundingClientRect(); b = {w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)}; } catch(e){}
    var val = null;
    try { val = (el.type === 'checkbox' || el.type === 'radio') ? el.checked : el.value; } catch(e){}
    out.push({
      i: i, tag: el.tagName, type: el.type || '', id: el.id || '', name: el.name || '',
      cls: (el.className || '').toString().slice(0,200),
      role: el.getAttribute('role') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      ariaChecked: el.getAttribute('aria-checked') || '',
      ariaExpanded: el.getAttribute('aria-expanded') || '',
      ariaControls: el.getAttribute('aria-controls') || '',
      placeholder: el.getAttribute('placeholder') || '',
      title: el.getAttribute('title') || '',
      dataTestId: el.getAttribute('data-testid') || '',
      value: val,
      text: (el.textContent||'').replace(/\s+/g,' ').trim().slice(0,120),
      disabled: !!el.disabled,
      visible: b.w>0 && b.h>0,
      rect: b,
      inRow: !!(el.closest && el.closest('tr,[role="row"]')),
      html: el.outerHTML.replace(/\s+/g,' ').slice(0,600)
    });
  });
  return JSON.stringify(out);
})()
"""


def do_dump(page, tag=""):
    suffix = ("_" + tag) if tag else ""
    html = page.js("document.documentElement.outerHTML")
    p = os.path.join(OUT, "page%s.html" % suffix)
    with open(p, "w", encoding="utf-8") as f:
        f.write(html)
    log("已保存 %s (%d 字符)" % (p, len(html)))

    items = json.loads(page.js(DUMP_JS))
    p2 = os.path.join(OUT, "controls%s.json" % suffix)
    with open(p2, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
    log("已保存 %s（%d 个控件）" % (p2, len(items)))

    try:
        page.shot("shot" + suffix)
    except Exception as e:
        log("截图失败: %s" % e)
    try:
        log("插件状态: %s" % json.dumps(page.js(CONNECT_JS), ensure_ascii=False))
    except Exception as e:
        log("插件状态读取失败: %s" % e)
    return items


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "dump"
    ensure_browser()
    t = get_page_target()
    page = Page(t["webSocketDebuggerUrl"])
    log("已附着页面: %s" % page.url())

    if cmd == "dump":
        u = page.url()
        if "unsubmitted" not in u:
            page.goto(TARGET)
            time.sleep(8)
        if not wait_login(page, LOGIN_WAIT):
            return 1
        log("额外等待 %d 秒让表格渲染…" % EXTRA_WAIT)
        time.sleep(EXTRA_WAIT)
        if "unsubmitted" not in (page.url() or ""):
            page.goto(TARGET)
            time.sleep(EXTRA_WAIT)
        log("最终 URL: %s" % page.url())
        do_dump(page, "full")
        log("DONE")
    elif cmd == "eval":
        src = open(sys.argv[2], encoding="utf-8").read()
        r = page.js(src, await_promise=True)
        print(json.dumps(r, ensure_ascii=False, indent=1) if not isinstance(r, str) else r)
    elif cmd == "goto":
        page.goto(sys.argv[2])
        time.sleep(int(sys.argv[3]) if len(sys.argv) > 3 else 10)
        log("URL: %s" % page.url())
    elif cmd == "shot":
        page.shot(sys.argv[2] if len(sys.argv) > 2 else "shot")
    page.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
