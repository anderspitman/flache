import * as flache from '../../index.js';

const kv = new flache.Cache();

await kv.set("og", { "says": "Hi there" });
console.log(await kv.get("og"));
