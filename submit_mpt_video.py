import json, urllib.request

SCRIPT = r"C:\Users\Admin\Desktop\短视频\douyin-video-tool-source-code\douyin-mcp-local\integrations\moneyprinterturbo\storage\tasks\8bb53c8c-ce13-4f7f-8c2d-2b22f97b90eb\script.json"
URL = "http://127.0.0.1:8080/api/v1/videos"

p = json.load(open(SCRIPT, encoding="utf-8"))["params"]

# 把 15 段全相同的死词替换成基于文案主题的多样化英文搜索词
terms = [
    "struggling student", "confused person", "deep thinking", "knowledge network",
    "math formula", "light bulb idea", "alarm clock", "teaching class",
    "spiral cycle", "reading book", "open notebook", "study desk",
    "writing notes", "classroom", "graduation cap",
]
p["video_terms"] = terms

data = json.dumps(p, ensure_ascii=False).encode("utf-8")
req = urllib.request.Request(URL, data=data, headers={"Content-Type": "application/json"})
try:
    r = urllib.request.urlopen(req, timeout=30)
    body = r.read().decode("utf-8")
    print("HTTP", r.status)
    print(body[:800])
except urllib.error.HTTPError as e:
    print("HTTP ERROR", e.code)
    print(e.read().decode("utf-8")[:800])
except Exception as e:
    print("EXCEPTION", repr(e))
