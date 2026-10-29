"""Inspect the actual release archive without extracting any paths."""
import json
import hashlib
import re
import sys
import tarfile
from pathlib import PurePosixPath

with tarfile.open(sys.argv[1], "r:gz") as archive:
    names = set(archive.getnames())
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        assert not path.is_absolute() and ".." not in path.parts, member.name
        assert not member.issym() and not member.islnk(), member.name
        assert not any(part in {"AGENTS.md", "CLAUDE.md", ".agents", ".codex", ".claude", ".certificates", "artifacts"} or part.startswith(".env") or part.endswith(".gitignore") for part in path.parts), member.name
    required = {
        "package/LICENSE", "package/NOTICE", "package/README.md",
        "package/dist/index.js", "package/dist/index.d.ts",
        "package/dist/react/index.js", "package/dist/react/ImageViewer.d.ts",
        "package/dist/scanic.js", "package/dist/export.js", "package/dist/styles.css",
        "package/dist/ocr.js", "package/dist/ocr.d.ts", "package/src/ocr.ts",
        "package/src/ocr-client.ts", "package/src/ocr-pdf.worker.ts",
        "package/dist/assets/ocr-pdf.worker.js", "package/scripts/ocr-assets.mjs",
        "package/dist/assets/ocr/worker.min.js",
        "package/dist/assets/ocr/worker.min.js.LICENSE.txt",
        "package/dist/assets/ocr/models.json",
        "package/dist/assets/third-party/tessdata-fast/LICENSE",
        "package/dist/assets/third-party/tessdata-fast/NOTICE",
        "package/dist/assets/processing.worker.js", "package/dist/assets/pdf.worker.js",
        "package/dist/assets/scanic.js", "package/dist/assets/scanic.LICENSE",
        "package/dist/assets/ktb-scanner.LICENSE", "package/dist/assets/ktb-scanner.NOTICE",
        "package/dist/assets/CC0-1.0.LICENSE",
        "package/dist/assets/third-party/scanic-wasm/NOTICE",
        "package/third-party/scanic-wasm/NOTICE",
        "package/dist/assets/licenses/inventory.json", "package/src/types.ts",
        "package/src/react/ImageViewer.tsx", "package/scripts/build.mjs",
        "package/scripts/clean.mjs", "package/scripts/instrument-scanic.mjs",
    }
    assert required <= names, sorted(required - names)
    # Reviewed originals are mandatory even if a source directory is accidentally removed.
    supplements = [
        'tesseract-wasm/NOTICE',
        'tesseract-wasm/emscripten-4.0.15/LICENSE',
        'tesseract-wasm/emscripten-4.0.15/LICENSE-LLVM',
        'tesseract-wasm/emscripten-4.0.15/musl/COPYRIGHT',
        'tesseract-wasm/giflib-fa37672/COPYING',
        'tesseract-wasm/leptonica-4af068b/LICENSE',
        'tesseract-wasm/libjpeg-6c0fcb8/LICENSE-IJG',
        'tesseract-wasm/libpng-a37d483/LICENSE',
        'tesseract-wasm/libtiff-b51bb15/COPYRIGHT',
        'tesseract-wasm/libwebp-20ef03e/COPYING',
        'tesseract-wasm/libwebp-20ef03e/LICENSE-PATENTS',
        'tesseract-wasm/openlibm-ae2d916/LICENSE.md',
        'tesseract-wasm/tesseract-2a9c1c4/LICENSE',
        'tesseract-wasm/zlib-21767c6/COPYRIGHT',
        'tesseract-worker/NOTICE',
        'tesseract-worker/base64-js-1.5.1/LICENSE',
        'tesseract-worker/bmp-js-0.1.0/LICENSE',
        'tesseract-worker/buffer-6.0.3/LICENSE',
        'tesseract-worker/idb-keyval-6.2.1/LICENCE',
        'tesseract-worker/ieee754-1.2.1/LICENSE',
        'tesseract-worker/is-url-1.2.4/LICENSE-MIT',
        'tesseract-worker/regenerator-runtime-0.13.11/LICENSE',
        'tesseract-worker/wasm-feature-detect-1.8.0/LICENSE',
        'tesseract-worker/zlibjs-0.3.1/LICENSE',
    ]
    for file in supplements:
        assert "package/third-party/" + file in names, file
        assert "package/dist/assets/third-party/" + file in names, file
    manifest = json.load(archive.extractfile("package/package.json"))
    assert manifest["name"] == "@ktb-tools/scanner"
    assert manifest["license"] == "AGPL-3.0-only" and manifest["private"] is False
    assert manifest["publishConfig"]["access"] == "public"
    for entry in [".", "./react", "./scanic", "./export", "./ocr"]:
        for target in manifest["exports"][entry].values():
            assert "package/" + target.removeprefix("./") in names, target
    license_text = archive.extractfile("package/LICENSE").read().decode()
    assert "GNU AFFERO GENERAL PUBLIC LICENSE" in license_text and "Version 3" in license_text
    clips = [name for name in names if name.endswith(".mp3")]
    assert set(clips) == {"package/dist/assets/shutter.mp3", "package/dist/assets/reflex.mp3"}, clips
    for clip in clips:
        notice = clip.removesuffix(".mp3") + ".NOTICE.txt"
        assert notice in names, notice
        text = archive.extractfile(notice).read().decode()
        assert "CC0-1.0" in text and "Creator:" in text and "Source:" in text, notice
        expected = re.search(r"SHA-256: ([0-9a-f]{64})", text).group(1)
        assert hashlib.sha256(archive.extractfile(clip).read()).hexdigest() == expected, clip
    inventory = json.load(archive.extractfile("package/dist/assets/licenses/inventory.json"))
    assert any(item["name"] == "scanic" for item in inventory)
    assert any(item["name"] == "jspdf" for item in inventory)
    assert {"tesseract.js", "tesseract.js-core", "pdf-lib"} <= {item["name"] for item in inventory}
    for core in ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]:
        assert f"package/dist/assets/ocr/core/{core}" in names
    models = json.load(archive.extractfile("package/dist/assets/ocr/models.json"))
    assert models["commit"] == "65727574dfcd264acbb0c3e07860e4e9e9b22185"
    assert {model["language"] for model in models["models"]} == {"deu", "eng"}
    for model in models["models"]:
        data = archive.extractfile("package/dist/assets/ocr/" + model["file"]).read()
        assert len(data) == model["bytes"]
        assert hashlib.sha256(data).hexdigest() == model["sha256"]
    for item in inventory:
        assert item["notices"], item["name"]
        for notice in item["notices"]:
            directory = (item["name"] + "@" + item["version"]).replace("/", "__")
            assert f"package/dist/assets/licenses/{directory}/{notice}" in names
    for name in names:
        if name.startswith("package/third-party/") and archive.getmember(name).isfile():
            copied = name.replace("package/third-party/", "package/dist/assets/third-party/", 1)
            assert copied in names, copied
            assert archive.extractfile(copied).read() == archive.extractfile(name).read(), copied
    for filename in ["LICENSE", "NOTICE"]:
        assert archive.extractfile(f"package/{filename}").read() == archive.extractfile(f"package/dist/assets/ktb-scanner.{filename}").read()
    print(f"Package verified: {len(names)} files, all entry points/sources/notices, two CC0 cues, no local configuration.")
