#!/usr/bin/env python3
"""Prepare the dog pose art for the app.

Reads the master illustrations from src/assets/pet/raw/, removes the
background (AI segmentation - the dog and the cream backdrop are too
close in colour to key out), autocrops to the dog, downsizes, and writes
transparent optimised PNGs to src/assets/pet/.

Re-runnable: drop a new master into raw/ and run again.

    python3 scripts/process-pet-art.py
"""
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

RAW = Path("src/assets/pet/raw")
OUT = Path("src/assets/pet")
TARGET = 640  # longest side, px

session = new_session("u2net")

for src in sorted(RAW.glob("dog-*.png")):
    img = Image.open(src).convert("RGBA")
    cut = remove(img, session=session).convert("RGBA")

    bbox = cut.getbbox()  # drop transparent margins (and any dropped shadow)
    if bbox:
        cut = cut.crop(bbox)

    w, h = cut.size
    scale = TARGET / max(w, h)
    if scale < 1:
        cut = cut.resize(
            (round(w * scale), round(h * scale)), Image.Resampling.LANCZOS
        )

    # WebP keeps the cartoon art crisp at a fraction of PNG's size.
    dst = OUT / (src.stem + ".webp")
    cut.save(dst, "WEBP", quality=88, method=6)
    kb = dst.stat().st_size // 1024
    print(f"{src.stem}.webp: {w}x{h} -> {cut.size[0]}x{cut.size[1]}  {kb} KB")

print("done")
