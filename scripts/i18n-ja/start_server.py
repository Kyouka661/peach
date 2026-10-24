"""日本語版をトレイなしで起動する（スタートアップ登録用）。

使い方: pythonw.exe scripts/i18n-ja/start_server.py <データフォルダー> [--open]

pythonw には標準出力と標準エラーがなく、peach.server が起こす serve の子プロセスは
書き込み先を失って止まる。Windows の標準ハンドルをログファイルに向けてから起動し、
子プロセスにも同じログを引き継がせる。

--open（デスクトップのショートカット用）: 準備ができたらブラウザで開く。
すでに動いているときはブラウザで開くだけで、二つ目のサーバーは起動しない。
"""
import ctypes
import msvcrt
import os
import runpy
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path

URL = "http://127.0.0.1:8900/"


def healthy() -> bool:
    try:
        with urllib.request.urlopen(URL + "healthz", timeout=2):
            return True
    except OSError:
        return False


def open_when_ready() -> None:
    for _ in range(90):
        if healthy():
            webbrowser.open(URL)
            return
        time.sleep(1)


if "--open" in sys.argv:
    if healthy():
        webbrowser.open(URL)
        sys.exit(0)
    threading.Thread(target=open_when_ready, daemon=True).start()

data_root = Path(sys.argv[1])
os.environ["PEACH_DATA_ROOT"] = str(data_root)
log = open(data_root / "logs" / "server-ja.log", "a", encoding="utf-8", buffering=1)
handle = msvcrt.get_osfhandle(log.fileno())
for std in (-11, -12):  # STD_OUTPUT_HANDLE, STD_ERROR_HANDLE
    ctypes.windll.kernel32.SetStdHandle(std, handle)
sys.stdout = sys.stderr = log
sys.argv = [sys.argv[0]]
runpy.run_module("peach.server", run_name="__main__")
