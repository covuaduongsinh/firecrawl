import { Plugin } from "vite";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

function findExecutable(names: string[], extraPaths: string[] = []): string | null {
  const userHome = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";

  const defaultCandidates: string[] = [];
  for (const name of names) {
    defaultCandidates.push(
      path.join(localAppData, "agy", "bin", `${name}.EXE`),
      path.join(localAppData, "agy", "bin", `${name}.exe`),
      path.join(userHome, ".local", "bin", `${name}.exe`),
      path.join(userHome, ".local", "bin", name),
      path.join(userHome, ".gemini", "bin", `${name}.exe`),
      path.join(userHome, ".gemini", "bin", name),
      path.join(process.env.APPDATA || "", "npm", `${name}.cmd`),
      path.join(process.env.APPDATA || "", "npm", name)
    );
  }

  const allCandidates = [...extraPaths, ...defaultCandidates];
  for (const c of allCandidates) {
    if (c && fs.existsSync(c)) {
      return c;
    }
  }

  // Check in PATH
  const pathDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of pathDirs) {
    for (const name of names) {
      const full1 = path.join(dir, name);
      const full2 = path.join(dir, `${name}.exe`);
      const full3 = path.join(dir, `${name}.cmd`);
      if (fs.existsSync(full1)) return full1;
      if (fs.existsSync(full2)) return full2;
      if (fs.existsSync(full3)) return full3;
    }
  }
  return null;
}

export function cliBridgePlugin(): Plugin {
  return {
    name: "vite-plugin-firecrawl-cli-bridge",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split("?")[0];

        // 1. Endpoint /api/cli/status
        if (url === "/api/cli/status" && req.method === "GET") {
          const agyBin = findExecutable(["agy"]);
          const claudeBin = findExecutable(["claude"]);

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              antigravity: {
                available: !!agyBin,
                path: agyBin,
              },
              claude: {
                available: !!claudeBin,
                path: claudeBin,
              },
            })
          );
          return;
        }

        // 1.5 Endpoint /api/proxy/fetch-html for super fast doc tree scraping
        if (url === "/api/proxy/fetch-html") {
          let targetUrl = "";
          if (req.method === "GET") {
            const urlObj = new URL(`http://localhost${req.url}`);
            targetUrl = urlObj.searchParams.get("url") || "";
          } else if (req.method === "POST") {
            let body = "";
            for await (const chunk of req) {
              body += chunk;
            }
            try {
              const parsed = JSON.parse(body || "{}");
              targetUrl = parsed.url || "";
            } catch (e) {}
          }

          if (!targetUrl) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Thiếu tham số url." }));
            return;
          }

          try {
            const userAgents =
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
            
            let fetchRes = await fetch(targetUrl, {
              headers: { "User-Agent": userAgents },
            });
            let html = await fetchRes.text();
            let finalUrl = fetchRes.url || targetUrl;

            // If HTML doesn't have sidebar links and URL is a root doc path, try appending /introduction
            if (
              !html.includes("wiki-tree") &&
              !html.includes("sidebar") &&
              !targetUrl.endsWith("/introduction") &&
              !targetUrl.endsWith("/docs")
            ) {
              const altUrl = targetUrl.replace(/\/+$/, "") + "/introduction";
              try {
                const altRes = await fetch(altUrl, {
                  headers: { "User-Agent": userAgents },
                });
                if (altRes.ok) {
                  const altHtml = await altRes.text();
                  if (altHtml.includes("wiki-tree") || altHtml.includes("sidebar")) {
                    html = altHtml;
                    finalUrl = altUrl;
                  }
                }
              } catch (e) {}
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                html,
                finalUrl,
              })
            );
          } catch (err: any) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: `Không thể tải URL (${targetUrl}): ${err.message || err}`,
              })
            );
          }
          return;
        }

        // 2. Endpoint /api/cli/extract
        if (url === "/api/cli/extract" && req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => {
            body += chunk;
          });

          req.on("end", async () => {
            try {
              const data = JSON.parse(body || "{}");
              const { engine, prompt, model } = data;

              let executable: string | null = null;
              let args: string[] = [];

              if (engine === "antigravity" || engine === "gemini") {
                executable = findExecutable(["agy"]);
                if (!executable) {
                  res.writeHead(400, { "Content-Type": "application/json" });
                  res.end(
                    JSON.stringify({
                      error:
                        "Không tìm thấy Antigravity CLI ('agy.EXE'). Hãy đảm bảo đã cài đặt Antigravity hoặc nhập Gemini API Key.",
                    })
                  );
                  return;
                }

                args = [
                  "-p",
                  prompt,
                  "--output-format",
                  "json",
                  "--dangerously-skip-permissions",
                  "--disable-slash-commands",
                ];
                if (model && model !== "default") {
                  args.push("--model", model, "--effort", "low");
                }
              } else if (engine === "claude") {
                executable = findExecutable(["claude"]);
                if (!executable) {
                  res.writeHead(400, { "Content-Type": "application/json" });
                  res.end(
                    JSON.stringify({
                      error:
                        "Không tìm thấy Claude Code CLI ('claude.exe'). Hãy đảm bảo đã cài đặt Claude Code hoặc nhập Anthropic API Key.",
                    })
                  );
                  return;
                }

                args = [
                  "-p",
                  prompt,
                  "--disable-slash-commands",
                  "--no-session-persistence",
                ];
              } else {
                res.writeHead(400, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: `Engine không hỗ trợ CLI: ${engine}` }));
                return;
              }

              // Spawn process
              const proc = spawn(executable, args, {
                stdio: ["ignore", "pipe", "pipe"],
                env: {
                  ...process.env,
                  DISABLE_AUTOUPDATER: "1",
                  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
                },
              });

              let stdout = "";
              let stderr = "";

              proc.stdout.on("data", (d) => {
                stdout += d.toString();
              });
              proc.stderr.on("data", (d) => {
                stderr += d.toString();
              });

              const timeoutTimer = setTimeout(() => {
                proc.kill();
                res.writeHead(504, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: "Thực thi CLI quá thời gian chờ (Timeout 120s).",
                  })
                );
              }, 120000);

              proc.on("close", (code) => {
                clearTimeout(timeoutTimer);
                if (code !== 0 && !stdout.trim()) {
                  res.writeHead(500, { "Content-Type": "application/json" });
                  res.end(
                    JSON.stringify({
                      error: `CLI trả về mã lỗi ${code}: ${stderr || stdout}`,
                    })
                  );
                  return;
                }

                let responseText = stdout.trim();
                try {
                  const parsed = JSON.parse(responseText);
                  if (parsed.status === "ERROR") {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    res.end(
                      JSON.stringify({
                        error: parsed.error || "Antigravity CLI trả về lỗi.",
                      })
                    );
                    return;
                  }
                  if (parsed.response) {
                    responseText = parsed.response;
                  } else if (parsed.result) {
                    responseText = parsed.result;
                  }
                } catch (e) {
                  // Keep responseText as raw text
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    success: true,
                    rawOutput: responseText,
                    engine,
                    executable,
                  })
                );
              });

              proc.on("error", (err) => {
                clearTimeout(timeoutTimer);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(
                  JSON.stringify({
                    error: `Lỗi khởi chạy CLI (${executable}): ${err.message}`,
                  })
                );
              });
            } catch (err: any) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: err?.message || "Internal server error" }));
            }
          });
          return;
        }

        next();
      });
    },
  };
}
