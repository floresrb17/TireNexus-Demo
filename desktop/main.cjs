const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");

const APP_NAME = "WGI POS";
const DEFAULT_WEB_PORT = 23865;
const DEFAULT_API_PORT = 8080;

if (process.platform === "win32") {
  app.setAppUserModelId("com.wheelgotit.wgipos");
}

const projectRoot = path.resolve(__dirname, "..");
const frontendDir = path.join(projectRoot, "artifacts", "tireshop-pos", "dist", "public");
const iconPath = path.join(projectRoot, "assets", "icons", "tire_app_icon.ico");

process.env.WGI_POS_DATA_DIR = process.env.WGI_POS_DATA_DIR || (
  app.isPackaged
    ? path.join(app.getPath("documents"), "WGI-POS")
    : path.join(projectRoot, "local-data")
);

function updateWindowsShortcutIcons() {
  if (process.platform !== "win32") return;

  try {
    const sourceIcon = iconPath;
    const shortcutIcon = path.join(process.env.WGI_POS_DATA_DIR, "tire_app_icon.ico");
    if (fs.existsSync(sourceIcon)) {
      fs.mkdirSync(path.dirname(shortcutIcon), { recursive: true });
      fs.copyFileSync(sourceIcon, shortcutIcon);
    }

    if (!fs.existsSync(shortcutIcon)) return;

    const escapedIcon = shortcutIcon.replace(/'/g, "''");
    const script = `
      $ErrorActionPreference = 'SilentlyContinue'
      $icon = '${escapedIcon}'
      $shell = New-Object -ComObject WScript.Shell
      $desktopPaths = @(
        [Environment]::GetFolderPath('Desktop'),
        [Environment]::GetFolderPath('CommonDesktopDirectory'),
        [Environment]::GetFolderPath('Programs'),
        [Environment]::GetFolderPath('CommonPrograms')
      ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
      foreach ($base in $desktopPaths) {
        Get-ChildItem -LiteralPath $base -Filter 'WGI POS.lnk' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
          $shortcut = $shell.CreateShortcut($_.FullName)
          $shortcut.IconLocation = "$icon,0"
          $shortcut.Save()
        }
      }
    `;

    spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      detached: true,
      stdio: "ignore",
    }).unref();
  } catch (error) {
    console.warn("Unable to update WGI POS shortcut icons", error);
  }
}
function seedPackagedDataDir() {
  if (!app.isPackaged) return;

  const targetDir = process.env.WGI_POS_DATA_DIR;
  const targetDataFile = path.join(targetDir, "wgi-pos-data.json");
  const bundledDataDir = path.join(projectRoot, "local-data");

  if (fs.existsSync(targetDataFile) || !fs.existsSync(bundledDataDir)) return;

  fs.mkdirSync(targetDir, { recursive: true });

  for (const fileName of ["wgi-pos-data.json", "wgi-pos-current.xlsx"]) {
    const sourceFile = path.join(bundledDataDir, fileName);
    const targetFile = path.join(targetDir, fileName);
    if (fs.existsSync(sourceFile) && !fs.existsSync(targetFile)) {
      fs.copyFileSync(sourceFile, targetFile);
    }
  }
}

seedPackagedDataDir();

const { startLocalApi } = require("../local-api.cjs");
const {
  getUpdateDir,
  readUpdateManifest,
  launchInstallerUpdate,
} = require("./desktop-update.cjs");

let mainWindow;
let liveWidgetWindow;
let liveWidgetHasActiveClients = false;
let apiServer;
let webServer;
let apiPortInUse = DEFAULT_API_PORT;
let webPortInUse = DEFAULT_WEB_PORT;

function isLiveWindow(windowRef) {
  return Boolean(windowRef && !windowRef.isDestroyed());
}

function getRequestPath(req) {
  return new URL(req.url || "/", "http://127.0.0.1").pathname;
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

function sendDesktopJson(res, status, data) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

function getRequestUser(req, apiPort) {
  return new Promise((resolve) => {
    const authReq = http.request(
      {
        hostname: "127.0.0.1",
        port: apiPort,
        path: "/api/auth/me",
        method: "GET",
        headers: {
          cookie: req.headers.cookie || "",
        },
      },
      (authRes) => {
        let body = "";
        authRes.on("data", (chunk) => {
          body += chunk;
        });
        authRes.on("end", () => {
          if ((authRes.statusCode || 500) >= 400) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );

    authReq.on("error", () => resolve(null));
    authReq.end();
  });
}

async function handleDesktopUpdateRequest(req, res, apiPort) {
  const user = await getRequestUser(req, apiPort);
  if (!user || user.role !== "admin") {
    sendDesktopJson(res, user ? 403 : 401, { error: user ? "Admin access is required" : "Not logged in" });
    return true;
  }

  const route = getRequestPath(req);
  const updateOptions = { currentVersion: app.getVersion(), documentsPath: app.getPath("documents") };

  if (route === "/api/desktop-update/status" && req.method === "GET") {
    sendDesktopJson(res, 200, {
      currentVersion: app.getVersion(),
      updateDir: getUpdateDir(updateOptions),
    });
    return true;
  }

  if (route === "/api/desktop-update/check" && req.method === "GET") {
    try {
      sendDesktopJson(res, 200, readUpdateManifest(updateOptions));
    } catch (error) {
      sendDesktopJson(res, 500, { error: error.message || "Unable to check updates" });
    }
    return true;
  }

  if (route === "/api/desktop-update/install" && req.method === "POST") {
    await readRequestBody(req);
    try {
      const update = readUpdateManifest(updateOptions);
      if (!update.updateAvailable) {
        sendDesktopJson(res, 409, { error: update.message || "No update available" });
        return true;
      }

      sendDesktopJson(res, 200, { success: true, message: "Installing update. WGI POS will close now." });
      launchInstallerUpdate(update.installerPath, { quitApp: () => app.quit() });
    } catch (error) {
      sendDesktopJson(res, 500, { error: error.message || "Unable to install update" });
    }
    return true;
  }

  return false;
}

function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const types = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
  };
  return types[extension] || "application/octet-stream";
}

function pipeApiRequest(req, res, apiPort) {
  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: apiPort,
      path: req.url,
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "Local API is not available" }));
  });

  req.pipe(proxyReq);
}

function serveFrontendFile(req, res) {
  const requestPath = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
  const relativePath = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const candidatePath = path.resolve(frontendDir, relativePath);
  const indexPath = path.join(frontendDir, "index.html");
  const filePath = candidatePath.startsWith(frontendDir) && fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()
    ? candidatePath
    : indexPath;

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("WGI POS desktop files are missing. Run pnpm run desktop:build first.");
      return;
    }

    res.writeHead(200, { "content-type": contentTypeFor(filePath) });
    res.end(content);
  });
}

function startFrontendServer(apiPort, preferredPort = DEFAULT_WEB_PORT) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      if (req.url && req.url.startsWith("/api/desktop-update/")) {
        const handled = await handleDesktopUpdateRequest(req, res, apiPort);
        if (handled) return;
      }

      if (req.url && req.url.startsWith("/api")) {
        pipeApiRequest(req, res, apiPort);
        return;
      }

      serveFrontendFile(req, res);
    });

    const tryListen = (port) => {
      server.once("error", (error) => {
        if (error.code === "EADDRINUSE" && port < preferredPort + 20) {
          tryListen(port + 1);
          return;
        }
        reject(error);
      });

      server.once("listening", () => {
        const address = server.address();
        const actualPort = typeof address === "object" && address ? address.port : port;
        resolve({ server, port: actualPort });
      });

      server.listen(port, "0.0.0.0");
    };

    tryListen(preferredPort);
  });
}

async function startApiServer(preferredPort = DEFAULT_API_PORT) {
  let lastError;

  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    try {
      return await startLocalApi({ port });
    } catch (error) {
      lastError = error;
      if (error.code !== "EADDRINUSE") break;
    }
  }

  throw lastError;
}

async function createWindow(webPort) {
  webPortInUse = webPort;
  mainWindow = new BrowserWindow({
    width: 1365,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    title: APP_NAME,
    icon: iconPath,
    show: false,
    backgroundColor: "#f8fafc",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("minimize", () => {
    showLiveWidgetWindow(webPortInUse);
  });

  mainWindow.on("restore", () => {
    hideLiveWidgetWindow();
  });

  mainWindow.on("focus", () => {
    hideLiveWidgetWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${webPort}/`);
}

function showLiveWidgetWindow(webPort) {
  if (liveWidgetWindow && !liveWidgetWindow.isDestroyed()) {
    if (!liveWidgetHasActiveClients) return;
    liveWidgetWindow.show();
    liveWidgetWindow.focus();
    return;
  }

  liveWidgetWindow = new BrowserWindow({
    width: 360,
    height: 520,
    minWidth: 320,
    minHeight: 360,
    maxWidth: 460,
    title: "WGI Live Clients",
    icon: iconPath,
    show: false,
    frame: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#020617",
    webPreferences: {
      session: isLiveWindow(mainWindow) ? mainWindow.webContents.session : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  liveWidgetWindow.setMenuBarVisibility(false);
  liveWidgetWindow.setAlwaysOnTop(true, "floating");
  liveWidgetWindow.on("page-title-updated", (event, title) => {
    event.preventDefault();
    if (title.includes("Empty")) {
      liveWidgetHasActiveClients = false;
      liveWidgetWindow.hide();
      return;
    }
    liveWidgetHasActiveClients = true;
    if (isLiveWindow(mainWindow) && mainWindow.isMinimized()) {
      liveWidgetWindow.show();
    }
  });
  liveWidgetWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      liveWidgetWindow.hide();
    }
  });

  liveWidgetWindow.loadURL(`http://127.0.0.1:${webPort}/live-widget`).catch((error) => console.error(error));
}

function hideLiveWidgetWindow() {
  if (liveWidgetWindow && !liveWidgetWindow.isDestroyed()) {
    liveWidgetWindow.hide();
  }
}

async function startDesktopApp() {
  if (!fs.existsSync(path.join(frontendDir, "index.html"))) {
    throw new Error("The built POS frontend was not found. Run pnpm --filter @workspace/tireshop-pos run build first.");
  }

  const api = await startApiServer();
  apiServer = api.server;
  apiPortInUse = api.port;

  const web = await startFrontendServer(api.port);
  webServer = web.server;
  webPortInUse = web.port;

  await createWindow(web.port);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.setName(APP_NAME);
  Menu.setApplicationMenu(null);

  app.on("second-instance", () => {
    if (isLiveWindow(mainWindow)) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    startDesktopApp().then(() => updateWindowsShortcutIcons()).catch((error) => {
      console.error(error);
      app.quit();
    });
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && webServer) {
      const address = webServer.address();
      const port = typeof address === "object" && address ? address.port : DEFAULT_WEB_PORT;
      createWindow(port).catch((error) => console.error(error));
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
    if (liveWidgetWindow && !liveWidgetWindow.isDestroyed()) liveWidgetWindow.destroy();
    if (webServer) webServer.close();
    if (apiServer) apiServer.close();
  });
}
