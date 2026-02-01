// Update these two values after you create the GitHub repo.
const REPO_OWNER = "YOUR_GITHUB_USER";
const REPO_NAME = "YOUR_REPO";
const WORKFLOW_FILE = "check-a2aj.yml";

const runBtn = document.getElementById("runBtn");
const runsLink = document.getElementById("runsLink");

function buildRunUrl() {
  return `https://github.com/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${WORKFLOW_FILE}`;
}

runBtn.addEventListener("click", () => {
  const url = buildRunUrl();
  window.open(url, "_blank");
});

runsLink.href = buildRunUrl();
