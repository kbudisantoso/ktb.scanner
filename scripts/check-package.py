"""Inspect the actual release archive without extracting any paths."""
import json
import hashlib
import io
import base64
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
        "package/dist/assets/paddle.worker.js", "package/src/paddle.worker.ts",
        "package/src/paddle-client.ts", "package/src/paddle-layout.ts",
        "package/src/paddle-memory.ts", "package/src/paddle-pdf-geometry.ts",
        "package/scripts/paddle-assets.mjs", "package/scripts/prepare-paddle-models.py",
        "package/dist/assets/ocr/paddle/models.json",
        "package/dist/assets/ocr/paddle/model-configs.json",
        "package/dist/assets/ocr/paddle/det.tar", "package/dist/assets/ocr/paddle/rec.tar",
        "package/dist/assets/ocr/paddle/ort-wasm-simd-threaded.mjs",
        "package/dist/assets/ocr/paddle/ort-wasm-simd-threaded.wasm",
        "package/dist/assets/ocr/paddle/pdf.ttf",
        "package/dist/assets/ocr/paddle/pdf-font.json",
        "package/dist/assets/ocr/paddle/pdf-font.LICENSE",
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
        'paddle-ocr/NOTICE',
        'paddle-ocr/paddleocr-js-0.4.2/LICENSE',
        'paddle-ocr/onnxruntime-1.31.1/LICENSE',
        'paddle-ocr/onnxruntime-1.31.1/NOTICE-ThirdPartyNotices.txt',
        'paddle-ocr/clipper-lib-6.4.2/LICENSE-Boost',
        'paddle-ocr/clipper-lib-6.4.2/LICENSE-JSBN',
        'paddle-ocr/clipper-lib-6.4.2/NOTICE-original-headers',
        'paddle-ocr/guid-typescript-1.0.9/LICENSE-ISC-standard',
        'paddle-ocr/guid-typescript-1.0.9/NOTICE-publisher-package.json',
        'paddle-ocr/models/NOTICE',
        'paddle-ocr/models/LICENSE-RapidOCR',
        'paddle-ocr/opencv-4.10.0/NOTICE',
        'paddle-ocr/opencv-4.10.0/LICENSE-zlib-1.3.1',
        'paddle-ocr/opencv-4.10.0/LICENSE-protobuf-3.19.1',
        'paddle-ocr/opencv-4.10.0/LICENSE-flatbuffers-23.5.9',
        'paddle-ocr/opencv-4.10.0/LICENSE-openjpeg-2.5.0',
        'paddle-ocr/glyphless-font/NOTICE',
        'paddle-ocr/glyphless-font/LICENSE',
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
    inventory_versions = {item["name"]: item["version"] for item in inventory}
    for name, version in {
        "@paddleocr/paddleocr-js": "0.4.2",
        "@techstark/opencv-js": "4.10.0-release.1",
        "onnxruntime-web": "1.31.1",
        "onnxruntime-common": "1.31.1",
        "clipper-lib": "6.4.2",
        "guid-typescript": "1.0.9",
    }.items():
        assert inventory_versions.get(name) == version, (name, inventory_versions.get(name))
    assert {"js-yaml", "argparse", "protobufjs", "flatbuffers", "long", "platform"} <= set(inventory_versions)
    for core in ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"]:
        assert f"package/dist/assets/ocr/core/{core}" in names
    models = json.load(archive.extractfile("package/dist/assets/ocr/models.json"))
    assert models["commit"] == "65727574dfcd264acbb0c3e07860e4e9e9b22185"
    assert {model["language"] for model in models["models"]} == {"deu", "eng"}
    for model in models["models"]:
        data = archive.extractfile("package/dist/assets/ocr/" + model["file"]).read()
        assert len(data) == model["bytes"]
        assert hashlib.sha256(data).hexdigest() == model["sha256"]
    paddle_root = "package/dist/assets/ocr/paddle/"
    paddle_worker = archive.extractfile("package/dist/assets/paddle.worker.js").read().decode()
    embedded_wasm = re.findall(r"data:application/octet-stream;base64,([A-Za-z0-9+/=]+)", paddle_worker)
    assert len(embedded_wasm) == 1, "Expected one reviewed embedded OpenCV WASM"
    assert hashlib.sha256(base64.b64decode(embedded_wasm[0])).hexdigest() == "fe8e126d8c3e517bcb0e0c6401dbd6a714f4cd8d78705e6a3edbc7c813a0aae3"
    paddle = json.load(archive.extractfile(paddle_root + "models.json"))
    assert paddle["schemaVersion"] == 1 and paddle["license"] == "Apache-2.0"
    assert paddle["sdk"] == "@paddleocr/paddleocr-js@0.4.2"
    assert paddle["runtime"] == "onnxruntime-web@1.31.1"
    assert paddle["opencv"] == "@techstark/opencv-js@4.10.0-release.1"
    expected_models = {
        "det.tar": ("PP-OCRv5_mobile_det", "4d97c44a20d30a81aad087d6a396b08f786c4635742afc391f6621f5c6ae78ae"),
        "rec.tar": ("latin_PP-OCRv5_mobile_rec", "b20bd37c168a570f583afbc8cd7925603890efbcdc000a59e22c269d160b5f5a"),
    }
    assert {model["file"] for model in paddle["models"]} == set(expected_models)
    configs = json.load(archive.extractfile(paddle_root + "model-configs.json"))
    for model in paddle["models"]:
        name, source_hash = expected_models[model["file"]]
        assert model["name"] == name and model["sourceSha256"] == source_hash
        assert model["source"].startswith("https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/")
        assert model["upstream"].startswith("https://huggingface.co/PaddlePaddle/")
        assert model["modification"], name
        data = archive.extractfile(paddle_root + model["file"]).read()
        assert len(data) == model["bytes"] and hashlib.sha256(data).hexdigest() == model["sha256"]
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:") as model_archive:
            assert len(model_archive.getmembers()) == 2
            assert set(model_archive.getnames()) == {"inference.onnx", "inference.yml"}
            assert all(member.isfile() for member in model_archive.getmembers())
            assert hashlib.sha256(model_archive.extractfile("inference.onnx").read()).hexdigest() == source_hash
            assert json.load(model_archive.extractfile("inference.yml")) == configs[model["file"].removesuffix(".tar")]
    characters = configs["rec"]["PostProcess"]["character_dict"]
    dictionary_hash = hashlib.sha256(("\n".join(characters) + "\n").encode()).hexdigest()
    assert len(characters) == paddle["dictionary"]["characters"] == 502
    assert dictionary_hash == paddle["dictionary"]["sha256"] == "3c0a8a79b612653c25f765271714f71281e4e955962c153e272b7b8c1d2b13ff"
    assert paddle["dictionary"]["upstreamRevision"] == "08fe4a9d06aca318ebf5b899a034bbfda36496b4"
    assert set(paddle["runtimeFiles"]) == {"ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"}
    for file, expected in paddle["runtimeFiles"].items():
        data = archive.extractfile(paddle_root + file).read()
        assert len(data) == expected["bytes"] and hashlib.sha256(data).hexdigest() == expected["sha256"]
    font = json.load(archive.extractfile(paddle_root + "pdf-font.json"))
    data = archive.extractfile(paddle_root + "pdf.ttf").read()
    assert font["license"] == "Apache-2.0" and font["bytes"] == len(data) == 572
    assert font["sha256"] == hashlib.sha256(data).hexdigest() == "c7845420925a23d88ed830a63957b8af85a66a8daf8d9fc90e843673b2ef1a59"
    font_license = archive.extractfile(paddle_root + "pdf-font.LICENSE").read()
    assert hashlib.sha256(font_license).hexdigest() == "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4"
    assert font_license == archive.extractfile("package/third-party/paddle-ocr/glyphless-font/LICENSE").read()
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
