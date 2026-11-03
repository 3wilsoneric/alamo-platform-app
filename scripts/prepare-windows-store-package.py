#!/usr/bin/env python3
"""Build and inspect a Windows Store candidate for the hosted Alamo Platform.

This prepares a candidate only. Partner Center identity, Store certification,
and installation on a real Windows device are separate release gates.
"""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


ORIGIN = "https://www.alamoplatform.com"
GENERATOR = "https://pwabuilder-windows-docker.azurewebsites.net/msix/generatezip"
DEFAULT_OUTPUT = Path("generated/platform-windows-store/alamo-platform-windows.zip")
EDGE_APP_ID = "mklmnhajgcmfkjmalmajpliimhinhieg"


def fetch(url, *, data=None, timeout=30):
    command = ["curl", "--fail-with-body", "--silent", "--show-error", "--max-time", str(timeout),
               "--user-agent", "AlamoPlatformWindowsCandidate/1.0"]
    if data is not None:
        command += ["--header", "Content-Type: application/json", "--data-binary", "@-"]
    command.append(url)
    return subprocess.run(command, input=data, capture_output=True, check=True, timeout=timeout + 5).stdout


def checked_zip(data):
    archive = zipfile.ZipFile(io.BytesIO(data))
    entries = archive.infolist()
    if len(entries) > 200 or sum(entry.file_size for entry in entries) > 25_000_000:
        raise ValueError("Generated archive is unexpectedly large.")
    names = [entry.filename for entry in entries]
    if len(names) != len(set(names)):
        raise ValueError("Generated archive has duplicate entries.")
    for name in names:
        normalized = name.replace("\\", "/")
        if normalized.startswith("/") or ".." in normalized.split("/"):
            raise ValueError("Generated archive has an unsafe path.")
    if archive.testzip() is not None:
        raise ValueError("Generated archive failed its checksum check.")
    return archive


def parse_xml(data):
    if b"<!DOCTYPE" in data or b"<!ENTITY" in data:
        raise ValueError("Generated package has an unexpected XML declaration.")
    return ET.fromstring(data)


def inspect_package(archive_bytes, package_id, publisher, version):
    expected_version = f"{version}.0"
    with checked_zip(archive_bytes) as outer:
        names = outer.namelist()
        store_name = next((name for name in names if name.endswith(".msixbundle")), None)
        sideload_name = next((name for name in names if name.endswith(".sideload.msix")), None)
        if not store_name or not sideload_name:
            raise ValueError("The generator did not return both Store and sideload packages.")
        with checked_zip(outer.read(store_name)) as bundle:
            store_signed = "AppxSignature.p7x" in bundle.namelist()
            bundle_xml = parse_xml(bundle.read("AppxMetadata/AppxBundleManifest.xml"))
            bundle_identity = next(element for element in bundle_xml.iter() if element.tag.endswith("}Identity"))
            if bundle_identity.get("Name") != package_id or bundle_identity.get("Publisher") != publisher or bundle_identity.get("Version") != expected_version:
                raise ValueError("Store bundle identity differs from the requested identity.")
            leaves = [name for name in bundle.namelist() if name.endswith(".appx")]
            if len(leaves) != 1:
                raise ValueError("Expected one architecture-neutral Store package.")
            with checked_zip(bundle.read(leaves[0])) as leaf:
                allowed = {"resources.pri", "AppxManifest.xml", "AppxBlockMap.xml", "[Content_Types].xml"}
                if any(name not in allowed and not (name.startswith("Images/") and name.endswith(".png")) for name in leaf.namelist()):
                    raise ValueError("Store bundle contains an unexpected payload.")
                store_manifest = parse_xml(leaf.read("AppxManifest.xml"))
                app = next(element for element in store_manifest.iter() if element.tag.endswith("}Application"))
                parameters = next((value for key, value in app.attrib.items() if key.endswith("}Parameters")), "")
                if f"--app-id={EDGE_APP_ID}" not in parameters or f"--app-fallback-url={ORIGIN}/" not in parameters:
                    raise ValueError("Store package points to an unexpected app or origin.")
        with checked_zip(outer.read(sideload_name)) as package:
            manifest = package.read("AppxManifest.xml")
            root = parse_xml(manifest)
            identity = next(element for element in root.iter() if element.tag.endswith("}Identity"))
            target = next(element for element in root.iter() if element.tag.endswith("}TargetDeviceFamily"))
            if identity.attrib.get("Name") != package_id:
                raise ValueError("Package identity differs from the requested identity.")
            if identity.attrib.get("Version") != expected_version:
                raise ValueError("Package version differs from the requested version.")
            if target.attrib.get("Name") != "Windows.Desktop":
                raise ValueError("Package is not targeted at Windows Desktop.")
            if ORIGIN not in manifest.decode("utf-8"):
                raise ValueError("Package does not point to the production Platform origin.")
            signed = any(name.lower() == "appxsignature.p7x" for name in package.namelist())
            return {
                "store_package": store_name,
                "sideload_package": sideload_name,
                "identity": identity.attrib,
                "target": target.attrib,
                "store_signed": store_signed,
                "sideload_signed": signed,
            }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--package-id", default="AlamoHealth.Platform")
    parser.add_argument("--version", default="1.0.0")
    parser.add_argument("--publisher-name", default=os.getenv("ALAMO_STORE_PUBLISHER_NAME", "Eric Wilson"))
    parser.add_argument(
        "--publisher-cn",
        default=os.getenv("ALAMO_STORE_PUBLISHER_CN", "CN=Eric Wilson, O=Eric Wilson, L=Boise, S=id, C=US"),
    )
    args = parser.parse_args()

    if not re.fullmatch(r"[1-9]\d{0,4}\.\d{1,5}\.\d{1,5}", args.version) or any(
        int(part) > 65535 for part in args.version.split(".")
    ):
        raise ValueError("Use a three-part Windows version; each part must be at most 65535.")

    manifest = json.loads(fetch(f"{ORIGIN}/manifest.json"))
    if manifest != json.loads(Path("public/manifest.json").read_text()):
        raise ValueError("The live Platform manifest differs from the reviewed source manifest.")
    if manifest.get("start_url") != "/home" or manifest.get("display") != "standalone":
        raise ValueError("The live Platform manifest is not ready for desktop packaging.")
    if len(manifest.get("icons", [])) < 2:
        raise ValueError("The live Platform manifest has too few app icons.")
    fetch(f"{ORIGIN}/sw.js")

    request = {
        "name": "Alamo Health Management",
        "packageId": args.package_id,
        "applicationId": "App",
        "url": f"{ORIGIN}/",
        "version": args.version,
        "allowSigning": True,
        "publisher": {"displayName": args.publisher_name, "commonName": args.publisher_cn},
        "generateModernPackage": True,
        "classicPackage": {"generate": False},
        "edgeHtmlPackage": {"generate": False},
        "edgeChannel": "stable",
        "manifestUrl": f"{ORIGIN}/manifest.json",
        "startUrl": f"{ORIGIN}/home",
        "resourceLanguage": "en-US",
        "targetDeviceFamilies": ["Desktop"],
    }
    archive = fetch(GENERATOR, data=json.dumps(request).encode("utf-8"), timeout=240)
    if len(archive) > 50_000_000:
        raise ValueError("Package generator response is unexpectedly large.")
    inspected = inspect_package(archive, args.package_id, args.publisher_cn, args.version)
    if inspected["store_signed"]:
        raise ValueError("Expected an unsigned Store candidate before the controlled signing step.")
    with checked_zip(archive) as outer:
        bundle = outer.read(inspected["store_package"])

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as temporary:
        temporary.write(archive)
        temporary_path = Path(temporary.name)
    temporary_path.replace(args.output)
    bundle_name = f"AlamoHealthPlatform-{args.version}.0.msixbundle"
    bundle_path = args.output.parent / bundle_name
    with tempfile.NamedTemporaryFile(dir=args.output.parent, delete=False) as temporary:
        temporary.write(bundle)
        temporary_path = Path(temporary.name)
    temporary_path.replace(bundle_path)
    receipt = {
        "status": "candidate_only",
        "source_origin": ORIGIN,
        "source_commit": subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, check=True, text=True).stdout.strip(),
        "run_id": os.getenv("GITHUB_RUN_ID"),
        "run_attempt": os.getenv("GITHUB_RUN_ATTEMPT"),
        "manifest_start_url": manifest["start_url"],
        "generator": GENERATOR,
        "archive_sha256": hashlib.sha256(archive).hexdigest(),
        "archive_bytes": len(archive),
        "bundle_file": bundle_name,
        "bundle_publisher": args.publisher_cn,
        "bundle_sha256": hashlib.sha256(bundle).hexdigest(),
        "bundle_bytes": len(bundle),
        **inspected,
    }
    args.output.with_suffix(".receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
