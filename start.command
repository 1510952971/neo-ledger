#!/bin/zsh
# Neo Ledger 一键启动器：双击 → 自检环境 → 启动服务 → 自动打开浏览器。
# 保持窗口开启即在运行；按 Ctrl+C 停止。

set -u

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR" || exit 1

APP_URL="http://localhost:3000"
REQUIRED_NODE_MAJOR=22
REQUIRED_NODE_MINOR=13

clear
echo "Neo Ledger"
echo "=========="
echo

pause_exit() {
  echo
  read "?按回车键退出..."
  exit 1
}

# ---------- 1. 环境自检 ----------
if ! command -v node >/dev/null 2>&1; then
  echo "错误：没有找到 Node.js。"
  echo "请先从 https://nodejs.org 安装 Node.js ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR} 或更高版本。"
  pause_exit
fi

NODE_VERSION="$(node --version | tr -d 'v')"
NODE_MAJOR="${NODE_VERSION%%.*}"
NODE_REST="${NODE_VERSION#*.}"
NODE_MINOR="${NODE_REST%%.*}"
if (( NODE_MAJOR < REQUIRED_NODE_MAJOR )) || { (( NODE_MAJOR == REQUIRED_NODE_MAJOR )) && (( NODE_MINOR < REQUIRED_NODE_MINOR )); }; then
  echo "错误：Node.js 版本过低（当前 v${NODE_VERSION}，需要 ≥ ${REQUIRED_NODE_MAJOR}.${REQUIRED_NODE_MINOR}）。"
  echo "请从 https://nodejs.org 升级后重试。"
  pause_exit
fi
echo "Node.js v${NODE_VERSION} ✓"

for tool in git sqlite3; do
  if command -v "$tool" >/dev/null 2>&1; then
    echo "$tool ✓"
  else
    echo "提示：未找到 $tool。程序可以运行，但\"一键升级/数据库备份\"功能需要它。"
  fi
done

# ---------- 2. 依赖安装（仅首次或依赖变化时） ----------
if [[ ! -d node_modules ]] || [[ package.json -nt node_modules ]]; then
  echo
  echo "正在安装依赖（首次运行需要几分钟，取决于网络）..."
  npm install || {
    echo "依赖安装失败，请检查网络后重试。"
    pause_exit
  }
fi

# ---------- 3. 已在运行则直接打开浏览器 ----------
if lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo
  echo "检测到 Neo Ledger 已在运行，直接打开浏览器。"
  open "$APP_URL"
  exit 0
fi

# ---------- 4. 启动并在就绪后自动打开浏览器 ----------
echo
echo "正在启动 Neo Ledger ..."
echo "就绪后浏览器会自动打开：$APP_URL"
echo "保持此窗口运行；按 Ctrl+C 停止。"
echo

(
  for _ in {1..90}; do
    sleep 2
    if curl -sf -o /dev/null "$APP_URL"; then
      open "$APP_URL"
      exit 0
    fi
  done
) &

exec npm run dev
