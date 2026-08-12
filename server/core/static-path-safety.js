import path from "node:path";

export function isPathInsideRoot(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export function resolveStaticRequestPath(rootDir, requestPathname = "/") {
  const rawPathname = String(requestPathname || "/");
  const pathname = rawPathname === "/" ? "/index.html" : rawPathname;
  if (pathname.includes("\\") || pathname.includes("\0")) return null;

  let decoded;
  let doubleDecoded;
  try {
    decoded = decodeURIComponent(pathname);
    doubleDecoded = decodeURIComponent(decoded);
  } catch {
    return null;
  }

  if (decoded !== doubleDecoded || decoded.includes("\\") || decoded.includes("\0")) return null;

  const relativeRequest = decoded.replace(/^\/+/, "");
  const requested = path.resolve(rootDir, relativeRequest || "index.html");
  return isPathInsideRoot(rootDir, requested) ? requested : null;
}
