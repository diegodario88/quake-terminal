#!/usr/bin/env node

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Updates the metadata.json file with the new version
 * @param {string} version - The new version string (e.g., "1.7.0")
 */
function updateMetadata(version) {
  const metadataPath = join(__dirname, "../src/metadata.json");

  try {
    const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));

    // Update version-name to match package.json semantic version
    metadata["version-name"] = version;

    // Increment version number (GNOME extension version)
    metadata.version += 1;

    writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
    console.log(
      `Updated metadata.json: version=${metadata.version}, version-name=${version}`
    );
  } catch (error) {
    console.error("Failed to update metadata.json:", error.message);
    process.exit(1);
  }
}

// Get version from command line argument
const version = process.argv[2];
if (!version) {
  console.error("Usage: node update-metadata.js <version>");
  process.exit(1);
}

updateMetadata(version);
