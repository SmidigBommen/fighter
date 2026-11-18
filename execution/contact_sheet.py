#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Lay out PNG files on one labelled image so sprite packs can be compared by eye.

Example:
  execution/contact_sheet.py -o assets/preview/characters.png --scale 2 \
      "assets/raw/streets-of-fight/**/Spritesheets/**/*.png" "assets/raw/soldier-nes/**/*.png"

Globs are relative to the project root. Images are scaled with nearest-neighbour.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("globs", nargs="+", help="glob patterns for PNG files")
    ap.add_argument("-o", "--out", required=True, help="output PNG path")
    ap.add_argument("--scale", type=int, default=2, help="integer upscale factor (default 2)")
    ap.add_argument("--width", type=int, default=1600, help="sheet width in pixels (default 1600)")
    ap.add_argument("--max", type=int, default=60, help="maximum number of images (default 60)")
    args = ap.parse_args()

    paths: list[Path] = []
    for g in args.globs:
        paths += sorted(ROOT.glob(g))
    paths = [p for p in paths if p.suffix.lower() == ".png"][: args.max]
    if not paths:
        print("no PNG files matched", file=sys.stderr)
        return 2

    pad, label_h = 8, 12
    cells = []
    for p in paths:
        im = Image.open(p).convert("RGBA")
        scale = args.scale
        while im.width * scale > args.width - 2 * pad and scale > 1:
            scale -= 1
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
        if im.width > args.width - 2 * pad:
            im.thumbnail((args.width - 2 * pad, 10_000))
        label = f"{p.parent.name[-22:]}/{p.stem[-26:]} {Image.open(p).size[0]}x{Image.open(p).size[1]}"
        cells.append((im, label))

    rows, x, y, row_h = [], pad, pad, 0
    for im, label in cells:
        w = max(im.width, 6 * len(label))
        if x + w + pad > args.width and x > pad:
            x, y, row_h = pad, y + row_h + pad, 0
        rows.append((im, label, x, y))
        x += w + pad
        row_h = max(row_h, im.height + label_h)
    sheet = Image.new("RGBA", (args.width, y + row_h + pad), (48, 52, 64, 255))
    draw = ImageDraw.Draw(sheet)
    for im, label, cx, cy in rows:
        draw.text((cx, cy), label, fill=(230, 230, 230, 255))
        sheet.alpha_composite(im, (cx, cy + label_h))

    out = ROOT / args.out
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"{out.relative_to(ROOT)} {sheet.width}x{sheet.height} {len(cells)} images")
    return 0


if __name__ == "__main__":
    sys.exit(main())
