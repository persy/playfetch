#!/usr/bin/env python3
"""Build browser-specific manifests and zip packages into dist/.

Usage:  python build.py

Output:
  dist/chrome/                     unpacked Chrome build (service_worker only)
  dist/firefox/                    unpacked Firefox build (scripts only)
  dist/playfetch-chrome-<v>.zip
  dist/playfetch-firefox-<v>.zip

manifest.json at the repository root is the development manifest: it lists both
background.service_worker and background.scripts, so the folder itself still
loads unpacked in either browser (Chrome shows a harmless MV2-key warning in
that case). This script produces a clean, single-key manifest per browser.
"""

import json
import shutil
import zipfile
from copy import deepcopy
from pathlib import Path

ROOT = Path(__file__).parent
DIST = ROOT / "dist"
FILES = ["background.js", "content.js", "popup.html", "popup.js", "icon.png"]

# Firefox requires an add-on id for Manifest V3. Use one of your own
# (email-like or GUID) and keep it unchanged across releases.
GECKO_ID = "playfetch@example.com"


def for_chrome(manifest):
    m = deepcopy(manifest)
    m["background"] = {"service_worker": "background.js"}
    m.pop("browser_specific_settings", None)
    return m


def for_firefox(manifest):
    m = deepcopy(manifest)
    m["background"] = {"scripts": ["background.js"]}
    m["browser_specific_settings"] = {
        "gecko": {"id": GECKO_ID, "strict_min_version": "121.0"}
    }
    return m


def write_unpacked(folder, manifest):
    if folder.exists():
        shutil.rmtree(folder)
    folder.mkdir(parents=True)
    (folder / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    for f in FILES:
        shutil.copy2(ROOT / f, folder / f)


def zip_folder(folder, target):
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                z.write(path, path.relative_to(folder).as_posix())


def main():
    base = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    version = base["version"]
    DIST.mkdir(exist_ok=True)

    for name, transform in (("chrome", for_chrome), ("firefox", for_firefox)):
        folder = DIST / name
        write_unpacked(folder, transform(base))
        target = DIST / f"playfetch-{name}-{version}.zip"
        zip_folder(folder, target)
        print(f"OK  {target.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
