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


/* =========================================================
   HOME / HEALTH
   ========================================================= */

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


/* =========================================================
   BUILD APK
   ========================================================= */

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


      /* -----------------------------------------------------
         DATI APP
      ----------------------------------------------------- */

      const appName =
        req.body.appName?.trim() ||
        "La mia app";

      const packageName =
        req.body.packageName?.trim() ||
        "com.web2apk.miaapp";

      const version =
        req.body.version?.trim() ||
        "1.0.0";

      const versionCode =
        req.body.versionCode?.trim() ||
        "1";

      const orientation =
        req.body.orientation ||
        "portrait";

      const internet =
        req.body.internet === "true";

      const javascript =
        req.body.javascript === "true";

      const fullscreen =
        req.body.fullscreen === "true";

      const externalLinks =
        req.body.externalLinks === "true";

      const keepScreenOn =
        req.body.keepScreenOn === "true";


      console.log("");
      console.log("======================================");
      console.log("          WEB2APK BUILD");
      console.log("======================================");
      console.log("Build ID:", buildId);
      console.log("App:", appName);
      console.log("Package:", packageName);
      console.log("Version:", version);
      console.log("Version code:", versionCode);
      console.log("Orientation:", orientation);
      console.log("Internet:", internet);
      console.log("JavaScript:", javascript);
      console.log("Fullscreen:", fullscreen);
      console.log("External links:", externalLinks);
      console.log("Keep screen on:", keepScreenOn);
      console.log("======================================");


      /* -----------------------------------------------------
         VALIDAZIONE PACKAGE NAME
      ----------------------------------------------------- */

      if (
        !/^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(
          packageName
        )
      ) {

        return res.status(400).json({
          error:
            "Package name non valido. Esempio: com.web2apk.miaapp"
        });
      }


      /* -----------------------------------------------------
         CARTELLA TEMPORANEA
      ----------------------------------------------------- */

      projectDir = path.join(
        os.tmpdir(),
        `web2apk-${buildId}`
      );

      fs.mkdirSync(
        projectDir,
        {
          recursive: true
        }
      );


      /* -----------------------------------------------------
         CARTELLA WEB
      ----------------------------------------------------- */

      const wwwDir = path.join(
        projectDir,
        "www"
      );

      fs.mkdirSync(
        wwwDir,
        {
          recursive: true
        }
      );


      /* -----------------------------------------------------
         HTML
      ----------------------------------------------------- */

      fs.writeFileSync(
        path.join(
          wwwDir,
          "index.html"
        ),
        req.body.html,
        "utf8"
      );

      console.log(
        "[WEB] HTML copiato."
      );


      /* -----------------------------------------------------
         CONFIGURAZIONE CAPACITOR
      ----------------------------------------------------- */

      const capacitorConfig = {
        appId: packageName,
        appName: appName,
        webDir: "www",
        bundledWebRuntime: false
      };

      fs.writeFileSync(
        path.join(
          projectDir,
          "capacitor.config.json"
        ),
        JSON.stringify(
          capacitorConfig,
          null,
          2
        ),
        "utf8"
      );

      console.log(
        "[CAPACITOR] Configurazione creata."
      );


      /* -----------------------------------------------------
         PACKAGE JSON DEL PROGETTO GENERATO
      ----------------------------------------------------- */

      const generatedPackage = {
        name: "web2apk-generated-app",
        version: "1.0.0",
        private: true,
        dependencies: {
          "@capacitor/android": "^7.4.3",
          "@capacitor/core": "^7.4.3"
        }
      };

      fs.writeFileSync(
        path.join(
          projectDir,
          "package.json"
        ),
        JSON.stringify(
          generatedPackage,
          null,
          2
        ),
        "utf8"
      );


      console.log(
        "[NPM] Installazione dipendenze Capacitor..."
      );


      /* -----------------------------------------------------
         NPM INSTALL
      ----------------------------------------------------- */

      const npmInstall =
        await runCommand(
          "npm",
          [
            "install",
            "--no-audit",
            "--no-fund"
          ],
          projectDir
        );


      if (!npmInstall.success) {

        throw new Error(
          "Installazione dipendenze fallita.\n\n" +
          npmInstall.output
        );
      }


      console.log(
        "[NPM] Dipendenze installate."
      );


      /* -----------------------------------------------------
         CAPACITOR CLI
      ----------------------------------------------------- */

      console.log(
        "[CAPACITOR] Creazione progetto Android..."
      );


      const capAdd =
        await runCommand(
          "npx",
          [
            "cap",
            "add",
            "android"
          ],
          projectDir
        );


      if (!capAdd.success) {

        throw new Error(
          "Creazione progetto Android fallita.\n\n" +
          capAdd.output
        );
      }


      console.log(
        "[CAPACITOR] Progetto Android creato."
      );


      /* -----------------------------------------------------
         COPIA WEB
      ----------------------------------------------------- */

      console.log(
        "[CAPACITOR] Copia dei file web..."
      );


      const capCopy =
        await runCommand(
          "npx",
          [
            "cap",
            "copy",
            "android"
          ],
          projectDir
        );


      if (!capCopy.success) {

        throw new Error(
          "Copia dei file web fallita.\n\n" +
          capCopy.output
        );
      }


      console.log(
        "[CAPACITOR] File web copiati."
      );


      /* -----------------------------------------------------
         CONFIGURAZIONE ANDROID
      ----------------------------------------------------- */

      await configureAndroid(
        projectDir,
        {
          appName,
          version,
          versionCode,
          orientation,
          internet,
          javascript,
          fullscreen,
          externalLinks,
          keepScreenOn
        }
      );


      /* -----------------------------------------------------
         ICONA
      ----------------------------------------------------- */

      if (req.file) {

        console.log(
          "[ICONA] Installazione icona..."
        );

        await installIcon(
          projectDir,
          req.file.path
        );

        console.log(
          "[ICONA] Icona installata."
        );
      }


      /* -----------------------------------------------------
         GRADLE
      ----------------------------------------------------- */

      const androidDir =
        path.join(
          projectDir,
          "android"
        );


      const gradlew =
        path.join(
          androidDir,
          "gradlew"
        );


      if (
        !fs.existsSync(
          gradlew
        )
      ) {

        throw new Error(
          "Gradle wrapper non trovato."
        );
      }


      try {

        fs.chmodSync(
          gradlew,
          0o755
        );

      } catch {}


      console.log("");
      console.log(
        "======================================"
      );
      console.log(
        "       AVVIO BUILD GRADLE"
      );
      console.log(
        "======================================"
      );


      const gradle =
        await runCommand(
          "./gradlew",
          [
            "assembleDebug",
            "--no-daemon",
            "--stacktrace"
          ],
          androidDir
        );


      if (!gradle.success) {

        throw new Error(
          "Build Gradle fallita.\n\n" +
          gradle.output
        );
      }


      console.log(
        "======================================"
      );

      console.log(
        "       BUILD GRADLE COMPLETATA"
      );

      console.log(
        "======================================"
      );


      /* -----------------------------------------------------
         CERCA APK
      ----------------------------------------------------- */

      const apkPath =
        findApk(
          androidDir
        );


      if (!apkPath) {

        throw new Error(
          "Gradle ha terminato senza produrre un APK."
        );
      }


      console.log(
        "[APK] Trovato:",
        apkPath
      );


      /* -----------------------------------------------------
         VERIFICA APK
      ----------------------------------------------------- */

      const apkBuffer =
        fs.readFileSync(
          apkPath
        );


      if (
        !isZip(apkBuffer)
      ) {

        throw new Error(
          "Il file prodotto non è un APK valido."
        );
      }


      if (
        apkBuffer.length < 10000
      ) {

        throw new Error(
          "L'APK prodotto è troppo piccolo e non sembra valido."
        );
      }


      console.log(
        "[APK] Dimensione:",
        apkBuffer.length,
        "bytes"
      );


      console.log(
        "[APK] Verifica completata."
      );


      /* -----------------------------------------------------
         RISPOSTA
      ----------------------------------------------------- */

      const filename =
        `${safeFileName(appName)}-${version}.apk`;


      res.status(200);

      res.setHeader(
        "Content-Type",
        "application/vnd.android.package-archive"
      );

      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
      );

      res.setHeader(
        "Content-Length",
        apkBuffer.length
      );


      res.send(
        apkBuffer
      );


      console.log(
        "[APK] APK inviato al browser."
      );


    } catch (error) {

      console.error("");
      console.error(
        "======================================"
      );
      console.error(
        "             BUILD ERROR"
      );
      console.error(
        "======================================"
      );
      console.error(
        error.message
      );


      if (!res.headersSent) {

        res.status(500).json({
          error:
            error.message ||
            "Errore durante la compilazione."
        });

      }


    } finally {

      /* -----------------------------------------------------
         PULIZIA
      ----------------------------------------------------- */

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
        fs.existsSync(
          req.file.path
        )
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


/* =========================================================
   CONFIGURAZIONE ANDROID
   ========================================================= */

async function configureAndroid(
  projectDir,
  settings
) {

  const androidDir =
    path.join(
      projectDir,
      "android"
    );


  const appDir =
    path.join(
      androidDir,
      "app"
    );


  const mainDir =
    path.join(
      appDir,
      "src",
      "main"
    );


  const manifestPath =
    path.join(
      mainDir,
      "AndroidManifest.xml"
    );


  if (
    fs.existsSync(
      manifestPath
    )
  ) {

    let manifest =
      fs.readFileSync(
        manifestPath,
        "utf8"
      );


    /* -----------------------------------------------------
       INTERNET
    ----------------------------------------------------- */

    if (
      settings.internet
    ) {

      if (
        !manifest.includes(
          "android.permission.INTERNET"
        )
      ) {

        manifest =
          manifest.replace(
            "<manifest",
            `<manifest\n    <uses-permission android:name="android.permission.INTERNET" />`
          );
      }
    }


    /* -----------------------------------------------------
       ORIENTAMENTO
    ----------------------------------------------------- */

    const orientationValue =
      settings.orientation ===
      "landscape"
        ? "landscape"
        : "portrait";


    manifest =
      manifest.replace(
        /<activity([^>]*)android:screenOrientation="[^"]*"/,
        `<activity$1android:screenOrientation="${orientationValue}"`
      );


    /* -----------------------------------------------------
       FULLSCREEN
    ----------------------------------------------------- */

    if (
      settings.fullscreen
    ) {

      manifest =
        manifest.replace(
          /<application([^>]*)>/,
          `<application$1 android:theme="@style/AppTheme">`
        );
    }


    fs.writeFileSync(
      manifestPath,
      manifest,
      "utf8"
    );
  }


  /* -------------------------------------------------------
     VERSIONE APP
  ------------------------------------------------------- */

  const buildGradlePath =
    path.join(
      appDir,
      "build.gradle"
    );

  const buildGradleKtsPath =
    path.join(
      appDir,
      "build.gradle.kts"
    );


  let gradlePath = null;


  if (
    fs.existsSync(
      buildGradlePath
    )
  ) {

    gradlePath =
      buildGradlePath;

  } else if (
    fs.existsSync(
      buildGradleKtsPath
    )
  ) {

    gradlePath =
      buildGradleKtsPath;
  }


  if (
    gradlePath
  ) {

    let gradle =
      fs.readFileSync(
        gradlePath,
        "utf8"
      );


    if (
      gradlePath.endsWith(
        ".gradle"
      )
    ) {

      gradle =
        gradle.replace(
          /versionCode\s+\d+/,
          `versionCode ${parseInt(settings.versionCode, 10) || 1}`
        );

      gradle =
        gradle.replace(
          /versionName\s+"[^"]*"/,
          `versionName "${escapeGradle(settings.version)}"`
        );

    } else {

      gradle =
        gradle.replace(
          /versionCode\s*=\s*\d+/,
          `versionCode = ${parseInt(settings.versionCode, 10) || 1}`
        );

      gradle =
        gradle.replace(
          /versionName\s*=\s*"[^"]*"/,
          `versionName = "${escapeGradle(settings.version)}"`
        );
    }


    fs.writeFileSync(
      gradlePath,
      gradle,
      "utf8"
    );
  }
}


/* =========================================================
   ICONA
   ========================================================= */

async function installIcon(
  projectDir,
  sourcePath
) {

  const androidRes =
    path.join(
      projectDir,
      "android",
      "app",
      "src",
      "main",
      "res"
    );


  if (
    !fs.existsSync(
      androidRes
    )
  ) {
    return;
  }


  const folders = [
    "mipmap-mdpi",
    "mipmap-hdpi",
    "mipmap-xhdpi",
    "mipmap-xxhdpi",
    "mipmap-xxxhdpi"
  ];


  for (
    const folder of folders
  ) {

    const destinationDir =
      path.join(
        androidRes,
        folder
      );


    if (
      !fs.existsSync(
        destinationDir
      )
    ) {

      fs.mkdirSync(
        destinationDir,
        {
          recursive: true
        }
      );
    }


    const destination =
      path.join(
        destinationDir,
        "ic_launcher.png"
      );


    fs.copyFileSync(
      sourcePath,
      destination
    );
  }
}


/* =========================================================
   ESECUZIONE COMANDI
   ========================================================= */

function runCommand(
  command,
  args,
  cwd
) {

  return new Promise(
    resolve => {

      console.log(
        `[CMD] ${command} ${args.join(" ")}`
      );


      execFile(
        command,
        args,
        {
          cwd,
          env: {
            ...process.env
          },
          maxBuffer:
            50 * 1024 * 1024
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
            ]
              .join("\n")
              .trim();


          if (output) {

            console.log(
              output
            );
          }


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


/* =========================================================
   CERCA APK
   ========================================================= */

function findApk(
  directory
) {

  let result = null;


  function scan(
    current
  ) {

    if (result) {
      return;
    }


    if (
      !fs.existsSync(
        current
      )
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

      const full =
        path.join(
          current,
          entry.name
        );


      if (
        entry.isDirectory()
      ) {

        scan(
          full
        );

      } else if (
        entry.isFile() &&
        entry.name.endsWith(
          ".apk"
        )
      ) {

        result =
          full;

        return;
      }
    }
  }


  scan(
    directory
  );


  return result;
}


/* =========================================================
   VERIFICA ZIP / APK
   ========================================================= */

function isZip(
  buffer
) {

  if (
    !buffer ||
    buffer.length < 4
  ) {
    return false;
  }


  return (
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x03 &&
      buffer[3] === 0x04
    ) ||
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x05 &&
      buffer[3] === 0x06
    ) ||
    (
      buffer[0] === 0x50 &&
      buffer[1] === 0x4b &&
      buffer[2] === 0x07 &&
      buffer[3] === 0x08
    )
  );
}


/* =========================================================
   NOME FILE SICURO
   ========================================================= */

function safeFileName(
  name
) {

  return String(name)
    .trim()
    .replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    ) ||
    "Web2APK";
}


/* =========================================================
   ESCAPE GRADLE
   ========================================================= */

function escapeGradle(
  value
) {

  return String(value)
    .replace(
      /\\/g,
      "\\\\"
    )
    .replace(
      /"/g,
      '\\"'
    );
}


/* =========================================================
   SERVER
   ========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "       WEB2APK BACKEND ONLINE"
    );
    console.log(
      "======================================"
    );
    console.log(
      `Porta: ${PORT}`
    );
    console.log(
      "API: POST /api/build"
    );
    console.log(
      "======================================"
    );
  }
);
