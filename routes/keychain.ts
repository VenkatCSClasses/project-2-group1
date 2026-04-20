import { Hono } from "hono";

const app = new Hono();

app.put("/store", (c) => {
    return c.html('<p>Not yet implemented! EEK</p>');
});

export default app;
