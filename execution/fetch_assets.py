#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Download the asset packs listed in assets/sources.toml from OpenGameArt.

For each source it reads the licence, author and file links from the page, downloads
the files into assets/raw/<id>/, unpacks zip archives, and rewrites
assets/manifest.json and assets/CREDITS.md.

Already downloaded sources are skipped unless --force is given.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import subprocess
import sys
import time
import tomllib
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
RAW = ASSETS / "raw"
UA = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"
FILE_EXT = ("zip", "png", "gif", "ogg", "mp3", "wav", "flac", "aseprite", "ase", "7z", "rar")


def get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def parse_page(page: str) -> dict:
    title = re.search(r"<title>(.*?) \| OpenGameArt", page, re.S)
    author = re.search(r"field-name-author-submitter.*?/users/[^\"]+\">([^<]+)<", page, re.S)
    lic_block = re.search(r"field-name-field-art-licenses(.*?)field-name-", page, re.S)
    licenses = sorted(set(re.findall(r"(CC0|CC-BY-SA \d\.\d|CC-BY \d\.\d|OGA-BY \d\.\d|GPL \d\.\d|LGPL \d\.\d)",
                                     lic_block.group(1) if lic_block else "")))
    files_block = re.search(r"field-name-field-art-files(.*?)(?:field-name-|<footer|id=\"comments\"|\Z)", page, re.S)
    pattern = r"href=\"(https://opengameart\.org/sites/default/files/[^\"]+\.(?:%s))\"" % "|".join(FILE_EXT)
    files = list(dict.fromkeys(re.findall(pattern, files_block.group(1) if files_block else "", re.I)))
    return {
        "title": html.unescape(title.group(1).strip()) if title else "",
        "author": html.unescape(author.group(1).strip()) if author else "",
        "licenses": licenses,
        "files": files,
    }


def safe_extract(archive: Path, dest: Path) -> int:
    count = 0
    with zipfile.ZipFile(archive) as zf:
        for info in zf.infolist():
            target = (dest / info.filename).resolve()
            if not target.is_relative_to(dest.resolve()):
                raise ValueError(f"unsafe path in {archive.name}: {info.filename}")
            if "__MACOSX" in info.filename or info.filename.endswith(".DS_Store"):
                continue
            zf.extract(info, dest)
            count += 0 if info.is_dir() else 1
    return count


def extract_7z(archive: Path, dest: Path) -> int:
    """Unpack with the system 7z binary after checking that no entry leaves dest."""
    listing = subprocess.run(["7z", "l", "-slt", "-ba", str(archive)], capture_output=True, text=True, check=True)
    for line in listing.stdout.splitlines():
        if line.startswith("Path = "):
            target = (dest / line[7:]).resolve()
            if not target.is_relative_to(dest.resolve()):
                raise ValueError(f"unsafe path in {archive.name}: {line[7:]}")
    subprocess.run(["7z", "x", "-y", "-bso0", "-bsp0", f"-o{dest}", str(archive)], check=True)
    return sum(1 for p in dest.rglob("*") if p.is_file())


def fetch(source: dict, force: bool) -> dict:
    dest = RAW / source["id"]
    marker = dest / ".source.json"
    if marker.exists() and not force:
        entry = json.loads(marker.read_text())
        entry["status"] = "cached"
        return entry
    meta = parse_page(get(source["url"]).decode("utf-8", "replace"))
    if not meta["files"]:
        raise RuntimeError("no downloadable files found on page")
    dest.mkdir(parents=True, exist_ok=True)
    downloaded = []
    for url in meta["files"]:
        name = urllib.parse.unquote(url.rsplit("/", 1)[1])
        data = get(url)
        path = dest / name
        path.write_bytes(data)
        item = {"name": name, "url": url, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
        if name.lower().endswith((".zip", ".7z")):
            sub = dest / Path(name).stem
            sub.mkdir(exist_ok=True)
            if name.lower().endswith(".zip"):
                item["unpacked_files"] = safe_extract(path, sub)
            else:
                item["unpacked_files"] = extract_7z(path, sub)
            path.unlink()
        downloaded.append(item)
        time.sleep(0.5)
    entry = {
        "id": source["id"], "role": source.get("role", ""), "page": source["url"],
        "title": meta["title"], "author": meta["author"], "licenses": meta["licenses"],
        "fetched": time.strftime("%Y-%m-%d"), "files": downloaded,
    }
    marker.write_text(json.dumps(entry, indent=2))
    entry["status"] = "downloaded"
    return entry


def write_outputs(entries: list[dict]) -> None:
    clean = [{k: v for k, v in e.items() if k != "status"} for e in entries]
    (ASSETS / "manifest.json").write_text(json.dumps(clean, indent=2) + "\n")
    lines = ["# Asset credits", "",
             "Generated by `execution/fetch_assets.py` from `assets/sources.toml`. Do not edit by hand.", "",
             "| Pack | Author | Licence | Used for | Source |", "|---|---|---|---|---|"]
    for e in clean:
        lines.append(f"| {e['title']} | {e['author']} | {', '.join(e['licenses']) or 'unknown'} | {e['role']} | {e['page']} |")
    (ASSETS / "CREDITS.md").write_text("\n".join(lines) + "\n")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="*", help="source ids to fetch (default: all)")
    ap.add_argument("--force", action="store_true", help="download again even if already present")
    ap.add_argument("--list", action="store_true", help="list source ids and exit")
    args = ap.parse_args()

    sources = tomllib.loads((ASSETS / "sources.toml").read_text())["source"]
    if args.list:
        for s in sources:
            print(f"{s['id']:30} {s['url']}")
        return 0
    unknown = set(args.ids) - {s["id"] for s in sources}
    if unknown:
        print(f"unknown ids: {', '.join(sorted(unknown))}", file=sys.stderr)
        return 2

    entries, failed = [], 0
    for s in sources:
        marker = RAW / s["id"] / ".source.json"
        if args.ids and s["id"] not in args.ids:
            if marker.exists():
                entries.append(json.loads(marker.read_text()))
            continue
        try:
            e = fetch(s, args.force)
        except Exception as exc:  # report and continue with the other sources
            failed += 1
            print(f"FAIL   {s['id']:28} {exc}")
            continue
        entries.append(e)
        size = sum(f["bytes"] for f in e["files"]) / 1024
        print(f"{e['status']:10} {e['id']:28} {','.join(e['licenses']) or 'NO-LICENCE':10} {size:8.0f} KB  {e['author']}")
        if e["status"] == "downloaded":
            time.sleep(1)
    write_outputs(entries)
    print(f"{len(entries)} sources in manifest, {failed} failed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
