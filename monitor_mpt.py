import json, time, urllib.request

TID = "8fe7572d-42b7-460e-b582-168b16c81c5c"
URL = f"http://127.0.0.1:8080/api/v1/tasks/{TID}"

for i in range(60):  # 最多 20 分钟
    try:
        r = urllib.request.urlopen(URL, timeout=10)
        t = json.load(r).get("data", {})
        state = t.get("state")
        prog = t.get("progress")
        print(f"[{i*20}s] state={state} progress={prog}", flush=True)
        if state == 1:  # COMPLETE
            print("=== COMPLETE ===")
            print("videos:", t.get("videos"))
            print("combined_videos:", t.get("combined_videos"))
            print("local_videos:", t.get("localVideos"))
            print("local_combined:", t.get("localCombinedVideos"))
            break
        if state == -1:  # FAILED
            print("=== FAILED ===")
            print("error:", (t.get("error") or "")[:400])
            print("failed_stage:", t.get("failed_stage"))
            break
    except Exception as e:
        print(f"[{i*20}s] ERR {e}", flush=True)
    time.sleep(20)
else:
    print("=== TIMEOUT (20min) 仍在处理，请手动检查 ===")
