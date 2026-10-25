/**
 * 便携包打包：产出 dist-portable/commprobe-v<版本>-<目标>.zip
 * 包内嵌 Node 运行时（runtime/）+ 生产依赖（node_modules/）+ 界面（web/dist），
 * 目标机器解压后双击 start-windows.bat / start-mac.command 即用，无需安装 Node。
 *
 * 用法：
 *   node scripts/pack.mjs [--target win-x64|mac-arm64|mac-x64] [--node-version v22.x.y]
 * 默认 target 为当前平台；默认 Node 版本自动取 v22 LTS 最新。
 * 依赖本机命令：zip / unzip / tar（macOS、Linux 自带）。
 */
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const OUT_DIR = join(ROOT, "dist-portable");
const CACHE = join(OUT_DIR, ".cache");
const MIRROR = process.env.NODE_MIRROR ?? "https://registry.npmmirror.com/-/binary/node";

const TARGETS = {
  "win-x64": {
    archive: (v) => `node-${v}-win-x64.zip`,
    os: "win",
    arch: "x64",
    launcher: "start-windows.bat",
  },
  "mac-arm64": {
    archive: (v) => `node-${v}-darwin-arm64.tar.gz`,
    os: "mac",
    arch: "arm64",
    launcher: "start-mac.command",
  },
  "mac-x64": {
    archive: (v) => `node-${v}-darwin-x64.tar.gz`,
    os: "mac",
    arch: "x64",
    launcher: "start-mac.command",
  },
};

function parseArgs(argv) {
  const opts = {
    target: process.platform === "darwin" && process.arch === "arm64" ? "mac-arm64" : "win-x64",
    nodeVersion: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--target") opts.target = argv[++i];
    else if (argv[i] === "--node-version") opts.nodeVersion = argv[++i];
  }
  if (!(opts.target in TARGETS))
    throw new Error(`未知 target：${opts.target}（可选 ${Object.keys(TARGETS).join(" / ")}）`);
  return opts;
}

async function resolveNodeVersion() {
  const res = await fetch(`${MIRROR}/index.json`);
  if (!res.ok) throw new Error(`获取 Node 版本列表失败：HTTP ${res.status}（${MIRROR}）`);
  const list = await res.json();
  const lts22 = list.find((e) => e.version.startsWith("v22.") && e.lts);
  if (!lts22) throw new Error("镜像中未找到 v22 LTS 版本");
  return lts22.version;
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败：HTTP ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(file));
}

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: "inherit", ...opts });
}

function walkSync(path) {
  const out = [];
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isDirectory()) out.push(...walkSync(full));
    else out.push(full);
  }
  return out;
}

function dirSize(path) {
  let total = 0;
  for (const entry of walkSync(path)) total += statSync(entry).size;
  return total;
}

function human(bytes) {
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rootPkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const serverPkg = JSON.parse(readFileSync(join(ROOT, "server", "package.json"), "utf8"));
  const nodeVersion = opts.nodeVersion ?? (await resolveNodeVersion());
  const target = TARGETS[opts.target];

  // 1. 前置检查：构建产物必须存在
  for (const required of ["server/dist/index.js", "web/dist/index.html"]) {
    if (!existsSync(join(ROOT, required))) {
      throw new Error(`缺少 ${required}：请先执行 npm run build`);
    }
  }

  // 2. 组装目录（与仓库同构，保证相对路径解析）
  const stage = join(OUT_DIR, "commprobe");
  rmSync(stage, { recursive: true, force: true });
  mkdirSync(join(stage, "server"), { recursive: true });
  mkdirSync(join(stage, "web"), { recursive: true });
  mkdirSync(join(stage, "runtime"), { recursive: true });
  cpSync(join(ROOT, "server", "dist"), join(stage, "server", "dist"), { recursive: true });
  cpSync(join(ROOT, "web", "dist"), join(stage, "web", "dist"), { recursive: true });
  writeFileSync(
    join(stage, "package.json"),
    JSON.stringify(
      {
        name: "commprobe-portable",
        version: rootPkg.version,
        private: true,
        type: "module",
        dependencies: serverPkg.dependencies,
        optionalDependencies: serverPkg.optionalDependencies,
      },
      null,
      2,
    ),
  );

  // 3. 生产依赖
  // @serialport/bindings-cpp 自 v12 起在包内 prebuilds/ 目录内置全平台预编译二进制，
  // 运行时按平台自选，因此任意平台上安装即可产出全平台可用的包，无需交叉参数。
  console.log("[pack] 安装生产依赖…");
  run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: stage,
  });

  // 4. 内嵌 Node 运行时
  mkdirSync(CACHE, { recursive: true });
  const archiveName = target.archive(nodeVersion);
  const archivePath = join(CACHE, archiveName);
  if (!existsSync(archivePath)) {
    const url = `${MIRROR}/${nodeVersion}/${archiveName}`;
    console.log(`[pack] 下载 Node ${nodeVersion}：${url}`);
    await download(url, archivePath);
  }
  if (target.os === "win") {
    run("unzip", ["-o", "-q", "-j", archivePath, "*/node.exe", "-d", join(stage, "runtime")]);
  } else {
    const tmp = join(tmpdir(), `commprobe-node-${Date.now()}`);
    mkdirSync(tmp, { recursive: true });
    run("tar", ["-xzf", archivePath, "-C", tmp]);
    const inner = readdirSync(tmp).find((n) => n.startsWith(`node-${nodeVersion}`));
    if (!inner) throw new Error("解压 Node 归档后未找到目录");
    cpSync(join(tmp, inner, "bin", "node"), join(stage, "runtime", "node"));
    chmodSync(join(stage, "runtime", "node"), 0o755);
    rmSync(tmp, { recursive: true, force: true });
  }

  // 5. 启动器 + 说明
  cpSync(join(ROOT, "launch", target.launcher), join(stage, target.launcher));
  if (target.os !== "win") chmodSync(join(stage, target.launcher), 0o755);
  writeFileSync(
    join(stage, "使用说明.txt"),
    [
      "CommProbe 跨平台联调工具（TCP / UDP / 串口）",
      "",
      "1. 解压整个目录后，双击：",
      `   ${target.os === "win" ? "start-windows.bat（Windows 首次运行请在防火墙弹窗中允许访问）" : 'start-mac.command（首次若提示"无法验证的开发者"：右键文件→打开→再点打开，或到 系统设置→隐私与安全性 点"仍要打开"；仅需一次）'}`,
      "2. 浏览器自动打开界面（http://localhost:7717），关闭启动窗口即退出。",
      "3. 本包已内嵌 Node 运行时，无需安装任何依赖。",
      `4. 会话录制默认开启，文件在 ~/.commprobe/sessions/。`,
      "",
      `commprobe v${rootPkg.version} · ${opts.target} · Node ${nodeVersion}`,
      "",
    ].join("\n"),
  );

  // 6. 打 zip
  const zipName = `commprobe-v${rootPkg.version}-${opts.target}.zip`;
  rmSync(join(OUT_DIR, zipName), { force: true });
  run("zip", ["-r", "-y", "-q", zipName, "commprobe"], { cwd: OUT_DIR });
  console.log(
    `[pack] 完成：${join(OUT_DIR, zipName)}（${human(statSync(join(OUT_DIR, zipName)).size)}，解压后约 ${human(dirSize(stage))}）`,
  );
}

main().catch((err) => {
  console.error("[pack] 失败：", err.message);
  process.exit(1);
});
