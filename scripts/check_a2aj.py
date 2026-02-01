import io
import json
import os
import sys
import zipfile
from datetime import datetime, timezone

from huggingface_hub import HfApi
from datasets import load_dataset

from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

REPO_ID = os.getenv("HF_REPO_ID", "a2aj/canadian-case-law")
DRIVE_FOLDER_ID = os.getenv("DRIVE_FOLDER_ID")
DRIVE_SA_JSON = os.getenv("DRIVE_SA_JSON")
STATE_FILENAME = os.getenv("STATE_FILENAME", "a2aj_last_commit.txt")

if not DRIVE_FOLDER_ID:
    print("Missing DRIVE_FOLDER_ID env var", file=sys.stderr)
    sys.exit(2)

if not DRIVE_SA_JSON:
    print("Missing DRIVE_SA_JSON env var", file=sys.stderr)
    sys.exit(2)

sa_info = json.loads(DRIVE_SA_JSON)
creds = service_account.Credentials.from_service_account_info(
    sa_info,
    scopes=["https://www.googleapis.com/auth/drive"],
)

drive = build("drive", "v3", credentials=creds, cache_discovery=False)


def list_files_in_folder(name, folder_id):
    q = (
        f"name='{name}' and '{folder_id}' in parents and trashed=false"
    )
    res = drive.files().list(
        q=q,
        fields="files(id, name)",
        pageSize=10,
    ).execute()
    return res.get("files", [])


def read_text_file(file_id):
    request = drive.files().get_media(fileId=file_id)
    fh = io.BytesIO()
    downloader = MediaIoBaseUpload(fh, mimetype="text/plain")
    # MediaIoBaseUpload isn't a downloader, so use a simple export via execute
    data = request.execute()
    return data.decode("utf-8")


def upload_text_file(name, text, folder_id, existing_id=None):
    media = MediaIoBaseUpload(
        io.BytesIO(text.encode("utf-8")),
        mimetype="text/plain",
        resumable=False,
    )
    if existing_id:
        drive.files().update(fileId=existing_id, media_body=media).execute()
    else:
        metadata = {"name": name, "parents": [folder_id]}
        drive.files().create(body=metadata, media_body=media, fields="id").execute()


def get_or_create_folder(name, parent_id):
    existing = list_files_in_folder(name, parent_id)
    if existing:
        return existing[0]["id"]
    metadata = {
        "name": name,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id],
    }
    created = drive.files().create(body=metadata, fields="id").execute()
    return created["id"]


def upload_bytes(name, data_bytes, folder_id, mime_type):
    media = MediaIoBaseUpload(io.BytesIO(data_bytes), mimetype=mime_type, resumable=False)
    metadata = {"name": name, "parents": [folder_id]}
    drive.files().create(body=metadata, media_body=media, fields="id").execute()


def get_last_sha():
    existing = list_files_in_folder(STATE_FILENAME, DRIVE_FOLDER_ID)
    if not existing:
        return None
    file_id = existing[0]["id"]
    data = drive.files().get_media(fileId=file_id).execute()
    return data.decode("utf-8").strip()


def set_last_sha(sha):
    existing = list_files_in_folder(STATE_FILENAME, DRIVE_FOLDER_ID)
    if existing:
        upload_text_file(STATE_FILENAME, sha, DRIVE_FOLDER_ID, existing_id=existing[0]["id"])
    else:
        upload_text_file(STATE_FILENAME, sha, DRIVE_FOLDER_ID)


def build_zip_from_texts(rows, set_name):
    buf = io.BytesIO()
    zf = zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED)
    for i, row in enumerate(rows):
        citation = (row.get("citation_en") or row.get("citation_fr") or "").strip()
        name = (row.get("name_en") or row.get("name_fr") or "").strip()
        date = row.get("document_date_en") or row.get("document_date_fr")
        date_str = ""
        if date:
            try:
                date_str = date.date().isoformat()
            except Exception:
                date_str = str(date)

        base = citation or name or f"{set_name}_{i:06d}"
        # ASCII-safe filename
        base = "".join(ch if ch.isalnum() or ch in "._-" else "_" for ch in base)
        base = "_".join(part for part in base.split("_") if part)
        if date_str:
            base = f"{date_str}_{base}"
        filename = f"{base}.txt"

        text = row.get("unofficial_text_en") or row.get("unofficial_text_fr") or ""
        zf.writestr(filename, text)
    zf.close()
    buf.seek(0)
    return buf.getvalue()


print("Checking latest snapshot...")
api = HfApi()
info = api.repo_info(repo_id=REPO_ID, repo_type="dataset")
latest_sha = info.sha

last_sha = get_last_sha()
if last_sha == latest_sha:
    print("Nothing new.")
    sys.exit(0)

print("New snapshot detected:", latest_sha)
print("Loading dataset...")

ds = load_dataset(REPO_ID, split="train")

print("Filtering RPD and RLLR...")
rpd = ds.filter(lambda x: x["dataset"] == "RPD")
rllr = ds.filter(lambda x: x["dataset"] == "RLLR")

print("Building zip files...")
rpd_zip = build_zip_from_texts(rpd, "RPD")
rllr_zip = build_zip_from_texts(rllr, "RLLR")

print("Uploading to Google Drive...")
updates_folder = get_or_create_folder("A2AJ_updates", DRIVE_FOLDER_ID)

dt = datetime.now(timezone.utc).strftime("%Y-%m-%d")
run_folder_name = f"update_{dt}_{latest_sha[:7]}"
run_folder_id = get_or_create_folder(run_folder_name, updates_folder)

upload_bytes(f"RPD_{dt}_{latest_sha[:7]}.zip", rpd_zip, run_folder_id, "application/zip")
upload_bytes(f"RLLR_{dt}_{latest_sha[:7]}.zip", rllr_zip, run_folder_id, "application/zip")

manifest = {
    "repo": REPO_ID,
    "sha": latest_sha,
    "date": dt,
    "counts": {"RPD": len(rpd), "RLLR": len(rllr)},
}
upload_bytes("manifest.json", json.dumps(manifest, indent=2).encode("utf-8"), run_folder_id, "application/json")

set_last_sha(latest_sha)
print("Done.")
