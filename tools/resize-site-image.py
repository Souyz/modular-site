from __future__ import annotations

import argparse
import io
import json
from pathlib import Path
from urllib.request import Request, urlopen

from PIL import Image, ImageOps


def main() -> None:
    parser = argparse.ArgumentParser(description="Resize one site image to an optimized WebP variant.")
    parser.add_argument("source")
    parser.add_argument("output", type=Path)
    parser.add_argument("--max-size", type=int, required=True)
    parser.add_argument("--quality", type=int, required=True)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if args.source.startswith(("http://", "https://")):
        request = Request(args.source, headers={"User-Agent": "Codex site media optimizer"})
        with urlopen(request, timeout=60) as response:
            source_bytes = response.read()
    else:
        source_bytes = Path(args.source).read_bytes()

    with Image.open(io.BytesIO(source_bytes)) as opened:
        image = ImageOps.exif_transpose(opened)
        if getattr(image, "is_animated", False):
            image.seek(0)
        image = image.convert("RGBA" if image.mode in {"RGBA", "LA"} or "transparency" in image.info else "RGB")
        image.thumbnail((args.max_size, args.max_size), Image.Resampling.LANCZOS)
        image.save(args.output, "WEBP", quality=args.quality, method=6)

    print(json.dumps({"originalBytes": len(source_bytes)}))


if __name__ == "__main__":
    main()
