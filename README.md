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

### 3) Create a Google Drive service account
1. Go to Google Cloud Console
2. Create a new project
3. Enable **Google Drive API** for the project
4. Create a **Service Account**
5. Create a **JSON key** for the service account and download it

### 4) Share your Drive folder with the service account
- Your folder ID: `1TgbucxzWLsMILWroPMVoBVY53st7Q3Vq`
- In Google Drive, open the folder and share it with the service account email
  (the email is in the JSON key file).

### 5) Add GitHub secrets and variables
In your repo:
- Settings -> Secrets and variables -> Actions

**Secrets**
- `DRIVE_SA_JSON` = the full JSON key file contents
- `HF_TOKEN` (optional) = Hugging Face token to speed up downloads

**Variables**
- `DRIVE_FOLDER_ID` = `1TgbucxzWLsMILWroPMVoBVY53st7Q3Vq`

### 6) Update the website button
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
