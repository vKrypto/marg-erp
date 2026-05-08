#!/usr/bin/env python3
"""Emit minimal solid-color PNGs for PWA manifest (stdlib only)."""
import struct
import zlib
from pathlib import Path


def _chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def rgba_png(width: int, height: int, r: int, g: int, b: int) -> bytes:
    pixel = bytes([r, g, b, 255])
    row = bytes([0]) + pixel * width
    raw = row * height
    z = zlib.compress(raw, 9)
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _chunk(b"IHDR", ihdr)
        + _chunk(b"IDAT", z)
        + _chunk(b"IEND", b"")
    )


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    icons = root / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    # Teal darken-1 (#00897b) — matches login / Materialize accent
    color = (0x00, 0x89, 0x7B)
    for name, size in (("icon-192.png", 192), ("icon-512.png", 512)):
        p = icons / name
        p.write_bytes(rgba_png(size, size, *color))
        print("wrote", p)


if __name__ == "__main__":
    main()
