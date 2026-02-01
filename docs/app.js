// Update these two values after you create the GitHub repo.
const REPO_OWNER = "lexieyzhai";
const REPO_NAME = "a2aj-updater";
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
