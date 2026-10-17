# Linux UI performance debug runbook

Use this runbook when Chrome/browser preview is smooth but the Linux Tauri desktop app stutters during drag, zoom, timeline show/hide, or window resize. All switches below are opt-in; default performance mode and debug overlay stay disabled.

## Runtime comparison matrix

Test the same project, display, monitor scale/refresh rate, and interaction in this order before changing frontend code:

| Mode | Dev command | Local install command | Runtime path being checked | Use when |
|------|-------------|-----------------------|----------------------------|----------|
| Default | `pnpm tauri dev` | `mova` | Current app default; on Wayland the app sets `WEBKIT_DISABLE_DMABUF_RENDERER=1` unless `MOVA_ENABLE_LINUX_DMABUF=1` or `WEBKIT_DISABLE_DMABUF_RENDERER` is already explicit | Establish baseline and confirm the issue is desktop-only |
| Fast / DMABuf | `pnpm tauri:dev:linux-fast` | `mova-fast` | Allows/enables the WebKitGTK DMABuf path | Check whether GPU buffer import improves canvas/timeline responsiveness |
| Compat / CPU | `pnpm tauri:dev:linux-compat` | `mova-compat` | Disables WebKit compositing mode and DMABuf renderer | Check whether accelerated compositing or DMABuf is causing jank/artifacts |
| X11 compat | `pnpm tauri:dev:linux-x11` | `mova-x11` | Forces `GDK_BACKEND=x11` plus compat rendering flags | Compare Wayland vs XWayland/X11 behavior |
| Force compositing | `pnpm tauri:dev:linux-force-compositing` | `mova-force-compositing` | Keeps compositing enabled while disabling DMABuf | Isolate compositing from the DMABuf renderer |

Collect these details with each result: distro/version, desktop environment and compositor, session type (`echo $XDG_SESSION_TYPE`), GPU model/driver (`lspci -k | grep -A3 -E 'VGA|3D|Display'`), WebKitGTK package version (`dpkg -l | grep -E 'webkit2gtk|webkitgtk'` or distro equivalent), monitor scale/refresh rate, command used, and whether drag/zoom/timeline interactions are smooth, janky, or visually corrupted.

## Optional frontend lite/performance mode

Mova supports an opt-in frontend-only lite mode for Linux WebKitGTK repaint/jank checks. It softens expensive shadows, makes transition timing nearly instant, and stops pulse animations. Default visuals stay unchanged unless you enable it.

Enable it in either way:

```text
# one-shot via URL query
http://localhost:5173/?mova_perf_mode=lite

# persistent via devtools console / localStorage
localStorage.setItem("mova.performanceMode", "lite")
location.reload()
```

Disable storage mode:

```js
localStorage.removeItem("mova.performanceMode")
location.reload()
```

Use lite mode while comparing browser (`pnpm dev`) versus Tauri (`pnpm tauri dev` or one of the Linux runtime modes) to confirm whether shadow/animation cost contributes to stutter.

## Optional diagnostic overlay

Mova also includes a lightweight browser-side diagnostic overlay. It is disabled by default and adds no dependency.

Enable for the current URL:

```text
?mova_perf_debug=1
```

Enable through browser devtools / WebView console storage:

```js
localStorage.setItem("mova.perfDebug", "1")
location.reload()
```

Disable storage mode:

```js
localStorage.removeItem("mova.perfDebug")
location.reload()
```

A query value overrides storage for that page load, so `?mova_perf_debug=0` can temporarily suppress the overlay even if storage is enabled.

The overlay reports:

- `rAF FPS`: approximate frames per second from a continuous `requestAnimationFrame` loop.
- `resize`: resize events per second in the last sample window, plus total resize events since enablement.
- `longtask`: total Long Task entries when `PerformanceObserver` supports `longtask`; otherwise `unsupported`.

The overlay is fixed in the lower-right corner and uses `pointer-events: none` so it does not block normal interaction. A startup line is also written to the console when enabled.

## Chrome dev server comparison

1. Record system information:

   ```bash
   uname -a
   lsb_release -a 2>/dev/null || cat /etc/os-release
   echo "XDG_SESSION_TYPE=$XDG_SESSION_TYPE"
   echo "GDK_BACKEND=$GDK_BACKEND"
   glxinfo -B 2>/dev/null || true
   ```

2. Start frontend only:

   ```bash
   pnpm dev
   ```

3. Open Chrome/Chromium at one of these URLs:

   ```text
   http://localhost:5173/
   http://localhost:5173/?mova_perf_mode=lite&mova_perf_debug=1
   ```

4. Record:
   - Chrome/Chromium version from `chrome://version`.
   - Whether hardware acceleration is enabled.
   - Mova commit / branch.
   - Scenario name and exact steps, for example: create/open project, resize the window for 10 seconds, pan/zoom canvas, scrub timeline, open chat.
   - Overlay values before the scenario, during the scenario, and after returning to idle.

## Tauri Linux desktop comparison

1. Record the same system information as above.
2. Record the launch mode, for example:

   ```bash
   pnpm tauri dev
   pnpm tauri:dev:linux-fast
   pnpm tauri:dev:linux-compat
   pnpm tauri:dev:linux-x11
   pnpm tauri:dev:linux-force-compositing
   ```

3. Enable optional modes as needed:
   - If using the dev server window URL, add `?mova_perf_debug=1` and/or `?mova_perf_mode=lite` to the loaded URL when possible.
   - Or open the WebView devtools console, set `localStorage` values (`mova.perfDebug`, `mova.performanceMode`), then reload the app window.

4. Run the same scenario script used in Chrome. Keep window size, monitor, scaling, backend (`Wayland`/`X11`), and environment variables consistent where possible.
5. Record overlay samples and any visible symptoms such as resize stutter, delayed input, canvas jank, artifacts, or Long Task increases.

## Reporting template

```text
Date/time:
Commit/branch:
System: distro, kernel, CPU, GPU, driver
Session: XDG_SESSION_TYPE, display server, monitor scale/refresh
Launch mode: Chrome dev server / pnpm tauri dev / linux-fast / linux-compat / linux-x11 / linux-force-compositing / env vars
Frontend options: default / mova_perf_mode=lite / mova_perf_debug=1
Scenario steps:
Idle overlay: rAF FPS, resize/s, longtask count/support
During scenario overlay:
After scenario overlay:
Observed symptoms:
Notes/screenshots/logs:
```

Use the same template for each branch so regressions can be compared from consistent evidence rather than subjective smoothness alone.
