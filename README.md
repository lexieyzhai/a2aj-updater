# A2AJ Update Checker (RPD + RLLR)

This repo creates a **free, shareable web page** that triggers a GitHub Actions workflow to:
- check the latest A2AJ dataset snapshot
- if new: download, filter **RPD** and **RLLR**, zip them, and upload to Google Drive
- if not new: do nothing

## What you get
- A shareable website (GitHub Pages)
- A one-click button that opens the workflow run page
- Google Drive uploads to your folder

## Setup (about 10 minutes)

### 1) Create a GitHub repo and push this project
- Create a new GitHub repo (public).
- Copy all files from this folder into that repo and push.

### 2) Enable GitHub Pages
- Repo Settings -> Pages
- Source: `Deploy from a branch`
- Branch: `main` and folder: `/docs`

### 3) Google Drive OAuth (recommended)
Service accounts often fail with "no storage quota". Use OAuth refresh token instead.

#### Create OAuth client
1. Google Cloud Console -> APIs & Services -> Credentials
2. Create Credentials -> OAuth client ID
3. App type: **Desktop app** (or **Web** if you prefer)
4. Download the client JSON and save the **Client ID** and **Client Secret**

#### Create a refresh token (one-time)
Run this locally and follow the prompts:
```
python3 - <<'PY'
import json
from google_auth_oauthlib.flow import InstalledAppFlow

CLIENT_ID = "PASTE_CLIENT_ID"
CLIENT_SECRET = "PASTE_CLIENT_SECRET"

flow = InstalledAppFlow.from_client_config(
    {
        "installed": {
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    },
    scopes=["https://www.googleapis.com/auth/drive"],
)
creds = flow.run_local_server(port=0)
print("REFRESH_TOKEN:", creds.refresh_token)
PY
```

### 4) Add GitHub secrets and variables
In your repo:
- Settings -> Secrets and variables -> Actions

**Secrets**
- `GDRIVE_CLIENT_ID`
- `GDRIVE_CLIENT_SECRET`
- `GDRIVE_REFRESH_TOKEN`
- `HF_TOKEN` (optional)

**Variables**
- `DRIVE_FOLDER_ID` = `1TgbucxzWLsMILWroPMVoBVY53st7Q3Vq`

### 5) Update the website button
Edit `docs/app.js` and set:
- `REPO_OWNER` = your GitHub username
- `REPO_NAME` = your repo name

Commit and push.

## How to use
- Open your GitHub Pages URL
- Click **Run update check**
- The workflow runs and uploads zip files to your Drive folder
- If nothing new, the workflow logs say "Nothing new."

## Output structure in Drive
```
A2AJ_updates/
  update_YYYY-MM-DD_abcdef0/
    RPD_YYYY-MM-DD_abcdef0.zip
    RLLR_YYYY-MM-DD_abcdef0.zip
    manifest.json
```

## Notes
- Zips contain plain text files for each case.
- This is 100% free (GitHub Pages + Actions + Google Drive).
