#!/usr/bin/env python3
"""Draws the app icons into icons/. Needs Pillow. Run from the project root: python3 tools/make_icons.py"""

from pathlib import Path

from PIL import Image, ImageDraw

WORK = 1536  # Everything is drawn large, then scaled down for clean edges.
OUT = Path(__file__).resolve().parent.parent / "icons"

SEA_TOP = (11, 111, 138)
SEA_BOTTOM = (31, 169, 177)
BODY = (224, 38, 43, 255)
LEGS = (176, 26, 34, 255)
CLAW = (255, 86, 74, 255)
SHINE = (255, 128, 114, 255)
WHITE = (255, 255, 255, 255)
PUPIL = (20, 24, 27, 255)
SHADOW = (6, 50, 62, 140)
CLEAR = (0, 0, 0, 0)


def crab_layer(scale):
    """A red crab on a transparent layer. scale is its size relative to the icon."""
    layer = Image.new("RGBA", (WORK, WORK), CLEAR)
    draw = ImageDraw.Draw(layer)

    def px(x, y):
        return ((0.5 + x * scale / 2) * WORK, (0.5 + (y + 0.08) * scale / 2) * WORK)

    def size(r):
        return r * scale / 2 * WORK

    def circle(x, y, rx, color, ry=None):
        cx, cy = px(x, y)
        a, b = size(rx), size(ry if ry is not None else rx)
        draw.ellipse((cx - a, cy - b, cx + a, cy + b), fill=color)

    def capsule(points, width, color):
        pts = [px(*p) for p in points]
        draw.line(pts, fill=color, width=int(size(width) * 2), joint="curve")
        for x, y in points:
            circle(x, y, width, color)

    for side in (-1, 1):
        for knee, foot in (
            ((0.68, 0.06), (0.86, 0.3)),
            ((0.7, 0.26), (0.84, 0.52)),
            ((0.58, 0.44), (0.68, 0.7)),
        ):
            capsule([(side * 0.3, foot[1] * 0.42 + 0.12), (side * knee[0], knee[1]), (side * foot[0], foot[1])], 0.05, LEGS)

    for side in (-1, 1):
        capsule([(side * 0.34, 0.02), (side * 0.58, -0.3)], 0.075, LEGS)
        circle(side * 0.62, -0.52, 0.27, CLAW)
        # The notch that turns a circle into a pincer.
        tip = px(side * 0.57, -0.47)
        draw.polygon([tip, px(side * 0.38, -0.86), px(side * 0.76, -0.9)], fill=CLEAR)

    circle(0, 0.2, 0.56, BODY, 0.38)
    circle(-0.16, 0.06, 0.2, SHINE, 0.09)

    for side in (-1, 1):
        capsule([(side * 0.16, -0.06), (side * 0.18, -0.26)], 0.04, BODY)
        circle(side * 0.18, -0.32, 0.135, WHITE)
        circle(side * 0.18, -0.29, 0.07, PUPIL)
    return layer


def sea():
    image = Image.new("RGBA", (WORK, WORK))
    draw = ImageDraw.Draw(image)
    for y in range(WORK):
        t = y / (WORK - 1)
        color = tuple(round(a + (b - a) * t) for a, b in zip(SEA_TOP, SEA_BOTTOM))
        draw.line((0, y, WORK, y), fill=color + (255,))
    return image


def make_icon(crab_scale, rounded):
    image = sea()
    crab = crab_layer(crab_scale)
    # A hard offset shadow, like the road paint on the title screen.
    shadow = Image.new("RGBA", (WORK, WORK), SHADOW)
    shadow.putalpha(crab.getchannel("A").point(lambda a: a * SHADOW[3] // 255))
    image.alpha_composite(shadow, (0, int(WORK * 0.018)))
    image.alpha_composite(crab)
    if rounded:
        mask = Image.new("L", (WORK, WORK), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, WORK - 1, WORK - 1), radius=int(WORK * 0.2), fill=255)
        image.putalpha(mask)
    return image


def main():
    OUT.mkdir(exist_ok=True)
    regular = make_icon(0.86, rounded=True)
    # Android can crop a maskable icon to a circle, so the crab stays inside the middle 80%.
    full_bleed = make_icon(0.72, rounded=False)
    apple = make_icon(0.82, rounded=False)  # iOS rounds the corners itself.

    for name, image, px in (
        ("icon-192.png", regular, 192),
        ("icon-512.png", regular, 512),
        ("icon-maskable-512.png", full_bleed, 512),
        ("apple-touch-icon.png", apple.convert("RGB"), 180),
    ):
        image.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
        print(name, (OUT / name).stat().st_size, "bytes")


if __name__ == "__main__":
    main()
