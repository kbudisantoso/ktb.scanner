"""Regenerate the synthetic JPEG; Pillow is needed only for regeneration."""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def main():
    image = Image.new("RGB", (8000, 6000), "#35443c")
    draw = ImageDraw.Draw(image)
    draw.rectangle((80, 80, 7919, 5919), fill="#fffdf7")
    # Four independent orientation marks, safely inside the near-full test crop.
    for box, color in [
        ((300, 300, 1299, 1099), "#df2634"),
        ((6700, 300, 7699, 1099), "#249344"),
        ((6700, 4900, 7699, 5699), "#3154bb"),
        ((300, 4900, 1299, 5699), "#e5bb21"),
    ]:
        draw.rectangle(box, fill=color)
    # Pillow's bundled bitmap font needs no system/font-file dependency.
    line = Image.new("RGB", (600, 16), "#fffdf7")
    ImageDraw.Draw(line).text(
        (0, 1),
        "SYNTHETIC HIGH RESOLUTION 0123456789 - NO PERSONAL DATA",
        fill="#24332b",
        font=ImageFont.load_default(),
    )
    line = line.resize((2400, 64), Image.Resampling.NEAREST)
    for y in range(1600, 4500, 180):
        image.paste(line, (2800, y))
        draw.line((1700, y + 100, 6300, y + 100), fill="#d4d5cf", width=4)
    # No EXIF: the browser cases insert one explicit orientation with exif.ts.
    image.save(
        Path(__file__).with_name("high-resolution-48mp.jpg"),
        quality=90,
        subsampling=0,
        optimize=True,
        progressive=False,
    )


if __name__ == "__main__":
    main()
