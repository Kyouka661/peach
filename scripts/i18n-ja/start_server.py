"""日本語版をトレイなしで起動する（スタートアップ登録用）。

使い方: pythonw.exe scripts/i18n-ja/start_server.py <データフォルダー>

pythonw には標準出力と標準エラーがなく、peach.server が起こす serve の子プロセスは
書き込み先を失って止まる。Windows の標準ハンドルをログファイルに向けてから起動し、
子プロセスにも同じログを引き継がせる。
"""
import ctypes
import msvcrt
import os
import runpy
import sys
from pathlib import Path

data_root = Path(sys.argv[1])
os.environ["PEACH_DATA_ROOT"] = str(data_root)
log = open(data_root / "logs" / "server-ja.log", "a", encoding="utf-8", buffering=1)
handle = msvcrt.get_osfhandle(log.fileno())
for std in (-11, -12):  # STD_OUTPUT_HANDLE, STD_ERROR_HANDLE
    ctypes.windll.kernel32.SetStdHandle(std, handle)
sys.stdout = sys.stderr = log
sys.argv = [sys.argv[0]]
runpy.run_module("peach.server", run_name="__main__")
