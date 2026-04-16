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

const headHTMLString = await Deno.readTextFile("static/head.html");

export const addHeadHTML = () =>
  createMiddleware(async (c, next) => {
    await next();

    if (c.res.ok) {
      const originalBody = await c.res.text();
      const transformedBody = originalBody.replace(
        "<!-- INSERT_HEAD_HTML -->",
        headHTMLString,
      );

      // 4. Overwrite the response with the new transformed content
      c.res = new Response(transformedBody, c.res);
    }
  });
