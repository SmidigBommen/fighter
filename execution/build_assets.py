#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["pillow"]
# ///
"""Build assets/game/ (the files the game loads) from assets/raw/.

Steps: sprites (re-anchor character strips), stage (compose the stages from the
tileset), fx (generated spark, font), audio (convert with ffmpeg).
"""
import argparse
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "assets" / "raw"
OUT = ROOT / "assets" / "game"
SOF = RAW / "streets-of-fight" / "streets_of_fight_files" / "Streets of Fight files"

FRAME_W, FRAME_H = 96, 63
ANCHOR_X = 45  # feet centre in the source frames; moved to FRAME_W / 2


def _rotated(sprite: Image.Image, degrees: float) -> Image.Image:
    """Rotate pixel art counter-clockwise without blur: enlarge, rotate, shrink, all nearest-neighbour."""
    k = 8
    big = sprite.resize((sprite.width * k, sprite.height * k), Image.Resampling.NEAREST)
    big = big.rotate(degrees, Image.Resampling.NEAREST, expand=True)
    small = big.resize((big.width // k, big.height // k), Image.Resampling.NEAREST)
    return small.crop(small.getbbox())


# The pack has no knockdown frames for the player. These are derived from frames it does have:
# (source strip, frame index, rotation in degrees, gap below the sprite in px).
PLAYER_KNOCKDOWN = [
    ("hurt", 1, 30, 2),  # 0 launched, leaning back
    ("hurt", 1, 55, 2),  # 1 dropping
    ("jump", 2, 90, 0),  # 2 lying on the back
    ("jump", 3, 0, 0),  # 3 curled up, starting to rise
    ("jump", 0, 0, 0),  # 4 crouch
]


def build_player_knockdown() -> str:
    out = Image.new("RGBA", (FRAME_W * len(PLAYER_KNOCKDOWN), FRAME_H))
    for i, (strip, index, degrees, gap) in enumerate(PLAYER_KNOCKDOWN):
        src = Image.open(OUT / f"player_{strip}.png").convert("RGBA")
        frame = src.crop((index * FRAME_W, 0, (index + 1) * FRAME_W, FRAME_H))
        sprite = frame.crop(frame.getbbox())
        if degrees:
            sprite = _rotated(sprite, degrees)
        out.alpha_composite(sprite, (i * FRAME_W + (FRAME_W - sprite.width) // 2, FRAME_H - gap - sprite.height))
    out.save(OUT / "player_knockdown.png")
    return f"player_knockdown.png ({len(PLAYER_KNOCKDOWN)} frames, generated)"


def build_sprites() -> list[str]:
    """Shift every frame so the feet sit at the frame centre. Punk is mirrored to face right."""
    made = []
    for folder, prefix, mirror in (("Brawler Girl", "player", False), ("Enemy Punk", "punk", True)):
        for src in sorted((SOF / "Spritesheets" / folder).glob("*.png")):
            strip = Image.open(src).convert("RGBA")
            count = strip.width // FRAME_W
            out = Image.new("RGBA", strip.size)
            for i in range(count):
                frame = strip.crop((i * FRAME_W, 0, (i + 1) * FRAME_W, FRAME_H))
                shifted = Image.new("RGBA", (FRAME_W, FRAME_H))
                shifted.paste(frame, (FRAME_W // 2 - ANCHOR_X, 0))
                if mirror:
                    shifted = shifted.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
                out.paste(shifted, (i * FRAME_W, 0))
            name = f"{prefix}_{src.stem}.png"
            out.save(OUT / name)
            made.append(f"{name} ({count} frames)")
    made.append(build_player_knockdown())
    shutil.copy(SOF / "Sprites" / "shadow.png", OUT / "shadow.png")
    # barrel.png holds two 32x48 frames: whole and crushed.
    shutil.copy(SOF / "Stage Layers" / "props" / "barrel.png", OUT / "barrel.png")
    made += ["shadow.png", "barrel.png (2 frames)"]
    return made


# Tileset chunks: name -> (x, y, w, h)
CHUNKS = {
    "pizza": (0, 0, 224, 96),
    "stone_pillar": (240, 0, 32, 96),
    "shop": (288, 0, 224, 96),
    "brick_end_l": (0, 112, 48, 96),
    "brick": (64, 112, 48, 96),
    "pipe": (128, 112, 48, 96),
    "window": (192, 112, 48, 96),
    "door": (256, 112, 48, 96),
    "brick_end_r": (320, 112, 32, 96),
    "gap_l": (368, 112, 32, 96),
    "fence": (416, 128, 32, 80),
    "gap_r": (464, 112, 32, 96),
    "ground_drain": (0, 224, 32, 144),
    "ground": (48, 224, 112, 144),
    "garage": (176, 224, 112, 96),
    "shutter": (304, 224, 112, 96),
    "graffiti": (432, 224, 96, 96),
}

def _fences(n: int) -> str:
    return "gap_l " + "fence " * n + "gap_r"


# One entry per stage. wall: tileset chunks left to right (repeated if too short).
# signs: (prop file, x, y). lamps, bushes, cars: x positions in the foreground layer.
# grade: (hue shift in degrees, saturation factor, brightness factor) applied to both layers.
STAGES: dict[str, dict] = {
    "stage1": {
        "width": 1920,
        "wall": (
            "shop brick_end_l pipe gap_l fence fence fence fence fence gap_r brick garage brick_end_r "
            "stone_pillar pizza brick_end_l window door window graffiti pipe shutter brick_end_r "
            "gap_l fence fence fence fence gap_r brick window garage graffiti door brick_end_r "
            "stone_pillar shop brick_end_l pipe window shutter brick window brick"
        ),
        "signs": [("Ethereum/ethereum-1.png", 6, 2), ("Sushi/sushi-1.png", 700, 10), ("banner-hor/banner-hor1.png", 1500, 4)],
        "lamps": [150, 520, 890, 1260, 1630],
        "bushes": [330, 1010, 1750],
        "cars": [400, 1330],
        "grade": None,
    },
    # Back alleys at dusk: fences, shutters and graffiti, few shop fronts.
    "stage2": {
        "width": 2304,
        "wall": (
            f"brick_end_l graffiti pipe shutter window brick_end_r {_fences(6)} brick graffiti garage pipe brick_end_r "
            f"{_fences(3)} brick shutter graffiti door window shutter brick_end_r stone_pillar pizza brick_end_l "
            f"garage graffiti pipe brick_end_r {_fences(5)} brick shutter garage graffiti window pipe brick_end_r "
            f"{_fences(4)} brick graffiti shutter door graffiti garage brick"
        ),
        "signs": [("banner-hor/banner-hor2.png", 250, 4), ("Sushi/sushi-2.png", 1240, 10)],
        "lamps": [260, 760, 1300, 1840],
        "bushes": [90, 600, 1120, 1560, 2100],
        "cars": [900, 1960],
        "grade": (-28, 1.05, 0.95),
    },
    # The neon mile: shop fronts and signs under green light.
    "stage3": {
        "width": 2304,
        "wall": (
            "stone_pillar shop stone_pillar pizza brick_end_l window door window brick_end_r "
            f"stone_pillar pizza stone_pillar shop brick_end_l pipe garage brick_end_r {_fences(4)} "
            "brick window door brick_end_r stone_pillar shop stone_pillar pizza stone_pillar shop "
            "brick_end_l shutter window pipe brick_end_r stone_pillar pizza brick_end_l door window brick"
        ),
        "signs": [
            ("Ethereum/ethereum-2.png", 40, 2), ("Sushi/sushi-2.png", 500, 10), ("banner-hor/banner-hor2.png", 700, 4),
            ("Ethereum/ethereum-1.png", 1260, 2), ("Sushi/sushi-1.png", 1750, 10), ("banner-hor/banner-hor1.png", 2000, 4),
        ],
        "lamps": [120, 420, 720, 1020, 1320, 1620, 1920, 2220],
        "bushes": [560, 1450],
        "cars": [240, 1100, 2040],
        "grade": (62, 1.0, 1.0),
    },
    # The last block before dawn: sodium-yellow street, cold blue brick, closed shutters.
    "stage4": {
        "width": 2432,
        "wall": (
            f"brick_end_l shutter shutter pipe brick_end_r {_fences(3)} brick graffiti shutter door shutter brick_end_r "
            f"stone_pillar shop brick_end_l garage pipe garage brick_end_r {_fences(7)} brick shutter graffiti shutter "
            f"pipe brick_end_r stone_pillar shop stone_pillar brick_end_l door shutter garage shutter door brick_end_r "
            f"{_fences(2)} brick shutter shutter shutter brick"
        ),
        "signs": [("Ethereum/ethereum-2.png", 760, 2)],
        "lamps": [200, 700, 1200, 1700, 2200],
        "bushes": [450, 1500],
        "cars": [1000, 1900],
        "grade": (-150, 1.15, 0.82),
    },
}


def _grade(img: Image.Image, grade: tuple[float, float, float] | None) -> Image.Image:
    """Shift hue and scale saturation and brightness. Alpha is kept."""
    if not grade:
        return img
    shift, sat, val = grade
    alpha = img.getchannel("A")
    h, s, v = img.convert("RGB").convert("HSV").split()
    h = h.point(lambda p: (p + round(shift * 256 / 360)) % 256)
    s = s.point(lambda p: min(255, round(p * sat)))
    v = v.point(lambda p: min(255, round(p * val)))
    out = Image.merge("HSV", (h, s, v)).convert("RGB").convert("RGBA")
    out.putalpha(alpha)
    return out


def build_one_stage(name: str, spec: dict) -> list[str]:
    width = spec["width"]
    tiles = Image.open(SOF / "Stage Layers" / "tileset.png").convert("RGBA")
    back = Image.open(SOF / "Stage Layers" / "back.png").convert("RGBA")
    fore_src = Image.open(SOF / "Stage Layers" / "fore.png").convert("RGBA")
    props = SOF / "Stage Layers" / "props"
    chunk = {k: tiles.crop((x, y, x + w, y + h)) for k, (x, y, w, h) in CHUNKS.items()}

    bg = Image.new("RGBA", (width, 240), (16, 16, 24, 255))
    wall = spec["wall"].split()
    x = 0
    i = 0
    while x < width:
        piece = wall[i % len(wall)]
        i += 1
        c = chunk[piece]
        if piece == "fence":
            bg.alpha_composite(back.crop((x % 96, 0, min(96, x % 96 + 32), 80)), (x, 8))
            if x % 96 > 64:
                bg.alpha_composite(back.crop((0, 0, x % 96 - 64, 80)), (x + 96 - x % 96, 8))
        bg.alpha_composite(c, (x, 96 - c.height))
        x += c.width
    x = 0
    i = 0
    while x < width:
        c = chunk["ground_drain"] if i % 3 == 2 else chunk["ground"]
        bg.alpha_composite(c, (x, 96))
        x += c.width
        i += 1
    for file, px, py in spec["signs"]:
        bg.alpha_composite(Image.open(props / file).convert("RGBA"), (px, py))
    _grade(bg, spec["grade"]).convert("RGB").save(OUT / f"{name}.png")

    fore = Image.new("RGBA", (width, 240))
    lamp = fore_src.crop((16, 5, 58, 144))
    bush = fore_src.crop((94, 76, 155, 144))
    car = Image.open(props / "car.png").convert("RGBA")
    for px in spec["cars"]:
        fore.alpha_composite(car, (px, 240 - car.height + 6))
    for px in spec["bushes"]:
        fore.alpha_composite(bush, (px, 240 - bush.height))
    for px in spec["lamps"]:
        fore.alpha_composite(lamp, (px, 240 - lamp.height))
    _grade(fore, spec["grade"]).save(OUT / f"{name}_fore.png")
    return [f"{name}.png ({width}x240)", f"{name}_fore.png"]


def build_stage() -> list[str]:
    made = []
    for name, spec in STAGES.items():
        made += build_one_stage(name, spec)
    shutil.copy(SOF / "Stage Layers" / "props" / "hydrant.png", OUT / "hydrant.png")
    return made + ["hydrant.png"]


FONT_CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.,:!?-+'/<>x"
# 5x7 glyphs, one string per row, '#' is a lit pixel
FONT = {
    "A": ".###.|#...#|#...#|#####|#...#|#...#|#...#", "B": "####.|#...#|#...#|####.|#...#|#...#|####.",
    "C": ".####|#....|#....|#....|#....|#....|.####", "D": "####.|#...#|#...#|#...#|#...#|#...#|####.",
    "E": "#####|#....|#....|####.|#....|#....|#####", "F": "#####|#....|#....|####.|#....|#....|#....",
    "G": ".####|#....|#....|#..##|#...#|#...#|.####", "H": "#...#|#...#|#...#|#####|#...#|#...#|#...#",
    "I": "#####|..#..|..#..|..#..|..#..|..#..|#####", "J": "..###|....#|....#|....#|....#|#...#|.###.",
    "K": "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", "L": "#....|#....|#....|#....|#....|#....|#####",
    "M": "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", "N": "#...#|##..#|#.#.#|#.#.#|#..##|#...#|#...#",
    "O": ".###.|#...#|#...#|#...#|#...#|#...#|.###.", "P": "####.|#...#|#...#|####.|#....|#....|#....",
    "Q": ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", "R": "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    "S": ".####|#....|#....|.###.|....#|....#|####.", "T": "#####|..#..|..#..|..#..|..#..|..#..|..#..",
    "U": "#...#|#...#|#...#|#...#|#...#|#...#|.###.", "V": "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..",
    "W": "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#", "X": "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    "Y": "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", "Z": "#####|....#|...#.|..#..|.#...|#....|#####",
    "0": ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", "1": "..#..|.##..|..#..|..#..|..#..|..#..|.###.",
    "2": ".###.|#...#|....#|...#.|..#..|.#...|#####", "3": "####.|....#|....#|.###.|....#|....#|####.",
    "4": "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", "5": "#####|#....|####.|....#|....#|#...#|.###.",
    "6": ".###.|#....|#....|####.|#...#|#...#|.###.", "7": "#####|....#|...#.|..#..|..#..|..#..|..#..",
    "8": ".###.|#...#|#...#|.###.|#...#|#...#|.###.", "9": ".###.|#...#|#...#|.####|....#|....#|.###.",
    ".": ".....|.....|.....|.....|.....|.##..|.##..", ",": ".....|.....|.....|.....|.##..|..#..|.#...",
    ":": ".....|.##..|.##..|.....|.##..|.##..|.....", "!": "..#..|..#..|..#..|..#..|..#..|.....|..#..",
    "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", "-": ".....|.....|.....|#####|.....|.....|.....",
    "+": ".....|..#..|..#..|#####|..#..|..#..|.....", "'": "..#..|..#..|.#...|.....|.....|.....|.....",
    "/": "....#|....#|...#.|..#..|.#...|#....|#....", "<": "...#.|..#..|.#...|#....|.#...|..#..|...#.",
    ">": ".#...|..#..|...#.|....#|...#.|..#..|.#...", "x": ".....|.....|#...#|.#.#.|..#..|.#.#.|#...#",
    " ": ".....|.....|.....|.....|.....|.....|.....",
}
GLYPH_W, GLYPH_H = 7, 9  # 5x7 glyph plus a 1 px dark outline

# Pickup icons, 16x16. Frame order must match PICKUPS in src/sim/objects.ts.
ICON_COLOURS = {
    "k": (24, 16, 32), "r": (214, 50, 48), "R": (140, 28, 52), "h": (255, 170, 150), "g": (70, 170, 60),
    "b": (110, 70, 40), "y": (250, 200, 60), "O": (200, 120, 30), "w": (255, 245, 190),
}
ICONS = {
    "food": [
        "................", ".........b.gg...", "........b.gggg..", "....kkkkbkkgg...",
        "...krrrrbrrrrk..", "..krrhrrrrrrrrk.", "..krhhrrrrrrrRk.", "..krhrrrrrrrrRk.",
        "..krrrrrrrrrrRk.", "..krrrrrrrrrRRk.", "..krrrrrrrrrRRk.", "...krrrrrrrRRk..",
        "...kRrrrrrRRRk..", "....kRRRkRRRk...", ".....kkk.kkk....", "................",
    ],
    "points": [
        "................", ".....kkkkkk.....", "...kkyyyyyykk...", "..kywwyyyyyyyk..",
        ".kywyyykkyyyyOk.", ".kywyykyykyyyOk.", "kyyyyykyyyyyyyOk", "kyyyyyykkyyyyyOk",
        "kyyyyyyyykyyyyOk", "kyyyyykyykyyyOOk", ".kyyyyykkyyyyOk.", ".kyyyyyyyyyyOOk.",
        "..kyyyyyyyyOOk..", "...kkyyyyOOkk...", ".....kkkkkk.....", "................",
    ],
    "feast": [
        "................", "................", ".....kkkkk......", "....kOOOOOk.....",
        "...kOyOOOObk....", "..kOyOOOOObbk...", "..kOOOOOOObbk...", "..kOOOOOObbbk...",
        "..kOOOOObbbk....", "...kOObbbbk.....", "....kkbbkk......", "......kwwk..k...",
        ".......kwwkkwk..", "........kwwwwk..", ".........kwkwk..", "..........k.k...",
    ],
    "life": [
        "................", "................", "..kkkk....kkkk..", ".krrrrk..krrrrk.",
        "krhhrrrkkrrrrrRk", "krhrrrrrrrrrrrRk", "krhrrrrrrrrrrrRk", "krrrrrrrrrrrrRRk",
        ".krrrrrrrrrrrRk.", "..krrrrrrrrrRk..", "...krrrrrrrRk...", "....krrrrrRk....",
        ".....krrrRk.....", "......krRk......", ".......kk.......", "................",
    ],
}
assert all(len(rows) == 16 and all(len(r) == 16 for r in rows) for rows in ICONS.values())


def build_fx() -> list[str]:
    # Font: white glyphs with a dark outline, one row, GLYPH_W x GLYPH_H cells.
    img = Image.new("RGBA", (GLYPH_W * len(FONT_CHARS), GLYPH_H))
    px = img.load()
    for i, ch in enumerate(FONT_CHARS):
        lit = [(x, y) for y, row in enumerate(FONT[ch].split("|")) for x, c in enumerate(row) if c == "#"]
        for x, y in lit:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    px[i * GLYPH_W + 1 + x + dx, 1 + y + dy] = (16, 12, 28, 255)
        for x, y in lit:
            px[i * GLYPH_W + 1 + x, 1 + y] = (255, 255, 255, 255)
    img.save(OUT / "font.png")
    (OUT / "font.txt").write_text(FONT_CHARS)

    # Hit spark: 4 frames of 24x24, a star that grows and breaks up.
    size = 24
    spark = Image.new("RGBA", (size * 4, size))
    d = ImageDraw.Draw(spark)
    for f, (r, inner, col) in enumerate(((5, 2, (255, 255, 255)), (10, 4, (255, 240, 150)), (11, 6, (255, 190, 70)), (11, 9, (230, 110, 40)))):
        cx, cy = f * size + size // 2, size // 2
        for dx, dy in ((1, 0), (0, 1), (1, 1), (1, -1)):
            k = 0.7 if dx and dy else 1.0
            for s in (-1, 1):
                d.line((cx + s * dx * inner * k, cy + s * dy * inner * k, cx + s * dx * r * k, cy + s * dy * r * k), fill=col + (255,), width=2 if f < 2 else 1)
        if f < 2:
            d.ellipse((cx - inner, cy - inner, cx + inner, cy + inner), fill=(255, 255, 255, 255))
    spark.save(OUT / "spark.png")

    icons = Image.new("RGBA", (16 * len(ICONS), 16))
    for i, rows in enumerate(ICONS.values()):
        for y, row in enumerate(rows):
            for x, c in enumerate(row):
                if c != ".":
                    icons.putpixel((i * 16 + x, y), ICON_COLOURS[c] + (255,))
    icons.save(OUT / "pickups.png")

    # Thrown bottle: 4 frames of 12x12, one quarter turn each.
    one = Image.new("RGBA", (12, 12))
    bd = ImageDraw.Draw(one)
    bd.rectangle((3, 4, 8, 11), fill=(20, 40, 30, 255))
    bd.rectangle((4, 0, 7, 4), fill=(20, 40, 30, 255))
    bd.rectangle((4, 5, 7, 10), fill=(70, 190, 110, 255))
    bd.rectangle((5, 1, 6, 4), fill=(70, 190, 110, 255))
    bd.line((5, 6, 5, 9), fill=(190, 250, 210, 255))
    bottle = Image.new("RGBA", (48, 12))
    for i in range(4):
        bottle.paste(one.rotate(-90 * i), (i * 12, 0))
    bottle.save(OUT / "bottle.png")
    return ["font.png", "font.txt", "spark.png (4 frames)", f"pickups.png ({len(ICONS)} frames)", "bottle.png (4 frames)"]


AUDIO = {
    "hit_light.ogg": "punch-sfx/qubodupPunch/qubodupPunch/qubodupPunch01.flac",
    "hit_mid.ogg": "punch-sfx/qubodupPunch/qubodupPunch/qubodupPunch03.flac",
    "hit_heavy.ogg": "punch-sfx/qubodupPunch/qubodupPunch/qubodupPunch05.flac",
    "thud.ogg": "hits-punches/independent_nu_ljudbank-hits_and_punches/hits/hit07.mp3.flac",
    "music_stage1.ogg": "chiptunes-action/5 Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 1.wav",
    "music_stage2.ogg": "chiptunes-action/5 Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 2.wav",
    "music_stage3.ogg": "chiptunes-action/5 Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Level 3.wav",
    "music_stage4.ogg": "music-loops/12_indie_game_music_loops_0/006 [Heavy Metal Chiptunes] bgm_stage_F (faster).ogg",
    "music_boss.ogg": "music-loops/12_indie_game_music_loops_0/316 [Chiptune Heroes] bgm_dangerous_encounter_A (faster).ogg",
    "music_title.ogg": "chiptunes-action/5 Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Title Screen.wav",
    "music_end.ogg": "chiptunes-action/5 Action Chiptunes By Juhani Junkala/Juhani Junkala [Retro Game Music Pack] Ending.wav",
}


def build_audio() -> list[str]:
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg not found")
    made = []
    for name, src in AUDIO.items():
        dst = OUT / name
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(RAW / src), "-c:a", "libvorbis", "-q:a", "3", str(dst)],
            check=True,
        )
        made.append(f"{name} ({dst.stat().st_size // 1024} kB)")
    # No pack has these, so they are generated: lavfi source, optional filter.
    square = "0.25*sgn(sin(2*PI*({f})*t))"
    generated = {
        "pickup.ogg": ("aevalsrc='" + square.format(f="if(lt(t,0.07),988,1319)") + "*exp(-6*t)':d=0.22:s=44100", None),
        "extralife.ogg": ("aevalsrc='" + square.format(f="if(lt(t,0.09),659,if(lt(t,0.18),784,if(lt(t,0.27),1047,1319)))") + "*exp(-2*t)':d=0.6:s=44100", None),
        "blip.ogg": ("aevalsrc='" + square.format(f="880") + "*exp(-20*t)':d=0.08:s=44100", None),
        "glass.ogg": ("anoisesrc=d=0.3:c=white:a=0.6:r=44100", "highpass=f=3500,afade=t=out:st=0.02:d=0.26"),
        "swish.ogg": ("anoisesrc=d=0.32:c=pink:a=0.9:r=44100", "bandpass=f=1400:w=900,afade=t=in:d=0.08,afade=t=out:st=0.1:d=0.22"),
    }
    for name, (source, filt) in generated.items():
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-i", source]
        if filt:
            cmd += ["-af", filt]
        subprocess.run([*cmd, "-c:a", "libvorbis", "-q:a", "3", str(OUT / name)], check=True)
        made.append(name)
    return made


STEPS = {"sprites": build_sprites, "stage": build_stage, "fx": build_fx, "audio": build_audio}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("steps", nargs="*", choices=[*STEPS, []], help="steps to run (default: all)")
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    for step in args.steps or STEPS:
        made = STEPS[step]()
        print(f"{step}: " + ", ".join(made))


if __name__ == "__main__":
    main()
