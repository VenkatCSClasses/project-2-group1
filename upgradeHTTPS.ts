import { createMiddleware } from "hono/factory";

export const upgradeHTTPS = (exclude?: Array<string>) =>
  createMiddleware(async (c, next) => {
    const url = new URL(c.req.url);
    if (exclude?.includes(url.hostname) || url.protocol === "https:") {
      await next();
    } else {
      url.protocol = "https:";
      return c.redirect(url.href, 302);
    }
  });
