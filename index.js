import { openDirectory } from './fs.js';

class Cache {

  #dir;
  #encode = JSON.stringify;
  #decode = JSON.parse;
  #textEncoder = new TextEncoder();

  constructor(opt) {
    const path = opt?.path ? opt.path : 'cache';
    this.#encode = opt?.encoder ? opt.encoder : JSON.stringify;
    this.#decode = opt?.decoder ? opt.decoder : JSON.parse;

    this.#dir = openDirectory(path);
  }

  async get(key) {
    const path = await this.#keyToPath(key);

    let content;
    try {
      content = await this.#dir.readFile(path, { encoding: 'utf-8' });
    }
    catch (e) {
      return null;
    }

    return this.#decode(content);
  }

  async set(key, value) {
    const path = await this.#keyToPath(key);
    await this.#dir.writeFile(path, this.#encode(value), { encoding: 'utf-8' });
  }

  async delete(key) {
    const path = await this.#keyToPath(key);
    try {
      await this.#dir.removeFile(path);
    }
    catch (e) {
    }
  }

  async #keyToPath(key) {
    const arrayBuffer = this.#textEncoder.encode(key);
    const hashAsArrayBuffer = await crypto.subtle.digest("SHA-1", arrayBuffer);
    const uint8ViewOfHash = new Uint8Array(hashAsArrayBuffer);
    const hashAsString = Array.from(uint8ViewOfHash)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const level1 = hashAsString.slice(0, 2);
    const level2 = hashAsString.slice(2, 4);
    return `${level1}/${level2}/${hashAsString}`;
  }
}

export {
  Cache,
};
