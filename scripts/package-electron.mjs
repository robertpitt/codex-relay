#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, chmod, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const distDir = path.join(rootDir, "dist");
const outDir = path.join(rootDir, "out");
const packageJsonPath = path.join(rootDir, "package.json");
const packageLockPath = path.join(rootDir, "package-lock.json");

const appDisplayName = "Relay";
const appBundleId = "com.relay.app";
const args = new Set(process.argv.slice(2));

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));

const pathExists = async (filePath) => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

const cleanDist = async () => {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
};

const sanitizeLabel = (value) => value.replace(/^refs\/tags\//, "").replace(/[^A-Za-z0-9._-]/g, "-");

const run = async (command, commandArgs, options = {}) => {
  await new Promise((resolve, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: rootDir,
      env: { ...process.env, ...options.env },
      shell: false,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed with ${signal ?? `exit code ${code ?? 1}`}`));
    });
  });
};

const configureDarwinBundle = async (bundleRoot, appVersion) => {
  const electronApp = path.join(bundleRoot, "Electron.app");
  const relayApp = path.join(bundleRoot, `${appDisplayName}.app`);
  await rename(electronApp, relayApp);

  const macOsDir = path.join(relayApp, "Contents", "MacOS");
  const electronExecutable = path.join(macOsDir, "Electron");
  const relayExecutable = path.join(macOsDir, appDisplayName);
  if (await pathExists(electronExecutable)) {
    await rename(electronExecutable, relayExecutable);
    await chmod(relayExecutable, 0o755);
  }

  const infoPlistPath = path.join(relayApp, "Contents", "Info.plist");
  const infoPlist = await readFile(infoPlistPath, "utf8");
  await writeFile(
    infoPlistPath,
    infoPlist
      .replace(/(<key>CFBundleExecutable<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appDisplayName}$2`)
      .replace(/(<key>CFBundleName<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appDisplayName}$2`)
      .replace(/(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appDisplayName}$2`)
      .replace(/(<key>CFBundleIdentifier<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appBundleId}$2`)
      .replace(/(<key>CFBundleShortVersionString<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appVersion}$2`)
      .replace(/(<key>CFBundleVersion<\/key>\s*<string>)[^<]+(<\/string>)/, `$1${appVersion}$2`),
    "utf8"
  );

  return path.join(relayApp, "Contents", "Resources");
};

const configurePlatformRuntime = async (bundleRoot, appVersion) => {
  if (process.platform === "darwin") {
    return configureDarwinBundle(bundleRoot, appVersion);
  }

  if (process.platform === "win32") {
    const electronExecutable = path.join(bundleRoot, "electron.exe");
    const relayExecutable = path.join(bundleRoot, `${appDisplayName}.exe`);
    if (await pathExists(electronExecutable)) {
      await rename(electronExecutable, relayExecutable);
    }
    return path.join(bundleRoot, "resources");
  }

  const electronExecutable = path.join(bundleRoot, "electron");
  const relayExecutable = path.join(bundleRoot, "relay");
  if (await pathExists(electronExecutable)) {
    await rename(electronExecutable, relayExecutable);
    await chmod(relayExecutable, 0o755);
  }
  return path.join(bundleRoot, "resources");
};

const copyProductionNodeModules = async (appDir, lockfile) => {
  const targetNodeModules = path.join(appDir, "node_modules");
  await mkdir(targetNodeModules, { recursive: true });

  const packagePaths = Object.entries(lockfile.packages)
    .filter(([packagePath, metadata]) => packagePath.startsWith("node_modules/") && metadata.dev !== true)
    .map(([packagePath]) => packagePath)
    .sort((left, right) => left.localeCompare(right));

  for (const packagePath of packagePaths) {
    const source = path.join(rootDir, packagePath);
    if (!(await pathExists(source))) {
      continue;
    }

    const destination = path.join(appDir, packagePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, {
      recursive: true,
      dereference: false,
      force: true
    });
  }
};

const writeAppPackageJson = async (appDir, rootPackageJson) => {
  const appPackageJson = {
    name: rootPackageJson.name,
    version: rootPackageJson.version,
    description: rootPackageJson.description,
    main: rootPackageJson.main,
    type: rootPackageJson.type,
    private: true,
    dependencies: rootPackageJson.dependencies
  };

  await writeFile(path.join(appDir, "package.json"), `${JSON.stringify(appPackageJson, null, 2)}\n`, "utf8");
};

const sha256File = async (filePath) =>
  new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const archiveBundle = async (artifactBase, bundleRoot) => {
  const isWindows = process.platform === "win32";
  const archiveName = `${artifactBase}${isWindows ? ".zip" : ".tar.gz"}`;
  const archivePath = path.join(distDir, archiveName);

  if (isWindows) {
    await run("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Compress-Archive -Path $env:RELAY_ARCHIVE_SOURCE -DestinationPath $env:RELAY_ARCHIVE_DESTINATION -Force"
    ], {
      env: {
        RELAY_ARCHIVE_SOURCE: bundleRoot,
        RELAY_ARCHIVE_DESTINATION: archivePath
      }
    });
  } else {
    await run("tar", ["-czf", archivePath, "-C", distDir, artifactBase]);
  }

  const digest = await sha256File(archivePath);
  const checksumPath = `${archivePath}.sha256`;
  await writeFile(checksumPath, `${digest}  ${archiveName}\n`, "utf8");

  return { archivePath, checksumPath };
};

const packageElectronApp = async () => {
  const rootPackageJson = await readJson(packageJsonPath);
  const lockfile = await readJson(packageLockPath);
  const electronPackageDir = path.dirname(require.resolve("electron/package.json"));
  const electronDistDir = path.join(electronPackageDir, "dist");

  if (!(await pathExists(outDir))) {
    throw new Error("Missing out/. Run npm run build before npm run package:binary.");
  }

  if (!(await pathExists(electronDistDir))) {
    throw new Error("Missing Electron runtime under node_modules/electron/dist. Run npm ci first.");
  }

  await mkdir(distDir, { recursive: true });

  const releaseLabel = sanitizeLabel(
    process.env.RELAY_RELEASE_VERSION || process.env.GITHUB_REF_NAME || `v${rootPackageJson.version}`
  );
  const artifactBase = `${rootPackageJson.name}-${releaseLabel}-${process.platform}-${process.arch}`;
  const bundleRoot = path.join(distDir, artifactBase);

  await rm(bundleRoot, { recursive: true, force: true });
  await cp(electronDistDir, bundleRoot, {
    recursive: true,
    dereference: false,
    force: true
  });

  const resourcesDir = await configurePlatformRuntime(bundleRoot, rootPackageJson.version);
  const appDir = path.join(resourcesDir, "app");

  await rm(appDir, { recursive: true, force: true });
  await mkdir(appDir, { recursive: true });
  await cp(outDir, path.join(appDir, "out"), {
    recursive: true,
    dereference: false,
    force: true
  });
  await writeAppPackageJson(appDir, rootPackageJson);
  await copyProductionNodeModules(appDir, lockfile);

  const { archivePath, checksumPath } = await archiveBundle(artifactBase, bundleRoot);

  console.log(`Packaged ${appDisplayName}`);
  console.log(`App: ${path.relative(rootDir, bundleRoot)}`);
  console.log(`Archive: ${path.relative(rootDir, archivePath)}`);
  console.log(`Checksum: ${path.relative(rootDir, checksumPath)}`);
};

if (args.has("--clean")) {
  await cleanDist();
} else {
  await packageElectronApp();
}
