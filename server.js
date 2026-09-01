const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");

const app = express();
const upload = multer({
  dest: path.join(os.tmpdir(), "web2apk-uploads")
});

const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.json({
    name: "Web2APK Builder",
    status: "online"
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok"
  });
});

app.post(
  "/api/build",
  upload.single("icon"),
  async (req, res) => {
    const buildId = crypto.randomUUID();

    let projectDir = null;

    try {
      if (!req.body.html) {
        return res.status(400).json({
          error: "Codice HTML mancante."
        });
      }

      const appName =
        req.body.appName || "La mia app";

      const packageName =
        req.body.packageName ||
        "com.web2apk.miaapp";

      const version =
        req.body.version || "1.0.0";

      const versionCode =
        req.body.versionCode || "1";

      const orientation =
        req.body.orientation || "portrait";

      console.log("");
      console.log("================================");
      console.log("WEB2APK BUILD");
      console.log("================================");
      console.log("Build ID:", buildId);
      console.log("App:", appName);
      console.log("Package:", packageName);
      console.log("Version:", version);
      console.log("Version code:", versionCode);
      console.log("Orientation:", orientation);
      console.log("================================");

      projectDir = path.join(
        os.tmpdir(),
        "web2apk-" + buildId
      );

      fs.mkdirSync(projectDir, {
        recursive: true
      });

      const webDir = path.join(
        projectDir,
        "app",
        "src",
        "main",
        "assets"
      );

      fs.mkdirSync(webDir, {
        recursive: true
      });

      const htmlPath = path.join(
        webDir,
        "index.html"
      );

      fs.writeFileSync(
        htmlPath,
        req.body.html,
        "utf8"
      );

      console.log("HTML copiato.");

      const settings = {
        appName,
        packageName,
        version,
        versionCode,
        orientation,
        internet:
          req.body.internet === "true",
        javascript:
          req.body.javascript === "true",
        fullscreen:
          req.body.fullscreen === "true",
        externalLinks:
          req.body.externalLinks === "true",
        keepScreenOn:
          req.body.keepScreenOn === "true"
      };

      fs.writeFileSync(
        path.join(
          projectDir,
          "web2apk-settings.json"
        ),
        JSON.stringify(
          settings,
          null,
          2
        ),
        "utf8"
      );

      console.log(
        "Configurazione salvata."
      );

      /*
       * IMPORTANTE:
       *
       * Questa parte prepara il progetto.
       * La vera compilazione Android verrà
       * eseguita dal Gradle wrapper del progetto.
       */

      const result = await runGradle(
        projectDir
      );

      if (!result.success) {
        console.error(
          result.output
        );

        return res.status(500).json({
          error:
            "Build Android fallita.",
          log:
            result.output
        });
      }

      const apkPath =
        findApk(projectDir);

      if (!apkPath) {
        return res.status(500).json({
          error:
            "Gradle ha terminato ma non è stato trovato alcun APK."
        });
      }

      const apkBuffer =
        fs.readFileSync(apkPath);

      /*
       * Controllo minimo:
       * un APK deve essere un archivio ZIP.
       */

      if (
        apkBuffer.length < 4 ||
        apkBuffer[0] !== 0x50 ||
        apkBuffer[1] !== 0x4b
      ) {
        return res.status(500).json({
          error:
            "Il file generato non è un APK Android valido."
        });
      }

      console.log(
        "APK valido trovato:",
        apkPath
      );

      console.log(
        "Dimensione APK:",
        apkBuffer.length,
        "bytes"
      );

      res.setHeader(
        "Content-Type",
        "application/vnd.android.package-archive"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${safeFileName(
          appName
        )}-${version}.apk"`
      );

      res.send(apkBuffer);

      console.log(
        "APK inviato al client."
      );

    } catch (error) {

      console.error(
        "BUILD ERROR:",
        error
      );

      if (!res.headersSent) {
        res.status(500).json({
          error:
            error.message ||
            "Errore interno durante la compilazione."
        });
      }

    } finally {

      if (
        projectDir &&
        fs.existsSync(projectDir)
      ) {
        try {
          fs.rmSync(
            projectDir,
            {
              recursive: true,
              force: true
            }
          );
        } catch {}
      }

      if (
        req.file &&
        fs.existsSync(req.file.path)
      ) {
        try {
          fs.unlinkSync(
            req.file.path
          );
        } catch {}
      }
    }
  }
);


/* =========================================
   GRADLE
========================================= */

function runGradle(projectDir) {

  return new Promise(
    (resolve) => {

      const gradlePath =
        path.join(
          projectDir,
          "gradlew"
        );

      if (
        !fs.existsSync(
          gradlePath
        )
      ) {

        resolve({
          success: false,
          output:
            "gradlew non trovato nel progetto Android."
        });

        return;
      }

      try {

        fs.chmodSync(
          gradlePath,
          0o755
        );

      } catch {}

      execFile(
        gradlePath,
        [
          "assembleDebug",
          "--no-daemon",
          "--stacktrace"
        ],
        {
          cwd: projectDir,
          env: {
            ...process.env,
            JAVA_HOME:
              process.env.JAVA_HOME
          },
          maxBuffer:
            20 * 1024 * 1024
        },
        (
          error,
          stdout,
          stderr
        ) => {

          const output =
            [
              stdout || "",
              stderr || ""
            ].join("\n");

          if (error) {

            resolve({
              success: false,
              output
            });

            return;
          }

          resolve({
            success: true,
            output
          });
        }
      );
    }
  );
}


/* =========================================
   CERCA APK
========================================= */

function findApk(dir) {

  let found = null;

  function scan(current) {

    if (found) {
      return;
    }

    if (
      !fs.existsSync(current)
    ) {
      return;
    }

    const entries =
      fs.readdirSync(
        current,
        {
          withFileTypes: true
        }
      );

    for (
      const entry of entries
    ) {

      const fullPath =
        path.join(
          current,
          entry.name
        );

      if (
        entry.isDirectory()
      ) {

        scan(fullPath);

      } else if (
        entry.isFile() &&
        entry.name.endsWith(
          ".apk"
        )
      ) {

        found = fullPath;

        return;
      }
    }
  }

  scan(dir);

  return found;
}


/* =========================================
   NOME FILE
========================================= */

function safeFileName(name) {

  return String(name)
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    ) || "Web2APK";
}


/* =========================================
   SERVER
========================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log(
      `Web2APK backend avviato sulla porta ${PORT}`
    );

  }
);
