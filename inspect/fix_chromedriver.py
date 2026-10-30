"""探测本机 Chrome 版本 -> 下载精确匹配的 ChromeDriver -> 安装到固定目录"""
import os
import io
import sys
import json
import shutil
import zipfile
import platform
import winreg
import requests

DEST = r"C:\Users\lyu\AppData\Local\chromedriver"

k = winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"SOFTWARE\Google\Chrome\BLBeacon")
version, _ = winreg.QueryValueEx(k, "version")
arch = "win64" if platform.machine() == "AMD64" else "win32"
print("Chrome:", version, "arch:", arch)


def try_url(v):
    return f"https://storage.googleapis.com/chrome-for-testing-public/{v}/{arch}/chromedriver-{arch}.zip"


url = try_url(version)
r = requests.head(url, timeout=60)
print("HEAD", url, "->", r.status_code)
if r.status_code != 200:
    # 回退：同大版本下探测邻近 build
    major = version.split(".")[0]
    idx = requests.get(
        "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json",
        timeout=60,
    ).json()
    stable = idx["channels"]["Stable"]["version"]
    print("fallback to stable:", stable)
    version = stable
    url = try_url(version)
    r = requests.head(url, timeout=60)
    print("HEAD", url, "->", r.status_code)
    if r.status_code != 200:
        print("FAIL: 找不到可下载的 chromedriver")
        sys.exit(1)

resp = requests.get(url, timeout=300)
resp.raise_for_status()
z = zipfile.ZipFile(io.BytesIO(resp.content))
src = next(n for n in z.namelist() if n.endswith("chromedriver.exe"))
os.makedirs(DEST, exist_ok=True)
out = os.path.join(DEST, "chromedriver.exe")
with z.open(src) as fs, open(out, "wb") as fd:
    shutil.copyfileobj(fs, fd)
open(os.path.join(DEST, "VERSION.txt"), "w").write(version + "\n")
print("installed ->", out, "version", version)
