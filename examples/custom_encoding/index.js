import * as flache from '../../index.js';

const kv = new flache.Cache();
kv.encode = x => x;
kv.decode = x => x;

await kv.set("og", "Hi there");
console.log(await kv.get("og"));
