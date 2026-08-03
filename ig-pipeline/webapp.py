#!/usr/bin/env python3
"""跑在本機的網頁介面：貼上 IG 網址 -> 抓取 -> 逐字稿 -> 產出可分析的素材。

    python webapp.py            # 然後開 http://127.0.0.1:8765

只綁 127.0.0.1，不對外開放。抓取與轉寫都是耗時工作，會丟到背景執行緒跑，
前端用輪詢拿進度。實際幹活的還是 igpipe.py，這裡只是包一層 UI。
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

import igpipe

HERE = Path(__file__).resolve().parent
INDEX_HTML = HERE / "web" / "index.html"

# 只接受 IG 的貼文網址，避免這個本地服務被拿去打別的站
IG_HOSTS = {"instagram.com", "www.instagram.com", "m.instagram.com"}
IG_PATH_RE = re.compile(r"^/(reel|reels|p|tv)/[\w-]+/?$")

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()


# --------------------------------------------------------------------------
# 工作流程


def validate_urls(raw: str) -> tuple[list[str], list[str]]:
    """回傳 (合格網址, 被拒絕的原始字串)。"""
    good, bad = [], []
    for line in raw.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        try:
            parsed = urlparse(line)
        except ValueError:
            bad.append(line)
            continue
        if parsed.scheme not in ("http", "https") or parsed.hostname not in IG_HOSTS:
            bad.append(line)
        elif not IG_PATH_RE.match(parsed.path):
            # 帳號首頁這類網址抓不到東西，早點擋掉比讓 yt-dlp 失敗好
            bad.append(line)
        else:
            good.append(f"https://www.instagram.com{parsed.path.rstrip('/')}/" )
    # 去重但保留順序
    return list(dict.fromkeys(good)), bad


def append_log(job_id: str, line: str) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is not None:
            job["log"].append(f"{datetime.now():%H:%M:%S}  {line}")


def set_state(job_id: str, **fields) -> None:
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if job is not None:
            job.update(fields)


def stream_step(job_id: str, argv: list[str], label: str) -> int:
    """跑一個 igpipe 子指令，把它的輸出即時倒進 job log。"""
    append_log(job_id, f"=== {label} ===")
    proc = subprocess.Popen(
        [sys.executable, str(HERE / "igpipe.py"), *argv],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        cwd=str(HERE),
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            append_log(job_id, line)
    proc.wait()
    if proc.returncode != 0:
        append_log(job_id, f"（{label} 回傳非零，可能只有部分失敗，繼續往下走）")
    return proc.returncode


def collect_results(workdir: Path) -> list[dict]:
    """從 workdir 讀出每支影片的 metadata 與逐字稿，給前端顯示。"""
    items = []
    if not workdir.exists():
        return items
    for video in igpipe.video_files(workdir):
        info_path = igpipe.info_for(video)
        if info_path is None:
            post = igpipe.Post.from_video_only(video)
        else:
            try:
                post = igpipe.Post.from_info(
                    json.loads(info_path.read_text(encoding="utf-8"))
                )
            except json.JSONDecodeError:
                post = igpipe.Post.from_video_only(video)
        txt = video.with_suffix(".txt")
        transcript = txt.read_text(encoding="utf-8") if txt.exists() else ""
        items.append(
            {
                "id": post.post_id,
                "url": post.url,
                "uploader": post.uploader,
                "date": post.date,
                "duration": post.duration,
                "views": post.view_count,
                "likes": post.like_count,
                "comments": post.comment_count,
                "caption": post.description,
                "transcript": transcript,
                "markdown": igpipe.render_markdown(post, transcript),
                "has_metadata": info_path is not None,
            }
        )
    return items


def run_job(job_id: str, urls: list[str], opts: dict) -> None:
    workdir = Path(JOBS[job_id]["workdir"])
    workdir.mkdir(parents=True, exist_ok=True)
    urls_file = workdir / "urls.txt"
    urls_file.write_text("\n".join(urls) + "\n", encoding="utf-8")

    try:
        set_state(job_id, state="fetching")
        fetch_argv = [
            "--workdir", str(workdir),
            "fetch", "--urls", str(urls_file), "--skip-existing",
            "--sleep", str(opts.get("sleep", 3)),
        ]
        if opts.get("cookies_from_browser"):
            fetch_argv += ["--cookies-from-browser", opts["cookies_from_browser"]]
        stream_step(job_id, fetch_argv, "下載影片")

        if not igpipe.video_files(workdir):
            set_state(job_id, state="error",
                      error="一支影片都沒抓到。多半是私密帳號、網址失效，或撞到 IG 限流。")
            return

        if opts.get("transcribe", True):
            set_state(job_id, state="transcribing")
            tr_argv = ["--workdir", str(workdir), "transcribe",
                       "--model", opts.get("model", "small")]
            if opts.get("lang"):
                tr_argv += ["--lang", opts["lang"]]
            stream_step(job_id, tr_argv, "產生逐字稿")
        else:
            append_log(job_id, "（略過逐字稿）")

        set_state(job_id, state="packing")
        stream_step(job_id, ["--workdir", str(workdir), "pack",
                             "--dest", str(workdir / "notebooklm"), "--single-file"],
                    "打包素材")

        items = collect_results(workdir)
        append_log(job_id, f"完成，共 {len(items)} 支影片")
        set_state(job_id, state="done", items=items)
    except Exception as exc:  # 背景執行緒的例外要留下來給前端看
        append_log(job_id, f"發生未預期的錯誤：{exc}")
        set_state(job_id, state="error", error=str(exc))


# --------------------------------------------------------------------------
# HTTP


class Handler(BaseHTTPRequestHandler):
    server_version = "igpipe-web"

    def log_message(self, fmt, *args):  # 別把每個請求都印出來洗版
        pass

    def _send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict) -> None:
        self._send(code, json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/":
            if not INDEX_HTML.exists():
                self._send(500, b"missing web/index.html", "text/plain; charset=utf-8")
                return
            self._send(200, INDEX_HTML.read_bytes(), "text/html; charset=utf-8")
            return

        match = re.match(r"^/api/jobs/([\w-]+)$", path)
        if match:
            with JOBS_LOCK:
                job = JOBS.get(match.group(1))
                payload = dict(job) if job else None
            if payload is None:
                self._json(404, {"error": "查無此工作"})
            else:
                self._json(200, payload)
            return

        self._send(404, b"not found", "text/plain; charset=utf-8")

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/jobs":
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return
        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError):
            self._json(400, {"error": "request body 不是合法 JSON"})
            return

        urls, rejected = validate_urls(body.get("urls") or "")
        if not urls:
            self._json(400, {
                "error": "沒有任何合格的 IG 貼文網址。需要 /reel/… 或 /p/… 這種單篇網址，"
                         "帳號首頁沒有用。",
                "rejected": rejected,
            })
            return

        job_id = uuid.uuid4().hex[:12]
        workdir = HERE / "work" / job_id
        with JOBS_LOCK:
            JOBS[job_id] = {
                "id": job_id, "state": "queued", "log": [], "items": [],
                "error": None, "workdir": str(workdir),
                "total": len(urls), "rejected": rejected,
            }
        threading.Thread(
            target=run_job, args=(job_id, urls, body), daemon=True
        ).start()
        self._json(200, {"job_id": job_id, "accepted": len(urls), "rejected": rejected})


def main() -> int:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"開啟 http://127.0.0.1:{port} （Ctrl-C 結束）", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n結束", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
