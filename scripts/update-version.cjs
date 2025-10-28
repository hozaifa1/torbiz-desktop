const fs = require('fs');
const path = require('path');

const newVersion = `0.1.${process.env.GITHUB_RUN_NUMBER}`;

const filesToUpdate = [
  '../package.json',
  '../src-tauri/tauri.conf.json'
];

filesToUpdate.forEach(file => {
  const filePath = path.join(__dirname, file);
  const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  fileContent.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(fileContent, null, 2));
  console.log(`Updated version in ${file} to ${newVersion}`);
});
