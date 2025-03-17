// Script to check if GLTF files are accessible

// Create status display
const statusElement = document.createElement("div");
statusElement.style.position = "absolute";
statusElement.style.top = "10px";
statusElement.style.left = "10px";
statusElement.style.color = "white";
statusElement.style.fontFamily = "Arial, sans-serif";
statusElement.style.padding = "10px";
statusElement.style.backgroundColor = "rgba(0,0,0,0.5)";
statusElement.style.maxWidth = "400px";
statusElement.style.maxHeight = "80vh";
statusElement.style.overflow = "auto";
document.body.appendChild(statusElement);

// Function to log messages to the status display
function logStatus(message: string) {
  console.log(message);
  statusElement.innerHTML += `<div>${message}</div>`;
}

// List of files to check
const filesToCheck = [
  "/lowpoly_nature/PineTree_1.gltf",
  "/lowpoly_nature/CommonTree_1.gltf",
  "/lowpoly_nature/Rock_1.gltf",
  "/lowpoly_nature/Willow_1.gltf",
  "/lowpoly_nature/PalmTree_1.gltf"
];

// Function to check if a file is accessible
async function checkFile(url: string): Promise<boolean> {
  try {
    logStatus(`Checking file: ${url}`);
    const response = await fetch(url, { method: 'HEAD' });
    
    if (response.ok) {
      logStatus(`✅ File accessible: ${url}`);
      return true;
    } else {
      logStatus(`❌ File not accessible: ${url} (Status: ${response.status})`);
      return false;
    }
  } catch (error) {
    logStatus(`❌ Error checking file ${url}: ${error}`);
    return false;
  }
}

// Check all files
async function checkAllFiles() {
  logStatus("Starting file accessibility check...");
  
  let accessibleCount = 0;
  
  for (const file of filesToCheck) {
    const accessible = await checkFile(file);
    
    if (accessible) {
      accessibleCount++;
    }
  }
  
  logStatus(`${accessibleCount}/${filesToCheck.length} files are accessible`);
  
  if (accessibleCount === 0) {
    logStatus("❌ No files are accessible. Possible issues:");
    logStatus("1. Files are not in the correct location");
    logStatus("2. Server is not serving static files correctly");
    logStatus("3. Path is incorrect");
    
    // Try to list the public directory
    logStatus("Attempting to list the public directory...");
    try {
      const response = await fetch('/lowpoly_nature/');
      if (response.ok) {
        const text = await response.text();
        logStatus("Directory listing (if available):");
        logStatus(text.substring(0, 500) + "...");
      } else {
        logStatus(`❌ Could not list directory (Status: ${response.status})`);
      }
    } catch (error) {
      logStatus(`❌ Error listing directory: ${error}`);
    }
  }
}

// Start the check
checkAllFiles(); 