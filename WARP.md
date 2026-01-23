# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

AutoGLM-GUI is a modern web GUI for the AutoGLM Phone Agent. It provides AI-driven Android automation via a FastAPI backend, a React (TanStack Router + Tailwind CSS) frontend, and an optional Electron desktop wrapper. The app integrates tightly with ADB and scrcpy to control and stream Android devices, supports multiple agent modes (classic, layered), and adds this fork's features such as scheduled tasks and Douyin (TikTok) comment workflows.

Top-level layout (simplified):

- `AutoGLM_GUI/`: Python package with FastAPI app, Socket.IO server, device/agent management, scrcpy video streaming, config + logging.
- `frontend/`: React 19 app (Vite + TanStack Router) for the web UI.
- `electron/`: Electron shell bundling backend + ADB + frontend into desktop apps.
- `docs/`: Docusaurus documentation site for end users and contributors.
- `scripts/`: Python helper scripts for building, linting, packaging, and Electron builds.
- `tests/`: Pytest-based tests, including Docker E2E integration using a remote mock device.

## Core Commands

### Environment & Backend

All Python work should be done via `uv`, not bare `python`.

```bash
# Install Python dependencies (from repo root)
uv sync

# Run backend in dev mode with auto-reload
uv run autoglm-gui --base-url http://localhost:8080/v1 --reload

# Run backend in normal mode (example using local model API)
uv run autoglm-gui --base-url http://localhost:8080/v1

# Run backend with custom logging options (examples)
uv run autoglm-gui --base-url http://localhost:8080/v1 --log-level DEBUG
uv run autoglm-gui --base-url http://localhost:8080/v1 --no-log-file
uv run autoglm-gui --base-url http://localhost:8080/v1 --log-file logs/custom.log
```

Configuration is normally stored in `~/.config/autoglm/config.json` and can be overridden by CLI flags like `--base-url`, `--model`, and `--apikey`.

### Frontend (Web UI)

```bash
# Install frontend deps
cd frontend && pnpm install

# Dev server with hot reload (default port 3000)
cd frontend && pnpm dev

# Type-check, lint, and format
cd frontend && pnpm type-check
cd frontend && pnpm lint
cd frontend && pnpm lint:fix
cd frontend && pnpm format
cd frontend && pnpm format:check

# Production build (used by backend static files build script)
cd frontend && pnpm build
```

### Build & Packaging (Backend + Static Frontend)

The backend serves the compiled frontend from `AutoGLM_GUI/static/`. You must build the frontend at least once before packaging or running from source in production-like mode.

```bash
# Build frontend and copy into Python package static dir
uv run python scripts/build.py

# Build frontend and create Python distribution artifacts (wheel/sdist)
uv run python scripts/build.py --pack

# Test the built wheel locally
uvx --from dist/autoglm_gui-*.whl autoglm-gui

# Publish to PyPI (maintainers only)
uv publish
```

### Linting (Strict)

Linting is enforced across Python and TypeScript code. All errors and warnings must be fixed.

```bash
# Run full lint suite (Python + TS/ESLint + Pyright + Ruff)
uv run python scripts/lint.py
```

The expectation is "0 errors, 0 warnings" before merging changes.

### Tests

Pytest is used for backend and integration tests.

```bash
# Run all tests
uv run pytest

# Run a specific test file
uv run pytest tests/integration/test_docker_e2e.py -v -s

# Run a single test (pytest targeting pattern)
uv run pytest path/to/test_file.py::TestClass::test_case
```

For Docker-based E2E tests with the mock remote device, see `tests/integration/DOCKER_E2E.md` for the full flow (starting the mock agent, building the Docker image, and wiring `REMOTE_DEVICE_BASE_URL`).

### Electron Desktop App

Electron bundles the Python backend, frontend, and ADB into a standalone desktop application.

```bash
# One-click build (frontend + backend + ADB + Electron installers)
uv run python scripts/build_electron.py

# Faster incremental builds (skip already-prepared parts)
uv run python scripts/build_electron.py --skip-frontend
uv run python scripts/build_electron.py --skip-adb
uv run python scripts/build_electron.py --skip-backend

# Develop Electron shell against a running backend
cd electron && npm install
cd electron && npm run dev

# Build Electron-only installers (requires prepared resources)
cd electron && npm run build
# Or platform-specific
cd electron && npm run build:win
cd electron && npm run build:mac
cd electron && npm run build:linux
```

Electron auto-update is wired via `electron-updater` against GitHub Releases; logs can be inspected with the built app's DevTools console.

### Documentation Site (Docusaurus)

The `docs/` directory hosts a Docusaurus site with user and developer docs.

```bash
cd docs

# Install docs dependencies
yarn

# Local docs dev server
yarn start

# Build static docs site
yarn build

# Deploy (GitHub Pages workflow)
USE_SSH=true yarn deploy
# or
GIT_USER=<your-github-username> yarn deploy
```

## High-Level Architecture

### Backend (AutoGLM_GUI)

The backend is a modular FastAPI application with Socket.IO for real-time video streaming and SSE for streaming agent output.

Key concepts:

- **FastAPI app & routers** (in `AutoGLM_GUI/api/`):
  - `agents.py`: lifecycle for single-agent flows (init, chat, reset, abort, status).
  - `layered_agent.py`: hierarchical "layered agent" API where a decision model plans and a vision agent executes.
  - `devices.py`: device discovery & management (USB/WiFi ADB, mDNS, QR pairing).
  - `control.py`: direct low-level control (tap/swipe/screenshot without full agent).
  - `media.py`: screenshot/video-related endpoints.
  - `metrics.py`: Prometheus metrics.
  - `version.py`: version and health.
  - `workflows.py`: saved workflow execution endpoints.

- **Server entrypoints**:
  - `AutoGLM_GUI.__main__:main` is exposed as the `autoglm-gui` console script.
  - `server.py` wires FastAPI with Socket.IO for H.264 streaming.

- **Configuration & logging**:
  - `config_manager.py` manages `~/.config/autoglm/config.json` with Pydantic models and mtime-based hot reload.
  - CLI args override config file; environment variables (`AUTOGLM_BASE_URL`, `AUTOGLM_MODEL_NAME`, `AUTOGLM_API_KEY`) provide defaults.
  - `logger.py` wraps Loguru to set up structured console logs and rotated log files in `logs/`.

- **Device & agent management**:
  - `device_manager.py` discovers devices via ADB (USB/WiFi) and mDNS, aggregating connections by stable hardware serial while exposing a dynamic `device_id` used by API calls.
  - `phone_agent_manager.py` is the single source of truth for agent instances and configs, indexed by `device_id` and protected by per-device locks.
    - Provides context managers like `use_agent(device_id)` to ensure only one task runs per device at a time.
    - Agent state is fully encapsulated in this manager (no global mutable state access).

- **Model / agent layer** (`AutoGLM_GUI/agents/`):
  - Defines common protocols (`BaseAgent`, `AsyncAgent`) and a registry-based factory.
  - GLM-based agents (sync + async) integrate with OpenAI-compatible APIs for both classic and layered modes.
  - MAI Agent implementation provides a richer multi-image mobile agent, fully internalized to this package.

- **Video streaming**:
  - `scrcpy_stream.py` manages the scrcpy server (bundled `scrcpy-server-v3.3.3`), connects to its TCP stream, caches SPS/PPS/IDR frames, and feeds H.264 NAL units.
  - `socketio_server.py` publishes metadata and H.264 data via Socket.IO events (`video-data`, `video-metadata`).
  - The frontend `ScrcpyPlayer` consumes this stream and renders to canvas using WebCodecs or a JS decoder.

- **ADB utilities** (`AutoGLM_GUI/adb_plus/` and `platform_utils.py`):
  - Abstract and centralize all ADB/HDC shell commands and cross-platform subprocess behavior.
  - Provide primitives for screenshots, touch events, IP detection, QR pairing, and ADB keyboard auto-setup.

### Device Abstraction & Remote Devices

A central design goal is to decouple "what the agent wants to do" from "how to talk to a device" via a protocol layer:

- **DeviceProtocol** (`device_protocol.py`): a typed interface for core actions such as `get_screenshot`, `tap`, `swipe`, `type_text`, `back`, `home`, `launch_app`, and ADB keyboard management.
- **DeviceProtocolAdapter** bridges the third-party `phone_agent` engine's `DeviceFactory` to project-specific implementations.
- **Implementations** (Layer 3 in `devices/`):
  - `ADBDevice`: local device over ADB (USB/WiFi/mDNS), using subprocess calls.
  - `RemoteDevice`: HTTP client that talks to a remote "device agent" FastAPI service (used in Docker E2E and potential remote farms).
  - `MockDevice`: in-memory state machine for integration tests.

When `REMOTE_DEVICE_BASE_URL` is set, the backend injects `RemoteDevice` so agent actions become HTTP calls to a remote device agent instead of local ADB. In this mode, ADB keyboard installation is skipped and the remote server takes responsibility for actual control.

### Frontend Architecture (`frontend/`)

The frontend is a Vite-powered React 19 app with TanStack Router and Tailwind CSS 4, focused on three main areas: device management, agent chat, and workflows.

- **Routing (file-based TanStack Router)**:
  - Root layout (`__root.tsx`) handles theme, i18n, and global shell (sidebar, error boundaries).
  - Primary routes include:
    - `/chat`: main multi-mode chat + device control interface.
    - `/workflows`: management of saved workflows.
    - `/about` and additional informational pages as needed.

- **Key components**:
  - `ScrcpyPlayer.tsx`: H.264 video player driven by Socket.IO, using the `@yume-chan/scrcpy` WebCodecs decoder and handling coordinate mapping and click ripple effects.
  - `ChatKitPanel.tsx`: core chat UI supporting classic and layered agent modes with streaming output.
  - `DevicePanel.tsx`: per-device configuration and initialization (model/base URL/API key, agent type, history settings).
  - `DeviceSidebar.tsx`: device list, connection status, WiFi & QR pairing, and discovery controls.
  - `api.ts`: thin client around `redaxios` for calling backend APIs.

The UI is heavily integrated with the backend's agent and device endpoints and assumes the scrcpy streaming and ADB subsystems are functioning.

### Electron Desktop App (`electron/`)

Electron wraps the backend and frontend into a cross-platform desktop application:

- `main.js` (main process) is responsible for:
  - Spawning and monitoring the bundled backend (PyInstaller output) on a dynamic port range (8000–8100).
  - Setting up environment variables and ADB paths.
  - Handling app lifecycle and error dialogs.
  - Wiring `electron-updater` for auto-update from GitHub Releases.

- `preload.js` exposes limited APIs to the renderer under context isolation.
- `afterPack.js` adjusts file permissions for bundled ADB and backend binaries on macOS/Linux.
- `electron-builder.yml` describes targets (DMG/NSIS/AppImage/DEB/tar.gz) and auto-update metadata.

The build pipeline (`scripts/build_electron.py`) orchestrates frontend build, backend packaging (PyInstaller), ADB asset download, and final Electron builds.

### Documentation & Website (`docs/`)

The Docusaurus site provides user and contributor documentation:

- `docs/docs/*.md` covers installation, quick start, configuration, development, and advanced topics like this fork's scheduled tasks and Douyin automations.
- `docs/REMOTE_DEVICE_ARCHITECTURE.md` documents the multi-layer device abstraction and remote device architecture (DeviceProtocol, RemoteDevice, mock agent, connection types).

## Additional Notes for Agents

- Always prefer existing abstractions:
  - Use `platform_utils.py` and `adb_plus` helpers instead of adding raw `subprocess` calls to `adb`.
  - Go through `PhoneAgentManager` and `DeviceManager` instead of introducing new global state.
- If you change how coordinates, screenshots, or device IDs work, review the lessons learned section in `CLAUDE.md` and related integration tests under `tests/integration/` to avoid subtle regressions.
- When adding new configuration or CLI behavior, keep `config_manager.py`, `__main__.py`, and the docs (`docs/docs/configuration.md`) in sync.
