const fs = require("fs");
const path = require("path");

const newVersion = `0.1.${process.env.GITHUB_RUN_NUMBER}`;

const filesToUpdate = [
  "../package.json",
  "../src-tauri/tauri.conf.json",
  "../src-tauri/Cargo.toml"
];

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  
  if (file.endsWith(".toml")) {
    // Handle Cargo.toml separately (TOML format)
    let fileContent = fs.readFileSync(filePath, "utf-8");
    fileContent = fileContent.replace(/^version = ".*"$/m, `version = "${newVersion}"`);
    fs.writeFileSync(filePath, fileContent);
    console.log(`Updated version in ${file} to ${newVersion}`);
  } else {
    // Handle JSON files
    const fileContent = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    fileContent.version = newVersion;
    fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2) + "\n");
    console.log(`Updated version in ${file} to ${newVersion}`);
  }
});
