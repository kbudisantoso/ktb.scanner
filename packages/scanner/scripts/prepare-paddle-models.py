"""Reproduce SDK model archives from the reviewed local ONNX conversions; no network access."""
import argparse
import hashlib
import io
import json
from pathlib import Path
import tarfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("source", type=Path, help="Directory containing the two sourceFile ONNX files")
args = parser.parse_args()
target = Path(__file__).resolve().parent.parent / "assets" / "ocr" / "paddle"
manifest = json.loads((target / "models.json").read_text())
configs = json.loads((target / "model-configs.json").read_text())
for model in manifest["models"]:
    weights = (args.source / model["sourceFile"]).read_bytes()
    if hashlib.sha256(weights).hexdigest() != model["sourceSha256"]:
        raise ValueError("Source model checksum mismatch: " + model["sourceFile"])
    kind = model["file"].removesuffix(".tar")
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        config = json.dumps(configs[kind], ensure_ascii=False).encode()
        for name, content in [("inference.onnx", weights), ("inference.yml", config)]:
            info = tarfile.TarInfo(name)
            info.size = len(content)
            info.mode = 0o644
            archive.addfile(info, io.BytesIO(content))
    packed = output.getvalue()
    if len(packed) != model["bytes"] or hashlib.sha256(packed).hexdigest() != model["sha256"]:
        raise ValueError("Repacked archive checksum mismatch: " + model["file"])
    (target / model["file"]).write_bytes(packed)
    print("Verified", model["file"], len(packed))
