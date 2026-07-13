# -*- coding: utf-8 -*-
"""Publish a prepared text/images package to WeChat Moments via wxautox4."""

from __future__ import annotations

import json
import logging
import signal
import subprocess
import sys
import time
from pathlib import Path


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler("wechat_moments_publish.log", encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ],
)
logger = logging.getLogger(__name__)
logging.getLogger("comtypes").setLevel(logging.WARNING)
logging.getLogger("comtypes.client").setLevel(logging.WARNING)
logging.getLogger("comtypes.gen").setLevel(logging.WARNING)


def emit(ok: bool, message: str, **extra: object) -> int:
    payload = {"ok": ok, "message": message, **extra}
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if ok else 1


def signal_handler(signum, frame):  # noqa: ANN001
    logger.info("received stop signal: %s", signum)
    sys.exit(emit(False, "微信朋友圈发布已取消。", code="INTERRUPTED"))


signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)


def load_payload(payload_path: str) -> tuple[str, list[str]]:
    path = Path(payload_path)
    if not path.exists():
        raise ValueError(f"payload file not found: {payload_path}")
    payload = json.loads(path.read_text(encoding="utf-8"))
    text = str(payload.get("text") or "").strip()
    if not text:
        raise ValueError("missing moments text")
    media_files: list[str] = []
    for item in payload.get("imagePaths") or []:
        file_path = Path(str(item)).resolve()
        if not file_path.exists():
            raise ValueError(f"image file not found: {file_path}")
        media_files.append(str(file_path))
    return text, media_files[:9]


def import_wechat():
    try:
        from wxautox4 import WeChat
        return WeChat
    except ModuleNotFoundError:
        logger.info("wxautox4 not found, installing automatically with current Python...")
        try:
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "wxautox4"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=300,
                check=False,
            )
        except Exception as exc:
            raise RuntimeError(f"发布朋友圈需要 wxautox4，自动安装失败：{exc}") from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise RuntimeError(f"发布朋友圈需要 wxautox4，自动安装失败：{detail or 'pip install wxautox4 执行失败'}")
        try:
            from wxautox4 import WeChat
            return WeChat
        except ModuleNotFoundError as exc:
            raise RuntimeError("wxautox4 已尝试自动安装，但当前 Python 仍无法导入。请检查本机 Python/pip 环境。") from exc
    except Exception as exc:  # pragma: no cover - import-time vendor errors
        raise RuntimeError(f"wxautox4 加载失败：{exc}") from exc


def publish(text: str, media_files: list[str], max_retries: int = 3) -> None:
    WeChat = import_wechat()

    try:
        wx = WeChat()
    except Exception as exc:
        raise RuntimeError(f"微信初始化失败，请确认微信 PC 版已登录且 wxautox4 已激活：{exc}") from exc

    last_error: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            wx.PublishMoment(text=text, media_files=media_files)
            return
        except Exception as exc:  # pragma: no cover - depends on local WeChat UI
            last_error = exc
            logger.error("publish failed (%s/%s): %s", attempt, max_retries, exc)
            if attempt < max_retries:
                time.sleep(2)
    raise RuntimeError(f"朋友圈发布失败：{last_error}")


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        return emit(False, "缺少发布参数文件。", code="MISSING_PAYLOAD")
    try:
        text, media_files = load_payload(argv[1])
        publish(text, media_files)
        return emit(True, f"微信朋友圈发布完成：{len(media_files)} 张图片。", imageCount=len(media_files))
    except ModuleNotFoundError as exc:
        return emit(False, f"Python 依赖缺失：{exc}", code="PYTHON_IMPORT_FAILED")
    except RuntimeError as exc:
        message = str(exc)
        code = "WXAUTO4_RUNTIME_ERROR"
        if "pip install wxautox4" in message:
            code = "WXAUTOX4_NOT_INSTALLED"
        return emit(False, message, code=code)
    except Exception as exc:
        logger.exception("unexpected publish error")
        return emit(False, str(exc), code="PUBLISH_FAILED")


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
