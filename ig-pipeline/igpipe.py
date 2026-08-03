#!/usr/bin/env python3
"""IG 短影片 -> 逐字稿 -> NotebookLM 素材包 的處理流程。

四個步驟，各自獨立，可以分開重跑：

    fetch       用 yt-dlp 下載貼文影片 + metadata
    transcribe  用 Whisper 產生逐字稿
    pack        把 metadata + 逐字稿打包成 NotebookLM 可上傳的 Markdown
    upload      （選用）把影片備份到 YouTube

用法見 README.md。
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

VIDEO_SUFFIXES = (".mp4", ".mkv", ".webm", ".mov")


# --------------------------------------------------------------------------
# 共用


def log(msg: str) -> None:
    print(f"[igpipe] {msg}", file=sys.stderr)


def die(msg: str) -> "NoReturn":  # type: ignore[valid-type]
    log(f"錯誤：{msg}")
    raise SystemExit(1)


def read_urls(path: Path) -> list[str]:
    """讀網址清單，忽略空行與 # 註解。"""
    if not path.exists():
        die(f"找不到網址清單 {path}")
    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if line:
            urls.append(line)
    if not urls:
        die(f"{path} 裡沒有任何網址")
    return urls


def slugify(text: str, limit: int = 60) -> str:
    """留下中英數字，其餘換成底線，給檔名用。"""
    cleaned = re.sub(r"[^\w一-鿿]+", "_", text, flags=re.UNICODE)
    return cleaned.strip("_")[:limit] or "untitled"


def info_json_files(workdir: Path) -> list[Path]:
    return sorted(workdir.glob("*.info.json"))


def video_for(info_path: Path) -> Path | None:
    """找出與 .info.json 對應的影片檔。"""
    stem = info_path.name[: -len(".info.json")]
    for suffix in VIDEO_SUFFIXES:
        candidate = info_path.with_name(stem + suffix)
        if candidate.exists():
            return candidate
    return None


# --------------------------------------------------------------------------
# metadata


@dataclass
class Post:
    post_id: str
    url: str
    uploader: str
    date: str
    duration: int
    description: str
    view_count: int | None
    like_count: int | None
    comment_count: int | None

    @classmethod
    def from_info(cls, info: dict) -> "Post":
        upload_date = info.get("upload_date") or ""
        if len(upload_date) == 8:  # YYYYMMDD -> YYYY-MM-DD
            upload_date = f"{upload_date[:4]}-{upload_date[4:6]}-{upload_date[6:]}"
        return cls(
            post_id=str(info.get("id") or "unknown"),
            url=info.get("webpage_url") or info.get("original_url") or "",
            uploader=info.get("uploader") or info.get("channel") or "",
            date=upload_date,
            duration=int(info.get("duration") or 0),
            # IG 的貼文文案在 description，title 常常只是文案的截斷版
            description=(info.get("description") or "").strip(),
            view_count=info.get("view_count"),
            like_count=info.get("like_count"),
            comment_count=info.get("comment_count"),
        )

    def label(self) -> str:
        first_line = self.description.splitlines()[0] if self.description else ""
        return slugify(first_line) if first_line else self.post_id


# --------------------------------------------------------------------------
# fetch


def cmd_fetch(args: argparse.Namespace) -> int:
    workdir: Path = args.workdir
    workdir.mkdir(parents=True, exist_ok=True)
    urls = read_urls(args.urls)

    cmd = [
        "yt-dlp",
        "--write-info-json",
        "--no-write-playlist-metafiles",
        "--restrict-filenames",
        "--output",
        str(workdir / "%(id)s.%(ext)s"),
        # IG 抓太快會被擋，預設放慢
        "--sleep-requests",
        str(args.sleep),
        "--sleep-interval",
        str(args.sleep),
        "--retries",
        "3",
    ]
    if args.cookies_from_browser:
        cmd += ["--cookies-from-browser", args.cookies_from_browser]
    elif args.cookies:
        cmd += ["--cookies", str(args.cookies)]
    else:
        log("警告：沒給 cookies，IG 多半會擋下來（見 README 的『登入』段落）")
    if args.skip_existing:
        cmd += ["--download-archive", str(workdir / "downloaded.txt")]
    cmd += urls

    log(f"下載 {len(urls)} 個網址到 {workdir}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        log("yt-dlp 有部分失敗，已下載的檔案仍然保留，可以修好清單後重跑")
    log(f"目前 {workdir} 裡有 {len(info_json_files(workdir))} 筆 metadata")
    return result.returncode


# --------------------------------------------------------------------------
# transcribe


def cmd_transcribe(args: argparse.Namespace) -> int:
    workdir: Path = args.workdir
    infos = info_json_files(workdir)
    if not infos:
        die(f"{workdir} 裡沒有 .info.json，請先跑 fetch")

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        die("需要 faster-whisper：pip install -r requirements.txt")

    log(f"載入 Whisper 模型 {args.model}（第一次會下載權重）")
    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    done = 0
    for info_path in infos:
        video = video_for(info_path)
        if video is None:
            log(f"跳過 {info_path.name}：找不到對應影片檔")
            continue
        out_txt = video.with_suffix(".txt")
        if out_txt.exists() and not args.overwrite:
            log(f"跳過 {video.name}：逐字稿已存在（--overwrite 可強制重做）")
            continue

        log(f"轉寫 {video.name}")
        segments, _ = model.transcribe(
            str(video),
            language=args.lang,
            vad_filter=True,
            beam_size=5,
        )

        lines, srt_blocks = [], []
        for idx, seg in enumerate(segments, start=1):
            text = seg.text.strip()
            if not text:
                continue
            lines.append(text)
            srt_blocks.append(
                f"{idx}\n{_srt_time(seg.start)} --> {_srt_time(seg.end)}\n{text}\n"
            )

        out_txt.write_text("\n".join(lines) + "\n", encoding="utf-8")
        video.with_suffix(".srt").write_text("\n".join(srt_blocks), encoding="utf-8")
        done += 1

    log(f"完成 {done} 支影片的逐字稿")
    return 0


def _srt_time(seconds: float) -> str:
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# --------------------------------------------------------------------------
# pack


def render_markdown(post: Post, transcript: str) -> str:
    """單支影片的 Markdown。欄位刻意寫成人看得懂的句子，NotebookLM 才引用得到。"""
    stats = []
    if post.view_count is not None:
        stats.append(f"觀看 {post.view_count:,}")
    if post.like_count is not None:
        stats.append(f"按讚 {post.like_count:,}")
    if post.comment_count is not None:
        stats.append(f"留言 {post.comment_count:,}")

    parts = [
        f"# {post.uploader or 'IG'} / {post.post_id}",
        "",
        f"- 來源網址：{post.url}",
        f"- 發布日期：{post.date or '未知'}",
        f"- 影片長度：{post.duration} 秒" if post.duration else "- 影片長度：未知",
    ]
    if stats:
        parts.append(f"- 互動數據：{'、'.join(stats)}")
    parts += [
        "",
        "## 貼文文案",
        "",
        post.description or "（無文案）",
        "",
        "## 影片逐字稿",
        "",
        transcript.strip() or "（無逐字稿）",
        "",
    ]
    return "\n".join(parts)


def cmd_pack(args: argparse.Namespace) -> int:
    workdir: Path = args.workdir
    dest: Path = args.dest
    infos = info_json_files(workdir)
    if not infos:
        die(f"{workdir} 裡沒有 .info.json，請先跑 fetch")
    dest.mkdir(parents=True, exist_ok=True)

    posts: list[tuple[Post, str, Path]] = []
    for info_path in infos:
        try:
            info = json.loads(info_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            log(f"跳過 {info_path.name}：JSON 解析失敗")
            continue
        post = Post.from_info(info)

        transcript = ""
        video = video_for(info_path)
        if video is not None:
            txt = video.with_suffix(".txt")
            if txt.exists():
                transcript = txt.read_text(encoding="utf-8")
        if not transcript:
            log(f"注意：{post.post_id} 沒有逐字稿，只會輸出文案與數據")

        out_name = f"{post.date or '0000-00-00'}_{post.post_id}_{post.label()}.md"
        out_path = dest / out_name
        out_path.write_text(render_markdown(post, transcript), encoding="utf-8")
        posts.append((post, transcript, out_path))

    posts.sort(key=lambda item: item[0].date)
    index = [
        f"# {posts[0][0].uploader or 'IG'} 影片索引",
        "",
        f"共 {len(posts)} 支影片。每支影片另有一個 Markdown 檔，逐字稿在該檔裡。",
        "",
        "| 日期 | 貼文 ID | 秒數 | 觀看 | 按讚 | 文案開頭 |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for post, _, _ in posts:
        head = (post.description.splitlines() or [""])[0][:40].replace("|", "/")
        index.append(
            f"| {post.date or '-'} | {post.post_id} | {post.duration or '-'} "
            f"| {post.view_count if post.view_count is not None else '-'} "
            f"| {post.like_count if post.like_count is not None else '-'} | {head} |"
        )
    (dest / "_index.md").write_text("\n".join(index) + "\n", encoding="utf-8")

    if args.single_file:
        merged = "\n\n---\n\n".join(
            render_markdown(post, transcript) for post, transcript, _ in posts
        )
        (dest / "_all.md").write_text(merged, encoding="utf-8")
        log("已另外輸出 _all.md（單檔版，適合 NotebookLM 來源數量吃緊時用）")

    log(f"輸出 {len(posts)} 個 Markdown 到 {dest}")
    return 0


# --------------------------------------------------------------------------
# upload（選用，純備份用途）


def cmd_upload(args: argparse.Namespace) -> int:
    workdir: Path = args.workdir
    try:
        from google.oauth2.credentials import Credentials
        from google_auth_oauthlib.flow import InstalledAppFlow
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
    except ImportError:
        die("需要 Google API 套件：pip install -r requirements.txt")

    scopes = ["https://www.googleapis.com/auth/youtube.upload"]
    token_path: Path = args.token
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), scopes)
    else:
        if not args.client_secrets.exists():
            die(f"找不到 {args.client_secrets}，請先在 Google Cloud 建立 OAuth client")
        flow = InstalledAppFlow.from_client_secrets_file(str(args.client_secrets), scopes)
        creds = flow.run_local_server(port=0)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    youtube = build("youtube", "v3", credentials=creds)
    uploaded_log = workdir / "uploaded.json"
    uploaded: dict = json.loads(uploaded_log.read_text()) if uploaded_log.exists() else {}

    count = 0
    for info_path in info_json_files(workdir):
        info = json.loads(info_path.read_text(encoding="utf-8"))
        post = Post.from_info(info)
        if post.post_id in uploaded:
            continue
        video = video_for(info_path)
        if video is None:
            continue
        if count >= args.limit:
            log(f"已達本次上傳上限 {args.limit}（YouTube 每日配額約 6 支，見 README）")
            break

        log(f"上傳 {video.name} -> YouTube（{args.privacy}）")
        request = youtube.videos().insert(
            part="snippet,status",
            body={
                "snippet": {
                    "title": (post.description.splitlines() or [post.post_id])[0][:95]
                    or post.post_id,
                    "description": f"來源：{post.url}\n\n{post.description}"[:4900],
                },
                "status": {"privacyStatus": args.privacy, "selfDeclaredMadeForKids": False},
            },
            media_body=MediaFileUpload(str(video), chunksize=-1, resumable=True),
        )
        response = request.execute()
        uploaded[post.post_id] = response["id"]
        uploaded_log.write_text(json.dumps(uploaded, indent=2), encoding="utf-8")
        count += 1

    log(f"本次上傳 {count} 支，紀錄在 {uploaded_log}")
    return 0


# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="igpipe", description=__doc__)
    parser.add_argument(
        "--workdir", type=Path, default=Path("work"), help="影片與 metadata 存放目錄"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_fetch = sub.add_parser("fetch", help="下載 IG 影片與 metadata")
    p_fetch.add_argument("--urls", type=Path, default=Path("urls.txt"))
    p_fetch.add_argument("--cookies", type=Path, help="Netscape 格式 cookies.txt")
    p_fetch.add_argument(
        "--cookies-from-browser", help="直接讀瀏覽器 cookies，例如 chrome、firefox"
    )
    p_fetch.add_argument("--sleep", type=float, default=3, help="每次請求間隔秒數")
    p_fetch.add_argument(
        "--skip-existing", action="store_true", help="用 download archive 跳過抓過的"
    )
    p_fetch.set_defaults(func=cmd_fetch)

    p_tr = sub.add_parser("transcribe", help="產生逐字稿")
    p_tr.add_argument("--model", default="small", help="tiny/base/small/medium/large-v3")
    p_tr.add_argument("--lang", default=None, help="語言代碼，如 zh；留空自動偵測")
    p_tr.add_argument("--device", default="cpu")
    p_tr.add_argument("--compute-type", default="int8")
    p_tr.add_argument("--overwrite", action="store_true")
    p_tr.set_defaults(func=cmd_transcribe)

    p_pack = sub.add_parser("pack", help="打包成 NotebookLM 素材")
    p_pack.add_argument("--dest", type=Path, default=Path("notebooklm"))
    p_pack.add_argument(
        "--single-file", action="store_true", help="額外輸出合併後的 _all.md"
    )
    p_pack.set_defaults(func=cmd_pack)

    p_up = sub.add_parser("upload", help="（選用）備份到 YouTube")
    p_up.add_argument("--privacy", default="unlisted", choices=["private", "unlisted", "public"])
    p_up.add_argument("--client-secrets", type=Path, default=Path("client_secrets.json"))
    p_up.add_argument("--token", type=Path, default=Path("youtube_token.json"))
    p_up.add_argument("--limit", type=int, default=6, help="單次上傳上限（配額保護）")
    p_up.set_defaults(func=cmd_upload)

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
